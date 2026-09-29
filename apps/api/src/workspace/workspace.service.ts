import { Injectable, NotFoundException } from '@nestjs/common';
import type { WorkspaceDto } from '@shelf/shared';
import type { AuthUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<{ id: string }> {
    const workspace = await this.prisma.workspace.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (!workspace) throw new NotFoundException('Простір не знайдено');
    return workspace;
  }

  async summary(user: AuthUser): Promise<WorkspaceDto> {
    const workspace = await this.forUser(user.id);
    const fileCount = await this.prisma.fileEntry.count({ where: { workspaceId: workspace.id } });
    return { id: workspace.id, owner: user, fileCount };
  }
}
