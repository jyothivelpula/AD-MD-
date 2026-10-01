import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'owner',
          },
        },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
    });
  }

  async findOneForUser(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
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

  async listMembers(userId: string, workspaceId: string) {
    await this.findOneForUser(userId, workspaceId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
    }));
  }

  async addMember(actorId: string, workspaceId: string, email: string) {
    await this.findOneForUser(actorId, workspaceId);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    if (!user) {
      throw new NotFoundException('No user exists with that email. They must sign up first.');
    }
    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });
    if (existing) {
      throw new ForbiddenException('That user is already a member of this workspace');
    }
    const member = await this.prisma.workspaceMember.create({
      data: { workspaceId, userId: user.id, role: 'member' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      id: member.id,
      userId: member.userId,
      role: member.role,
      name: member.user.name,
      email: member.user.email,
    };
  }

  async updateMemberProfile(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    dto: { name?: string; email?: string },
  ) {
    const actor = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
      include: { user: { select: { name: true } } },
    });
    if (!actor) throw new ForbiddenException('You are not a member of this workspace');
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new ForbiddenException('Only a workspace manager can edit members');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    const assignedHere = await this.prisma.task.findFirst({
      where: { assigneeId: targetUserId, list: { space: { workspaceId } } },
      select: { id: true },
    });
    if (!membership && !assignedHere) {
      throw new ForbiddenException('That user is not in this workspace');
    }

    const data: { name?: string; email?: string; emailVerified?: boolean; emailVerifiedAt?: Date | null } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      if (name !== target.name) data.name = name;
    }
    let emailChanged = false;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const taken = await this.prisma.user.findFirst({ where: { email, NOT: { id: targetUserId } } });
      if (taken) throw new ConflictException('Email already registered');
      if (email !== target.email.toLowerCase()) {
        data.email = email;
        data.emailVerified = true;
        data.emailVerifiedAt = new Date();
        emailChanged = true;
      }
    }
    if (!dto.name && !dto.email) throw new BadRequestException('Nothing to update');

    const updated = Object.keys(data).length
      ? await this.prisma.user.update({
          where: { id: targetUserId },
          data,
          select: { id: true, name: true, email: true },
        })
      : { id: target.id, name: target.name, email: target.email };

    if (emailChanged) {
      await this.prisma.activityLog.create({
        data: {
          workspaceId,
          userId: actorId,
          action: `${actor.user.name} updated ${target.name}'s email address`,
          meta: { targetUserId },
        },
      });
    }

    return {
      userId: updated.id,
      name: updated.name,
      email: updated.email,
      role: membership?.role ?? null,
    };
  }

  async update(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.findOneForUser(userId, workspaceId);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
    });
  }

  async remove(userId: string, workspaceId: string) {
    await this.findOneForUser(userId, workspaceId);
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    return { id: workspaceId, deleted: true };
  }

  async search(userId: string, workspaceId: string, q: string) {
    await this.findOneForUser(userId, workspaceId);
    const query = q.trim();
    const contains = query
      ? { contains: query, mode: 'insensitive' as const }
      : undefined;
    const take = query ? 20 : 8;

    const [tasks, lists, spaces, members, chats, comments] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          list: { space: { workspaceId } },
          ...(contains
            ? {
                OR: [
                  { title: contains },
                  { description: contains },
                  { assigneeName: contains },
                  { ownerName: contains },
                  { createdBy: { name: contains } },
                ],
              }
            : {}),
        },
        include: {
          list: { include: { space: { include: { statuses: true } } } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.list.findMany({
        where: {
          space: { workspaceId },
          ...(contains ? { name: contains } : {}),
        },
        include: { space: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        take: 12,
      }),
      this.prisma.space.findMany({
        where: {
          workspaceId,
          ...(contains ? { name: contains } : {}),
        },
        orderBy: { name: 'asc' },
        take: 12,
      }),
      this.prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          ...(contains
            ? {
                user: {
                  OR: [{ name: contains }, { email: contains }],
                },
              }
            : {}),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
        take: 12,
      }),
      this.prisma.aiChat.findMany({
        where: {
          workspaceId,
          userId,
          ...(contains ? { title: contains } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      contains
        ? this.prisma.comment.findMany({
            where: {
              body: contains,
              task: { list: { space: { workspaceId } } },
            },
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  listId: true,
                  list: { select: { name: true, spaceId: true, space: { select: { id: true, name: true } } } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    return {
      query,
      tasks: tasks.map((t) => {
        const status = t.list.space.statuses.find((s) => s.id === t.statusId);
        const isDone = status?.type === 'done';
        return {
          id: t.id,
          title: t.title,
          status: status?.name || '',
          statusColor: status?.color || '#94a3b8',
          statusType: status?.type || '',
          listId: t.listId,
          listName: t.list.name,
          spaceId: t.list.space.id,
          spaceName: t.list.space.name,
          assigneeName: t.assignee?.name || t.assigneeName || null,
          createdAt: t.createdAt.toISOString(),
          isOverdue: !!(t.dueDate && t.dueDate < now && !isDone),
        };
      }),
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        spaceId: l.space.id,
        spaceName: l.space.name,
      })),
      spaces: spaces.map((s) => ({ id: s.id, name: s.name })),
      people: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
      })),
      chats: chats.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      })),
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        authorName: c.authorName,
        createdAt: c.createdAt.toISOString(),
        taskId: c.task.id,
        taskTitle: c.task.title,
        listId: c.task.listId,
        listName: c.task.list.name,
        spaceId: c.task.list.spaceId,
        spaceName: c.task.list.space.name,
      })),
    };
  }
}
