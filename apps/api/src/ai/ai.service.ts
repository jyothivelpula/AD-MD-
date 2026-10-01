import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService, ChatMessage, LlmTool } from './ai-provider.service.js';
import { AiTaskCard, AiToolsService, GetTasksFilters } from './ai-tools.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SmartNotificationsService } from '../notifications/smart-notifications.service.js';
import { AiContextDto } from './dto/ai-context.dto.js';
import { CreateAiChatDto } from './dto/create-chat.dto.js';
import { SendAiMessageDto } from './dto/send-message.dto.js';

export type AiStructuredResponse = {
  type: 'answer' | 'task_list' | 'summary' | 'clarification';
  content: string;
  tasks: AiTaskCard[];
  entities: { type: string; id: string; name: string }[];
  actions: { type: string; label: string; taskId?: string }[];
  source: 'workspace';
  usedLlm: boolean;
};

type ToolRun = { name: string; args: Record<string, unknown>; result: unknown };

const WORKSPACE_TOOLS: LlmTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_workspace',
      description:
        'General search across task titles, descriptions, comments, people, lists, and spaces. Use when the user mentions a name, topic, or phrase that might match several entity types.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tasks',
      description: 'Find tasks by text in title or description. Use to resolve a task name to its id.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task',
      description: 'Get one task by id, including description, creator, assignee, dates, comments, and subtasks.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Task UUID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tasks',
      description:
        'List workspace tasks with filters. For "in progress / overdue / high priority" do NOT set assigneeMe unless the user named themselves. For "my tasks" use assigneeMe and createdByMe. Never call with empty filters unless they asked for everything.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          assigneeMe: { type: 'boolean' },
          assigneeName: { type: 'string' },
          assigneeId: { type: 'string' },
          createdByName: { type: 'string' },
          createdById: { type: 'string' },
          createdByMe: { type: 'boolean' },
          unassigned: { type: 'boolean' },
          statusType: { type: 'string', enum: ['open', 'in_progress', 'done'] },
          statusName: { type: 'string' },
          priority: { type: 'string' },
          highPriority: { type: 'boolean' },
          due: { type: 'string', enum: ['overdue', 'today', 'week', 'none'] },
          listId: { type: 'string' },
          listName: { type: 'string' },
          spaceId: { type: 'string' },
          spaceName: { type: 'string' },
          blocked: { type: 'boolean' },
          excludeDone: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_comments',
      description: 'Get comments / daily logs for a task id.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_subtasks',
      description: 'Get subtasks for a task id.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_activity',
      description:
        'Get comments, next actions, and assignment audit if stored. Use for latest update, who assigned, history.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_people',
      description: 'List people in the workspace with ids.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lists',
      description: 'List lists in the workspace.',
      parameters: { type: 'object', properties: { spaceId: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spaces',
      description: 'List spaces, folders, and lists.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_summary',
      description: 'Counts for the workspace: total, in progress, overdue, unassigned, high priority. Use only for summaries.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private tools: AiToolsService,
    private provider: AiProviderService,
    private smart: SmartNotificationsService,
    private notifications: NotificationsService,
    private emails: EmailService,
  ) {}

  async listChats(userId: string, workspaceId: string) {
    await this.tools.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.aiChat.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        contextJson: true,
        model: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createChat(userId: string, workspaceId: string, dto: CreateAiChatDto) {
    await this.tools.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.aiChat.create({
      data: {
        workspaceId,
        userId,
        title: dto.title?.trim() || 'New chat',
        contextJson: (dto.context as object | undefined) ?? undefined,
        model: dto.model || this.provider.model,
      },
    });
  }

  async getChat(userId: string, workspaceId: string, chatId: string) {
    const load = () =>
      this.prisma.aiChat.findFirst({
        where: { id: chatId, workspaceId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    try {
      const chat = await load();
      if (!chat) throw new NotFoundException('Chat not found');
      return chat;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      const code = (err as { code?: string }).code;
      if (code !== 'P2024') throw err;
      const chat = await load();
      if (!chat) throw new NotFoundException('Chat not found');
      return chat;
    }
  }

  async renameChat(userId: string, workspaceId: string, chatId: string, title: string) {
    await this.getChat(userId, workspaceId, chatId);
    const next = title.replace(/\s+/g, ' ').trim();
    return this.prisma.aiChat.update({
      where: { id: chatId },
      data: { title: next || 'New chat' },
      select: {
        id: true,
        title: true,
        contextJson: true,
        model: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteChat(userId: string, workspaceId: string, chatId: string) {
    await this.getChat(userId, workspaceId, chatId);
    await this.prisma.aiChat.delete({ where: { id: chatId } });
    return { ok: true };
  }

  async contextTree(userId: string, workspaceId: string) {
    return this.tools.getContextTree(userId, workspaceId);
  }

  async picker(userId: string, workspaceId: string, q?: string) {
    return this.tools.getPicker(userId, workspaceId, q);
  }

  status() {
    return this.provider.status();
  }

  async dailyBrief(userId: string, workspaceId: string, generate: boolean) {
    const [user, prefs, facts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      this.notifications.getPreferences(userId),
      this.smart.build(userId, workspaceId),
    ]);
    if (!user) throw new ForbiddenException('User not found');
    const briefDate = this.briefDate();
    const cached = await this.prisma.dailyBrief.findUnique({
      where: { userId_workspaceId_briefDate: { userId, workspaceId, briefDate } },
    });
    let summary = cached?.content ?? null;
    let summaryUnavailable = false;
    let generatedAt = cached?.generatedAt ?? null;
    if (generate) {
      const written = await this.writeDailySummary(user.name, facts);
      if (written) {
        const saved = await this.prisma.dailyBrief.upsert({
          where: { userId_workspaceId_briefDate: { userId, workspaceId, briefDate } },
          create: { userId, workspaceId, briefDate, content: written },
          update: { content: written, generatedAt: new Date() },
        });
        summary = saved.content;
        generatedAt = saved.generatedAt;
      } else if (!summary) {
        summaryUnavailable = true;
      }
    }
    await this.emails.maybeSendDailySummary(userId, workspaceId, facts).catch(() => undefined);
    return {
      ...facts,
      userName: user.name,
      aiEnabled: prefs.dailyAiBrief,
      aiSummary: summary,
      summaryUnavailable,
      cached: Boolean(cached) && !generate,
      generatedAt,
    };
  }

  private briefDate(now = new Date()) {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  private async writeDailySummary(userName: string, facts: Awaited<ReturnType<SmartNotificationsService['build']>>) {
    const allowed = new Set(
      [...facts.overdue, ...facts.dueToday, ...facts.dueTomorrow, ...facts.mentions, ...facts.completed, ...facts.inProgress].map((task) =>
        task.title.toLowerCase(),
      ),
    );
    const text = await this.provider.complete([
      {
        role: 'system',
        content:
          'You are an AI workspace assistant. Summarize only the workspace facts supplied by the application. Do not invent tasks, users, dates, priorities, statuses, comments, or activity. Use the supplied counts exactly. If a list is empty, do not mention items for it. Write at most 3 short sentences.',
      },
      {
        role: 'user',
        content: `Write today's brief for ${userName} using only this JSON:\n${JSON.stringify(this.smart.llmContext(userName, facts))}`,
      },
    ]);
    if (!text) return null;
    const quoted = [...text.matchAll(/"([^"]{2,80})"/g)].map((match) => match[1].toLowerCase());
    if (quoted.some((title) => !allowed.has(title) && title !== userName.toLowerCase())) return null;
    return text.slice(0, 700);
  }

  private async assignmentAnswer(userId: string, workspaceId: string, task: AiTaskCard) {
    const note = await this.prisma.notification.findFirst({
      where: { userId, workspaceId, taskId: task.id, type: { in: ['TASK_ASSIGNED', 'TASK_REASSIGNED'] } },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } },
    });
    if (note?.actor?.name) return `${note.actor.name} assigned ${task.title} to you.`;
    const activity = await this.tools.getTaskActivity(userId, workspaceId, task.id);
    if (activity.note) {
      return `${task.title} is assigned to ${task.assigneeName || 'Unassigned'}. ${activity.note}`;
    }
    return `${task.title} is assigned to ${task.assigneeName || 'Unassigned'}.`;
  }

  async sendMessage(userId: string, workspaceId: string, chatId: string, dto: SendAiMessageDto) {
    const text = dto.content.trim();
    const greeting = this.isGreeting(text);
    const listQuestion = this.coverageCalls(text, '', dto.context).length > 0;
    const aboutPrevious = /\bwhich one\b|\bwho assigned\b|\bwho mentioned\b/i.test(text);
    const followUp = !greeting && !dto.taskIds?.length && (aboutPrevious || (!listQuestion && this.refersToFocused(text)));

    const [chat, user, lookedUp] = await Promise.all([
      this.prisma.aiChat.findFirst({
        where: { id: chatId, workspaceId, userId },
        select: {
          id: true,
          title: true,
          model: true,
          contextJson: true,
          messages: {
            where: { role: 'assistant' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { responseJson: true },
          },
        },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
      greeting || followUp ? Promise.resolve(null) : this.tools.quickLookup(userId, workspaceId, text),
    ]);
    if (!chat) throw new NotFoundException('Chat not found');
    if (!user) throw new ForbiddenException('User not found');

    const context = dto.context || (chat.contextJson as AiContextDto | null) || undefined;
    const lastTasks = this.extractTasks(chat.messages[0]?.responseJson);
    const tasks = lookedUp ?? lastTasks;
    let answerTasks = tasks;
    let answerText = this.fallbackAnswer({ message: text, userName: user.name }, tasks, []);
    if (!greeting && followUp && tasks[0] && /\bwho assigned\b|\bassigned it\b/i.test(text)) {
      answerText = await this.assignmentAnswer(userId, workspaceId, tasks[0]);
      answerTasks = [tasks[0]];
    }
    const structured: AiStructuredResponse = greeting
      ? {
          type: 'answer',
          content: 'Hi! 👋 How can I help you with your workspace?',
          tasks: [],
          entities: [],
          actions: [],
          source: 'workspace',
          usedLlm: false,
        }
      : this.toResult(answerText, answerTasks, [], false).structured;

    const shouldRename = chat.title === 'New chat' || chat.title.startsWith('New chat');
    const title = shouldRename ? this.titleFrom(text) : chat.title;
    const contextJson = {
      ...(context as object | undefined),
      taskIds: dto.taskIds,
      listIds: dto.listIds,
      userIds: dto.userIds,
      links: dto.links,
    };

    const [userMessage, assistantMessage, updated] = await Promise.all([
      this.prisma.aiMessage.create({
        data: { chatId, role: 'user', content: text, contextJson },
      }),
      this.prisma.aiMessage.create({
        data: {
          chatId,
          role: 'assistant',
          content: structured.content,
          contextJson: (context as object | undefined) ?? undefined,
          toolCalls: [],
          responseJson: structured as object,
        },
      }),
      this.prisma.aiChat.update({
        where: { id: chatId },
        data: {
          title,
          contextJson: (context as object | undefined) ?? undefined,
          model: dto.model || chat.model || this.provider.model,
        },
      }),
    ]);

    return {
      chat: { id: updated.id, title: updated.title, updatedAt: updated.updatedAt },
      userMessage,
      assistantMessage: { ...assistantMessage, responseJson: structured },
    };
  }

  private isGreeting(message: string) {
    return /^(hi|hii+|hello|hey|yo|sup|hiya|howdy|good (morning|afternoon|evening))([\s,!.]*| there[\s,!.]*)?$/i.test(
      message.trim(),
    );
  }

  private async answer(input: {
    userId: string;
    userName: string;
    workspaceId: string;
    message: string;
    context?: AiContextDto;
    lastTasks: AiTaskCard[];
    history: { role: string; content: string }[];
    model?: string;
  }): Promise<{ structured: AiStructuredResponse; toolCalls: ToolRun[] }> {
    if (this.isGreeting(input.message)) {
      return {
        toolCalls: [],
        structured: {
          type: 'answer',
          content: 'Hi! 👋 How can I help you with your workspace?',
          tasks: [],
          entities: [],
          actions: [],
          source: 'workspace',
          usedLlm: false,
        },
      };
    }

    const toolCalls: ToolRun[] = [];
    const focused = input.lastTasks.filter((t) => t?.id && t?.title).slice(0, 8);
    let content: string | null = null;
    let usedLlm = false;

    const coverage = this.coverageCalls(input.message, input.userName, input.context);
    if (coverage.length) {
      for (const call of coverage) {
        const result = await this.executeTool(input.userId, input.workspaceId, input.context, input.userId, call);
        toolCalls.push({ name: call.name, args: call.args, result });
      }
      const tasks = this.collectTasks(toolCalls, focused, input.message);
      return this.toResult(this.fallbackAnswer(input, tasks, toolCalls), tasks, toolCalls, false);
    }

    if (this.provider.llmEnabled) {
      const result = await this.runLlmTools(input, focused, toolCalls);
      content = result.content;
      usedLlm = result.usedLlm;
    }

    let tasks = this.collectTasks(toolCalls, focused, input.message);
    if (!toolCalls.length) {
      const searched = await this.executeTool(input.userId, input.workspaceId, input.context, input.userId, {
        name: 'search_workspace',
        args: { query: input.message },
      });
      toolCalls.push({ name: 'search_workspace', args: { query: input.message }, result: searched });
      tasks = this.collectTasks(toolCalls, focused, input.message);
    }

    if (tasks.length && this.looksEmptyClaim(content)) {
      content = null;
    }

    if (!content && tasks.length && this.provider.llmEnabled) {
      content = await this.provider.complete(
        [
          {
            role: 'system',
            content:
              'Answer using only these workspace records. Do not invent data. If the user said "my" but assigned-to-them is empty, say so and show the matching workspace work (created by them or in progress). Use exact task titles. Be concise.',
          },
          {
            role: 'user',
            content: `Question: ${input.message}\nCurrent user: ${input.userName}\nRecords: ${JSON.stringify(tasks.slice(0, 20).map((t) => this.slimTask(t)))}`,
          },
        ],
        input.model,
      );
      if (content) usedLlm = true;
    }

    if (!content) content = this.fallbackAnswer(input, tasks, toolCalls);

    return this.toResult(content, tasks, toolCalls, usedLlm);
  }

  private toResult(
    content: string,
    tasks: AiTaskCard[],
    toolCalls: ToolRun[],
    usedLlm: boolean,
  ): { structured: AiStructuredResponse; toolCalls: ToolRun[] } {
    const unique = this.mergeTasks([], tasks);
    const actions: AiStructuredResponse['actions'] = [];
    if (unique.length === 1) actions.push({ type: 'open_task', label: 'Open Task', taskId: unique[0].id });
    else if (unique.length > 1) actions.push({ type: 'view_tasks', label: 'View Tasks' });

    const type: AiStructuredResponse['type'] =
      unique.length > 1 && /which one|which of|two tasks|multiple/i.test(content) ? 'clarification' : unique.length ? 'task_list' : 'answer';

    return {
      toolCalls,
      structured: {
        type,
        content,
        tasks: unique,
        entities: unique.map((t) => ({ type: 'task', id: t.id, name: t.title })),
        actions,
        source: 'workspace',
        usedLlm,
      },
    };
  }

  private async runLlmTools(
    input: {
      userId: string;
      userName: string;
      workspaceId: string;
      message: string;
      context?: AiContextDto;
      history: { role: string; content: string }[];
      model?: string;
    },
    focused: AiTaskCard[],
    toolCalls: ToolRun[],
  ): Promise<{ content: string | null; usedLlm: boolean }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt(input, focused) },
      ...input.history.slice(-8).map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content.slice(0, 800),
      })),
      { role: 'user', content: input.message },
    ];

    for (let i = 0; i < 4; i++) {
      const turn = await this.provider.chat(messages, {
        modelOverride: input.model,
        tools: WORKSPACE_TOOLS,
        toolChoice: i === 0 ? 'required' : 'auto',
      });
      if (!turn) return { content: null, usedLlm: false };
      if (turn.toolCalls.length) {
        messages.push({
          role: 'assistant',
          content: turn.content || '',
          tool_calls: turn.toolCalls,
        });
        for (const call of turn.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          const result = await this.executeTool(input.userId, input.workspaceId, input.context, input.userId, {
            name: call.function.name,
            args,
          });
          toolCalls.push({ name: call.function.name, args, result });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(this.compactResult(result)).slice(0, 8000),
          });
        }
        continue;
      }
      return { content: turn.content, usedLlm: true };
    }
    return { content: null, usedLlm: true };
  }

  private systemPrompt(
    input: { userName: string; userId: string; workspaceId: string; context?: AiContextDto },
    focused: AiTaskCard[],
  ) {
    const focus = focused.length
      ? focused.map((t) => `${t.title} (id=${t.id}, assignee=${t.assigneeName || 'Unassigned'}, status=${t.status})`).join('; ')
      : 'none';
    return [
      'You are a workspace assistant. Answer natural-language questions about the CURRENT workspace from live tool data.',
      `Current user: ${input.userName} (id ${input.userId}). Default workspace id: ${input.workspaceId}. Context: ${this.tools.describeContext(input.context)}.`,
      `Focused tasks from this chat (for "it" / "this task"): ${focus}.`,
      'If a task, list, or person is attached, use those IDs. For status/priority/due/assignee of an attached task, call get_task with that id. Do not list the whole workspace.',
      'Always call tools. Never invent tasks, people, dates, or statuses.',
      '"My tasks" / "my work" means: (1) tasks assigned to the current user, (2) tasks they created, and if those are empty, (3) in-progress / open work in the workspace. Do not say they have no work until those queries return empty.',
      'Questions like "what is in progress" are workspace-wide. Do NOT set assigneeMe unless they said "assigned to me".',
      'createdBy = who created it. assignee = who currently works on it. Do not mix them up.',
      'If asked who assigned a task, use get_task_activity. If there is no assignment audit, say that and report creator vs assignee.',
      'Resolve names with search_tasks/search_workspace, then get_task by id.',
      'For in-progress use get_tasks statusType=in_progress. For overdue use due=overdue. For due this week use due=week. For high/urgent use highPriority=true.',
      'Answer in a few sentences using exact titles and people names from tools. Attach matching tasks.',
    ].join('\n');
  }

  private compactResult(result: unknown) {
    if (!result || typeof result !== 'object') return result;
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.tasks)) {
      return {
        ...obj,
        tasks: (obj.tasks as AiTaskCard[]).slice(0, 20).map((t) => this.slimTask(t)),
      };
    }
    if (obj.id && obj.title) return this.slimTask(obj as AiTaskCard);
    return obj;
  }

  private slimTask(t: AiTaskCard) {
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      statusType: t.statusType,
      priority: t.priority,
      assigneeName: t.assigneeName,
      assigneeId: t.assigneeId,
      ownerName: t.ownerName,
      createdByName: t.createdByName,
      createdById: t.createdById,
      createdAt: t.createdAt,
      dueDate: t.dueDate,
      startDate: t.startDate,
      listId: t.listId,
      listName: t.listName,
      spaceId: t.spaceId,
      spaceName: t.spaceName,
      isOverdue: t.isOverdue,
      description: t.description,
    };
  }

  private collectTasks(toolCalls: ToolRun[], focused: AiTaskCard[], message: string): AiTaskCard[] {
    let tasks: AiTaskCard[] = [];
    for (const call of toolCalls) {
      const r = call.result;
      if (!r || typeof r !== 'object') continue;
      const obj = r as Record<string, unknown>;
      if (Array.isArray(obj.tasks)) tasks = this.mergeTasks(tasks, obj.tasks as AiTaskCard[]);
      if (typeof obj.id === 'string' && typeof obj.title === 'string') tasks = this.mergeTasks(tasks, [obj as AiTaskCard]);
      if (obj.parent && obj.subtasks) tasks = this.mergeTasks(tasks, (obj.subtasks as AiTaskCard[]) || []);
    }
    if (!tasks.length && this.refersToFocused(message) && focused.length) {
      tasks = focused.slice(0, 1);
    }
    return tasks.filter((t) => t?.id && t?.title);
  }

  private normalizeQuestion(message: string) {
    return message
      .toLowerCase()
      .replace(/in[-\s]?progress/g, 'in progress')
      .replace(/\bmt\b/g, 'my')
      .replace(/\btaks\b/g, 'tasks')
      .replace(/\bto do\b/g, 'todo');
  }

  private looksEmptyClaim(content: string | null) {
    if (!content) return false;
    return /\b(don'?t have|do not have|no tasks|none right now|no matching|could not find|couldn't find|nothing in progress|no work)\b/i.test(
      content,
    );
  }

  private alreadyCalled(toolCalls: ToolRun[], name: string, args: Record<string, unknown>) {
    const key = JSON.stringify(args);
    return toolCalls.some((c) => c.name === name && JSON.stringify(c.args) === key);
  }

  private refersToFocused(message: string) {
    return /\b(it|this|that|the task|status|priority|due|assignee|assigned|created|blocking|update|subtask|comment|about)\b/i.test(
      message,
    );
  }

  private composeUserMessage(content: string, dto: SendAiMessageDto) {
    const bits = [content];
    if (dto.taskIds?.length) bits.push(`Attached task ids: ${dto.taskIds.join(', ')}`);
    if (dto.listIds?.length) bits.push(`Attached list ids: ${dto.listIds.join(', ')}`);
    if (dto.userIds?.length) bits.push(`Attached person ids: ${dto.userIds.join(', ')}`);
    if (dto.links?.length) bits.push(`Attached links: ${dto.links.join(', ')}`);
    for (const file of dto.attachments || []) {
      bits.push(`Attached file: ${file.name}${file.text ? `\n${file.text.slice(0, 6000)}` : ''}`);
    }
    return bits.join('\n\n');
  }

  private async resolveComposerContext(userId: string, workspaceId: string, dto: SendAiMessageDto) {
    const tasks: AiTaskCard[] = [];
    for (const id of (dto.taskIds || []).slice(0, 5)) {
      try {
        const task = await this.tools.getTask(userId, workspaceId, id);
        tasks.push(task);
      } catch {
        /* skip missing */
      }
    }
    let context: AiContextDto | undefined;
    if (tasks[0]) {
      context = {
        type: 'task',
        id: tasks[0].id,
        name: tasks[0].title,
        listId: tasks[0].listId,
        spaceId: tasks[0].spaceId,
      };
    } else if (dto.listIds?.[0]) {
      const lists = await this.tools.getLists(userId, workspaceId);
      const list = lists.find((item) => item.id === dto.listIds![0]);
      if (list) context = { type: 'list', id: list.id, name: list.name, spaceId: list.spaceId };
    } else if (dto.userIds?.[0]) {
      const people = await this.tools.getUsers(userId, workspaceId);
      const person = people.find((item) => item.id === dto.userIds![0]);
      if (person) context = { type: 'person', id: person.id, name: person.name };
    }
    return { context, tasks };
  }

  private coverageCalls(
    message: string,
    _userName: string,
    context?: AiContextDto,
  ): { name: string; args: Record<string, unknown> }[] {
    const q = this.normalizeQuestion(message);
    const mentionsPerson = /\b(jyothi|kasim)\b/i.test(message);
    const aboutMine = /\b(my|mine)\b/.test(q) && /\b(task|tasks|work|todo|assigned|progress|attention)\b/.test(q);
    const inProgress = /\bin progress\b/.test(q);
    const overdue = /\boverdue|past due\b/.test(q);
    const dueToday = /\bdue today\b/.test(q);
    const dueWeek = /\bdue this week\b/.test(q);
    const highPri = /\bhigh priority|urgent\b/.test(q);
    const summary = /\bsummar(y|ise|ize)|what'?s going on|needs? (my )?attention|overview\b/.test(q);
    const allTasks = /\b(all tasks|show tasks|what are (my |the )?tasks|what is my work|what'?s my work)\b/.test(q);
    const createdByThem = /\b(i created|created by me|i made)\b/.test(q);

    if (
      context?.type === 'task' &&
      context.id &&
      this.refersToFocused(message) &&
      !overdue &&
      !allTasks &&
      !summary &&
      !inProgress
    ) {
      return [{ name: 'get_task', args: { id: context.id } }];
    }

    const calls: { name: string; args: Record<string, unknown> }[] = [];
    if (inProgress && !mentionsPerson) {
      calls.push({ name: 'get_tasks', args: { statusType: 'in_progress' } });
      if (aboutMine) {
        calls.push({ name: 'get_tasks', args: { assigneeMe: true, statusType: 'in_progress' } });
      }
    }
    if (overdue && !mentionsPerson) calls.push({ name: 'get_tasks', args: { due: 'overdue' } });
    if (dueToday) calls.push({ name: 'get_tasks', args: { due: 'today' } });
    if (dueWeek) calls.push({ name: 'get_tasks', args: { due: 'week' } });
    if (highPri) calls.push({ name: 'get_tasks', args: { highPriority: true } });
    if ((aboutMine || createdByThem) && !inProgress) {
      calls.push({ name: 'get_tasks', args: { assigneeMe: true, excludeDone: true } });
      calls.push({ name: 'get_tasks', args: { createdByMe: true, excludeDone: true } });
    }
    if (summary || allTasks) {
      calls.push({ name: 'get_workspace_summary', args: {} });
      if (!inProgress) calls.push({ name: 'get_tasks', args: { statusType: 'in_progress' } });
      if (!overdue) calls.push({ name: 'get_tasks', args: { due: 'overdue' } });
    }
    return calls;
  }

  private fallbackAnswer(input: { message: string; userName: string }, tasks: AiTaskCard[], toolCalls: ToolRun[]) {
    const q = input.message.toLowerCase();
    const summaryCall = toolCalls.find((c) => c.name === 'get_workspace_summary' || c.name === 'get_workspace');
    if (summaryCall && summaryCall.result && typeof summaryCall.result === 'object' && !tasks.length) {
      const s = summaryCall.result as Record<string, unknown>;
      return `Workspace snapshot: ${s.total} tasks, ${s.inProgress} in progress, ${s.overdue} overdue, ${s.unassigned} unassigned, ${s.highPriority} high priority.`;
    }
    if (!tasks.length) {
      const summaryCall = toolCalls.find((c) => c.name === 'get_workspace_summary' || c.name === 'get_workspace');
      if (summaryCall && summaryCall.result && typeof summaryCall.result === 'object') {
        const s = summaryCall.result as Record<string, unknown>;
        if (s.total) {
          return `The workspace has ${s.total} tasks (${s.inProgress} in progress, ${s.overdue} overdue). Ask about a person, a list, or “in progress” to see them.`;
        }
      }
      return 'I could not find matching workspace records for that. Try naming a task, person, or list.';
    }
    if (/high priority/.test(q)) {
      const high = tasks.filter((task) => /high|urgent/i.test(task.priority || ''));
      if (!high.length) return 'None of these tasks are high priority.';
      if (high.length === 1) return `${high[0].title} is high priority.`;
      return `These tasks are high priority:\n${high.map((task) => `• ${task.title}`).join('\n')}`;
    }
    if (tasks.length === 1) {
      const t = tasks[0];
      if (/creat/i.test(q)) return `${t.title} was created by ${t.createdByName || 'an unknown user'}.`;
      if (/assign|handling|responsible|working on|who is/i.test(q)) {
        return `${t.title} is assigned to ${t.assigneeName || 'Unassigned'}.`;
      }
      if (/status/i.test(q)) return `${t.title} is currently ${t.status}.`;
      if (/priority/i.test(q)) return `${t.title} has ${t.priority || 'no'} priority.`;
      if (/due/i.test(q)) return t.dueDate ? `${t.title} is due ${t.dueDate.slice(0, 10)}.` : `${t.title} has no due date.`;
      if (/list/i.test(q)) return `${t.title} is in the ${t.listName} list (${t.spaceName}).`;
      if (/space/i.test(q)) return `${t.title} is in the ${t.spaceName} space.`;
      return `${t.title} is ${t.status}, assigned to ${t.assigneeName || 'Unassigned'}, created by ${t.createdByName || 'unknown'}.`;
    }
    const preview = tasks
      .slice(0, 8)
      .map((t) => `• ${t.title} — ${t.status}${t.assigneeName ? `, assigned to ${t.assigneeName}` : ''}`)
      .join('\n');
    const more = tasks.length > 8 ? `\n…and ${tasks.length - 8} more.` : '';
    const label = /\boverdue\b/.test(q)
      ? 'overdue'
      : /\bdue today\b/.test(q)
        ? 'due today'
        : /\bmention/.test(q)
          ? 'where you were mentioned'
          : 'matching';
    return `Here are ${tasks.length} ${label} tasks:\n${preview}${more}`;
  }

  private async executeTool(
    userId: string,
    workspaceId: string,
    context: AiContextDto | undefined,
    currentUserId: string,
    call: { name: string; args: Record<string, unknown> },
  ) {
    const str = (k: string) => (typeof call.args[k] === 'string' ? (call.args[k] as string) : undefined);
    const bool = (k: string) => Boolean(call.args[k]);
    try {
      switch (call.name) {
        case 'get_workspace':
        case 'get_workspace_summary':
          return this.tools.getWorkspaceSummary(userId, workspaceId, context);
        case 'get_lists':
          return this.tools.getLists(userId, workspaceId, str('spaceId'));
        case 'get_spaces':
          return this.tools.getSpaces(userId, workspaceId);
        case 'get_people':
        case 'get_users':
          return this.tools.getUsers(userId, workspaceId);
        case 'get_task':
        case 'get_task_details':
          if (!str('id')) return { error: 'task id required' };
          return this.tools.getTask(userId, workspaceId, str('id')!);
        case 'get_task_comments':
          if (!str('id')) return { error: 'task id required' };
          return this.tools.getTaskComments(userId, workspaceId, str('id')!);
        case 'get_task_subtasks':
          if (!str('id')) return { error: 'task id required' };
          return this.tools.getTaskSubtasks(userId, workspaceId, str('id')!);
        case 'get_task_activity':
          if (!str('id')) return { error: 'task id required' };
          return this.tools.getTaskActivity(userId, workspaceId, str('id')!);
        case 'search_workspace':
          return this.tools.searchWorkspace(userId, workspaceId, str('query') || '');
        case 'search_tasks':
          return this.tools.searchTasks(userId, workspaceId, context, str('query') || '');
        case 'get_overdue_tasks':
          return this.tools.getTasks(userId, workspaceId, context, { due: 'overdue' }, currentUserId);
        case 'get_due_today_tasks':
          return this.tools.getTasks(userId, workspaceId, context, { due: 'today' }, currentUserId);
        case 'get_due_this_week_tasks':
          return this.tools.getTasks(userId, workspaceId, context, { due: 'week' }, currentUserId);
        case 'get_tasks_by_assignee':
          return this.tools.getTasks(
            userId,
            workspaceId,
            context,
            { assigneeName: str('name') || str('assigneeName'), assigneeId: str('id') || str('assigneeId') },
            currentUserId,
          );
        case 'get_tasks_by_creator':
          return this.tools.getTasks(
            userId,
            workspaceId,
            context,
            { createdByName: str('name') || str('createdByName'), createdById: str('id') || str('createdById') },
            currentUserId,
          );
        case 'get_tasks_by_status':
          return this.tools.getTasks(
            userId,
            workspaceId,
            context,
            { statusType: str('statusType') as GetTasksFilters['statusType'], statusName: str('statusName') || str('name') },
            currentUserId,
          );
        case 'get_tasks_by_priority':
          return this.tools.getTasks(
            userId,
            workspaceId,
            context,
            { priority: str('priority') || str('name'), highPriority: bool('highPriority') },
            currentUserId,
          );
        case 'get_tasks_by_list':
          return this.tools.getTasks(
            userId,
            workspaceId,
            context,
            { listId: str('listId'), listName: str('listName') || str('name') },
            currentUserId,
          );
        case 'get_tasks_by_space':
          return this.tools.getTasks(userId, workspaceId, context, { spaceId: str('spaceId'), spaceName: str('spaceName') || str('name') }, currentUserId);
        case 'get_tasks': {
          const filters: GetTasksFilters = {
            search: str('search') || str('query'),
            assigneeMe: bool('assigneeMe'),
            assigneeId: str('assigneeId'),
            assigneeName: str('assigneeName') || str('name'),
            createdById: str('createdById'),
            createdByName: str('createdByName'),
            createdByMe: bool('createdByMe'),
            unassigned: bool('unassigned'),
            statusType: str('statusType') as GetTasksFilters['statusType'],
            statusName: str('statusName'),
            priority: str('priority'),
            highPriority: bool('highPriority'),
            due: str('due') as GetTasksFilters['due'],
            listId: str('listId'),
            listName: str('listName'),
            spaceId: str('spaceId'),
            spaceName: str('spaceName'),
            blocked: bool('blocked'),
            excludeDone: bool('excludeDone'),
          };
          return this.tools.getTasks(userId, workspaceId, context, filters, currentUserId);
        }
        default:
          return { error: `Unknown tool ${call.name}` };
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  private mergeTasks(existing: AiTaskCard[], extra: AiTaskCard[]) {
    const map = new Map<string, AiTaskCard>();
    for (const t of [...existing, ...extra]) {
      if (t?.id && t?.title) map.set(t.id, t);
    }
    return [...map.values()];
  }

  private extractTasks(json: Prisma.JsonValue | null | undefined): AiTaskCard[] {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
    const tasks = (json as { tasks?: AiTaskCard[] }).tasks;
    return Array.isArray(tasks) ? tasks.filter((t) => t?.id && t?.title) : [];
  }

  private titleFrom(text: string) {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean || 'New chat';
  }
}
