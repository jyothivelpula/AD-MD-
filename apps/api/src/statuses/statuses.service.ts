import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateStatusDto } from './dto/create-status.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';

@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

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

  async create(userId: string, spaceId: string, dto: CreateStatusDto) {
    await this.assertSpaceAccess(userId, spaceId);
    const lastStatus = await this.prisma.status.findFirst({
      where: { spaceId },
      orderBy: { order: 'desc' },
    });
    const order = lastStatus ? lastStatus.order + 1 : 0;

    return this.prisma.status.create({
      data: {
        spaceId,
        name: dto.name,
        color: dto.color || '#9CA3AF',
        type: dto.type || 'open',
        order,
      },
    });
  }

  private async assertStatusAccess(userId: string, id: string) {
    const status = await this.prisma.status.findUnique({
      where: { id },
      include: { space: { include: { workspace: { include: { members: true } } } } },
    });
    if (!status) {
      throw new NotFoundException('Status not found');
    }
    const isMember = status.space.workspace.members.some((m: { userId: string }) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this status');
    }
    return status;
  }

  async update(userId: string, id: string, dto: UpdateStatusDto) {
    await this.assertStatusAccess(userId, id);
    return this.prisma.status.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    const status = await this.assertStatusAccess(userId, id);

    const tasksUsingStatus = await this.prisma.task.count({
      where: { statusId: id, list: { spaceId: status.spaceId } },
    });
    if (tasksUsingStatus > 0) {
      throw new ConflictException(
        `Cannot delete this status — ${tasksUsingStatus} task(s) still use it. Move them to another status first.`,
      );
    }

    const remaining = await this.prisma.status.count({ where: { spaceId: status.spaceId } });
    if (remaining <= 1) {
      throw new ConflictException('A space must keep at least one status.');
    }

    await this.prisma.status.delete({ where: { id } });
    return { id, deleted: true };
  }
}
