import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailService } from '../email/email.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { AddNextActionDto } from './dto/add-next-action.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { MergeTaskDto } from './dto/merge-task.dto.js';
import { AddCommentDto } from './dto/add-comment.dto.js';

const TASK_TYPES = ['Development', 'Bug', 'Research', 'Documentation', 'Meeting', 'Testing', 'Design', 'Marketing', 'HR', 'Other'];
const TEAMS = ['Development', 'AI / ML', 'GenAI', 'HR', 'Marketing', 'Sales', 'Finance', 'Operations', 'Management', 'Other'];
const DURATIONS = ['30 minutes', '1 hour', '2 hours', '1 day', '3 days'];
const APPROVAL_STATUSES = ['Not Required', 'Pending', 'Approved', 'Rejected', 'Changes Requested'];
const DEPENDENCY_TYPES = ['Blocked by', 'Blocks', 'Related to'];

function optionalChoice(value: string | undefined, allowed: string[], label: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!allowed.includes(trimmed)) {
    throw new BadRequestException(`${label} is not a valid option`);
  }
  return trimmed;
}

function parseDate(value?: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emails: EmailService,
  ) {}

  private async allocateTaskCode() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`
        SELECT code FROM "Task"
        WHERE code LIKE 'TASK-%'
        ORDER BY CAST(SUBSTRING(code FROM 6) AS INTEGER) DESC
        LIMIT 1
      `;
      const current = rows[0] ? Number(rows[0].code.slice(5)) : 0;
      const code = `TASK-${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, '0')}`;
      const taken = await this.prisma.task.findUnique({ where: { code }, select: { id: true } });
      if (!taken) return code;
    }
    throw new BadRequestException('Could not assign a task ID');
  }

  private async dependencyPatch(taskId: string, workspaceId: string, dto: { dependencyTaskId?: string | null; dependencyType?: string | null }) {
    if (dto.dependencyTaskId === undefined && dto.dependencyType === undefined) return {};
    const dependencyTaskId = (dto.dependencyTaskId ?? '').trim();
    const dependencyType = optionalChoice(dto.dependencyType ?? undefined, DEPENDENCY_TYPES, 'Dependency type');
    if (dependencyTaskId === '') {
      return { dependencyTaskId: null, dependencyType: null };
    }
    if (!dependencyTaskId && dependencyType === undefined) return {};
    if (!dependencyTaskId) {
      throw new BadRequestException('Choose a related task for this dependency');
    }
    if (dependencyTaskId === taskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }
    const other = await this.prisma.task.findUnique({
      where: { id: dependencyTaskId },
      include: { list: { select: { space: { select: { workspaceId: true } } } } },
    });
    if (!other || other.list.space.workspaceId !== workspaceId) {
      throw new BadRequestException('Related task was not found in this workspace');
    }
    return {
      dependencyTaskId,
      dependencyType: dependencyType || 'Related to',
    };
  }

  private async resolveReviewer(workspaceId: string, reviewerId: string | null) {
    const id = (reviewerId || '').trim();
    if (!id) return null;
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: id } },
    });
    if (!member) throw new BadRequestException('Reviewer must be a workspace member');
    return id;
  }

  private choicePatch(dto: {
    taskType?: string;
    team?: string;
    estimatedTime?: string;
    actualTime?: string;
    acceptanceCriteria?: string;
    approvalStatus?: string;
  }) {
    return {
      ...(dto.taskType !== undefined ? { taskType: optionalChoice(dto.taskType, TASK_TYPES, 'Task type') } : {}),
      ...(dto.team !== undefined ? { team: optionalChoice(dto.team, TEAMS, 'Team') } : {}),
      ...(dto.estimatedTime !== undefined ? { estimatedTime: optionalChoice(dto.estimatedTime, DURATIONS, 'Estimated time') } : {}),
      ...(dto.actualTime !== undefined ? { actualTime: optionalChoice(dto.actualTime, DURATIONS, 'Actual time') } : {}),
      ...(dto.approvalStatus !== undefined ? { approvalStatus: optionalChoice(dto.approvalStatus, APPROVAL_STATUSES, 'Approval status') || 'Not Required' } : {}),
      ...(dto.acceptanceCriteria !== undefined ? { acceptanceCriteria: (dto.acceptanceCriteria || '').trim() || null } : {}),
    };
  }

  private async assertListAccess(userId: string, listId: string) {
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      include: {
        space: {
          include: {
            workspace: { include: { members: true } },
            statuses: true,
          },
        },
      },
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

  private async assertTaskAccess(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          include: {
            space: {
              include: {
                workspace: { include: { members: true } },
                statuses: true,
                customFields: true,
              },
            },
          },
        },
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const isMember = task.list.space.workspace.members.some((m: { userId: string }) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this task');
    }
    return task;
  }

  private async resolveAssignee(assigneeId?: string | null, assigneeName?: string | null) {
    if (assigneeId) {
      const user = await this.prisma.user.findUnique({ where: { id: assigneeId } });
      if (!user) {
        throw new NotFoundException('Assignee not found');
      }
      return { assigneeId: user.id, assigneeName: user.name };
    }
    if (assigneeName && assigneeName.trim()) {
      const name = assigneeName.trim();
      const user = await this.prisma.user.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      return { assigneeId: user?.id ?? null, assigneeName: name };
    }
    return { assigneeId: null, assigneeName: null };
  }

  private async syncTaskAssignees(taskId: string, assigneeId: string | null) {
    await this.prisma.taskAssignee.deleteMany({ where: { taskId } });
    if (assigneeId) {
      await this.prisma.taskAssignee.create({ data: { taskId, userId: assigneeId } });
    }
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
    return keep;
  }

  private async assertSpaceMember(userId: string, spaceId: string) {
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

  private async resolvePersonKey(personKey: string) {
    const decoded = decodeURIComponent(personKey);
    if (decoded.startsWith('name:')) {
      const name = decoded.slice(5).trim();
      if (!name) throw new NotFoundException('Person not found');
      const user = await this.prisma.user.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      return { userId: user?.id ?? null, name: user?.name ?? name };
    }
    const user = await this.prisma.user.findUnique({ where: { id: decoded } });
    if (!user) {
      throw new NotFoundException('Assignee not found');
    }
    return { userId: user.id, name: user.name };
  }

  async listPeople(actorId: string, spaceId: string) {
    await this.assertSpaceMember(actorId, spaceId);
    const people: { key: string; userId: string | null; name: string; email: string | null }[] = [];
    const seen = new Set<string>();

    const addPerson = (name: string, userId: string | null, email: string | null = null) => {
      const label = name.trim();
      if (!label) return;
      const k = label.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      people.push({ key: userId || `name:${label}`, userId, name: label, email });
    };

    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      include: { workspace: { include: { members: true } } },
    });
    if (!space) return [];

    const memberUsers = await this.prisma.user.findMany({
      where: { id: { in: space.workspace.members.map((m: { userId: string }) => m.userId) } },
    });
    for (const user of memberUsers) addPerson(user.name, user.id, user.email);

    const lists = await this.prisma.list.findMany({ where: { spaceId } });
    for (const list of lists) {
      if (list.name.trim().toLowerCase() === 'general') continue;
      const user = await this.prisma.user.findFirst({
        where: { name: { equals: list.name.trim(), mode: 'insensitive' } },
      });
      if (user) addPerson(user.name, user.id, user.email);
    }

    const assigned = await this.prisma.task.findMany({
      where: { list: { spaceId }, OR: [{ assigneeId: { not: null } }, { assigneeName: { not: null } }] },
      select: { assigneeId: true, assigneeName: true },
    });
    const assigneeIds = assigned.map((t) => t.assigneeId).filter((id): id is string => !!id);
    const assigneeUsers = assigneeIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(assigneeIds)] } } })
      : [];
    const userById = new Map(assigneeUsers.map((u) => [u.id, u]));
    for (const t of assigned) {
      if (t.assigneeId && userById.get(t.assigneeId)) {
        const u = userById.get(t.assigneeId)!;
        addPerson(u.name, u.id, u.email);
      } else if (t.assigneeName) {
        addPerson(t.assigneeName, null);
      }
    }

    return people.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(userId: string, listId: string, dto: CreateTaskDto) {
    const list = await this.assertListAccess(userId, listId);

    let statusId = dto.statusId;
    if (!statusId) {
      const defaultStatus = [...list.space.statuses].sort((a, b) => a.order - b.order)[0];
      if (!defaultStatus) {
        throw new NotFoundException('No statuses configured for this space');
      }
      statusId = defaultStatus.id;
    }

    const lastTask = await this.prisma.task.findFirst({
      where: { listId },
      orderBy: { position: 'desc' },
    });
    const position = lastTask ? lastTask.position + 1 : 1;
    const assignee = await this.resolveAssignee(dto.assigneeId, dto.assigneeName);
    const workspaceId = list.space.workspaceId;
    const code = await this.allocateTaskCode();
    const reviewerId = dto.reviewerId !== undefined ? await this.resolveReviewer(workspaceId, dto.reviewerId) : undefined;
    const dependency = await this.dependencyPatch('new', workspaceId, dto);

    const task = await this.prisma.task.create({
      data: {
        listId,
        title: dto.title,
        description: dto.description,
        statusId,
        priority: dto.priority,
        position,
        createdById: userId,
        assigneeId: assignee.assigneeId,
        assigneeName: assignee.assigneeName,
        ownerName: dto.ownerName,
        workCategory: dto.workCategory,
        scope: dto.scope,
        url: dto.url,
        code,
        startDate: parseDate(dto.startDate) || undefined,
        dueDate: parseDate(dto.dueDate) || undefined,
        progressDate: parseDate(dto.progressDate) || undefined,
        parentTaskId: dto.parentTaskId,
        ...(reviewerId !== undefined ? { reviewerId } : {}),
        ...this.choicePatch(dto),
        ...dependency,
      },
    });
    await this.syncTaskAssignees(task.id, assignee.assigneeId);
    await this.notifications.notifyTaskAssigned(userId, assignee.assigneeId, {
      id: task.id,
      title: task.title,
      workspaceId: list.space.workspaceId,
    });
    return task;
  }

  async createForPerson(actorId: string, spaceId: string, personKey: string, dto: CreateTaskDto) {
    await this.assertSpaceMember(actorId, spaceId);
    const person = await this.resolvePersonKey(personKey);
    const general = await this.ensureGeneralList(spaceId);
    return this.create(actorId, general.id, {
      ...dto,
      assigneeId: person.userId || undefined,
      assigneeName: person.name,
    });
  }

  async findAssignedInSpace(actorId: string, spaceId: string, personKey: string) {
    await this.assertSpaceMember(actorId, spaceId);
    const person = await this.resolvePersonKey(personKey);
    return this.prisma.task.findMany({
      where: {
        list: { spaceId },
        OR: [
          ...(person.userId ? [{ assigneeId: person.userId }] : []),
          { assigneeName: { equals: person.name, mode: 'insensitive' as const } },
        ],
      },
      orderBy: { position: 'asc' },
    });
  }

  async findAllForList(userId: string, listId: string) {
    await this.assertListAccess(userId, listId);
    return this.prisma.task.findMany({
      where: { listId },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(userId: string, taskId: string) {
    const task = await this.assertTaskAccess(userId, taskId);
    if (!task.code) {
      task.code = await this.allocateTaskCode();
      await this.prisma.task.update({ where: { id: task.id }, data: { code: task.code } });
    }
    const [subtasks, nextActions, comments, attachments, activityLogs, assignee, dependencyTask, reviewer] = await Promise.all([
      this.prisma.task.findMany({ where: { parentTaskId: taskId }, orderBy: { position: 'asc' } }),
      this.prisma.nextActionEntry.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.comment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.attachment.findMany({ where: { taskId } }),
      this.prisma.activityLog.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      task.assigneeId
        ? this.prisma.user.findUnique({ where: { id: task.assigneeId }, select: { email: true, emailVerified: true } })
        : Promise.resolve(null),
      task.dependencyTaskId
        ? this.prisma.task.findUnique({ where: { id: task.dependencyTaskId }, select: { id: true, title: true, code: true } })
        : Promise.resolve(null),
      task.reviewerId
        ? this.prisma.user.findUnique({ where: { id: task.reviewerId }, select: { id: true, name: true, email: true } })
        : Promise.resolve(null),
    ]);
    return {
      ...task,
      subtasks,
      nextActions,
      comments,
      attachments,
      activityLogs,
      dependencyTask,
      reviewerName: reviewer?.name || null,
      reviewerEmail: reviewer?.email || null,
      assigneeEmail: assignee?.emailVerified ? assignee.email : null,
      assigneeEmailUnverified: assignee && !assignee.emailVerified ? assignee.email : null,
      customFieldDefs: task.list.space.customFields,
    };
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await this.assertTaskAccess(userId, taskId);

    if (dto.statusId) {
      const validStatus = task.list.space.statuses.some((s: { id: string }) => s.id === dto.statusId);
      if (!validStatus) {
        throw new NotFoundException('Status not found in this space');
      }
    }

    const assigneePatch =
      dto.assigneeId !== undefined || dto.assigneeName !== undefined
        ? await this.resolveAssignee(dto.assigneeId, dto.assigneeName)
        : null;

    const workspaceId = task.list.space.workspaceId;
    const reviewerId = dto.reviewerId !== undefined ? await this.resolveReviewer(workspaceId, dto.reviewerId) : undefined;
    const dependency = await this.dependencyPatch(taskId, workspaceId, dto);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.statusId !== undefined ? { statusId: dto.statusId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(assigneePatch
          ? { assigneeId: assigneePatch.assigneeId, assigneeName: assigneePatch.assigneeName }
          : {}),
        ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
        ...(dto.workCategory !== undefined ? { workCategory: dto.workCategory } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.startDate !== undefined ? { startDate: parseDate(dto.startDate) } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: parseDate(dto.dueDate) } : {}),
        ...(dto.progressDate !== undefined ? { progressDate: parseDate(dto.progressDate) } : {}),
        ...(dto.customFieldValues !== undefined ? { customFields: dto.customFieldValues } : {}),
        ...(reviewerId !== undefined ? { reviewerId } : {}),
        ...this.choicePatch(dto),
        ...dependency,
      },
    });
    const activityTask = {
      id: updated.id,
      title: updated.title,
      workspaceId,
      assigneeId: updated.assigneeId,
      createdById: updated.createdById,
    };
    if (assigneePatch) {
      await this.syncTaskAssignees(taskId, assigneePatch.assigneeId);
      if (assigneePatch.assigneeId && assigneePatch.assigneeId !== task.assigneeId) {
        await this.notifications.notifyTaskReassigned(userId, assigneePatch.assigneeId, activityTask);
      }
    }
    if (dto.statusId && dto.statusId !== task.statusId) {
      const oldStatus = task.list.space.statuses.find((s: { id: string }) => s.id === task.statusId);
      const newStatus = task.list.space.statuses.find((s: { id: string }) => s.id === dto.statusId);
      if (oldStatus && newStatus) {
        const wasDone = oldStatus.type === 'done';
        const isDone = newStatus.type === 'done';
        if (!wasDone && isDone) await this.notifications.notifyCompleted(userId, activityTask);
        else if (wasDone && !isDone) await this.notifications.notifyReopened(userId, activityTask);
        else await this.notifications.notifyStatusChanged(userId, activityTask.assigneeId, activityTask, newStatus.name);
      }
    }
    if (dto.priority !== undefined && (dto.priority || '') !== (task.priority || '')) {
      await this.notifications.notifyPriorityChanged(
        userId,
        activityTask.assigneeId,
        activityTask,
        dto.priority || 'None',
      );
    }
    return updated;
  }

  async addNextAction(userId: string, taskId: string, dto: AddNextActionDto) {
    await this.assertTaskAccess(userId, taskId);
    return this.prisma.nextActionEntry.create({
      data: { taskId, text: dto.text },
    });
  }

  async updateNextAction(userId: string, taskId: string, entryId: string, dto: AddNextActionDto) {
    await this.assertTaskAccess(userId, taskId);
    const entry = await this.prisma.nextActionEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.taskId !== taskId) {
      throw new NotFoundException('Next action entry not found');
    }
    return this.prisma.nextActionEntry.update({
      where: { id: entryId },
      data: { text: dto.text },
    });
  }

  async removeNextAction(userId: string, taskId: string, entryId: string) {
    await this.assertTaskAccess(userId, taskId);
    const entry = await this.prisma.nextActionEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.taskId !== taskId) {
      throw new NotFoundException('Next action entry not found');
    }
    await this.prisma.nextActionEntry.delete({ where: { id: entryId } });
    return { id: entryId, deleted: true };
  }

  async addComment(userId: string, taskId: string, dto: AddCommentDto) {
    const task = await this.assertTaskAccess(userId, taskId);
    const comment = await this.prisma.comment.create({
      data: { taskId, userId, authorName: dto.authorName || null, body: dto.body },
    });
    const activityTask = {
      id: task.id,
      title: task.title,
      workspaceId: task.list.space.workspaceId,
      assigneeId: task.assigneeId,
      createdById: task.createdById,
    };
    await this.notifications.notifyComment(userId, comment.id, activityTask);
    await this.notifications.notifyMentions(userId, comment.id, dto.body, activityTask);
    return comment;
  }

  async removeComment(userId: string, taskId: string, commentId: string) {
    await this.assertTaskAccess(userId, taskId);
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundException('Comment not found');
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { id: commentId, deleted: true };
  }

  async addAttachment(userId: string, taskId: string, file: Express.Multer.File | undefined) {
    await this.assertTaskAccess(userId, taskId);
    if (!file) {
      throw new NotFoundException('No file was received');
    }
    const url = `/uploads/${taskId}/${file.filename}`;
    return this.prisma.attachment.create({
      data: { taskId, url, name: file.originalname },
    });
  }

  async removeAttachment(userId: string, taskId: string, attachmentId: string) {
    await this.assertTaskAccess(userId, taskId);
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.taskId !== taskId) {
      throw new NotFoundException('Attachment not found');
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    try {
      unlinkSync(join(process.cwd(), attachment.url.replace(/^\//, '')));
    } catch {
      // File already missing on disk — the DB row is still removed, which is what matters.
    }
    return { id: attachmentId, deleted: true };
  }

  async duplicate(userId: string, taskId: string) {
    const task = await this.assertTaskAccess(userId, taskId);

    const lastTask = await this.prisma.task.findFirst({
      where: { listId: task.listId },
      orderBy: { position: 'desc' },
    });
    const position = lastTask ? lastTask.position + 1 : 1;

    const copy = await this.prisma.task.create({
      data: {
        listId: task.listId,
        title: `${task.title} (copy)`,
        description: task.description,
        statusId: task.statusId,
        priority: task.priority,
        position,
        customFields: task.customFields as any,
        createdById: userId,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        ownerName: task.ownerName,
        workCategory: task.workCategory,
        scope: task.scope,
        url: task.url,
        code: await this.allocateTaskCode(),
        taskType: task.taskType,
        team: task.team,
        reviewerId: task.reviewerId,
        estimatedTime: task.estimatedTime,
        actualTime: task.actualTime,
        dependencyType: task.dependencyType,
        dependencyTaskId: task.dependencyTaskId,
        acceptanceCriteria: task.acceptanceCriteria,
        approvalStatus: task.approvalStatus,
        startDate: task.startDate,
        dueDate: task.dueDate,
        progressDate: task.progressDate,
      },
    });
    await this.syncTaskAssignees(copy.id, task.assigneeId);
    await this.notifications.notifyTaskAssigned(userId, copy.assigneeId, {
      id: copy.id,
      title: copy.title,
      workspaceId: task.list.space.workspaceId,
    });
    return copy;
  }

  async move(userId: string, taskId: string, dto: MoveTaskDto) {
    const task = await this.assertTaskAccess(userId, taskId);
    const targetList = await this.assertListAccess(userId, dto.targetListId);

    const sameSpace = targetList.spaceId === task.list.spaceId;

    let statusId = task.statusId;
    if (!sameSpace) {
      const defaultStatus = [...targetList.space.statuses].sort((a, b) => a.order - b.order)[0];
      if (!defaultStatus) {
        throw new NotFoundException('No statuses configured for the target list\'s space');
      }
      statusId = defaultStatus.id;
    }

    const lastTask = await this.prisma.task.findFirst({
      where: { listId: dto.targetListId },
      orderBy: { position: 'desc' },
    });
    const position = lastTask ? lastTask.position + 1 : 1;

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        listId: dto.targetListId,
        statusId,
        position,
      },
    });
  }

  async merge(userId: string, taskId: string, dto: MergeTaskDto) {
    if (taskId === dto.targetTaskId) {
      throw new NotFoundException('Cannot merge a task into itself');
    }
    const sourceTask = await this.assertTaskAccess(userId, taskId);
    await this.assertTaskAccess(userId, dto.targetTaskId);

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { parentTaskId: taskId },
        data: { parentTaskId: dto.targetTaskId },
      }),
      this.prisma.nextActionEntry.updateMany({
        where: { taskId },
        data: { taskId: dto.targetTaskId },
      }),
      this.prisma.nextActionEntry.create({
        data: { taskId: dto.targetTaskId, text: `Merged task "${sourceTask.title}" into this one` },
      }),
      this.prisma.task.delete({ where: { id: taskId } }),
    ]);

    return { mergedInto: dto.targetTaskId, deleted: taskId };
  }

  async remove(userId: string, taskId: string) {
    await this.assertTaskAccess(userId, taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
    return { id: taskId, deleted: true };
  }

  async locateTask(userId: string, taskId: string) {
    const task = await this.assertTaskAccess(userId, taskId);
    return {
      id: task.id,
      title: task.title,
      listId: task.listId,
      listName: task.list.name,
      spaceId: task.list.space.id,
      spaceName: task.list.space.name,
    };
  }

  async sendTaskEmail(
    userId: string,
    taskId: string,
    dto: { to: string[]; cc?: string[]; subject: string; body: string },
  ) {
    if (!dto.to.length) throw new BadRequestException('Add at least one recipient');
    const task = await this.assertTaskAccess(userId, taskId);
    return this.emails.sendTaskEmail({
      taskId: task.id,
      workspaceId: task.list.space.workspaceId,
      senderId: userId,
      to: dto.to,
      cc: dto.cc,
      subject: dto.subject,
      body: dto.body,
      kind: 'manual',
    });
  }

  async retryTaskEmail(userId: string, taskId: string, emailId: string) {
    await this.assertTaskAccess(userId, taskId);
    const row = await this.prisma.taskEmail.findFirst({ where: { id: emailId, taskId } });
    if (!row) throw new NotFoundException('Email not found');
    const saved = await this.emails.retry(emailId);
    if (saved?.status === 'sent' && saved.taskId) {
      await this.prisma.activityLog.create({
        data: {
          workspaceId: saved.workspaceId,
          taskId: saved.taskId,
          userId,
          action: `Email sent to ${saved.recipientEmail}`,
          meta: { taskEmailId: saved.id, recipientEmail: saved.recipientEmail },
        },
      });
    }
    return saved;
  }
}
