import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateListDto } from './dto/create-list.dto.js';
import { UpdateListDto } from './dto/update-list.dto.js';

@Injectable()
export class ListsService {
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

  private async assertListAccess(userId: string, listId: string) {
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      include: { space: { include: { workspace: { include: { members: true } } } } },
    });
    if (!list) {
      throw new NotFoundException('List not found');
    }
    const isMember = list.space.workspace.members.some((m: { userId: string }) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this list');
    }
    return list;
  }

  async ensureGeneralList(spaceId: string) {
    const generals = await this.prisma.list.findMany({
      where: { spaceId, name: { equals: 'General', mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
    if (generals.length === 0) {
      return this.prisma.list.create({ data: { name: 'General', spaceId } });
    }
    const [keep, ...extras] = generals;
    for (const extra of extras) {
      await this.prisma.task.updateMany({ where: { listId: extra.id }, data: { listId: keep.id } });
      await this.prisma.list.delete({ where: { id: extra.id } });
    }
    if (keep.name !== 'General') {
      return this.prisma.list.update({ where: { id: keep.id }, data: { name: 'General' } });
    }
    return keep;
  }

  private async migratePersonalNameLists(spaceId: string) {
    const general = await this.ensureGeneralList(spaceId);
    const lists = await this.prisma.list.findMany({ where: { spaceId } });

    for (const list of lists) {
      if (list.id === general.id) continue;
      const match = await this.prisma.user.findFirst({
        where: { name: { equals: list.name.trim(), mode: 'insensitive' } },
      });
      if (!match) continue;

      const lastGeneralTask = await this.prisma.task.findFirst({
        where: { listId: general.id },
        orderBy: { position: 'desc' },
      });
      let position = lastGeneralTask ? lastGeneralTask.position + 1 : 1;
      const tasks = await this.prisma.task.findMany({ where: { listId: list.id }, orderBy: { position: 'asc' } });

      for (const task of tasks) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            listId: general.id,
            position,
            assigneeId: match.id,
            assigneeName: match.name,
          },
        });
        await this.prisma.taskAssignee.deleteMany({
          where: { taskId: task.id, NOT: { userId: match.id } },
        });
        await this.prisma.taskAssignee.upsert({
          where: { taskId_userId: { taskId: task.id, userId: match.id } },
          create: { taskId: task.id, userId: match.id },
          update: {},
        });
        position += 1;
      }

      try {
        await this.prisma.list.delete({ where: { id: list.id } });
      } catch {
        // Another request already migrated this personal list.
      }
    }
  }

  async create(userId: string, spaceId: string, dto: CreateListDto) {
    await this.assertSpaceAccess(userId, spaceId);
    await this.ensureGeneralList(spaceId);
    return this.prisma.list.create({
      data: { name: dto.name, spaceId },
    });
  }

  async findAllForSpace(userId: string, spaceId: string) {
    await this.assertSpaceAccess(userId, spaceId);
    await this.ensureGeneralList(spaceId);
    await this.migratePersonalNameLists(spaceId);
    return this.prisma.list.findMany({ where: { spaceId } });
  }

  async update(userId: string, listId: string, dto: UpdateListDto) {
    await this.assertListAccess(userId, listId);
    return this.prisma.list.update({
      where: { id: listId },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
    });
  }

  async remove(userId: string, listId: string) {
    const list = await this.assertListAccess(userId, listId);
    if (list.name.toLowerCase() === 'general') {
      throw new ForbiddenException('The General list cannot be deleted');
    }
    await this.prisma.list.delete({ where: { id: listId } });
    return { id: listId, deleted: true };
  }
}
