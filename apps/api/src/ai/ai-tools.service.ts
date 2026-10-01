import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiContextDto } from './dto/ai-context.dto.js';

export type AiTaskCard = {
  id: string;
  title: string;
  status: string;
  statusType: string;
  statusColor: string;
  priority: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  ownerName: string | null;
  createdByName: string | null;
  createdById: string | null;
  createdAt?: string | null;
  dueDate: string | null;
  startDate: string | null;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
  isOverdue: boolean;
  description?: string | null;
  url?: string | null;
  workCategory?: string | null;
};

export type GetTasksFilters = {
  assigneeMe?: boolean;
  assigneeId?: string;
  assigneeName?: string;
  unassigned?: boolean;
  statusType?: 'open' | 'in_progress' | 'done';
  statusName?: string;
  priority?: string;
  highPriority?: boolean;
  due?: 'overdue' | 'today' | 'week' | 'none';
  search?: string;
  listId?: string;
  listName?: string;
  spaceId?: string;
  spaceName?: string;
  createdById?: string;
  createdByName?: string;
  createdByMe?: boolean;
  blocked?: boolean;
  noDueDate?: boolean;
  excludeDone?: boolean;
};

type TaskRow = Prisma.TaskGetPayload<{
  include: {
    list: { include: { space: { include: { statuses: true } } } };
    assignee: { select: { id: true; name: true } };
    createdBy: { select: { id: true; name: true } };
  };
}>;

@Injectable()
export class AiToolsService {
  constructor(private prisma: PrismaService) {}

  async assertWorkspaceMember(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (member) return member;
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    throw new ForbiddenException('You do not have access to this workspace');
  }

