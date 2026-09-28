import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSpaceDto } from './dto/create-space.dto.js';
import { UpdateSpaceDto } from './dto/update-space.dto.js';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  private async assertWorkspaceMember(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const isMember = workspace.members.some((m: { userId: string }) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this workspace');
    }
    return workspace;
  }

  private async assertSpaceAccess(userId: string, spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      include: { workspace: { include: { members: true } } },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    const isMember = space.workspace.members.some((m: { userId: string }) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this space');
    }
    return space;
  }

  async create(userId: string, workspaceId: string, dto: CreateSpaceDto) {
    await this.assertWorkspaceMember(userId, workspaceId);

    return this.prisma.space.create({
      data: {
        name: dto.name,
        workspaceId,
        statuses: {
          create: [
            { name: 'To Do', color: '#9CA3AF', order: 0, type: 'open' },
            { name: 'In Progress', color: '#3B82F6', order: 1, type: 'in_progress' },
            { name: 'Done', color: '#22C55E', order: 2, type: 'done' },
          ],
        },
        lists: {
          create: [{ name: 'General' }],
        },
      },
      include: { statuses: true },
    });
  }

  async findAllForWorkspace(userId: string, workspaceId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.space.findMany({
      where: { workspaceId },
      include: { statuses: { orderBy: { order: 'asc' } } },
    });
  }

  async update(userId: string, spaceId: string, dto: UpdateSpaceDto) {
    await this.assertSpaceAccess(userId, spaceId);
    return this.prisma.space.update({
      where: { id: spaceId },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
    });
  }

  async remove(userId: string, spaceId: string) {
    await this.assertSpaceAccess(userId, spaceId);
    await this.prisma.space.delete({ where: { id: spaceId } });
    return { id: spaceId, deleted: true };
  }
}
