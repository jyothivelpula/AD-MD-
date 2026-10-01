import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type WorkSummary = {
  overdueCount: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  highPriorityCount: number;
  unreadNotifications: number;
  unreadMentions: number;
  completedRecently: number;
  inProgressCount: number;
};

export type BriefTask = {
  id: string;
  title: string;
  status: string;
  statusType: string;
  priority: string | null;
  dueDate: string | null;
  assigneeName: string | null;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
  overdueDays: number;
  reason: string;
};

export type BriefMention = BriefTask & { message: string };

export type SmartBrief = {
  summary: WorkSummary;
  attention: BriefTask[];
  overdue: BriefTask[];
  dueToday: BriefTask[];
  dueTomorrow: BriefTask[];
  mentions: BriefMention[];
  completed: BriefTask[];
  inProgress: BriefTask[];
};

type TaskRow = {
  id: string;
  title: string;
  priority: string | null;
  dueDate: Date | null;
  statusId: string;
  assigneeName: string | null;
  createdAt?: Date;
  listId: string;
  list: {
    name: string;
    space: {
      id: string;
      name: string;
      statuses: { id: string; name: string; type: string }[];
    };
  };
  assignee: { name: string } | null;
};

@Injectable()
export class SmartNotificationsService {
  constructor(private prisma: PrismaService) {}

