import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = await readFile(new URL('../../src/public/feedInfiniteScroll.js', import.meta.url), 'utf8');

describe('feed infinite scroll', () => {
  it('fetches the next cursor page and appends its rendered posts', async () => {
    const requests: string[] = [];
    const appended: string[] = [];
    let intersectionCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    let disconnected = false;
    const feedList = {
      dataset: { hasMore: 'true', nextCursor: '10' },
      append(fragment: { html: string }) {
        appended.push(fragment.html);
      },
      querySelector: () => ({}),
    };
    const sentinel = { getBoundingClientRect: () => ({ top: 1000 }) };
    const loading = { hidden: true };
    const errorMessage = {
      hidden: true,
      querySelector: () => ({ textContent: '' }),
    };
    const retryButton = { addEventListener: () => undefined };
    const endMessage = { hidden: true };
    const document = {
      querySelector(selector: string) {
        return {
          '[data-feed-list]': feedList,
          '[data-feed-sentinel]': sentinel,
          '[data-feed-loading]': loading,
          '[data-feed-error]': errorMessage,
          '[data-feed-retry]': retryButton,
          '[data-feed-end]': endMessage,
          '[data-feed-empty]': { remove: () => undefined },
        }[selector];
      },
      createElement: () => ({
        content: { html: '' },
        set innerHTML(html: string) {
          this.content.html = html;
        },
      }),
    };
    const fetch = async (url: string) => {
      requests.push(url);
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          posts: [{ id: 11 }],
          html: '<article data-post-id="11">Post 11</article>',
          nextCursor: null,
          hasMore: false,
        }),
      };
    };
    class FakeIntersectionObserver {
      constructor(callback: typeof intersectionCallback) {
        intersectionCallback = callback;
      }

      observe() {}
      unobserve() {}
      disconnect() {
        disconnected = true;
      }
    }

    runInNewContext(script, {
      document,
      fetch,
      URLSearchParams,
      IntersectionObserver: FakeIntersectionObserver,
      window: { requestAnimationFrame: (callback: () => void) => callback() },
    });

    intersectionCallback?.([{ isIntersecting: true }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toEqual(['/api/feed?cursor=10&limit=10']);
    expect(appended).toEqual(['<article data-post-id="11">Post 11</article>']);
    expect(feedList.dataset).toEqual({ hasMore: 'false', nextCursor: '' });
    expect(loading.hidden).toBe(true);
    expect(endMessage.hidden).toBe(false);
    expect(disconnected).toBe(true);
  });
});
