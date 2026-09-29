import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard, SESSION_INVALID_MESSAGE } from './jwt-auth.guard';

describe('JwtAuthGuard.handleRequest', () => {
  const guard = new JwtAuthGuard();

  it('returns the authenticated user', () => {
    const user = { id: 'u-1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it.each([
    ['no user', null, false],
    ['a passport error', new Error('jwt expired'), undefined],
  ])('rejects with a Ukrainian 401 for %s', (_label, error, user) => {
    let thrown: unknown;
    try {
      guard.handleRequest(error, user);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(UnauthorizedException);
    expect((thrown as UnauthorizedException).getStatus()).toBe(401);
    expect((thrown as UnauthorizedException).message).toBe(SESSION_INVALID_MESSAGE);
  });
});
