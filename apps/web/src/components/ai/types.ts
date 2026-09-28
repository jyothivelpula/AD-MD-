export type AiContext = {
  type: 'workspace' | 'space' | 'list' | 'person' | 'task';
  id?: string;
  name?: string;
  spaceId?: string;
  listId?: string;
};

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
  createdByName?: string | null;
  createdById?: string | null;
  dueDate: string | null;
  startDate: string | null;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
  isOverdue: boolean;
  description?: string | null;
};

export type AiAction = { type: string; label: string; taskId?: string };

export type AiStructured = {
  type: 'answer' | 'task_list' | 'summary';
  content: string;
  tasks?: AiTaskCard[];
  actions?: AiAction[];
  source?: string;
  usedLlm?: boolean;
};

export type AiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
  responseJson?: AiStructured | null;
};

export type AiChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  contextJson?: AiContext | null;
};

export type AiContextTree = {
  workspace: { id: string; name: string };
  spaces: {
    id: string;
    name: string;
    lists: { id: string; name: string }[];
    people: { key: string; userId: string | null; name: string }[];
  }[];
  people: { id: string; name: string; email: string; role: string }[];
};

export function contextLabel(ctx?: AiContext | null) {
  if (!ctx) return 'Workspace';
  if (ctx.type === 'workspace') return ctx.name || 'Workspace';
  if (ctx.type === 'space') return ctx.name || 'Space';
  if (ctx.type === 'list') return ctx.name || 'List';
  if (ctx.type === 'person') return ctx.name || 'Person';
  if (ctx.type === 'task') return `Task: ${ctx.name || 'Untitled'}`;
  return 'Workspace';
}

export const SUGGESTION_CARDS = [
  { id: 'tasks', title: 'My Tasks', subtitle: 'View assigned work', query: 'Show my assigned tasks' },
  { id: 'workspace', title: 'Workspace', subtitle: 'Summarize current work', query: 'Summarize my workspace' },
  { id: 'overdue', title: 'Overdue Work', subtitle: 'Find overdue tasks', query: 'Show overdue tasks' },
  { id: 'progress', title: 'Progress', subtitle: "See what's moving", query: 'What is the progress of my current work?' },
];
