import type { User } from '@prisma/client';
import type { UserDto } from '@shelf/shared';

export function toUserDto(user: Pick<User, 'id' | 'email' | 'displayName'>): UserDto {
  return { id: user.id, email: user.email, displayName: user.displayName };
}
