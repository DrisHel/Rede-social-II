import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = await readFile(new URL('../../src/public/feedCarousel.js', import.meta.url), 'utf8');

function createButton() {
  let clickHandler: (() => void) | undefined;
  return {
    addEventListener(event: string, handler: () => void) {
      if (event === 'click') clickHandler = handler;
    },
    click() {
      if (!clickHandler) throw new Error('Click handler was not registered');
      clickHandler();
    },
  };
}

describe('feed photo carousel', () => {
  it('navigates forward and backward, wraps around, and updates the indicator', () => {
    const slides = [{ hidden: false }, { hidden: true }, { hidden: true }];
    const previousButton = createButton();
    const nextButton = createButton();
    const indicator = { textContent: '1 / 3' };
    const carousel = {
      querySelectorAll: () => slides,
      querySelector(selector: string) {
        if (selector === '[data-carousel-prev]') return previousButton;
        if (selector === '[data-carousel-next]') return nextButton;
        if (selector === '[data-carousel-indicator]') return indicator;
        return null;
      },
    };
    const document = { querySelectorAll: () => [carousel] };

    runInNewContext(script, { document });

    nextButton.click();
    expect(slides.map((slide) => slide.hidden)).toEqual([true, false, true]);
    expect(indicator.textContent).toBe('2 / 3');

    previousButton.click();
    expect(slides.map((slide) => slide.hidden)).toEqual([false, true, true]);
    expect(indicator.textContent).toBe('1 / 3');

    previousButton.click();
    expect(slides.map((slide) => slide.hidden)).toEqual([true, true, false]);
    expect(indicator.textContent).toBe('3 / 3');

    nextButton.click();
    expect(slides.map((slide) => slide.hidden)).toEqual([false, true, true]);
    expect(indicator.textContent).toBe('1 / 3');
  });
});
