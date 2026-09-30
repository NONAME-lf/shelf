import { describe, expect, it } from 'vitest';
import { accountKey } from './account';

describe('accountKey', () => {
  it('is the user id at the normalized API address', () => {
    expect(accountKey('http://localhost:4000', 'u1')).toBe('u1@http://localhost:4000/api');
    expect(accountKey(' http://localhost:4000/', 'u1')).toBe(accountKey('http://localhost:4000/api', 'u1'));
  });

  it('differs between users and between servers', () => {
    expect(accountKey('http://localhost:4000', 'u1')).not.toBe(accountKey('http://localhost:4000', 'u2'));
    expect(accountKey('http://localhost:4000', 'u1')).not.toBe(accountKey('https://shelf-api.onrender.com', 'u1'));
  });
});
