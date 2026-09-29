import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export const SESSION_INVALID_MESSAGE = 'Сесія недійсна або завершилась — увійдіть знову';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser>(_error: unknown, user: TUser | false | null | undefined): TUser {
    if (!user) throw new UnauthorizedException(SESSION_INVALID_MESSAGE);
    return user;
  }
}