  async build(userId: string, workspaceId: string): Promise<SmartBrief> {
    await this.assertMember(userId, workspaceId);
    const now = new Date();
    const today = this.startOfDay(now);
    const tomorrow = this.addDays(today, 1);
    const dayAfter = this.addDays(today, 2);
    const recentSince = this.addDays(today, -14);

    const [tasks, unreadNotifications, unreadMentions, mentionRows] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          list: { space: { workspaceId } },
          OR: [{ assigneeId: userId }, { assignees: { some: { userId } } }],
        },
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          statusId: true,
          assigneeName: true,
          createdAt: true,
          listId: true,
          list: {
            select: {
              name: true,
              space: { select: { id: true, name: true, statuses: { select: { id: true, name: true, type: true } } } },
            },
          },
          assignee: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 300,
      }),
      this.prisma.notification.count({ where: { userId, workspaceId, isRead: false } }),
      this.prisma.notification.count({ where: { userId, workspaceId, isRead: false, type: 'TASK_MENTION' } }),
      this.prisma.notification.findMany({
        where: { userId, workspaceId, isRead: false, type: 'TASK_MENTION' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              priority: true,
              dueDate: true,
              statusId: true,
              assigneeName: true,
              listId: true,
              list: {
                select: {
                  name: true,
                  space: { select: { id: true, name: true, statuses: { select: { id: true, name: true, type: true } } } },
                },
              },
              assignee: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const cards = tasks.map((task) => this.toCard(task, today));
    const open = cards.filter((task) => task.statusType !== 'done');
    const overdue = open.filter((task) => task.overdueDays > 0).sort((a, b) => this.rank(a) - this.rank(b) || b.overdueDays - a.overdueDays);
    const dueToday = open.filter((task) => this.isDueOn(task, today, tomorrow));
    const dueTomorrow = open.filter((task) => this.isDueOn(task, tomorrow, dayAfter));
    const inProgress = open.filter((task) => task.statusType === 'in_progress');
    const recentDone = cards
      .filter((task) => task.statusType === 'done')
      .filter((task) => {
        const row = tasks.find((item) => item.id === task.id);
        return Boolean(row && row.createdAt >= recentSince);
      })
      .slice(0, 8);

    const mentions: BriefMention[] = mentionRows
      .filter((row) => row.task)
      .map((row) => ({
        ...this.toCard(row.task as TaskRow, today),
        message: row.message,
        reason: row.message,
      }));

    const attention = this.rankAttention(overdue, dueToday, mentions, dueTomorrow).slice(0, 8);

    return {
      summary: {
        overdueCount: overdue.length,
        dueTodayCount: dueToday.length,
        dueTomorrowCount: dueTomorrow.length,
        highPriorityCount: open.filter((task) => this.isHigh(task.priority)).length,
        unreadNotifications,
        unreadMentions,
        completedRecently: recentDone.length,
        inProgressCount: inProgress.length,
      },
      attention,
      overdue: overdue.slice(0, 12),
      dueToday: dueToday.slice(0, 12),
      dueTomorrow: dueTomorrow.slice(0, 12),
      mentions,
      completed: recentDone,
      inProgress: inProgress.slice(0, 12),
    };
  }

  llmContext(userName: string, brief: SmartBrief) {
    const slim = (task: BriefTask) => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : null,
      assignee: task.assigneeName,
      overdueDays: task.overdueDays,
      reason: task.reason,
    });
    return {
      userName,
      counts: brief.summary,
      overdue: brief.overdue.map(slim),
      dueToday: brief.dueToday.map(slim),
      dueTomorrow: brief.dueTomorrow.map(slim),
      mentions: brief.mentions.map((item) => ({ taskTitle: item.title, message: item.message })),
      completed: brief.completed.map((item) => ({ title: item.title })),
      inProgress: brief.inProgress.map((item) => ({ title: item.title, status: item.status })),
    };
  }

  private rankAttention(overdue: BriefTask[], dueToday: BriefTask[], mentions: BriefMention[], dueTomorrow: BriefTask[]) {
    const overdueHigh = overdue.filter((task) => this.isHigh(task.priority));
    const overdueRest = overdue.filter((task) => !this.isHigh(task.priority));
    const todayHigh = dueToday.filter((task) => this.isHigh(task.priority));
    const todayRest = dueToday.filter((task) => !this.isHigh(task.priority));
    const mentionCards = mentions.map((item) => ({ ...item, reason: item.message }));
    return [...overdueHigh, ...overdueRest, ...todayHigh, ...todayRest, ...mentionCards, ...dueTomorrow];
  }

  private toCard(task: TaskRow, today: Date): BriefTask {
    const status = task.list.space.statuses.find((item) => item.id === task.statusId);
    const statusType = status?.type || 'open';
    const overdueDays = task.dueDate && statusType !== 'done' ? this.daysBetween(this.startOfDay(task.dueDate), today) : 0;
    const high = this.isHigh(task.priority);
    let reason = 'Assigned to you';
    if (overdueDays > 0) reason = `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
    else if (task.dueDate && this.isSameDay(task.dueDate, today)) reason = high ? 'High priority · Due today' : 'Due today';
    else if (task.dueDate && this.isSameDay(task.dueDate, this.addDays(today, 1))) reason = 'Due tomorrow';
    else if (high) reason = 'High priority';
    return {
      id: task.id,
      title: task.title,
      status: status?.name || 'Unknown',
      statusType,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      assigneeName: task.assignee?.name || task.assigneeName,
      listId: task.listId,
      listName: task.list.name,
      spaceId: task.list.space.id,
      spaceName: task.list.space.name,
      overdueDays: Math.max(0, overdueDays),
      reason,
    };
  }

  private rank(task: BriefTask) {
    if (task.overdueDays > 0 && this.isHigh(task.priority)) return 0;
    if (task.overdueDays > 0) return 1;
    if (this.isHigh(task.priority)) return 2;
    return 3;
  }

  private isDueOn(task: BriefTask, start: Date, end: Date) {
    if (!task.dueDate || task.overdueDays > 0) return false;
    const due = new Date(task.dueDate);
    return due >= start && due < end;
  }

  private isSameDay(due: Date, day: Date) {
    const start = this.startOfDay(day);
    return due >= start && due < this.addDays(start, 1);
  }

  private isHigh(priority: string | null) {
    const value = (priority || '').toLowerCase();
    return value === 'high' || value === 'urgent';
  }

  private daysBetween(dueDay: Date, today: Date) {
    return Math.round((today.getTime() - dueDay.getTime()) / 86400000);
  }

  private startOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private async assertMember(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this workspace');
  }
}
