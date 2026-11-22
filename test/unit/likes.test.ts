import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = await readFile(new URL('../../src/public/likes.js', import.meta.url), 'utf8');

class FakeElement {
  closest(_selector: string): FakeElement | null {
    return this;
  }
}

class FakeButton extends FakeElement {
  disabled = false;
  title = 'Curtir';
  dataset: { likeUrl: string; commentLikeButton?: string } = { likeUrl: '/posts/1/like' };
  attributes = new Map([['aria-pressed', 'false']]);
  classes = new Set(['text-blue-600']);
  status = { textContent: '' };
  count = { textContent: '2' };
  icon = { fill: 'none', setAttribute: (_name: string, value: string) => { this.icon.fill = value; } };
  classList = {
    toggle: (className: string, enabled: boolean) => {
      if (enabled) this.classes.add(className);
      else this.classes.delete(className);
    },
  };
  parentElement = { querySelector: () => this.status };

  getAttribute(name: string) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  querySelector(selector: string) {
    if (selector === '[data-like-count]') return this.count;
    if (selector === '[data-like-icon]') return this.icon;
    return null;
  }
}

class FakeCommentItem extends FakeElement {
  constructor(
    readonly dataset: { commentId: string; commentCreatedAt: string },
    readonly count: { textContent: string },
  ) {
    super();
  }

  querySelector(selector: string) {
    return selector === '[data-like-count]' ? this.count : null;
  }
}

class FakeCommentList extends FakeElement {
  comments: FakeCommentItem[] = [];

  querySelectorAll(_selector: string) {
    return this.comments;
  }

  append(comment: FakeCommentItem) {
    const index = this.comments.indexOf(comment);
    if (index >= 0) this.comments.splice(index, 1);
    this.comments.push(comment);
  }
}

class FakeCommentButton extends FakeButton {
  constructor(private readonly commentList: FakeCommentList) {
    super();
    this.dataset.commentLikeButton = '';
    this.dataset.likeUrl = '/posts/1/comments/3/like';
    this.count.textContent = '0';
  }

  closest(selector: string): FakeElement | null {
    return selector === '[data-comment-list]' ? this.commentList : super.closest(selector);
  }
}

function createHarness(fetch: (url: string) => Promise<unknown>, button = new FakeButton()) {
  let clickHandler: ((event: { target: FakeButton }) => Promise<void>) | undefined;
  const eventRoot = {
    addEventListener(event: string, handler: (event: { target: FakeButton }) => Promise<void>) {
      if (event === 'click') clickHandler = handler;
    },
  };
  runInNewContext(script, {
    document: { querySelector: () => eventRoot },
    Element: FakeElement,
    HTMLButtonElement: FakeButton,
    HTMLUListElement: FakeCommentList,
    fetch,
  });
  if (!clickHandler) throw new Error('Like click handler was not registered');
  return { button, click: clickHandler };
}

describe('optimistic likes', () => {
  it('updates the button before the response, then keeps the server state', async () => {
    let resolveFetch: ((response: unknown) => void) | undefined;
    let requestedUrl = '';
    const fetch = (url: string) => {
      requestedUrl = url;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    };
    const { button, click } = createHarness(fetch);

    const request = click({ target: button });

    expect(requestedUrl).toBe('/posts/1/like');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.count.textContent).toBe('3');
    expect(button.title).toBe('Descurtir');
    expect(button.icon.fill).toBe('currentColor');
    expect(button.classes.has('text-red-600')).toBe(true);

    resolveFetch?.({
      ok: true,
      redirected: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ liked: true, likeCount: 3 }),
    });
    await request;

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.count.textContent).toBe('3');
    expect(button.disabled).toBe(false);
  });

  it('rolls back the visual state and reports the error when fetch fails', async () => {
    const { button, click } = createHarness(() => Promise.reject(new Error('offline')));

    const request = click({ target: button });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.count.textContent).toBe('3');

    await request;

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.count.textContent).toBe('2');
    expect(button.title).toBe('Curtir');
    expect(button.icon.fill).toBe('none');
    expect(button.classes.has('text-red-600')).toBe(false);
    expect(button.classes.has('text-blue-600')).toBe(true);
    expect(button.status.textContent).not.toBe('');
    expect(button.disabled).toBe(false);
  });

  it('reordena comentários quando uma curtida altera a pontuação', async () => {
    const list = new FakeCommentList();
    const button = new FakeCommentButton(list);
    const popularComment = new FakeCommentItem(
      { commentId: '20', commentCreatedAt: '2026-01-01T10:00:00.000Z' },
      { textContent: '2' },
    );
    const olderUnlikedComment = new FakeCommentItem(
      { commentId: '1', commentCreatedAt: '2026-01-02T10:00:00.000Z' },
      { textContent: '0' },
    );
    const targetComment = new FakeCommentItem(
      { commentId: '3', commentCreatedAt: '2026-01-03T10:00:00.000Z' },
      button.count,
    );
    list.comments = [popularComment, olderUnlikedComment, targetComment];
    let resolveFetch: ((response: unknown) => void) | undefined;
    const { click } = createHarness(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }), button);

    const request = click({ target: button });

    expect(list.comments.map((comment) => comment.dataset.commentId)).toEqual(['20', '3', '1']);
    resolveFetch?.({
      ok: true,
      redirected: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ liked: true, likeCount: 1 }),
    });
    await request;
  });
});
