import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = await readFile(new URL('../../src/public/feedCarousel.js', import.meta.url), 'utf8');

class FakeElement {
  closest(_selector: string) {
    return null;
  }
}

class FakeButton extends FakeElement {
  constructor(private readonly selector: string, private readonly carousel: object) {
    super();
  }

  closest(selector: string) {
    if (selector === '[data-carousel-prev], [data-carousel-next]') return this;
    if (selector === '[data-image-carousel]') return this.carousel;
    return null;
  }

  matches(selector: string) {
    return selector === this.selector;
  }
}

function createFeedList() {
  let clickHandler: ((event: { target: FakeButton }) => void) | undefined;
  return {
    addEventListener(event: string, handler: (event: { target: FakeButton }) => void) {
      if (event === 'click') clickHandler = handler;
    },
    click(target: FakeButton) {
      if (!clickHandler) throw new Error('Feed click handler was not registered');
      clickHandler({ target });
    },
  };
}

describe('feed photo carousel', () => {
  it('navigates forward and backward, wraps around, and updates the indicator', () => {
    const slides = [{ hidden: false }, { hidden: true }, { hidden: true }];
    const indicator = { textContent: '1 / 3' };
    const carousel = {
      querySelectorAll: () => slides,
      querySelector: () => indicator,
    };
    const previousButton = new FakeButton('[data-carousel-prev]', carousel);
    const nextButton = new FakeButton('[data-carousel-next]', carousel);
    const feedList = createFeedList();
    const document = { querySelector: () => feedList };

    runInNewContext(script, {
      document,
      Element: FakeElement,
      HTMLButtonElement: FakeButton,
    });

    feedList.click(nextButton);
    expect(slides.map((slide) => slide.hidden)).toEqual([true, false, true]);
    expect(indicator.textContent).toBe('2 / 3');

    feedList.click(previousButton);
    expect(slides.map((slide) => slide.hidden)).toEqual([false, true, true]);
    expect(indicator.textContent).toBe('1 / 3');

    feedList.click(previousButton);
    expect(slides.map((slide) => slide.hidden)).toEqual([true, true, false]);
    expect(indicator.textContent).toBe('3 / 3');

    feedList.click(nextButton);
    expect(slides.map((slide) => slide.hidden)).toEqual([false, true, true]);
    expect(indicator.textContent).toBe('1 / 3');
  });
});
