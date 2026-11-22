import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = await readFile(new URL('../../src/public/comments.js', import.meta.url), 'utf8');

class FakeElement {
  closest(_selector: string): FakeElement | null {
    return null;
  }

  querySelector(_selector: string): FakeElement | null {
    return null;
  }
}

class FakeTextArea extends FakeElement {
  value = '';
  focused = false;

  focus() {
    this.focused = true;
  }
}

class FakeCommentContent extends FakeElement {
  textContent = 'Comentário original';
  hidden = false;
}

class FakeStatus extends FakeElement {
  textContent = '';
}

class FakeButton extends FakeElement {
  hidden = false;

  constructor(
    private readonly kind: 'edit' | 'cancel',
    private readonly item: FakeCommentItem,
    private readonly form: FakeForm,
  ) {
    super();
  }

  closest(selector: string): FakeElement | null {
    if (selector === '[data-cancel-comment-edit]') return this.kind === 'cancel' ? this : null;
    if (selector === '[data-edit-comment]') return this.kind === 'edit' ? this : null;
    if (selector === 'li[data-comment-id]') return this.item;
    if (selector === '[data-edit-comment-form]') return this.form;
    return null;
  }
}

class FakeSection extends FakeElement {
  dataset = { postId: '4' };
}

class FakeForm extends FakeElement {
  hidden = true;
  classes = new Set<string>();
  classList = {
    add: (value: string) => this.classes.add(value),
    remove: (value: string) => this.classes.delete(value),
  };
  elements = { namedItem: (name: string) => name === 'content' ? this.field : null };

  constructor(
    private readonly item: FakeCommentItem,
    private readonly section: FakeSection,
    readonly field: FakeTextArea,
    private readonly status: FakeStatus,
  ) {
    super();
  }

  querySelector(selector: string): FakeElement | null {
    return selector === '[data-comment-edit-status]' ? this.status : null;
  }

  closest(selector: string): FakeElement | null {
    if (selector === 'li[data-comment-id]') return this.item;
    if (selector === '[data-comment-section]') return this.section;
    return null;
  }
}

class FakeCommentItem extends FakeElement {
  dataset = { commentId: '10' };
  content = new FakeCommentContent();
  editButton!: FakeButton;
  form!: FakeForm;

  closest(selector: string): FakeElement | null {
    return selector === 'li[data-comment-id]' ? this : null;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === '[data-comment-content]') return this.content;
    if (selector === '[data-edit-comment]') return this.editButton;
    if (selector === '[data-edit-comment-form]') return this.form;
    return null;
  }
}

function createHarness() {
  const section = new FakeSection();
  const item = new FakeCommentItem();
  const field = new FakeTextArea();
  const status = new FakeStatus();
  const form = new FakeForm(item, section, field, status);
  const editButton = new FakeButton('edit', item, form);
  const cancelButton = new FakeButton('cancel', item, form);
  item.form = form;
  item.editButton = editButton;

  let clickHandler: ((event: { target: FakeElement }) => Promise<void>) | undefined;
  const eventRoot = {
    addEventListener(event: string, handler: (event: { target: FakeElement }) => Promise<void>) {
      if (event === 'click') clickHandler = handler;
    },
  };

  runInNewContext(script, {
    document: { querySelector: () => eventRoot },
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLButtonElement: FakeButton,
    HTMLFormElement: FakeForm,
    HTMLTextAreaElement: FakeTextArea,
    HTMLInputElement: class extends FakeElement {},
    HTMLUListElement: class extends FakeElement {},
  });

  if (!clickHandler) throw new Error('Comment click handler was not registered');
  return { cancelButton, click: clickHandler, content: item.content, editButton, field, form, status };
}

describe('comment editing controls', () => {
  it('opens the edit form and restores the original content when cancelled', async () => {
    const { cancelButton, click, content, editButton, field, form, status } = createHarness();

    await click({ target: editButton });

    expect(form.hidden).toBe(false);
    expect(form.classes.has('flex')).toBe(true);
    expect(content.hidden).toBe(true);
    expect(editButton.hidden).toBe(true);
    expect(field.value).toBe('Comentário original');
    expect(field.focused).toBe(true);

    field.value = 'Texto alterado, mas não salvo';
    status.textContent = 'Erro anterior';
    await click({ target: cancelButton });

    expect(form.hidden).toBe(true);
    expect(form.classes.has('flex')).toBe(false);
    expect(content.hidden).toBe(false);
    expect(editButton.hidden).toBe(false);
    expect(field.value).toBe('Comentário original');
    expect(status.textContent).toBe('');
  });
});
