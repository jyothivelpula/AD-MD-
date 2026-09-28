import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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
