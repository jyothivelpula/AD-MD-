import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type CreateNotificationInput = {
  userId: string;
  workspaceId: string;
  taskId?: string | null;
  type: string;
  title: string;
  message: string;
  actorId?: string | null;
  eventKey?: string | null;
};

const PREFERENCE_FIELDS = [
  'taskAssigned',
  'taskReassigned',
  'taskStatusChanged',
  'taskPriorityChanged',
  'taskCompleted',
  'taskReopened',
  'taskDueToday',
  'taskDueTomorrow',
  'taskOverdue',
  'taskComment',
  'taskMention',
  'workspaceActivity',
  'dailyAiBrief',
  'dailyDigest',
  'emailTaskAssigned',
  'emailTaskReassigned',
  'emailTaskDueToday',
  'emailTaskDueTomorrow',
  'emailTaskOverdue',
  'emailTaskComment',
  'emailTaskMention',
  'emailTaskStatusChanged',
  'emailTaskPriorityChanged',
  'emailDailySummary',
] as const;

type PreferenceField = (typeof PREFERENCE_FIELDS)[number];
type PreferenceSettings = Record<PreferenceField, boolean>;

// Status and priority stay on by default so existing activity notifications
// keep arriving until the user turns them off in settings.
const DEFAULT_PREFERENCES: PreferenceSettings = {
  taskAssigned: true,
  taskReassigned: true,
  taskStatusChanged: true,
  taskPriorityChanged: true,
  taskCompleted: true,
  taskReopened: true,
  taskDueToday: true,
  taskDueTomorrow: true,
  taskOverdue: true,
  taskComment: true,
  taskMention: true,
  workspaceActivity: true,
  dailyAiBrief: false,
  dailyDigest: false,
  emailTaskAssigned: true,
  emailTaskReassigned: true,
  emailTaskDueToday: true,
  emailTaskDueTomorrow: true,
  emailTaskOverdue: true,
  emailTaskComment: true,
  emailTaskMention: true,
  emailTaskStatusChanged: true,
  emailTaskPriorityChanged: true,
  emailDailySummary: false,
};

const TYPE_TO_PREFERENCE: Record<string, PreferenceField> = {
  TASK_ASSIGNED: 'taskAssigned',
  TASK_REASSIGNED: 'taskReassigned',
  TASK_STATUS_CHANGED: 'taskStatusChanged',
  TASK_PRIORITY_CHANGED: 'taskPriorityChanged',
  TASK_COMPLETED: 'taskCompleted',
  TASK_REOPENED: 'taskReopened',
  TASK_DUE_TODAY: 'taskDueToday',
  TASK_DUE_TOMORROW: 'taskDueTomorrow',
  TASK_OVERDUE: 'taskOverdue',
  TASK_COMMENT: 'taskComment',
  TASK_MENTION: 'taskMention',
};

const FILTER_TYPES: Record<string, string[]> = {
  tasks: [
    'TASK_ASSIGNED',
    'TASK_REASSIGNED',
    'TASK_STATUS_CHANGED',
    'TASK_PRIORITY_CHANGED',
    'TASK_COMPLETED',
    'TASK_REOPENED',
  ],
  comments: ['TASK_COMMENT'],
  mentions: ['TASK_MENTION'],
  deadlines: ['TASK_DUE_TODAY', 'TASK_DUE_TOMORROW', 'TASK_OVERDUE'],
};

const TASK_INCLUDE = {
  task: {
    select: {
      id: true,
      title: true,
      priority: true,
      listId: true,
      list: { select: { name: true, space: { select: { id: true, name: true } } } },
    },
  },
} as const;

