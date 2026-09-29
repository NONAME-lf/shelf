import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { WorkspaceDto } from '@shelf/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Get()
  summary(@CurrentUser() user: AuthUser): Promise<WorkspaceDto> {
    return this.workspaces.summary(user);
  }
}
