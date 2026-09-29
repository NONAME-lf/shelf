import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Creates the user together with their workspace in one statement (one workspace per user). */
  createWithWorkspace(data: { email: string; displayName: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(data.email),
        displayName: data.displayName.trim(),
        passwordHash: data.passwordHash,
        workspace: { create: {} },
      },
    });
  }
}
