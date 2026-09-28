import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto.js';

@Injectable()
export class CustomFieldsService {
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

  async create(userId: string, spaceId: string, dto: CreateCustomFieldDto) {
    await this.assertSpaceAccess(userId, spaceId);
    return this.prisma.customField.create({
      data: {
        spaceId,
        name: dto.name,
        type: dto.type,
        config: dto.config,
      },
    });
  }

  async findAllForSpace(userId: string, spaceId: string) {
    await this.assertSpaceAccess(userId, spaceId);
    return this.prisma.customField.findMany({
      where: { spaceId },
      orderBy: { id: 'asc' },
    });
  }

  private async assertFieldAccess(userId: string, id: string) {
    const field = await this.prisma.customField.findUnique({
      where: { id },
      include: { space: { include: { workspace: { include: { members: true } } } } },
    });
    if (!field) {
      throw new NotFoundException('Custom field not found');
    }
    const isMember = field.space.workspace.members.some((m: { userId: string }) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this custom field');
    }
    return field;
  }

  async remove(userId: string, id: string) {
    await this.assertFieldAccess(userId, id);
    await this.prisma.customField.delete({ where: { id } });
    return { id, deleted: true };
  }
}
