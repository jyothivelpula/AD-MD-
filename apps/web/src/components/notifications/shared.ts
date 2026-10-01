import type { AiTaskCard } from '@/components/ai/types';

export type NotificationTask = {
  id: string;
  title: string;
  priority?: string | null;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
};

export type NotificationBand = 'critical' | 'important' | 'normal';

export type NotificationItem = {
  id: string;
  taskId: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  task: NotificationTask | null;
};

export type NotificationPage = {
  notifications: NotificationItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export type NotificationFilter = 'all' | 'tasks' | 'comments' | 'mentions' | 'deadlines';

export const NOTIFICATIONS_CHANGED = 'notifications-changed';

export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function timeAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function typeIcon(type: string, unread: boolean) {
  if (type === 'TASK_OVERDUE') return '🔴 ';
  if (type === 'TASK_DUE_TODAY' || type === 'TASK_DUE_TOMORROW') return '🟠 ';
  if (type === 'TASK_REASSIGNED') return '👤 ';
  if (type === 'TASK_STATUS_CHANGED') return '🔄 ';
  if (type === 'TASK_PRIORITY_CHANGED') return '⚡ ';
  if (type === 'TASK_COMPLETED') return '✅ ';
  if (type === 'TASK_REOPENED') return '↩️ ';
  if (type === 'TASK_COMMENT') return '💬 ';
  if (type === 'TASK_MENTION') return '@ ';
  return unread ? '🔵 ' : '';
}

export function toTaskCard(task: NotificationTask): AiTaskCard {
  return {
    id: task.id,
    title: task.title,
    status: '',
    statusType: '',
    statusColor: '#6B7280',
    priority: null,
    assigneeName: null,
    assigneeId: null,
    ownerName: null,
    dueDate: null,
    startDate: null,
    listId: task.listId,
    listName: task.listName,
    spaceId: task.spaceId,
    spaceName: task.spaceName,
    isOverdue: false,
  };
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Earlier this week', 'Older'] as const;
export type NotificationGroup = (typeof GROUP_ORDER)[number];

// The API has no configured timezone, so day groups follow the device calendar.
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function notificationGroup(iso: string, now = new Date()): NotificationGroup {
  const day = startOfDay(new Date(iso));
  const today = startOfDay(now);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const weekday = today.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - mondayOffset);
  if (day >= startOfWeek) return 'Earlier this week';
  return 'Older';
}

export function groupNotifications(items: NotificationItem[]) {
  const buckets = new Map<NotificationGroup, NotificationItem[]>();
  for (const item of items) {
    const group = notificationGroup(item.createdAt);
    const list = buckets.get(group) || [];
    list.push(item);
    buckets.set(group, list);
  }
  return GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    items: buckets.get(group) || [],
  }));
}

export function notificationBand(item: NotificationItem): NotificationBand {
  if (item.type === 'TASK_OVERDUE' || item.type === 'TASK_MENTION' || item.type === 'TASK_ASSIGNED' || item.type === 'TASK_REASSIGNED') {
    return 'critical';
  }
  if (item.type === 'TASK_DUE_TODAY' || /high|urgent/i.test(item.task?.priority || '')) return 'important';
  return 'normal';
}

export type DigestRow =
  | { kind: 'single'; item: NotificationItem }
  | { kind: 'digest'; key: string; count: number; task: NotificationTask | null; items: NotificationItem[] };

export function digestRows(items: NotificationItem[], enabled: boolean): DigestRow[] {
  if (!enabled) return items.map((item) => ({ kind: 'single', item }));
  const consumed = new Set<string>();
  const rows: DigestRow[] = [];
  for (const item of items) {
    if (consumed.has(item.id)) continue;
    if (notificationBand(item) !== 'normal' || !item.taskId) {
      rows.push({ kind: 'single', item });
      continue;
    }
    const group = items.filter((row) => !consumed.has(row.id) && notificationBand(row) === 'normal' && row.taskId === item.taskId);
    if (group.length < 2) {
      rows.push({ kind: 'single', item });
      continue;
    }
    group.forEach((row) => consumed.add(row.id));
    rows.push({ kind: 'digest', key: item.taskId, count: group.length, task: item.task, items: group });
  }
  return rows;
}

export const EMPTY_BY_FILTER: Record<NotificationFilter, { title: string; body: string }> = {
  all: { title: 'You’re all caught up', body: 'No notifications yet.' },
  tasks: { title: 'No task notifications.', body: '' },
  comments: { title: 'No comment notifications.', body: '' },
  mentions: { title: 'No mentions yet.', body: '' },
  deadlines: { title: 'No deadline notifications.', body: '' },
};