  async getContextTree(userId: string, workspaceId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    const spaces = await this.prisma.space.findMany({
      where: { workspaceId },
      include: {
        lists: { orderBy: { name: 'asc' } },
        statuses: { orderBy: { order: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const spacePayload = [];
    for (const space of spaces) {
      const people = await this.peopleForSpace(space.id, members.map((m) => m.user));
      spacePayload.push({
        id: space.id,
        name: space.name,
        lists: space.lists.map((l) => ({ id: l.id, name: l.name })),
        people,
        statuses: space.statuses.map((s) => ({ id: s.id, name: s.name, type: s.type, color: s.color })),
      });
    }

    return {
      workspace: { id: workspace!.id, name: workspace!.name },
      spaces: spacePayload,
      people: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
    };
  }

  async getPicker(userId: string, workspaceId: string, q?: string) {
    const query = (q || '').trim();
    const people = await this.getUsers(userId, workspaceId);
    const lists = await this.getLists(userId, workspaceId);
    const found = await this.getTasks(
      userId,
      workspaceId,
      undefined,
      query ? { search: query, excludeDone: true } : { excludeDone: true },
      userId,
    );
    const qLower = query.toLowerCase();
    return {
      tasks: found.tasks.slice(0, 40).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        listId: t.listId,
        listName: t.listName,
        spaceId: t.spaceId,
        spaceName: t.spaceName,
        assigneeName: t.assigneeName,
      })),
      lists: lists
        .filter((l) => !qLower || `${l.spaceName} ${l.name}`.toLowerCase().includes(qLower))
        .map((l) => ({ id: l.id, name: l.name, spaceId: l.spaceId, spaceName: l.spaceName })),
      people: people
        .filter((p) => !qLower || p.name.toLowerCase().includes(qLower) || p.email.toLowerCase().includes(qLower))
        .map((p) => ({ id: p.id, name: p.name, email: p.email })),
    };
  }

  async getWorkspaceSummary(userId: string, workspaceId: string, context?: AiContextDto) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const scoped = await this.loadScopedTasks(userId, workspaceId, context, {});
    const counts = this.countByStatus(scoped);
    return {
      workspaceId,
      context: this.describeContext(context),
      total: scoped.length,
      ...counts,
      overdue: scoped.filter((t) => t.isOverdue).length,
      unassigned: scoped.filter((t) => !t.assigneeId && !t.assigneeName).length,
      noDueDate: scoped.filter((t) => !t.dueDate).length,
      highPriority: scoped.filter((t) => this.isHighPriority(t.priority)).length,
    };
  }

  async getLists(userId: string, workspaceId: string, spaceId?: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const lists = await this.prisma.list.findMany({
      where: {
        space: { workspaceId },
        ...(spaceId ? { spaceId } : {}),
      },
      include: { space: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
      orderBy: { name: 'asc' },
    });
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      spaceId: l.space.id,
      spaceName: l.space.name,
      taskCount: l._count.tasks,
    }));
  }

  async getUsers(userId: string, workspaceId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    }));
  }

  async getTask(userId: string, workspaceId: string, taskId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, list: { space: { workspaceId } } },
      include: {
        list: { include: { space: { include: { statuses: true } } } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: 'desc' }, take: 8 },
        nextActions: { orderBy: { createdAt: 'desc' }, take: 8 },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    const card = this.toCard(task);
    const subtasks = await this.prisma.task.findMany({
      where: { parentTaskId: taskId },
      include: {
        list: { include: { space: { include: { statuses: true } } } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    return {
      ...card,
      createdAt: task.createdAt.toISOString(),
      description: task.description,
      url: task.url,
      workCategory: task.workCategory,
      ownerName: task.ownerName,
      customFields: task.customFields,
      comments: task.comments.map((c) => ({
        body: c.body,
        authorName: c.authorName,
        createdAt: c.createdAt.toISOString(),
      })),
      nextActions: task.nextActions.map((n) => ({ text: n.text, createdAt: n.createdAt.toISOString() })),
      attachments: (await this.prisma.attachment.findMany({ where: { taskId } })).map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
      })),
      subtasks: subtasks.map((s) => this.toCard(s)),
    };
  }

  async quickLookup(userId: string, workspaceId: string, message: string): Promise<AiTaskCard[]> {
    const q = message
      .toLowerCase()
      .replace(/\ba+re\b/g, 'are')
      .replace(/\btaks\b/g, 'tasks')
      .replace(/\bwhats\b/g, 'what is');
    const mine = /\b(my|mine)\b/.test(q) && /\b(task|tasks|work|todo|assigned|progress|attention)\b/.test(q);
    const inProgress = /\bin progress\b|\bdoing\b|\bworking on\b/.test(q);
    const overdue = /\boverdue\b|\bpast due\b/.test(q);
    const dueToday = /\bdue today\b/.test(q);
    const dueTomorrow = /\bdue tomorrow\b/.test(q);
    const attention = /\battention\b|\bfocus\b/.test(q);
    const progress = /\bprogress\b/.test(q);
    const mentions = /\bmention/.test(q);
    const high = /\bhigh priority\b|\burgent\b/.test(q);
    const where: Prisma.TaskWhereInput = { list: { space: { workspaceId } } };
    const and: Prisma.TaskWhereInput[] = [];

    if (mine) {
      and.push({
        OR: [
          { assigneeId: userId },
          { assignees: { some: { userId } } },
          { createdById: userId },
        ],
      });
    }
    if (high) {
      and.push({
        OR: [
          { priority: { equals: 'High', mode: 'insensitive' } },
          { priority: { equals: 'Urgent', mode: 'insensitive' } },
        ],
      });
    }
    if (overdue) and.push({ dueDate: { lt: this.startOfDay(new Date()) } });
    if (dueToday || dueTomorrow) {
      const start = this.startOfDay(new Date());
      if (dueTomorrow) start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      and.push({ dueDate: { gte: start, lt: end } });
    }
    if (mentions) {
      const notes = await this.prisma.notification.findMany({
        where: { userId, workspaceId, type: 'TASK_MENTION' },
        select: { taskId: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const ids = notes.map((note) => note.taskId).filter((id): id is string => Boolean(id));
      if (!ids.length) return [];
      and.push({ id: { in: ids } });
    }

    const generic = new Set([
      'who', 'what', 'when', 'where', 'why', 'how', 'are', 'the', 'my', 'mine', 'task', 'tasks', 'work',
      'show', 'tell', 'please', 'about', 'all', 'any', 'progress', 'overdue', 'due', 'today', 'week',
      'high', 'priority', 'urgent', 'assigned', 'todo', 'list', 'give', 'for', 'and', 'with', 'from',
      'current', 'currently', 'doing', 'working', 'this', 'that', 'you', 'your', 'have', 'has',
    ]);
    const words = q
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !generic.has(w));
    const guided = overdue || dueToday || dueTomorrow || attention || progress || mentions || inProgress || high;
    if (words.length && !mine && !guided) {
      and.push({
        OR: words.slice(0, 3).flatMap((w) => [
          { title: { contains: w, mode: 'insensitive' as const } },
          { list: { name: { contains: w, mode: 'insensitive' as const } } },
          { list: { space: { name: { contains: w, mode: 'insensitive' as const } } } },
        ]),
      });
    }
    if (and.length) where.AND = and;

    const rows = await this.prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        statusId: true,
        priority: true,
        dueDate: true,
        startDate: true,
        assigneeId: true,
        assigneeName: true,
        ownerName: true,
        createdById: true,
        createdAt: true,
        listId: true,
        url: true,
        workCategory: true,
        list: {
          select: {
            id: true,
            name: true,
            space: {
              select: {
                id: true,
                name: true,
                statuses: { select: { id: true, name: true, type: true, color: true } },
              },
            },
          },
        },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    let cards = rows.map((t) => this.toCard(t as TaskRow));
    if (inProgress || progress) cards = cards.filter((t) => t.statusType === 'in_progress' || /progress|doing/i.test(t.status));
    if ((mine || inProgress || attention || dueToday || dueTomorrow) && !mentions) {
      cards = cards.filter((t) => t.statusType !== 'done');
    }
    if (overdue) cards = cards.filter((t) => t.isOverdue);
    if (attention) {
      const start = this.startOfDay(new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const score = (task: AiTaskCard) => {
        const due = task.dueDate ? new Date(task.dueDate) : null;
        const dueTodayCard = Boolean(due && due >= start && due < end && !task.isOverdue);
        const highCard = /high|urgent/i.test(task.priority || '');
        if (task.isOverdue && highCard) return 0;
        if (task.isOverdue) return 1;
        if (dueTodayCard && highCard) return 2;
        if (dueTodayCard) return 3;
        if (highCard) return 4;
        return 5;
      };
      cards.sort((a, b) => score(a) - score(b));
    }
    return cards;
  }

  async getTasks(
    userId: string,
    workspaceId: string,
    context: AiContextDto | undefined,
    filters: GetTasksFilters,
    currentUserId: string,
  ) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const tasks = await this.loadScopedTasks(userId, workspaceId, context, filters, currentUserId);
    const limit = 40;
    return {
      total: tasks.length,
      truncated: tasks.length > limit,
      tasks: tasks.slice(0, limit),
    };
  }

  async searchTasks(userId: string, workspaceId: string, context: AiContextDto | undefined, query: string) {
    return this.getTasks(userId, workspaceId, context, { search: query }, userId);
  }

  async getSpaces(userId: string, workspaceId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const spaces = await this.prisma.space.findMany({
      where: { workspaceId },
      include: { lists: true, statuses: { orderBy: { order: 'asc' } }, folders: true },
      orderBy: { name: 'asc' },
    });
    return spaces.map((s) => ({
      id: s.id,
      name: s.name,
      listCount: s.lists.length,
      lists: s.lists.map((l) => ({ id: l.id, name: l.name })),
      folders: s.folders.map((f) => ({ id: f.id, name: f.name })),
      statuses: s.statuses.map((st) => ({ id: st.id, name: st.name, type: st.type })),
    }));
  }

  async getTaskComments(userId: string, workspaceId: string, taskId: string) {
    await this.getTask(userId, workspaceId, taskId);
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.authorName,
      userId: c.userId,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async getTaskSubtasks(userId: string, workspaceId: string, taskId: string) {
    const parent = await this.getTask(userId, workspaceId, taskId);
    return { parent: { id: parent.id, title: parent.title }, subtasks: parent.subtasks };
  }

  async getTaskActivity(userId: string, workspaceId: string, taskId: string) {
    const task = await this.getTask(userId, workspaceId, taskId);
    const logs = await this.prisma.activityLog.findMany({
      where: { taskId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      taskId: task.id,
      title: task.title,
      createdByName: task.createdByName,
      assigneeName: task.assigneeName,
      ownerName: task.ownerName,
      assignmentAudit: logs.filter((l) => /assign/i.test(l.action)),
      activity: logs.map((l) => ({
        action: l.action,
        userId: l.userId,
        meta: l.meta,
        createdAt: l.createdAt.toISOString(),
      })),
      comments: task.comments,
      nextActions: task.nextActions,
      note: logs.length
        ? undefined
        : 'No assignment audit trail is stored. createdBy is who created the task; assignee is who currently owns the work. Do not assume the creator assigned it.',
    };
  }

  private searchPhrases(query: string): string[] {
    const q = query.trim();
    const stop = new Set([
      'who', 'what', 'when', 'where', 'why', 'how', 'is', 'are', 'was', 'were', 'the', 'a', 'an',
      'me', 'my', 'i', 'to', 'for', 'of', 'in', 'on', 'at', 'this', 'that', 'these', 'those',
      'task', 'tasks', 'work', 'please', 'show', 'tell', 'give', 'about', 'current', 'currently',
      'assigned', 'assignee', 'assign', 'created', 'create', 'creator', 'owner', 'owns', 'from',
      'with', 'and', 'or', 'any', 'all', 'can', 'you', 'your', 'our', 'we', 'them', 'their',
      'has', 'have', 'does', 'did', 'get', 'find', 'list', 'which', 'whose', 'working', 'status',
      'priority', 'due', 'overdue', 'progress', 'summary', 'summarize', 'latest', 'update',
    ]);
    const words = q
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stop.has(w.toLowerCase()));
    const phrases = [q];
    if (words.length) phrases.push(words.join(' '));
    for (const w of words) if (w.length > 2) phrases.push(w);
    return [...new Set(phrases.map((p) => p.trim()).filter(Boolean))];
  }

  async searchWorkspace(userId: string, workspaceId: string, query: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const q = query.trim();
    if (!q) return { query: q, tasks: [], people: [], lists: [], spaces: [], comments: [] };

    const phrases = this.searchPhrases(q);
    const tokens = phrases.filter((p) => p.toLowerCase() !== q.toLowerCase());
    if (!tokens.length) {
      return {
        query: q,
        tooGeneric: true,
        hint: 'Use get_tasks and/or get_workspace_summary for this general workspace question.',
        tasks: [],
        people: [],
        lists: [],
        spaces: [],
        comments: [],
      };
    }

    const people = await this.getUsers(userId, workspaceId);
    const lists = await this.getLists(userId, workspaceId);
    const spaces = await this.getSpaces(userId, workspaceId);
    const joined = tokens.find((p) => p.includes(' ')) || tokens[0];

    const taskMap = new Map<string, AiTaskCard>();
    const primary = await this.getTasks(userId, workspaceId, undefined, { search: joined }, userId);
    for (const t of primary.tasks) taskMap.set(t.id, t);
    if (taskMap.size === 0) {
      for (const phrase of phrases.slice(0, 6)) {
        const found = await this.getTasks(userId, workspaceId, undefined, { search: phrase }, userId);
        for (const t of found.tasks) taskMap.set(t.id, t);
      }
    }

    const matchedPeople = people.filter((p) =>
      phrases.some(
        (ph) => p.name.toLowerCase().includes(ph.toLowerCase()) || ph.toLowerCase().includes(p.name.toLowerCase()),
      ),
    );
    for (const person of matchedPeople) {
      const theirs = await this.getTasks(
        userId,
        workspaceId,
        undefined,
        { assigneeId: person.id, assigneeName: person.name },
        userId,
      );
      for (const t of theirs.tasks) taskMap.set(t.id, t);
    }

    const comments = await this.prisma.comment.findMany({
      where: {
        OR: phrases.slice(0, 4).map((ph) => ({ body: { contains: ph, mode: 'insensitive' as const } })),
        task: { list: { space: { workspaceId } } },
      },
      include: { task: { select: { id: true, title: true } } },
      take: 15,
      orderBy: { createdAt: 'desc' },
    });

    return {
      query: q,
      phrases,
      tasks: [...taskMap.values()],
      people: matchedPeople,
      lists: lists.filter((l) => phrases.some((ph) => l.name.toLowerCase().includes(ph.toLowerCase()))),
      spaces: spaces.filter((s) => phrases.some((ph) => s.name.toLowerCase().includes(ph.toLowerCase()))),
      comments: comments.map((c) => ({
        taskId: c.task.id,
        taskTitle: c.task.title,
        body: c.body,
        authorName: c.authorName,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  private async loadScopedTasks(
    userId: string,
    workspaceId: string,
    context: AiContextDto | undefined,
    filters: GetTasksFilters,
    currentUserId = userId,
  ): Promise<AiTaskCard[]> {
    const where: Prisma.TaskWhereInput = {
      list: { space: { workspaceId } },
    };

    if (context?.type === 'list' && context.id) where.listId = context.id;
    if (context?.type === 'space' && context.id) {
      where.list = { space: { workspaceId, id: context.id } };
    }
    if (context?.type === 'task' && context.id) where.id = context.id;
    if (context?.type === 'person') {
      const personClause = this.personClause(context.id, context.name);
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), personClause];
    }

    if (filters.listId) where.listId = filters.listId;
    if (filters.spaceId) where.list = { space: { workspaceId, id: filters.spaceId } };
    if (filters.listName) {
      const list = await this.prisma.list.findFirst({
        where: { name: { equals: filters.listName, mode: 'insensitive' }, space: { workspaceId } },
      });
      if (list) where.listId = list.id;
      else where.listId = '__none__';
    }
    if (filters.spaceName) {
      const space = await this.prisma.space.findFirst({
        where: { name: { equals: filters.spaceName, mode: 'insensitive' }, workspaceId },
      });
      if (space) where.list = { space: { workspaceId, id: space.id } };
      else where.list = { space: { workspaceId, id: '__none__' } };
    }

    if (filters.createdByMe) {
      where.createdById = currentUserId;
    } else if (filters.createdById) {
      where.createdById = filters.createdById;
    } else if (filters.createdByName) {
      const creator = await this.prisma.user.findFirst({
        where: { name: { equals: filters.createdByName, mode: 'insensitive' } },
      });
      where.createdById = creator?.id || '__none__';
    }

    if (filters.assigneeMe) {
      const me = await this.prisma.user.findUnique({ where: { id: currentUserId } });
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { assigneeId: currentUserId },
            { assignees: { some: { userId: currentUserId } } },
            ...(me ? [{ assigneeName: { equals: me.name, mode: 'insensitive' as const } }] : []),
          ],
        },
      ];
    }
    if (filters.assigneeId || filters.assigneeName) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        this.personClause(filters.assigneeId, filters.assigneeName),
      ];
    }
    if (filters.unassigned) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { assigneeId: null, OR: [{ assigneeName: null }, { assigneeName: '' }] },
      ];
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { assigneeName: { contains: q, mode: 'insensitive' } },
            { ownerName: { contains: q, mode: 'insensitive' } },
            { createdBy: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    if (filters.priority) {
      where.priority = { equals: filters.priority, mode: 'insensitive' };
    }
    if (filters.highPriority) {
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : where.OR ? [where.OR] : []),
        { priority: { equals: 'High', mode: 'insensitive' } },
        { priority: { equals: 'Urgent', mode: 'insensitive' } },
      ];
    }

    const startToday = this.startOfDay(new Date());
    const endToday = new Date(startToday);
    endToday.setDate(endToday.getDate() + 1);
    const endWeek = new Date(startToday);
    endWeek.setDate(endWeek.getDate() + 7);

    if (filters.due === 'today') {
      where.dueDate = { gte: startToday, lt: endToday };
    } else if (filters.due === 'week') {
      where.dueDate = { gte: startToday, lt: endWeek };
    } else if (filters.due === 'overdue') {
      where.dueDate = { lt: startToday };
    } else if (filters.due === 'none' || filters.noDueDate) {
      where.dueDate = null;
    }

    const rows = await this.prisma.task.findMany({
      where,
      include: {
        list: { include: { space: { include: { statuses: true } } } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
      take: 200,
    });

    let cards = rows.map((t) => this.toCard(t));

    if (filters.statusType) {
      cards = cards.filter((t) => {
        if (t.statusType === filters.statusType) return true;
        if (filters.statusType === 'in_progress' && /progress|doing|working/i.test(t.status)) return true;
        return false;
      });
    }
    if (filters.excludeDone) {
      cards = cards.filter((t) => t.statusType !== 'done');
    }
    if (filters.statusName) {
      const name = filters.statusName.toLowerCase();
      cards = cards.filter((t) => t.status.toLowerCase().includes(name));
    }
    if (filters.blocked) {
      cards = cards.filter(
        (t) =>
          t.status.toLowerCase().includes('block') ||
          (t.title || '').toLowerCase().includes('block') ||
          (t.description || '').toLowerCase().includes('block'),
      );
    }
    if (filters.due === 'overdue') {
      cards = cards.filter((t) => t.isOverdue);
    }
    if (filters.due === 'today' || filters.due === 'week') {
      cards = cards.filter((t) => t.statusType !== 'done');
    }

    return cards;
  }

  private personClause(id?: string, name?: string): Prisma.TaskWhereInput {
    const or: Prisma.TaskWhereInput[] = [];
    if (id) {
      or.push({ assigneeId: id });
      or.push({ assignees: { some: { userId: id } } });
    }
    if (name) {
      or.push({ assigneeName: { equals: name, mode: 'insensitive' } });
      or.push({ assignees: { some: { user: { name: { equals: name, mode: 'insensitive' } } } } });
    }
    if (or.length === 0) return {};
    return { OR: or };
  }

  private toCard(task: TaskRow): AiTaskCard {
    const status = task.list.space.statuses.find((s) => s.id === task.statusId);
    const due = task.dueDate;
    const startToday = this.startOfDay(new Date());
    const isOverdue = Boolean(due && due < startToday && status?.type !== 'done');
    return {
      id: task.id,
      title: task.title,
      status: status?.name || 'Unknown',
      statusType: status?.type || 'open',
      statusColor: status?.color || '#6B7280',
      priority: task.priority,
      assigneeName: task.assignee?.name || task.assigneeName,
      assigneeId: task.assigneeId,
      ownerName: task.ownerName,
      createdByName: task.createdBy?.name || null,
      createdById: task.createdById,
      createdAt: task.createdAt.toISOString(),
      dueDate: due ? due.toISOString() : null,
      startDate: task.startDate ? task.startDate.toISOString() : null,
      listId: task.listId,
      listName: task.list.name,
      spaceId: task.list.space.id,
      spaceName: task.list.space.name,
      isOverdue,
      description: task.description ? task.description.slice(0, 400) : null,
      url: task.url,
      workCategory: task.workCategory,
    };
  }

  private countByStatus(tasks: AiTaskCard[]) {
    return {
      open: tasks.filter((t) => t.statusType === 'open').length,
      inProgress: tasks.filter((t) => t.statusType === 'in_progress').length,
      done: tasks.filter((t) => t.statusType === 'done').length,
    };
  }

  private isHighPriority(priority: string | null) {
    const p = (priority || '').toLowerCase();
    return p === 'high' || p === 'urgent';
  }

  private startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  describeContext(context?: AiContextDto | null) {
    if (!context) return 'Entire workspace';
    if (context.type === 'workspace') return context.name || 'Entire workspace';
    const label =
      context.type === 'space'
        ? 'Space'
        : context.type === 'list'
          ? 'List'
          : context.type === 'person'
            ? 'Person'
            : context.type === 'task'
              ? 'Task'
              : 'Workspace';
    return `${label}: ${context.name || context.id || ''}`.trim();
  }

  private async peopleForSpace(spaceId: string, members: { id: string; name: string }[]) {
    const tasks = await this.prisma.task.findMany({
      where: { list: { spaceId } },
      select: { assigneeId: true, assigneeName: true },
    });
    const seen = new Set<string>();
    const people: { key: string; userId: string | null; name: string }[] = [];
    const add = (name: string, userId: string | null) => {
      const key = (userId || name).toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      people.push({ key: userId || `name:${name}`, userId, name });
    };
    for (const m of members) add(m.name, m.id);
    for (const t of tasks) {
      if (t.assigneeId) {
        const member = members.find((m) => m.id === t.assigneeId);
        add(member?.name || t.assigneeName || 'Assignee', t.assigneeId);
      } else if (t.assigneeName) {
        add(t.assigneeName, null);
      }
    }
    return people;
  }
}
