import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { UserDto } from '@shelf/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { toUserDto } from '../users/user.mapper';
import { UsersService } from '../users/users.service';

export type AuthUser = UserDto;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly users: UsersService,
  ) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: config.jwtSecret, ignoreExpiration: false });
  }

  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Сесія недійсна, увійдіть знову');
    return toUserDto(user);
  }
}
