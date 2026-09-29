import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, splitBySize } from './limits';

describe('upload limit', () => {
  it('is 50 MB', () => {
    expect(MAX_UPLOAD_MB).toBe(50);
    expect(MAX_UPLOAD_BYTES).toBe(52_428_800);
  });

  it('accepts files up to and including the limit and rejects larger ones', () => {
    const small = { name: 'a', size: 1 };
    const exact = { name: 'b', size: MAX_UPLOAD_BYTES };
    const big = { name: 'c', size: MAX_UPLOAD_BYTES + 1 };
    expect(splitBySize([small, exact, big])).toEqual({ accepted: [small, exact], rejected: [big] });
  });
});
