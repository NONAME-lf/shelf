import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import { AuthService } from './auth.service';
import { normalizeEmail, UsersService } from '../users/users.service';

class InMemoryUsers {
  readonly users: User[] = [];
  raceOnCreate = false;

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === normalizeEmail(email)) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async createWithWorkspace(data: { email: string; displayName: string; passwordHash: string }): Promise<User> {
    if (this.raceOnCreate) {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
    }
    const user: User = {
      id: `u${this.users.length + 1}`,
      email: normalizeEmail(data.email),
      displayName: data.displayName,
      passwordHash: data.passwordHash,
      createdAt: new Date(),
    };
    this.users.push(user);
    return user;
  }
}

describe('AuthService', () => {
  let users: InMemoryUsers;
  let jwt: JwtService;
  let auth: AuthService;

  beforeEach(() => {
    users = new InMemoryUsers();
    jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: 60 } });
    auth = new AuthService(users as unknown as UsersService, jwt);
  });

  it('registers a user, stores a bcrypt hash and returns a token for that user', async () => {
    const response = await auth.register({ email: 'Artem@Shelf.dev', password: 'secret-123', displayName: 'Артем' });

    expect(response.user).toEqual({ id: 'u1', email: 'artem@shelf.dev', displayName: 'Артем' });
    expect(users.users[0].passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(users.users[0].passwordHash).not.toContain('secret-123');
    expect(jwt.verify<{ sub: string }>(response.accessToken).sub).toBe('u1');
  });

  it('rejects an email that is already registered, ignoring case', async () => {
    await auth.register({ email: 'artem@shelf.dev', password: 'secret-123', displayName: 'Артем' });
    await expect(
      auth.register({ email: 'ARTEM@shelf.dev', password: 'other-pass', displayName: 'Інший' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a unique-constraint race to 409', async () => {
    users.raceOnCreate = true;
    await expect(
      auth.register({ email: 'race@shelf.dev', password: 'secret-123', displayName: 'Гонка' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in with the right password', async () => {
    await auth.register({ email: 'artem@shelf.dev', password: 'secret-123', displayName: 'Артем' });
    const response = await auth.login({ email: 'artem@shelf.dev', password: 'secret-123' });
    expect(response.user.email).toBe('artem@shelf.dev');
    expect(jwt.verify<{ sub: string }>(response.accessToken).sub).toBe('u1');
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    await auth.register({ email: 'artem@shelf.dev', password: 'secret-123', displayName: 'Артем' });
    await expect(auth.login({ email: 'artem@shelf.dev', password: 'wrong-pass' })).rejects.toThrow(
      new UnauthorizedException('Невірний email або пароль'),
    );
    await expect(auth.login({ email: 'nobody@shelf.dev', password: 'secret-123' })).rejects.toThrow(
      new UnauthorizedException('Невірний email або пароль'),
    );
  });
});
