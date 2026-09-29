import { ApiProperty } from '@nestjs/swagger';
import type { LoginDto, RegisterDto } from '@shelf/shared';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterBody implements RegisterDto {
  @ApiProperty({ example: 'artem@shelf.dev' })
  @IsEmail({}, { message: 'Некоректний email' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8, example: 'shelf-demo-2026' })
  @IsString()
  @MinLength(8, { message: 'Пароль має містити щонайменше 8 символів' })
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Артем' })
  @IsString()
  @IsNotEmpty({ message: "Ім'я не може бути порожнім" })
  @MaxLength(60)
  displayName: string;
}

export class LoginBody implements LoginDto {
  @ApiProperty({ example: 'artem@shelf.dev' })
  @IsEmail({}, { message: 'Некоректний email' })
  email: string;

  @ApiProperty({ example: 'shelf-demo-2026' })
  @IsString()
  @IsNotEmpty({ message: 'Введіть пароль' })
  password: string;
}
