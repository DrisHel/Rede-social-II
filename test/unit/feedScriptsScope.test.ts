import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const scriptPaths = [
  '../../src/public/likes.js',
  '../../src/public/comments.js',
  '../../src/public/feedCarousel.js',
  '../../src/public/feedInfiniteScroll.js',
];
const scripts = await Promise.all(
  scriptPaths.map((scriptPath) => readFile(new URL(scriptPath, import.meta.url), 'utf8')),
);

describe('feed browser scripts', () => {
  it('can be loaded together without global lexical declaration conflicts', () => {
    expect(() => new Script(scripts.join('\n'))).not.toThrow();
  });
});
