import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { AuthResponseDto, LoginDto, RegisterDto } from '@shelf/shared';
import { compare, hash } from 'bcryptjs';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { toUserDto } from '../users/user.mapper';
import { UsersService } from '../users/users.service';

const EMAIL_TAKEN = 'Цей email уже зареєстровано';
const BAD_CREDENTIALS = 'Невірний email або пароль';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (await this.users.findByEmail(dto.email)) throw new ConflictException(EMAIL_TAKEN);
    const passwordHash = await hash(dto.password, 10);
    try {
      const user = await this.users.createWithWorkspace({ email: dto.email, displayName: dto.displayName, passwordHash });
      return this.issue(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(EMAIL_TAKEN);
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await compare(dto.password, user.passwordHash))) throw new UnauthorizedException(BAD_CREDENTIALS);
    return this.issue(user);
  }

  private issue(user: User): AuthResponseDto {
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email }), user: toUserDto(user) };
  }
}
