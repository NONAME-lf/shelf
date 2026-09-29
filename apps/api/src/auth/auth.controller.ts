import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthResponseDto, UserDto } from '@shelf/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginBody, RegisterBody } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterBody): Promise<AuthResponseDto> {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginBody): Promise<AuthResponseDto> {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser): UserDto {
    return user;
  }
}
