import { describe, expect, it } from '@jest/globals';
import { readTtlSeconds } from './ttl-config';

const FALLBACK = 300;

describe('readTtlSeconds', () => {
  it('returns a configured positive value', () => {
    expect(readTtlSeconds('60', FALLBACK)).toBe(60);
  });

  it('falls back when the value is unset', () => {
    expect(readTtlSeconds(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a non-numeric string', 'not-a-number'],
    ['zero', '0'],
    ['a negative number', '-5'],
    ['infinity', 'Infinity'],
  ])('falls back on %s', (_label, rawValue) => {
    expect(readTtlSeconds(rawValue, FALLBACK)).toBe(FALLBACK);
  });
});
