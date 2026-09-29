import { describe, expect, it } from 'vitest';
import { formatDateTime, formatSize } from './format';

describe('formatSize', () => {
  it.each([
    [0, '0 Б'],
    [1023, '1023 Б'],
    [1536, '1,5 КБ'],
    [10 * 1024, '10 КБ'],
    [5 * 1024 * 1024, '5 МБ'],
    [52_428_800, '50 МБ'],
    [-1, '—'],
  ])('%d → %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});

describe('formatDateTime (tests run with TZ=UTC)', () => {
  it('formats an ISO string as dd.MM.yyyy HH:mm', () => {
    expect(formatDateTime('2026-09-29T08:05:00.000Z')).toBe('29.09.2026 08:05');
  });

  it('accepts epoch milliseconds', () => {
    expect(formatDateTime(Date.parse('2026-01-02T03:04:00.000Z'))).toBe('02.01.2026 03:04');
  });

  it('returns a dash for an invalid date', () => {
    expect(formatDateTime('not a date')).toBe('—');
  });
});