type ActivityTask = {
  id: string;
  title: string;
  workspaceId: string;
  assigneeId?: string | null;
  createdById?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private emails: EmailService,
  ) {}

  async createNotification(input: CreateNotificationInput) {
    if (input.actorId && input.actorId === input.userId) return null;
    if (!(await this.preferenceAllows(input.userId, input.type))) return null;
    if (input.eventKey) {
      const existing = await this.prisma.notification.findUnique({ where: { eventKey: input.eventKey } });
      if (existing) return existing;
    }
    try {
      const created = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId,
          taskId: input.taskId || null,
          type: input.type,
          title: input.title,
          message: input.message,
          actorId: input.actorId || null,
          eventKey: input.eventKey || null,
        },
      });
      try {
        await this.emails.deliverNotification(created);
      } catch {
        /* a mail failure must not remove the notification */
      }
      return created;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002' && input.eventKey) {
        return this.prisma.notification.findUnique({ where: { eventKey: input.eventKey } });
      }
      throw err;
    }
  }

  async notifyTaskAssigned(
    actorId: string,
    assigneeId: string | null | undefined,
    task: { id: string; title: string; workspaceId: string },
  ) {
    if (!assigneeId || assigneeId === actorId) return null;
    return this.createNotification({
      userId: assigneeId,
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: `${task.title} was assigned to you`,
      actorId,
      eventKey: `TASK_ASSIGNED:${task.id}:${assigneeId}`,
    });
  }

  async notifyTaskReassigned(actorId: string, assigneeId: string | null | undefined, task: ActivityTask) {
    if (!assigneeId || assigneeId === actorId) return null;
    const actorName = await this.actorName(actorId);
    return this.createNotification({
      userId: assigneeId,
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_REASSIGNED',
      title: 'Task assigned to you',
      message: `${task.title} was assigned to you by ${actorName}.`,
      actorId,
    });
  }

  async notifyStatusChanged(actorId: string, assigneeId: string | null | undefined, task: ActivityTask, statusName: string) {
    const actorName = await this.actorName(actorId);
    return this.notifyRelevant({
      actorId,
      recipientIds: [assigneeId],
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_STATUS_CHANGED',
      title: 'Task status changed',
      message: `${task.title} was moved to ${statusName} by ${actorName}.`,
    });
  }

  async notifyPriorityChanged(actorId: string, assigneeId: string | null | undefined, task: ActivityTask, priority: string) {
    const actorName = await this.actorName(actorId);
    return this.notifyRelevant({
      actorId,
      recipientIds: [assigneeId],
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_PRIORITY_CHANGED',
      title: 'Task priority changed',
      message: `${task.title} priority was changed to ${priority} by ${actorName}.`,
    });
  }

  async notifyCompleted(actorId: string, task: ActivityTask) {
    const actorName = await this.actorName(actorId);
    return this.notifyRelevant({
      actorId,
      recipientIds: [task.createdById, task.assigneeId],
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_COMPLETED',
      title: 'Task completed',
      message: `${actorName} completed ${task.title}.`,
    });
  }

  async notifyReopened(actorId: string, task: ActivityTask) {
    const actorName = await this.actorName(actorId);
    return this.notifyRelevant({
      actorId,
      recipientIds: [task.assigneeId, task.createdById],
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_REOPENED',
      title: 'Task reopened',
      message: `${actorName} reopened ${task.title}.`,
    });
  }

  async notifyComment(actorId: string, commentId: string, task: ActivityTask) {
    const actorName = await this.actorName(actorId);
    return this.notifyRelevant({
      actorId,
      recipientIds: [task.assigneeId, task.createdById],
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_COMMENT',
      title: 'New comment',
      message: `${actorName} commented on ${task.title}.`,
      eventKey: (userId) => `TASK_COMMENT:${commentId}:${userId}`,
    });
  }

  async notifyMentions(actorId: string, commentId: string, body: string, task: ActivityTask) {
    const actorName = await this.actorName(actorId);
    const mentioned = await this.resolveMentions(task.workspaceId, body);
    return this.notifyRelevant({
      actorId,
      recipientIds: mentioned,
      workspaceId: task.workspaceId,
      taskId: task.id,
      type: 'TASK_MENTION',
      title: 'You were mentioned',
      message: `${actorName} mentioned you in ${task.title}.`,
      eventKey: (userId) => `TASK_MENTION:${commentId}:${userId}`,
    });
  }

  async getUserNotifications(
    userId: string,
    options: { workspaceId?: string; page?: number; limit?: number; filter?: string; q?: string } = {},
  ) {
    const workspaceId = options.workspaceId;
    await this.assertWorkspaceFilter(userId, workspaceId);
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const filterKey = (options.filter || 'all').toLowerCase();
    const types = filterKey === 'all' ? undefined : FILTER_TYPES[filterKey];
    const q = options.q?.trim().slice(0, 100);
    const where = {
      userId,
      ...(workspaceId ? { workspaceId } : {}),
      ...(types ? { type: { in: types } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { message: { contains: q, mode: 'insensitive' as const } },
              { task: { title: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: TASK_INCLUDE,
      }),
    ]);
    return {
      notifications: rows.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async getUnreadCount(userId: string, workspaceId?: string) {
    await this.assertWorkspaceFilter(userId, workspaceId);
    const where = { userId, isRead: false, ...(workspaceId ? { workspaceId } : {}) };
    const [count, grouped, prefs] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
      this.getPreferences(userId),
    ]);
    const byType = new Map(grouped.map((row) => [row.type, row._count._all]));
    const sum = (types: string[]) => types.reduce((total, type) => total + (byType.get(type) || 0), 0);
    return {
      count,
      dailyDigest: prefs.dailyDigest,
      groups: {
        overdue: sum(['TASK_OVERDUE']),
        dueToday: sum(['TASK_DUE_TODAY']),
        mentions: sum(['TASK_MENTION']),
        taskUpdates: sum([
          'TASK_ASSIGNED',
          'TASK_REASSIGNED',
          'TASK_STATUS_CHANGED',
          'TASK_PRIORITY_CHANGED',
          'TASK_COMPLETED',
          'TASK_REOPENED',
          'TASK_COMMENT',
          'TASK_DUE_TOMORROW',
        ]),
      },
    };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    if (existing.isRead) return this.reload(existing.id, userId);

    await this.prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true, readAt: new Date() },
    });
    return this.reload(existing.id, userId);
  }

  async markAllNotificationsRead(userId: string, workspaceId?: string) {
    await this.assertWorkspaceFilter(userId, workspaceId);
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false, ...(workspaceId ? { workspaceId } : {}) },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async deleteNotification(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    await this.prisma.notification.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  async getPreferences(userId: string): Promise<PreferenceSettings> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_PREFERENCES };
    return this.toPreference(row);
  }

  async updatePreferences(userId: string, patch: Partial<PreferenceSettings>) {
    const current = await this.getPreferences(userId);
    const next = { ...current };
    for (const field of PREFERENCE_FIELDS) {
      if (typeof patch[field] === 'boolean') next[field] = patch[field];
    }
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return this.toPreference(row);
  }

  private async preferenceAllows(userId: string, type: string) {
    const prefs = await this.getPreferences(userId);
    const field = TYPE_TO_PREFERENCE[type];
    if (!field) return prefs.workspaceActivity;
    return prefs[field];
  }

  private toPreference(row: PreferenceSettings): PreferenceSettings {
    const settings = { ...DEFAULT_PREFERENCES };
    for (const field of PREFERENCE_FIELDS) settings[field] = row[field];
    return settings;
  }

  private async reload(id: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
      include: TASK_INCLUDE,
    });
    if (!row) throw new NotFoundException('Notification not found');
    return this.toResponse(row);
  }

  private async notifyRelevant(input: {
    actorId: string;
    recipientIds: Array<string | null | undefined>;
    workspaceId: string;
    taskId: string;
    type: string;
    title: string;
    message: string;
    eventKey?: (userId: string) => string;
  }) {
    const recipients = [...new Set(input.recipientIds.filter((id): id is string => !!id && id !== input.actorId))];
    const created = [];
    for (const userId of recipients) {
      const row = await this.createNotification({
        userId,
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        type: input.type,
        title: input.title,
        message: input.message,
        actorId: input.actorId,
        eventKey: input.eventKey?.(userId),
      });
      if (row) created.push(row);
    }
    return created;
  }

  private async actorName(actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    return user?.name || 'Someone';
  }

  private async resolveMentions(workspaceId: string, body: string) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true } } },
    });
    const people = members
      .map((member) => ({ id: member.user.id, name: member.user.name.trim() }))
      .filter((person) => person.name)
      .sort((a, b) => b.name.length - a.name.length);
    const ids = new Set<string>();
    for (const person of people) {
      const pattern = new RegExp(`@${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu');
      if (pattern.test(body)) ids.add(person.id);
    }
    return [...ids];
  }

  private async assertWorkspaceFilter(userId: string, workspaceId?: string) {
    if (!workspaceId) return;
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this workspace');
  }

  private toResponse(row: {
    id: string;
    userId: string;
    workspaceId: string;
    taskId: string | null;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: Date;
    readAt: Date | null;
    task: {
      id: string;
      title: string;
      priority: string | null;
      listId: string;
      list: { name: string; space: { id: string; name: string } };
    } | null;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      workspaceId: row.workspaceId,
      taskId: row.taskId,
      type: row.type,
      title: row.title,
      message: row.message,
      isRead: row.isRead,
      createdAt: row.createdAt,
      readAt: row.readAt,
      task: row.task
        ? {
            id: row.task.id,
            title: row.task.title,
            priority: row.task.priority,
            listId: row.task.listId,
            listName: row.task.list.name,
            spaceId: row.task.list.space.id,
            spaceName: row.task.list.space.name,
          }
        : null,
    };
  }
}
