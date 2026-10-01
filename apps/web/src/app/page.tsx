'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, API_URL } from '@/lib/api';
import AiChatPanel from '@/components/ai/AiChatPanel';
import NotificationBell from '@/components/notifications/NotificationBell';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import NotificationSettings from '@/components/notifications/NotificationSettings';
import AiIcon from '@/components/ai/AiIcon';
import type { AiChatSummary, AiContext, AiTaskCard } from '@/components/ai/types';
import WorkspaceSearch, { SearchTrigger, type SearchListHit, type SearchPersonHit, type SearchSpaceHit, type SearchTaskHit } from '@/components/search/WorkspaceSearch';

type User = { id: string; email: string; name: string };
type Workspace = { id: string; name: string };
type Status = { id: string; name: string; color: string; order: number; type?: string };
type Space = { id: string; name: string; statuses: Status[] };
type List = { id: string; name: string; spaceId: string; kind?: 'list' | 'person'; userId?: string; personKey?: string; email?: string | null };
type Member = { id: string; userId: string; role: string; name: string; email: string };
type Person = { key: string; userId: string | null; name: string; email?: string | null };
type NextActionEntry = { id: string; text: string; createdAt: string };
type CustomField = { id: string; name: string; type: string; config?: any };
type Comment = { id: string; body: string; authorName?: string | null; createdAt: string };
type Attachment = { id: string; url: string; name: string };
type Task = {
  id: string;
  title: string;
  description?: string | null;
  statusId: string;
  priority?: string | null;
  position: number;
  assigneeId?: string | null;
  createdById?: string | null;
  assigneeName?: string | null;
  ownerName?: string | null;
  workCategory?: string | null;
  scope?: string | null;
  url?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  progressDate?: string | null;
  parentTaskId?: string | null;
  customFields?: Record<string, any> | null;
};
type TaskDetail = Task & {
  listId?: string;
  subtasks: Task[];
  nextActions: NextActionEntry[];
  comments: Comment[];
  attachments: Attachment[];
  activityLogs?: { id: string; action: string; createdAt: string }[];
  assigneeEmail?: string | null;
  assigneeEmailUnverified?: string | null;
  customFieldDefs: CustomField[];
};

// "Where I left off" — remembers the last task/list view so it can be restored
// automatically next time this device opens the app, and a short recently-viewed
// task list shown on the Home screen.
type LastView = {
  workspaceId: string;
  spaceId?: string;
  listId?: string;
  taskId?: string;
  chatId?: string;
  mode: 'task' | 'list' | 'ai';
};
type RecentTaskEntry = {
  workspaceId: string;
  spaceId: string;
  spaceName: string;
  listId: string;
  listName: string;
  taskId: string;
  taskTitle: string;
  openedAt: number;
};

type Theme = {
  accent: string;
  sidebarBg: string;
  sidebarText: string;
  mainBg: string;
  font: string;
};

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'System (default)', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
  { label: 'Rounded', value: '"Trebuchet MS", "Segoe UI Rounded", sans-serif' },
];

const WORK_CATEGORY_OPTIONS = ['Development', 'Design', 'Research', 'Marketing', 'Sales', 'Operations', 'Documentation', 'Promotion'];
const SCOPE_OPTIONS = ['Small Task', 'Medium Task', 'Large Task', 'Epic'];
const PRIORITY_OPTIONS = ['Urgent', 'High', 'Normal', 'Low'];
const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'checkbox'];

const DEFAULT_THEME: Theme = {
  accent: '#0078D4',
  sidebarBg: '#F3F2F1',
  sidebarText: '#242424',
  mainBg: '#FAF9F8',
  font: FONT_OPTIONS[0].value,
};

const THEME_PRESETS: { name: string; theme: Theme }[] = [
  { name: 'Outlook Blue', theme: DEFAULT_THEME },
  { name: 'Windows 11', theme: { accent: '#0067C0', sidebarBg: '#F9F9F9', sidebarText: '#1B1B1B', mainBg: '#FFFFFF', font: FONT_OPTIONS[0].value } },
  { name: 'Teams Purple', theme: { accent: '#5B5FC7', sidebarBg: '#EDEBFA', sidebarText: '#252423', mainBg: '#FAFAFA', font: FONT_OPTIONS[0].value } },
  { name: 'Dark Mode', theme: { accent: '#4CC2FF', sidebarBg: '#201F1E', sidebarText: '#F3F2F1', mainBg: '#2B2A29', font: FONT_OPTIONS[0].value } },
  { name: 'ClickUp Purple', theme: { accent: '#7B68EE', sidebarBg: '#1B1B2E', sidebarText: '#D7D7EA', mainBg: '#F6F6FB', font: FONT_OPTIONS[0].value } },
  { name: 'Forest', theme: { accent: '#16A34A', sidebarBg: '#0F2A1D', sidebarText: '#D8F0E2', mainBg: '#F4FAF6', font: FONT_OPTIONS[0].value } },
];

function isTaskOverdue(task: Task, statuses: Status[]): boolean {
  if (!task.dueDate) return false;
  const status = statuses.find((s) => s.id === task.statusId);
  if (status?.type === 'done') return false;
  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function toDateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function personViewKey(userId: string) {
  return `person:${userId}`;
}

function isPlaceholderEmail(email?: string | null) {
  return !!email && /@example\.com$/i.test(email.trim());
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function latestDailyLog(entries: { text: string; createdAt: string }[] | undefined) {
  if (!entries?.length) return '';
  const latest = [...entries]
    .filter((entry) => typeof entry.text === 'string' && entry.text.trim() !== '')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return latest ? latest.text.replace(/\r\n/g, '\n') : '';
}

function isPersonView(list: List) {
  return list.kind === 'person';
}

function makePersonList(person: Person, space: Space): List {
  return {
    id: personViewKey(person.key),
    name: person.name,
    email: person.email || null,
    spaceId: space.id,
    kind: 'person',
    userId: person.userId || undefined,
    personKey: person.key,
  };
}

function canonicalListId(list: List, task?: Task | null) {
  if (task?.listId) return task.listId;
  return isPersonView(list) ? '' : list.id;
}

function isGeneralList(list: List) {
  return !isPersonView(list) && list.name.toLowerCase() === 'general';
}

function priorityColor(p?: string | null): string {
  switch (p) {
    case 'Urgent':
      return 'text-red-500';
    case 'High':
      return 'text-orange-400';
    case 'Normal':
      return 'text-blue-400';
    case 'Low':
      return 'text-gray-400';
    default:
      return 'text-gray-300';
  }
}

// Comments (and any other dated entry) automatically shift background color as they age.
// Fresh (<2h): highlighted "new" tint. 2h-24h: normal. Over 24h: slightly muted/older tint.
function ageBgClass(createdAt: string, nowMs: number): string {
  const ageMs = nowMs - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 2) return 'bg-blue-50 border border-blue-200';
  if (ageHours < 24) return 'bg-gray-50 border border-transparent';
  return 'bg-gray-100 border border-transparent';
}

// Cycling palette for description date-blocks, starting from green as requested.
const DESCRIPTION_BLOCK_COLORS = [
  'bg-green-50 border-green-200',
  'bg-blue-50 border-blue-200',
  'bg-yellow-50 border-yellow-200',
  'bg-purple-50 border-purple-200',
  'bg-pink-50 border-pink-200',
  'bg-orange-50 border-orange-200',
  'bg-teal-50 border-teal-200',
];

// Splits free-text description into blocks separated by one-or-more blank lines,
// so each "date + note" entry the person types can get its own background color.
function parseDescriptionBlocks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

// Daily-log entries logged on the same calendar day share a color; each new day
// picks up the next color in the palette, cycling back to green after 7 days.
function dayColorClass(createdAt: string, allDates: string[]): string {
  const day = new Date(createdAt).toDateString();
  const uniqueDays = Array.from(new Set(allDates.map((d) => new Date(d).toDateString()))).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const idx = Math.max(0, uniqueDays.indexOf(day));
  return DESCRIPTION_BLOCK_COLORS[idx % DESCRIPTION_BLOCK_COLORS.length];
}

// Which task-detail cards can be hidden by the user via "⚙ Customize fields".
const FIELD_TOGGLES: { key: string; label: string }[] = [
  { key: 'description', label: 'Description & Daily Log' },
  { key: 'coreFields', label: 'Status / Priority / Assignee / Owner / Work Category / Scope / URL' },
  { key: 'dates', label: 'Start / Due / Progress dates' },
  { key: 'handoff', label: 'Hand off task to' },
  { key: 'customFields', label: 'Custom Fields' },
  { key: 'subtasks', label: 'Subtasks' },
  { key: 'comments', label: 'Comments' },
  { key: 'attachments', label: 'Attachments' },
];

function loadHiddenFields(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cu_hidden_fields');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHiddenFields(keys: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('cu_hidden_fields', JSON.stringify(keys));
}

// Per-custom-field visibility (e.g. hide "JBLUE" or "Date" individually), keyed by
// the custom field's id. Saved separately from the whole-card toggles above.
function loadHiddenCustomFields(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cu_hidden_custom_field_ids');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHiddenCustomFields(ids: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('cu_hidden_custom_field_ids', JSON.stringify(ids));
}

function loadTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem('cu_theme');
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_THEME;
}

function loadLastView(): LastView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cu_last_view');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastView(view: LastView) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('cu_last_view', JSON.stringify(view));
  } catch {}
}

function clearLastView() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('cu_last_view');
}

type LastAiChats = Record<string, string>;

function loadLastAiChatMap(): LastAiChats {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('cu_last_ai_chat');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLastAiChat(workspaceId: string, chatId: string) {
  if (typeof window === 'undefined') return;
  try {
    const map = loadLastAiChatMap();
    map[workspaceId] = chatId;
    localStorage.setItem('cu_last_ai_chat', JSON.stringify(map));
  } catch {}
}

function lastAiChatFor(workspaceId: string): string | null {
  return loadLastAiChatMap()[workspaceId] || null;
}

function forgetLastAiChat(workspaceId: string, chatId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const map = loadLastAiChatMap();
    if (chatId && map[workspaceId] && map[workspaceId] !== chatId) return;
    delete map[workspaceId];
    localStorage.setItem('cu_last_ai_chat', JSON.stringify(map));
  } catch {}
}

function loadRecentTasks(): RecentTaskEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cu_recent_tasks');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentTasks(entries: RecentTaskEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('cu_recent_tasks', JSON.stringify(entries));
  } catch {}
}

export default function Home({ initialView }: { initialView?: 'notifications' | 'notification-settings' } = {}) {
  // theme / appearance
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [centerView, setCenterView] = useState<'notifications' | 'notification-settings' | null>(initialView ?? null);
  const [aiBriefToken, setAiBriefToken] = useState(0);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEmail, setProfileEmail] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [manageUser, setManageUser] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [manageName, setManageName] = useState('');
  const [manageEmail, setManageEmail] = useState('');
  const [manageNotice, setManageNotice] = useState('');
  const [manageBusy, setManageBusy] = useState(false);

  // auth state
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // workspaces
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingWorkspace, setEditingWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [peopleBySpace, setPeopleBySpace] = useState<Record<string, Person[]>>({});
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newTaskAssigneeKey, setNewTaskAssigneeKey] = useState('');
  const creatingTaskRef = useRef(false);

  // spaces (sidebar tree)
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [addingSpace, setAddingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [editingSpace, setEditingSpace] = useState<{ id: string; name: string } | null>(null);

  // lists per space
  const [listsBySpace, setListsBySpace] = useState<Record<string, List[]>>({});
  const [addingListForSpace, setAddingListForSpace] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [editingList, setEditingList] = useState<{ id: string; name: string } | null>(null);

  // lists expanded in the sidebar tree, with their tasks grouped by status
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [tasksByList, setTasksByList] = useState<Record<string, Task[]>>({});
  const [addingTaskFor, setAddingTaskFor] = useState<{ listId: string; statusId: string } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [sortByPriority, setSortByPriority] = useState(false);
  const [addingStatusForSpace, setAddingStatusForSpace] = useState<string | null>(null);
  const [newStatusName, setNewStatusName] = useState('');
  const [editingStatus, setEditingStatus] = useState<{ id: string; name: string } | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState<{ listId: string; taskId: string; title: string } | null>(null);
  const [newStatusColor, setNewStatusColor] = useState('#6B7280');
  const [newStatusType, setNewStatusType] = useState('open');

  // task detail — now the full main-panel view, not a drawer
  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const [detailListId, setDetailListId] = useState<string | null>(null);
  const [detailSpace, setDetailSpace] = useState<Space | null>(null);
  const [detailForm, setDetailForm] = useState<{
    title: string;
    description: string;
    statusId: string;
    priority: string;
    assigneeId: string;
    assigneeName: string;
    ownerName: string;
    workCategory: string;
    scope: string;
    url: string;
    startDate: string;
    dueDate: string;
    progressDate: string;
  } | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [handOffTo, setHandOffTo] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);
  const [nextActionText, setNextActionText] = useState('');
  const [editingNextActionId, setEditingNextActionId] = useState<string | null>(null);
  const [editingNextActionText, setEditingNextActionText] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [customizeFieldsOpen, setCustomizeFieldsOpen] = useState(false);
  const [hiddenCustomFieldIds, setHiddenCustomFieldIds] = useState<Set<string>>(new Set());
  const [manageHiddenCustomFieldsOpen, setManageHiddenCustomFieldsOpen] = useState(false);

  useEffect(() => {
    setHiddenFields(new Set(loadHiddenFields()));
    setHiddenCustomFieldIds(new Set(loadHiddenCustomFields()));
  }, []);

  function toggleFieldVisibility(key: string) {
    setHiddenFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHiddenFields(Array.from(next));
      return next;
    });
  }

  function toggleCustomFieldVisibility(id: string) {
    setHiddenCustomFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveHiddenCustomFields(Array.from(next));
      return next;
    });
  }
  const [addingCustomField, setAddingCustomField] = useState(false);
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [newCustomFieldType, setNewCustomFieldType] = useState(CUSTOM_FIELD_TYPES[0]);
  const [newCustomFieldOptions, setNewCustomFieldOptions] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [addingApprover, setAddingApprover] = useState(false);
  const [approverName, setApproverName] = useState('');
  const [approverDateTime, setApproverDateTime] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Keep comment/entry background colors fresh — re-render every minute so the
  // "new" → "normal" → "older" color shift happens automatically while a task is open.
  // Only runs while a task detail page is actually open (perf: avoids a whole-app
  // re-render every 60s while browsing the sidebar/list view with nothing open).
  useEffect(() => {
    if (!detailTask) return;
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [detailTask?.id]);

  // List view (ClickUp-style List/Board toolbar for a whole List, not a single task)
  const [viewingList, setViewingList] = useState<{ list: List; space: Space } | null>(null);
  const [aiListedTasks, setAiListedTasks] = useState<AiTaskCard[] | null>(null);

  // "Where I left off" — see LastView/RecentTaskEntry types above.
  const [recentTasks, setRecentTasks] = useState<RecentTaskEntry[]>([]);
  const restoreAttempted = useRef(false);
  const [listViewMode, setListViewMode] = useState<'list' | 'board'>('list');
  const [listGroupBy, setListGroupBy] = useState<'status' | 'assignee' | 'priority'>('status');
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [listAssigneeFilter, setListAssigneeFilter] = useState('');
  const [listShowClosed, setListShowClosed] = useState(true);
  const [listShowSubtasks, setListShowSubtasks] = useState(true);
  const [listColumnsOpen, setListColumnsOpen] = useState(false);
  const [listVisibleCols, setListVisibleCols] = useState({ assignee: true, dueDate: true, priority: true });
  const [listFilterOpen, setListFilterOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [listQuickAddTitle, setListQuickAddTitle] = useState('');
  const [listQuickAddOpen, setListQuickAddOpen] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiChatId, setAiChatId] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState<AiContext | null>(null);
  const [aiChats, setAiChats] = useState<AiChatSummary[]>([]);
  const [aiMenuFor, setAiMenuFor] = useState<string | null>(null);
  const [aiRename, setAiRename] = useState<{ id: string; title: string } | null>(null);
  const [aiDeleteConfirm, setAiDeleteConfirm] = useState<AiChatSummary | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  async function addQuickTask(list: List, space: Space) {
    if (!listQuickAddTitle.trim()) return;
    const defaultStatus = [...space.statuses].sort((a, b) => a.order - b.order)[0];
    if (!defaultStatus) return;
    try {
      if (isPersonView(list) && (list.personKey || list.userId)) {
        await apiFetch(`/spaces/${space.id}/people/${encodeURIComponent(list.personKey || list.userId!)}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title: listQuickAddTitle, statusId: defaultStatus.id }),
        });
      } else {
        await apiFetch(`/lists/${list.id}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title: listQuickAddTitle, statusId: defaultStatus.id }),
        });
      }
      setListQuickAddTitle('');
      setListQuickAddOpen(false);
      await refreshTasksFor(list, space);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function leaveNotificationViews() {
    setCenterView(null);
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (path === '/notifications' || path === '/settings/notifications') {
      window.history.pushState(null, '', '/');
    }
  }

  function showNotificationCenter() {
    setAiOpen(false);
    setCenterView('notifications');
    if (typeof window !== 'undefined' && window.location.pathname !== '/notifications') {
      window.history.pushState(null, '', '/notifications');
    }
  }

  function openDailyBrief() {
    setCenterView(null);
    setAiOpen(true);
    setAiBriefToken((value) => value + 1);
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  }

  function showNotificationSettings() {
    setAiOpen(false);
    setCenterView('notification-settings');
    if (typeof window !== 'undefined' && window.location.pathname !== '/settings/notifications') {
      window.history.pushState(null, '', '/settings/notifications');
    }
  }

  function openListView(list: List, space: Space) {
    leaveNotificationViews();
    setAiListedTasks(null);
    setViewingList({ list, space });
    closeTaskDetail();
    if (!tasksByList[list.id]) refreshTasksFor(list, space);
    if (selectedWorkspace) {
      saveLastView({ workspaceId: selectedWorkspace.id, spaceId: space.id, listId: list.id, mode: 'list' });
    }
  }

  function goHome() {
    leaveNotificationViews();
    closeTaskDetail();
    setViewingList(null);
    setAiListedTasks(null);
    setAiOpen(false);
    clearLastView();
  }

  async function loadAiChats(workspaceId?: string): Promise<AiChatSummary[]> {
    const id = workspaceId || selectedWorkspace?.id;
    if (!id) return [];
    try {
      const data: AiChatSummary[] = await apiFetch(`/workspaces/${id}/ai/chats`);
      setAiChats(data);
      return data;
    } catch {
      setAiChats([]);
      return [];
    }
  }

  function workspaceAiContext(): AiContext {
    return {
      type: 'workspace',
      id: selectedWorkspace?.id,
      name: selectedWorkspace?.name,
    };
  }

  function rememberOpenAiChat(workspaceId: string, chatId: string) {
    setAiChatId(chatId);
    setAiOpen(true);
    saveLastAiChat(workspaceId, chatId);
    saveLastView({ workspaceId, mode: 'ai', chatId });
  }

  function openAiHome() {
    if (!selectedWorkspace) return;
    leaveNotificationViews();
    closeTaskDetail();
    setViewingList(null);
    setAiContext(workspaceAiContext());
    setAiChatId(null);
    setAiOpen(true);
    saveLastView({ workspaceId: selectedWorkspace.id, mode: 'ai' });
  }

  async function ensureAiChat(): Promise<string> {
    if (aiChatId) return aiChatId;
    if (!selectedWorkspace) throw new Error('No workspace selected');
    const chat = await apiFetch(`/workspaces/${selectedWorkspace.id}/ai/chats`, {
      method: 'POST',
      body: JSON.stringify({ context: aiContext || workspaceAiContext() }),
    });
    rememberOpenAiChat(selectedWorkspace.id, chat.id);
    await loadAiChats(selectedWorkspace.id);
    return chat.id as string;
  }

  async function openAiWorkspace(opts?: { newChat?: boolean; chatId?: string; context?: AiContext }) {
    if (!selectedWorkspace) return;
    leaveNotificationViews();
    const ctx = opts?.context || aiContext || workspaceAiContext();
    closeTaskDetail();
    setViewingList(null);
    setAiContext(ctx);
    try {
      if (opts?.chatId) {
        rememberOpenAiChat(selectedWorkspace.id, opts.chatId);
        return;
      }
      if (opts?.newChat) {
        const chat = await apiFetch(`/workspaces/${selectedWorkspace.id}/ai/chats`, {
          method: 'POST',
          body: JSON.stringify({ context: ctx }),
        });
        rememberOpenAiChat(selectedWorkspace.id, chat.id);
        await loadAiChats(selectedWorkspace.id);
        return;
      }
      openAiHome();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function renameAiChat() {
    if (!selectedWorkspace || !aiRename) return;
    const title = aiRename.title.trim();
    if (!title) return;
    try {
      await apiFetch(`/workspaces/${selectedWorkspace.id}/ai/chats/${aiRename.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setAiRename(null);
      await loadAiChats(selectedWorkspace.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteAiChat(chat: AiChatSummary) {
    if (!selectedWorkspace) return;
    try {
      await apiFetch(`/workspaces/${selectedWorkspace.id}/ai/chats/${chat.id}`, { method: 'DELETE' });
      const remaining = aiChats.filter((c) => c.id !== chat.id);
      setAiChats(remaining);
      setAiDeleteConfirm(null);
      setAiMenuFor(null);
      if (aiChatId === chat.id) {
        forgetLastAiChat(selectedWorkspace.id, chat.id);
        setAiChatId(null);
        setAiOpen(true);
        saveLastView({ workspaceId: selectedWorkspace.id, mode: 'ai' });
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  function viewTasksFromAi(tasks: AiTaskCard[]) {
    if (!tasks.length) return;
    setAiListedTasks(tasks);
    setAiOpen(false);
    closeTaskDetail();
    setViewingList(null);
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      for (const task of tasks) next.add(task.spaceId);
      return next;
    });
  }

  async function openTaskFromAi(task: AiTaskCard, options?: { onMissing?: () => void }): Promise<boolean> {
    setAiOpen(false);
    let space = spaces.find((s) => s.id === task.spaceId) || null;
    if (!space && selectedWorkspace) {
      try {
        const data: Space[] = await apiFetch(`/workspaces/${selectedWorkspace.id}/spaces`);
        setSpaces(data);
        space = data.find((s) => s.id === task.spaceId) || null;
      } catch (err: any) {
        if (options?.onMissing) {
          options.onMissing();
          return false;
        }
        setError(err.message);
        return false;
      }
    }
    if (!space) {
      if (options?.onMissing) {
        options.onMissing();
        return false;
      }
      setError('Could not open that task — space not found.');
      return false;
    }
    let lists = listsBySpace[space.id] || [];
    if (!listsBySpace[space.id]) {
      try {
        lists = await apiFetch(`/spaces/${space.id}/lists`);
        setListsBySpace((prev) => ({ ...prev, [space.id]: lists }));
      } catch {
        lists = [];
      }
    }
    const list = lists.find((l) => l.id === task.listId) || {
      id: task.listId,
      name: task.listName,
      spaceId: space.id,
    };
    const opened = await openTaskDetail(list, space, task.id, undefined, options);
    if (opened) leaveNotificationViews();
    return opened;
  }

  async function resolveSpace(spaceId: string): Promise<Space | null> {
    let space = spaces.find((s) => s.id === spaceId) || null;
    if (!space && selectedWorkspace) {
      try {
        const data: Space[] = await apiFetch(`/workspaces/${selectedWorkspace.id}/spaces`);
        setSpaces(data);
        space = data.find((s) => s.id === spaceId) || null;
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    }
    return space;
  }

  async function openTaskFromSearch(task: SearchTaskHit) {
    setSearchOpen(false);
    await openTaskFromAi({
      id: task.id,
      title: task.title,
      status: task.status,
      statusType: '',
      statusColor: task.statusColor,
      priority: null,
      assigneeName: task.assigneeName,
      assigneeId: null,
      ownerName: null,
      dueDate: null,
      startDate: null,
      listId: task.listId,
      listName: task.listName,
      spaceId: task.spaceId,
      spaceName: task.spaceName,
      isOverdue: task.isOverdue,
    });
  }

  async function openListFromSearch(hit: SearchListHit) {
    setSearchOpen(false);
    setAiOpen(false);
    closeTaskDetail();
    const space = await resolveSpace(hit.spaceId);
    if (!space) {
      setError('Could not open that list — space not found.');
      return;
    }
    let lists = listsBySpace[space.id] || [];
    if (!listsBySpace[space.id]) {
      try {
        lists = (await loadSpaceListsAndPeople(space)).data;
      } catch {
        lists = [];
      }
    }
    const list = lists.find((l) => l.id === hit.id) || { id: hit.id, name: hit.name, spaceId: space.id };
    setExpandedSpaces((prev) => new Set(prev).add(space.id));
    openListView(list, space);
  }

  async function openSpaceFromSearch(hit: SearchSpaceHit) {
    setSearchOpen(false);
    setAiOpen(false);
    closeTaskDetail();
    setViewingList(null);
    const space = await resolveSpace(hit.id);
    if (!space) return;
    setExpandedSpaces((prev) => new Set(prev).add(space.id));
    if (!listsBySpace[space.id]) {
      try {
        await loadSpaceListsAndPeople(space);
      } catch (err: any) {
        setError(err.message);
      }
    }
  }

  async function askAiFromSearch(text: string, context?: AiContext) {
    if (!selectedWorkspace) return;
    setSearchOpen(false);
    const ctx = context || workspaceAiContext();
    closeTaskDetail();
    setViewingList(null);
    setAiContext(ctx);
    if (!text.trim()) {
      openAiHome();
      return;
    }
    try {
      const chat = await apiFetch(`/workspaces/${selectedWorkspace.id}/ai/chats`, {
        method: 'POST',
        body: JSON.stringify({ context: ctx }),
      });
      await apiFetch(`/workspaces/${selectedWorkspace.id}/ai/chats/${chat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text.trim(), context: ctx }),
      });
      rememberOpenAiChat(selectedWorkspace.id, chat.id);
      await loadAiChats(selectedWorkspace.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function openPersonFromSearch(person: SearchPersonHit) {
    askAiFromSearch(`Show me all tasks assigned to ${person.name}.`, {
      type: 'person',
      id: person.id,
      name: person.name,
    });
  }

  async function updateTaskStatusInline(list: List, task: Task, statusId: string) {
    const apiListId = canonicalListId(list, task);
    if (!apiListId) return;
    try {
      await apiFetch(`/lists/${apiListId}/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ statusId }),
      });
      const space = spaces.find((s) => s.id === list.spaceId);
      if (space) await refreshRelatedViews(space, list, task.assigneeId);
      else refreshListTasks(apiListId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // task actions: duplicate / move / merge
  const [openTaskMenu, setOpenTaskMenu] = useState<{ listId: string; taskId: string } | null>(null);
  const [moveDialogTask, setMoveDialogTask] = useState<{ list: List; task: Task } | null>(null);
  const [moveDialogTargetListId, setMoveDialogTargetListId] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailAttach, setEmailAttach] = useState<string[]>([]);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');
  const [emailSentNotice, setEmailSentNotice] = useState('');
  const [emailRetryId, setEmailRetryId] = useState<string | null>(null);
  const [mergeDialogTask, setMergeDialogTask] = useState<{ list: List; task: Task } | null>(null);
  const [mergeDialogTargetTaskId, setMergeDialogTargetTaskId] = useState('');

  // on mount, restore session + theme (guarded against React Strict Mode's
  // double-invoke of effects in dev, which would otherwise fire this twice)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    setTheme(loadTheme());
    setRecentTasks(loadRecentTasks());

    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      loadWorkspaces();
      apiFetch('/auth/me')
        .then((me: User) => {
          const next = { id: me.id, email: me.email, name: me.name };
          localStorage.setItem('user', JSON.stringify(next));
          setUser(next);
        })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    function onPop() {
      const path = window.location.pathname;
      if (path === '/notifications') setCenterView('notifications');
      else if (path === '/settings/notifications') setCenterView('notification-settings');
      else setCenterView(null);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      if (!selectedWorkspace) return;
      e.preventDefault();
      setSearchOpen((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedWorkspace]);

  // Once the current workspace's spaces have loaded, try to restore whatever
  // task/list view was open the last time this device used the app. Only
  // attempted once per app load (restoreAttempted), so it never fights with
  // the user's own navigation afterward.
  useEffect(() => {
    if (restoreAttempted.current) return;
    if (!selectedWorkspace) return;

    const last = loadLastView();
    if (last?.mode === 'ai') {
      restoreAttempted.current = true;
      return;
    }
    if (spaces.length === 0) return;

    restoreAttempted.current = true;
    if (!last || last.workspaceId !== selectedWorkspace.id) return;
    if (!last.spaceId || !last.listId) return;

    const space = spaces.find((s) => s.id === last.spaceId);
    if (!space) return;

    (async () => {
      setExpandedSpaces((prev) => new Set(prev).add(space.id));
      let lists = listsBySpace[space.id];
      if (!lists) {
        try {
          lists = (await loadSpaceListsAndPeople(space)).data;
        } catch {
          return;
        }
      }
      const list = lists?.find((l) => l.id === last.listId);
      if (!list) return;
      setExpandedLists((prev) => new Set(prev).add(list.id));
      if (last.mode === 'task' && last.taskId) {
        openTaskDetail(list, space, last.taskId);
      } else {
        openListView(list, space);
      }
    })();
  }, [spaces, selectedWorkspace]);

  function applyTheme(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem('cu_theme', JSON.stringify(next));
    } catch {}
  }

  function handleAuthSuccess(data: { accessToken: string; user: User }) {
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    loadWorkspaces();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (authLoading) return;
    setAuthLoading(true);
    setError('');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      handleAuthSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (authLoading) return;
    setAuthLoading(true);
    setError('');
    try {
      const data = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      });
      handleAuthSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setWorkspaces([]);
    setSelectedWorkspace(null);
    setSpaces([]);
    setListsBySpace({});
    setExpandedLists(new Set());
    setTasksByList({});
    setMembers([]);
    setPeopleBySpace({});
    closeTaskDetail();
    setViewingList(null);
    setAiOpen(false);
    setAiChatId(null);
    setAiChats([]);
    setAiContext(null);
  }

  async function saveProfileEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const next = profileEmail.trim().toLowerCase();
    if (!isValidEmail(next)) {
      setProfileNotice('Enter a valid email address.');
      return;
    }
    setProfileBusy(true);
    setProfileNotice('');
    try {
      const saved: { accessToken?: string; user?: User; email: string; verificationSent?: boolean } = await apiFetch('/auth/email', {
        method: 'POST',
        body: JSON.stringify({ email: next }),
      });
      const updated: User = saved.user?.email ? saved.user : { ...user, email: saved.email };
      if (saved.accessToken) localStorage.setItem('token', saved.accessToken);
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
      setMembers((prev) => prev.map((member) => (member.userId === updated.id ? { ...member, email: updated.email } : member)));
      setPeopleBySpace((prev) => {
        const copy = { ...prev };
        for (const spaceId of Object.keys(copy)) {
          copy[spaceId] = copy[spaceId].map((person) =>
            person.userId === updated.id ? { ...person, email: updated.email } : person,
          );
        }
        return copy;
      });
      setProfileNotice(
        saved.verificationSent
          ? 'Email saved. Check your inbox to verify it before automatic task emails are sent.'
          : 'Email saved. People, assignees, and future notifications use this address. Verify it before automatic emails are sent.',
      );
    } catch (err: any) {
      setProfileNotice(err.message || 'Could not save that email.');
    } finally {
      setProfileBusy(false);
    }
  }

  function openManageUser(person: { userId: string; name: string; email?: string | null }) {
    setManageUser({ userId: person.userId, name: person.name, email: person.email || '' });
    setManageName(person.name);
    setManageEmail(person.email || '');
    setManageNotice('');
  }

  async function saveManagedUser(e: React.FormEvent) {
    e.preventDefault();
    if (!manageUser || !selectedWorkspace || !user) return;
    const email = manageEmail.trim().toLowerCase();
    const name = manageName.trim();
    if (!name) {
      setManageNotice('Name is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setManageNotice('Enter a valid email address.');
      return;
    }
    setManageBusy(true);
    setManageNotice('');
    try {
      const saved: { userId: string; name: string; email: string } = await apiFetch(
        `/workspaces/${selectedWorkspace.id}/members/${manageUser.userId}`,
        { method: 'PATCH', body: JSON.stringify({ name, email }) },
      );
      setMembers((prev) => prev.map((member) => (member.userId === saved.userId ? { ...member, name: saved.name, email: saved.email } : member)));
      setPeopleBySpace((prev) => {
        const copy = { ...prev };
        for (const spaceId of Object.keys(copy)) {
          copy[spaceId] = copy[spaceId].map((person) =>
            person.userId === saved.userId ? { ...person, name: saved.name, email: saved.email } : person,
          );
        }
        return copy;
      });
      if (user.id === saved.userId) {
        const next = { ...user, name: saved.name, email: saved.email };
        localStorage.setItem('user', JSON.stringify(next));
        setUser(next);
      }
      await Promise.all(
        spaces
          .filter((space) => peopleBySpace[space.id])
          .map(async (space) => {
            const people: Person[] = await apiFetch(`/spaces/${space.id}/people`);
            setPeopleBySpace((prev) => ({ ...prev, [space.id]: people }));
          }),
      );
      setManageUser(null);
    } catch (err: any) {
      setManageNotice(err.message || 'Could not save that user.');
    } finally {
      setManageBusy(false);
    }
  }

  // ---- workspaces ----

  async function loadWorkspaces(selectId?: string) {
    try {
      const data: Workspace[] = await apiFetch('/workspaces');
      setWorkspaces(data);
      const toSelect = selectId ? data.find((w) => w.id === selectId) : data[0];
      if (toSelect && (!selectedWorkspace || selectId)) {
        selectWorkspace(toSelect);
      } else if (!selectedWorkspace && data.length > 0) {
        selectWorkspace(data[0]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function selectWorkspace(ws: Workspace) {
    setSelectedWorkspace(ws);
    setSpaces([]);
    setListsBySpace({});
    setExpandedSpaces(new Set());
    setExpandedLists(new Set());
    setTasksByList({});
    closeTaskDetail();
    setViewingList(null);
    setAiOpen(false);
    setAiChatId(null);
    setAiChats([]);
    setAiContext(null);
    setMembers([]);
    setPeopleBySpace({});
    try {
      const data: Space[] = await apiFetch(`/workspaces/${ws.id}/spaces`);
      setSpaces(data);
      const people: Member[] = await apiFetch(`/workspaces/${ws.id}/members`);
      setMembers(people);
      const chats = await loadAiChats(ws.id);
      const last = loadLastView();
      if (last?.mode === 'ai' && last.workspaceId === ws.id) {
        setAiOpen(true);
        if (last.chatId && chats.some((c) => c.id === last.chatId)) {
          setAiChatId(last.chatId);
          saveLastAiChat(ws.id, last.chatId);
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    try {
      const created = await apiFetch('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: newWorkspaceName }),
      });
      setNewWorkspaceName('');
      setAddingWorkspace(false);
      loadWorkspaces(created.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveWorkspaceEdit() {
    if (!editingWorkspace || !editingWorkspace.name.trim()) return;
    try {
      await apiFetch(`/workspaces/${editingWorkspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingWorkspace.name }),
      });
      const id = editingWorkspace.id;
      const newName = editingWorkspace.name;
      setEditingWorkspace(null);
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name: newName } : w)));
      if (selectedWorkspace?.id === id) setSelectedWorkspace({ ...selectedWorkspace, name: newName });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteWorkspace(ws: Workspace) {
    if (!confirm(`Delete workspace "${ws.name}"? This deletes everything inside it.`)) return;
    try {
      await apiFetch(`/workspaces/${ws.id}`, { method: 'DELETE' });
      loadWorkspaces();
      if (selectedWorkspace?.id === ws.id) {
        setSelectedWorkspace(null);
        setSpaces([]);
        setMembers([]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addWorkspaceMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace || !newMemberEmail.trim()) return;
    try {
      const member: Member = await apiFetch(`/workspaces/${selectedWorkspace.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: newMemberEmail.trim() }),
      });
      setMembers((prev) => [...prev, member].sort((a, b) => a.name.localeCompare(b.name)));
      setNewMemberEmail('');
      setAddingMember(false);
      for (const space of spaces) {
        if (listsBySpace[space.id]) {
          const data: List[] = await apiFetch(`/spaces/${space.id}/lists`);
          setListsBySpace((prev) => ({ ...prev, [space.id]: data }));
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ---- spaces ----

  function peopleForSpace(spaceId: string): Person[] {
    if (peopleBySpace[spaceId]?.length) return peopleBySpace[spaceId];
        return members.map((m) => ({ key: m.userId, userId: m.userId, name: m.name, email: m.email }));
  }

  async function loadSpaceListsAndPeople(space: Space) {
    const [data, people] = await Promise.all([
      apiFetch(`/spaces/${space.id}/lists`) as Promise<List[]>,
      apiFetch(`/spaces/${space.id}/people`) as Promise<Person[]>,
    ]);
    setListsBySpace((prev) => ({ ...prev, [space.id]: data }));
    setPeopleBySpace((prev) => ({ ...prev, [space.id]: people }));
    return { data, people };
  }

  async function toggleSpace(space: Space) {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(space.id)) next.delete(space.id);
      else next.add(space.id);
      return next;
    });
    if (!listsBySpace[space.id]) {
      try {
        await loadSpaceListsAndPeople(space);
      } catch (err: any) {
        setError(err.message);
      }
    }
  }

  async function createSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!newSpaceName.trim() || !selectedWorkspace) return;
    try {
      await apiFetch(`/workspaces/${selectedWorkspace.id}/spaces`, {
        method: 'POST',
        body: JSON.stringify({ name: newSpaceName }),
      });
      setNewSpaceName('');
      setAddingSpace(false);
      selectWorkspace(selectedWorkspace);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveSpaceEdit() {
    if (!editingSpace || !editingSpace.name.trim() || !selectedWorkspace) return;
    try {
      await apiFetch(`/workspaces/${selectedWorkspace.id}/spaces/${editingSpace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingSpace.name }),
      });
      const id = editingSpace.id;
      const newName = editingSpace.name;
      setEditingSpace(null);
      setSpaces((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName } : s)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteSpace(sp: Space) {
    if (!selectedWorkspace) return;
    if (!confirm(`Delete space "${sp.name}"? This deletes everything inside it.`)) return;
    try {
      await apiFetch(`/workspaces/${selectedWorkspace.id}/spaces/${sp.id}`, { method: 'DELETE' });
      if (detailSpace?.id === sp.id) closeTaskDetail();
      selectWorkspace(selectedWorkspace);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ---- lists ----

  async function createList(e: React.FormEvent, space: Space) {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      await apiFetch(`/spaces/${space.id}/lists`, {
        method: 'POST',
        body: JSON.stringify({ name: newListName }),
      });
      setNewListName('');
      setAddingListForSpace(null);
      const data: List[] = await apiFetch(`/spaces/${space.id}/lists`);
      setListsBySpace((prev) => ({ ...prev, [space.id]: data }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveListEdit(space: Space) {
    if (!editingList || !editingList.name.trim()) return;
    try {
      await apiFetch(`/spaces/${space.id}/lists/${editingList.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingList.name }),
      });
      const id = editingList.id;
      const newName = editingList.name;
      setEditingList(null);
      setListsBySpace((prev) => ({
        ...prev,
        [space.id]: (prev[space.id] || []).map((l) => (l.id === id ? { ...l, name: newName } : l)),
      }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteList(space: Space, list: List) {
    if (!confirm(`Delete list "${list.name}"? This deletes all its tasks.`)) return;
    try {
      await apiFetch(`/spaces/${space.id}/lists/${list.id}`, { method: 'DELETE' });
      setListsBySpace((prev) => ({
        ...prev,
        [space.id]: (prev[space.id] || []).filter((l) => l.id !== list.id),
      }));
      if (detailListId === list.id) closeTaskDetail();
      setTasksByList((prev) => {
        const next = { ...prev };
        delete next[list.id];
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ---- statuses (custom columns per space) ----

  async function refreshSpaces() {
    if (!selectedWorkspace) return;
    try {
      const data: Space[] = await apiFetch(`/workspaces/${selectedWorkspace.id}/spaces`);
      setSpaces(data);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createStatus(e: React.FormEvent, space: Space) {
    e.preventDefault();
    if (!newStatusName.trim()) return;
    try {
      await apiFetch(`/spaces/${space.id}/statuses`, {
        method: 'POST',
        body: JSON.stringify({ name: newStatusName, color: newStatusColor, type: newStatusType }),
      });
      setNewStatusName('');
      setNewStatusColor('#6B7280');
      setNewStatusType('open');
      setAddingStatusForSpace(null);
      await refreshSpaces();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteStatus(status: Status, space: Space) {
    if (!confirm(`Delete status "${status.name}"? Tasks currently on it must be moved first.`)) return;
    try {
      await apiFetch(`/spaces/${space.id}/statuses/${status.id}`, { method: 'DELETE' });
      await refreshSpaces();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveTaskRename() {
    if (!editingTaskTitle || !editingTaskTitle.title.trim()) {
      setEditingTaskTitle(null);
      return;
    }
    const { listId, taskId, title } = editingTaskTitle;
    try {
      await apiFetch(`/lists/${listId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setEditingTaskTitle(null);
      refreshListTasks(listId);
      if (detailTask?.id === taskId) setDetailForm((f) => (f ? { ...f, title } : f));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveStatusRename(status: Status, space: Space) {
    if (!editingStatus || !editingStatus.name.trim()) return;
    try {
      await apiFetch(`/spaces/${space.id}/statuses/${status.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingStatus.name }),
      });
      setEditingStatus(null);
      await refreshSpaces();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ---- list expansion + tasks (sidebar tree) ----

  async function refreshListTasks(listId: string) {
    if (listId.startsWith('person:')) return;
    try {
      const data: Task[] = await apiFetch(`/lists/${listId}/tasks`);
      setTasksByList((prev) => ({ ...prev, [listId]: data }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function refreshTasksFor(list: List, space?: Space) {
    try {
      const spaceId = list.spaceId || space?.id;
      const personKey = list.personKey || list.userId;
      const data: Task[] =
        isPersonView(list) && personKey && spaceId
          ? await apiFetch(`/spaces/${spaceId}/people/${encodeURIComponent(personKey)}/tasks`)
          : await apiFetch(`/lists/${list.id}/tasks`);
      setTasksByList((prev) => ({ ...prev, [list.id]: data }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function refreshRelatedViews(space: Space, list: List, previousAssigneeId?: string | null) {
    await refreshTasksFor(list, space);
    const general = (listsBySpace[space.id] || []).find(isGeneralList);
    if (general && general.id !== list.id) {
      await refreshListTasks(general.id);
    }
    const ids = new Set<string>();
    if (list.personKey) ids.add(list.personKey);
    if (list.userId) ids.add(list.userId);
    if (previousAssigneeId) ids.add(previousAssigneeId);
    for (const person of peopleForSpace(space.id)) {
      const view = makePersonList(person, space);
      if (ids.has(person.key) || (person.userId && ids.has(person.userId)) || expandedLists.has(view.id) || tasksByList[view.id]) {
        await refreshTasksFor(view, space);
      }
    }
  }

  async function toggleList(list: List, space: Space) {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(list.id)) next.delete(list.id);
      else next.add(list.id);
      return next;
    });
    if (!tasksByList[list.id]) {
      await refreshTasksFor(list, space);
    }
  }

  async function createTaskInList(e: React.FormEvent, list: List, statusId: string, space: Space) {
    e.preventDefault();
    if (!newTaskTitle.trim() || creatingTaskRef.current) return;
    creatingTaskRef.current = true;
    try {
      const people = peopleForSpace(space.id);
      const selected = people.find((p) => p.key === newTaskAssigneeKey);
      if (isPersonView(list) && (list.personKey || list.userId)) {
        await apiFetch(`/spaces/${space.id}/people/${encodeURIComponent(list.personKey || list.userId!)}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title: newTaskTitle, statusId }),
        });
      } else {
        await apiFetch(`/lists/${list.id}/tasks`, {
          method: 'POST',
          body: JSON.stringify({
            title: newTaskTitle,
            statusId,
            ...(selected?.userId ? { assigneeId: selected.userId } : {}),
            ...(selected?.name ? { assigneeName: selected.name } : {}),
          }),
        });
      }
      setNewTaskTitle('');
      setNewTaskAssigneeKey('');
      setAddingTaskFor(null);
      await refreshRelatedViews(space, list);
      const peopleList: Person[] = await apiFetch(`/spaces/${space.id}/people`);
      setPeopleBySpace((prev) => ({ ...prev, [space.id]: peopleList }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      creatingTaskRef.current = false;
    }
  }

  async function deleteTaskFromList(list: List, task: Task, space: Space) {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    const apiListId = canonicalListId(list, task);
    if (!apiListId) return;
    try {
      await apiFetch(`/lists/${apiListId}/tasks/${task.id}`, { method: 'DELETE' });
      if (detailTask?.id === task.id) closeTaskDetail();
      await refreshRelatedViews(space, list, task.assigneeId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function duplicateTask(list: List, task: Task, space: Space) {
    setOpenTaskMenu(null);
    const apiListId = canonicalListId(list, task);
    if (!apiListId) return;
    try {
      await apiFetch(`/lists/${apiListId}/tasks/${task.id}/duplicate`, { method: 'POST' });
      await refreshRelatedViews(space, list, task.assigneeId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function ensureAllListsLoaded() {
    const updates: Record<string, List[]> = {};
    for (const space of spaces) {
      if (!listsBySpace[space.id]) {
        try {
          const data: List[] = await apiFetch(`/spaces/${space.id}/lists`);
          updates[space.id] = data;
        } catch (err: any) {
          setError(err.message);
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setListsBySpace((prev) => ({ ...prev, ...updates }));
    }
  }

  async function openMoveDialog(list: List, task: Task) {
    setOpenTaskMenu(null);
    setMoveDialogTask({ list, task });
    setMoveDialogTargetListId('');
    await ensureAllListsLoaded();
  }

  async function confirmMoveTask() {
    if (!moveDialogTask || !moveDialogTargetListId) return;
    try {
      await apiFetch(`/lists/${canonicalListId(moveDialogTask.list, moveDialogTask.task)}/tasks/${moveDialogTask.task.id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ targetListId: moveDialogTargetListId }),
      });
      const sourceListId = canonicalListId(moveDialogTask.list, moveDialogTask.task) || moveDialogTask.list.id;
      const targetListId = moveDialogTargetListId;
      const wasOpen = detailTask?.id === moveDialogTask.task.id;
      setMoveDialogTask(null);
      if (wasOpen) closeTaskDetail();
      refreshListTasks(sourceListId);
      if (tasksByList[targetListId]) refreshListTasks(targetListId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function openMergeDialog(list: List, task: Task) {
    setOpenTaskMenu(null);
    setMergeDialogTask({ list, task });
    setMergeDialogTargetTaskId('');
  }

  async function confirmMergeTask() {
    if (!mergeDialogTask || !mergeDialogTargetTaskId) return;
    try {
      await apiFetch(`/lists/${canonicalListId(mergeDialogTask.list, mergeDialogTask.task)}/tasks/${mergeDialogTask.task.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetTaskId: mergeDialogTargetTaskId }),
      });
      const listId = canonicalListId(mergeDialogTask.list, mergeDialogTask.task) || mergeDialogTask.list.id;
      const wasOpen = detailTask?.id === mergeDialogTask.task.id;
      setMergeDialogTask(null);
      if (wasOpen) closeTaskDetail();
      refreshListTasks(listId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function detailAsListTaskPair(): { list: List; task: Task } | null {
    if (!detailTask || !detailListId || !detailSpace) return null;
    return { list: { id: detailListId, name: '', spaceId: detailSpace.id }, task: detailTask };
  }

  function getSpaceForList(listId: string): Space | undefined {
    for (const space of spaces) {
      if ((listsBySpace[space.id] || []).some((l) => l.id === listId)) return space;
    }
    return undefined;
  }

  let overdueCount = 0;
  const overdueTasksList: { list: List; space: Space; task: Task }[] = [];
  for (const [listId, listTasks] of Object.entries(tasksByList)) {
    if (listId.startsWith('person:')) continue;
    const sp = getSpaceForList(listId);
    if (!sp) continue;
    const listForOverdue = (listsBySpace[sp.id] || []).find((l) => l.id === listId) || { id: listId, name: '', spaceId: sp.id };
    for (const t of listTasks) {
      if (isTaskOverdue(t, sp.statuses)) {
        overdueCount += 1;
        overdueTasksList.push({ list: listForOverdue, space: sp, task: t });
      }
    }
  }

  // ---- task detail (full main-panel view) ----

  async function openTaskDetail(
    list: List,
    space: Space,
    taskId: string,
    task?: Task,
    options?: { onMissing?: () => void },
  ): Promise<boolean> {
    try {
      if (!peopleBySpace[space.id]) {
        const peopleList: Person[] = await apiFetch(`/spaces/${space.id}/people`).catch(() => []);
        setPeopleBySpace((prev) => ({ ...prev, [space.id]: peopleList }));
      }
      const apiListId = canonicalListId(list, task);
      if (!apiListId) return false;
      const data: TaskDetail = await apiFetch(`/lists/${apiListId}/tasks/${taskId}`);
      if (detailTask?.id !== taskId) setEmailSentNotice('');
      setDetailTask(data);
      setDetailListId(data.listId || apiListId);
      setDetailSpace(space);
      setDetailForm({
        title: data.title,
        description: data.description || '',
        statusId: data.statusId,
        priority: data.priority || '',
        assigneeId: data.assigneeId || '',
        assigneeName: data.assigneeName || '',
        ownerName: data.ownerName || '',
        workCategory: data.workCategory || '',
        scope: data.scope || '',
        url: data.url || '',
        startDate: toDateInput(data.startDate),
        dueDate: toDateInput(data.dueDate),
        progressDate: toDateInput(data.progressDate),
      });
      setCustomFieldValues(
        data.customFields && typeof data.customFields === 'object' ? { ...data.customFields } : {},
      );
      setHandOffTo('');
      setNextActionText('');
      setAddingCustomField(false);
      setCommentText('');
      setCommentAuthor(user?.name || '');
      setAddingApprover(false);
      setApproverName('');
      setApproverDateTime('');
      setShowAllLogs(false);

      if (selectedWorkspace) {
        saveLastView({ workspaceId: selectedWorkspace.id, spaceId: space.id, listId: list.id, taskId, mode: 'task' });
        setRecentTasks((prev) => {
          const next = [
            {
              workspaceId: selectedWorkspace.id,
              spaceId: space.id,
              spaceName: space.name,
              listId: list.id,
              listName: list.name,
              taskId,
              taskTitle: data.title,
              openedAt: Date.now(),
            },
            ...prev.filter((r) => r.taskId !== taskId),
          ].slice(0, 8);
          saveRecentTasks(next);
          return next;
        });
      }
      return true;
    } catch (err: any) {
      if (options?.onMissing && /not found/i.test(err.message || '')) {
        options.onMissing();
        return false;
      }
      setError(err.message);
      return false;
    }
  }

  function openEmailComposer() {
    if (!detailTask) return;
    setEmailTo(detailTask.assigneeEmail || '');
    setEmailCc('');
    setEmailSubject(detailTask.title);
    const draft = nextActionText.replace(/\r\n/g, '\n').trim();
    setEmailBody(draft || latestDailyLog(detailTask.nextActions));
    setEmailAttach([]);
    setEmailRetryId(null);
    setEmailNotice(
      detailTask.assigneeEmailUnverified
        ? 'The assignee email is not verified yet. Enter a recipient before sending.'
        : '',
    );
    setEmailOpen(true);
  }

  async function submitTaskEmail(retry = false) {
    if (!detailTask || !detailListId || !detailSpace) return;
    const to = emailTo.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
    const cc = emailCc.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
    const attachments = detailTask.attachments.filter((item) => emailAttach.includes(item.id));
    const attachmentText = attachments.map((item) => `${item.name}: ${API_URL}${item.url}`).join('\n');
    const body = [emailBody.trim(), attachmentText ? `Attachments:\n${attachmentText}` : ''].filter(Boolean).join('\n\n');
    if (!retry && (!to.length || !emailSubject.trim() || !body)) {
      setEmailNotice('Add a recipient, subject, and message.');
      return;
    }
    setEmailBusy(true);
    setEmailNotice('');
    try {
      const result: { id: string; status: string; success?: boolean; error?: string | null; recipientEmail?: string } =
        retry && emailRetryId
          ? await apiFetch(`/tasks/${detailTask.id}/emails/${emailRetryId}/retry`, { method: 'POST' })
          : await apiFetch(`/tasks/${detailTask.id}/email`, {
              method: 'POST',
              body: JSON.stringify({ to, cc, subject: emailSubject.trim(), body }),
            });
      if (result.status !== 'sent' || result.success === false) {
        setEmailRetryId(result.id);
        setEmailNotice(result.error || 'Email failed to send.');
        return;
      }
      const sentTo = retry ? result.recipientEmail || emailTo.trim() : to.join(', ');
      setEmailOpen(false);
      setEmailRetryId(null);
      await openTaskDetail({ id: detailListId, name: '', spaceId: detailSpace.id }, detailSpace, detailTask.id);
      setEmailSentNotice(sentTo ? `Mail was sent to ${sentTo}.` : 'Mail was sent.');
    } catch (err: any) {
      setEmailNotice(err.message || 'Email failed to send.');
    } finally {
      setEmailBusy(false);
    }
  }

  const deepLinkTried = useRef(false);
  useEffect(() => {
    if (!user || !selectedWorkspace || spaces.length === 0 || deepLinkTried.current) return;
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (!taskId) return;
    deepLinkTried.current = true;
    (async () => {
      try {
        const loc: { id: string; title: string; listId: string; listName: string; spaceId: string } = await apiFetch(`/tasks/${taskId}`);
        const space = spaces.find((item) => item.id === loc.spaceId);
        if (!space) {
          setError('Related task is no longer available.');
          return;
        }
        const opened = await openTaskDetail({ id: loc.listId, name: loc.listName, spaceId: loc.spaceId }, space, loc.id);
        if (!opened) setError('Related task is no longer available.');
      } catch {
        setError('Related task is no longer available.');
      }
    })();
  }, [user, selectedWorkspace, spaces]);

  function closeTaskDetail() {
    setEmailSentNotice('');
    setDetailTask(null);
    setDetailListId(null);
    setDetailSpace(null);
    setDetailForm(null);
    setCustomFieldValues({});
    setNewSubtaskTitle('');
    setHandOffTo('');
    setNextActionText('');
    setAddingCustomField(false);
    setCommentText('');
    setCommentAuthor('');
    setAddingApprover(false);
    setApproverName('');
    setApproverDateTime('');
    setShowAllLogs(false);
  }

  async function saveTaskDetail() {
    if (!detailTask || !detailForm || !detailListId || !detailForm.title.trim()) return;
    setDetailSaving(true);
    const previousAssigneeId = detailTask.assigneeId;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: detailForm.title,
          description: detailForm.description || null,
          statusId: detailForm.statusId,
          priority: detailForm.priority || null,
          assigneeId: detailForm.assigneeId || null,
          assigneeName: detailForm.assigneeId
            ? members.find((m) => m.userId === detailForm.assigneeId)?.name || detailForm.assigneeName || null
            : null,
          ownerName: detailForm.ownerName || null,
          workCategory: detailForm.workCategory || null,
          scope: detailForm.scope || null,
          url: detailForm.url || null,
          startDate: detailForm.startDate || null,
          dueDate: detailForm.dueDate || null,
          progressDate: detailForm.progressDate || null,
          customFieldValues,
        }),
      });
      const listId = detailListId;
      const space = detailSpace;
      closeTaskDetail();
      if (space) {
        const list = (listsBySpace[space.id] || []).find((l) => l.id === listId) || {
          id: listId,
          name: '',
          spaceId: space.id,
        };
        await refreshRelatedViews(space, list, previousAssigneeId);
      } else {
        refreshListTasks(listId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailSaving(false);
    }
  }

  async function handOffTask() {
    if (!detailTask || !detailListId || !handOffTo.trim()) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ownerName: handOffTo }),
      });
      setDetailForm((prev) => (prev ? { ...prev, ownerName: handOffTo } : prev));
      setHandOffTo('');
      refreshListTasks(detailListId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!detailTask || !detailListId || !detailSpace || !newSubtaskTitle.trim()) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: newSubtaskTitle,
          parentTaskId: detailTask.id,
          statusId: detailTask.statusId,
        }),
      });
      setNewSubtaskTitle('');
      const listId = detailListId;
      const space = detailSpace;
      const taskId = detailTask.id;
      const list: List = { id: listId, name: '', spaceId: space.id };
      await openTaskDetail(list, space, taskId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteSubtask(subtask: Task) {
    if (!detailTask || !detailListId || !detailSpace) return;
    if (!confirm(`Delete subtask "${subtask.title}"?`)) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${subtask.id}`, { method: 'DELETE' });
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
      refreshListTasks(detailListId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addNextAction() {
    if (!detailTask || !detailListId || !detailSpace || !nextActionText.trim()) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/next-actions`, {
        method: 'POST',
        body: JSON.stringify({ text: nextActionText }),
      });
      setNextActionText('');
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveNextActionEdit(entryId: string) {
    if (!detailTask || !detailListId || !detailSpace || !editingNextActionText.trim()) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/next-actions/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editingNextActionText }),
      });
      setEditingNextActionId(null);
      setEditingNextActionText('');
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteNextAction(entryId: string) {
    if (!detailTask || !detailListId || !detailSpace) return;
    if (!confirm('Delete this daily log?')) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/next-actions/${entryId}`, {
        method: 'DELETE',
      });
      if (editingNextActionId === entryId) {
        setEditingNextActionId(null);
        setEditingNextActionText('');
      }
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addComment() {
    if (!detailTask || !detailListId || !detailSpace || !commentText.trim()) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentText, authorName: commentAuthor || undefined }),
      });
      setCommentText('');
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addApprover() {
    if (!detailTask || !detailListId || !detailSpace || !approverName.trim()) return;
    try {
      const when = approverDateTime ? new Date(approverDateTime) : new Date();
      const formatted = when.toLocaleString();
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: `✅ Approved by ${approverName} on ${formatted}`,
          authorName: approverName,
        }),
      });
      setApproverName('');
      setApproverDateTime('');
      setAddingApprover(false);
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteComment(commentId: string) {
    if (!detailTask || !detailListId || !detailSpace) return;
    if (!confirm('Delete this comment?')) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/comments/${commentId}`, {
        method: 'DELETE',
      });
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function uploadAttachment(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !detailTask || !detailListId || !detailSpace) return;
    setUploadingAttachment(true);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append('file', file);
        await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/attachments`, {
          method: 'POST',
          body: formData,
        });
      }
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!detailTask || !detailListId || !detailSpace) return;
    if (!confirm('Delete this attachment?')) return;
    try {
      await apiFetch(`/lists/${detailListId}/tasks/${detailTask.id}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addCustomFieldDef(e: React.FormEvent) {
    e.preventDefault();
    if (!detailSpace || !newCustomFieldName.trim() || !detailTask || !detailListId) return;
    try {
      const config =
        newCustomFieldType === 'dropdown'
          ? { options: newCustomFieldOptions.split(',').map((s) => s.trim()).filter(Boolean) }
          : undefined;
      await apiFetch(`/spaces/${detailSpace.id}/custom-fields`, {
        method: 'POST',
        body: JSON.stringify({ name: newCustomFieldName, type: newCustomFieldType, config }),
      });
      setNewCustomFieldName('');
      setNewCustomFieldType(CUSTOM_FIELD_TYPES[0]);
      setNewCustomFieldOptions('');
      setAddingCustomField(false);
      const list: List = { id: detailListId, name: '', spaceId: detailSpace.id };
      await openTaskDetail(list, detailSpace, detailTask.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ---- render ----

  const themeStyle: React.CSSProperties = {
    ['--accent' as any]: theme.accent,
    ['--sidebar-bg' as any]: theme.sidebarBg,
    ['--sidebar-text' as any]: theme.sidebarText,
    ['--main-bg' as any]: theme.mainBg,
    fontFamily: theme.font,
  };

  if (!user) {
    return (
      <main style={themeStyle} className="min-h-screen flex items-center justify-center bg-[var(--main-bg)]">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-black/5">
          <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.accent }}>
            ClickUp Clone
          </h1>
          <div className="flex mb-4 border rounded-xl overflow-hidden">
            <button
              className="flex-1 py-2 font-medium"
              style={authMode === 'login' ? { backgroundColor: theme.accent, color: 'white' } : { backgroundColor: '#F3F4F6' }}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              className="flex-1 py-2 font-medium"
              style={authMode === 'signup' ? { backgroundColor: theme.accent, color: 'white' } : { backgroundColor: '#F3F4F6' }}
              onClick={() => setAuthMode('signup')}
            >
              Sign Up
            </button>
          </div>
          <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-3">
            {authMode === 'signup' && (
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder={authMode === 'signup' ? 'Password (min 8 characters)' : 'Password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={authMode === 'signup' ? 8 : undefined}
              required
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              className="w-full text-white py-2 rounded-lg font-medium disabled:opacity-50"
              style={{ backgroundColor: theme.accent }}
              type="submit"
              disabled={authLoading}
            >
              {authLoading ? 'Please wait...' : authMode === 'login' ? 'Log in' : 'Sign up'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main style={themeStyle} className="h-screen flex bg-[var(--main-bg)] text-sm">
      <nav
        className="w-[52px] shrink-0 flex flex-col items-center py-3 gap-2"
        style={{ backgroundColor: '#1c1c1c', color: '#f5f5f5' }}
      >
        <button
          onClick={goHome}
          className="flex flex-col items-center gap-0.5"
          title="Home"
        >
          <span
            className="w-9 h-9 rounded-[10px] grid place-items-center hover:bg-white/10"
            style={!detailTask && !viewingList && !aiOpen ? { backgroundColor: 'rgba(255,255,255,0.12)' } : {}}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" />
              <path d="M9 22V12h6v10" />
            </svg>
          </span>
          <span className="text-[10px] text-white/55">Home</span>
        </button>
        <button
          onClick={() => openAiWorkspace()}
          className="flex flex-col items-center gap-0.5"
          title="AI"
        >
          <span
            className="w-9 h-9 rounded-[10px] grid place-items-center hover:bg-white/10"
            style={aiOpen ? { backgroundColor: 'rgba(255,255,255,0.12)' } : {}}
          >
            <AiIcon size={22} />
          </span>
          <span className="text-[10px] text-white/55">AI</span>
        </button>
      </nav>
      {/* Sidebar — now holds the full tree: Space -> List -> Status -> Tasks */}
      <aside
        className={`${aiOpen ? 'w-[260px]' : 'w-80'} flex flex-col shrink-0 border-r border-black/5`}
        style={{
          backgroundColor: aiOpen ? '#F7F8FA' : theme.sidebarBg,
          color: aiOpen ? '#2A2E34' : theme.sidebarText,
        }}
      >
        <div className="p-3 border-b border-current/15">
          <div className="flex items-center gap-2">
            <select
              className="flex-1 rounded-lg px-2 py-1.5 text-sm font-medium bg-current/10 border border-current/15 outline-none"
              style={{ color: theme.sidebarText }}
              value={selectedWorkspace?.id || ''}
              onChange={(e) => {
                const ws = workspaces.find((w) => w.id === e.target.value);
                if (ws) selectWorkspace(ws);
              }}
            >
              {workspaces.length === 0 && <option value="">No workspaces</option>}
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id} style={{ color: '#111' }}>
                  {ws.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setAddingWorkspace((v) => !v)}
              className="rounded-lg px-2 py-1.5 text-xs font-medium border"
              style={{ borderColor: theme.accent, color: theme.accent }}
              title="New workspace"
            >
              +
            </button>
          </div>
          {addingWorkspace && (
            <form onSubmit={createWorkspace} className="flex gap-1 mt-2">
              <input
                autoFocus
                className="flex-1 border rounded-lg px-2 py-1 text-sm text-black"
                placeholder="Workspace name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
              <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                Add
              </button>
            </form>
          )}
          {selectedWorkspace && (
            <div className="flex items-center justify-between mt-1">
              {editingWorkspace?.id === selectedWorkspace.id ? (
                <div className="flex gap-1 w-full">
                  <input
                    autoFocus
                    className="flex-1 border rounded-lg px-2 py-1 text-xs text-black"
                    value={editingWorkspace.name}
                    onChange={(e) => setEditingWorkspace({ id: selectedWorkspace.id, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && saveWorkspaceEdit()}
                  />
                  <button onClick={saveWorkspaceEdit} className="text-xs" style={{ color: theme.accent }}>Save</button>
                  <button onClick={() => setEditingWorkspace(null)} className="text-xs opacity-60">Cancel</button>
                </div>
              ) : (
                <div className="flex gap-2 text-xs opacity-60 mt-1">
                  <button onClick={() => setEditingWorkspace({ id: selectedWorkspace.id, name: selectedWorkspace.name })} className="hover:opacity-100">
                    Rename workspace
                  </button>
                  <button onClick={() => deleteWorkspace(selectedWorkspace)} className="hover:text-red-400">
                    Delete workspace
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={goHome}
            className="w-full text-left mt-2 px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-black/5 flex items-center gap-1.5"
            style={!detailTask && !viewingList && !aiOpen ? { backgroundColor: theme.accent, color: 'white' } : {}}
          >
            Home
          </button>
          {selectedWorkspace && (
            <div className="mt-2">
              <button
                onClick={() => setAddingMember((v) => !v)}
                className="w-full text-left px-2 py-1 rounded-lg text-xs opacity-70 hover:opacity-100"
              >
                + Add person
              </button>
              {addingMember && (
                <form onSubmit={addWorkspaceMember} className="flex gap-1 mt-1">
                  <input
                    autoFocus
                    className="flex-1 border rounded-lg px-2 py-1 text-xs text-black"
                    placeholder="Member email"
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                  />
                  <button className="text-white px-2 rounded-lg text-xs" style={{ backgroundColor: theme.accent }}>
                    Add
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {selectedWorkspace && (
            <div className="mb-3 px-1">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-2">AI Chats</div>
              <button
                onClick={() => openAiWorkspace()}
                className="w-full text-left px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-black/5 flex items-center gap-2"
                style={aiOpen && !aiChatId ? { backgroundColor: 'rgba(15,23,42,0.06)' } : {}}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white shrink-0 ring-1 ring-black/5">
                  <AiIcon size={18} />
                </span>
                AI Workspace
              </button>
              <button
                onClick={() => openAiWorkspace({ newChat: true })}
                className="w-full text-left px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-800 hover:bg-black/5"
              >
                + New chat
              </button>
              {aiChats.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-2 mb-1">Recent Chats</div>
                  <div className="max-h-56 overflow-y-auto">
                    {aiChats.map((c) => (
                      <div
                        key={c.id}
                        className="group relative flex items-center rounded-lg hover:bg-black/5"
                        style={aiOpen && aiChatId === c.id ? { backgroundColor: 'rgba(15,23,42,0.06)' } : {}}
                      >
                        <button
                          onClick={() => {
                            setAiMenuFor(null);
                            openAiWorkspace({ chatId: c.id });
                          }}
                          className="flex-1 min-w-0 text-left px-2 py-1 text-xs truncate"
                          title={c.title}
                        >
                          📄 {c.title}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAiMenuFor(aiMenuFor === c.id ? null : c.id);
                          }}
                          className="shrink-0 px-1.5 py-1 text-xs opacity-40 group-hover:opacity-100"
                          title="Chat options"
                        >
                          ⋮
                        </button>
                        {aiMenuFor === c.id && (
                          <div className="absolute right-1 top-7 z-30 w-32 rounded-lg border bg-white text-gray-800 shadow-lg py-1 text-xs">
                            <button
                              className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                              onClick={() => {
                                setAiRename({ id: c.id, title: c.title });
                                setAiMenuFor(null);
                              }}
                            >
                              Rename
                            </button>
                            <button
                              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600"
                              onClick={() => {
                                setAiDeleteConfirm(c);
                                setAiMenuFor(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-xs font-semibold opacity-50 uppercase tracking-wide">Spaces</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortByPriority((v) => !v)}
                className="text-xs opacity-60 hover:opacity-100"
                title="Sort tasks by priority"
              >
                {sortByPriority ? '🚩 Priority ✓' : '🚩 Sort'}
              </button>
              <button onClick={() => setAddingSpace((v) => !v)} className="opacity-60 hover:opacity-100 text-sm" title="New space">
                +
              </button>
            </div>
          </div>
          {addingSpace && (
            <form onSubmit={createSpace} className="flex gap-1 mb-2 px-1">
              <input
                autoFocus
                className="flex-1 border rounded-lg px-2 py-1 text-sm text-black"
                placeholder="Space name"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
              />
              <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                Add
              </button>
            </form>
          )}

          {spaces.map((space) => (
            <div key={space.id} className="mb-1">
              <div className="group flex items-center">
                <button onClick={() => toggleSpace(space)} className="opacity-50 w-4 shrink-0 text-xs">
                  {expandedSpaces.has(space.id) ? '▾' : '▸'}
                </button>
                {editingSpace?.id === space.id ? (
                  <div className="flex gap-1 flex-1">
                    <input
                      autoFocus
                      className="flex-1 border rounded-lg px-2 py-1 text-sm text-black"
                      value={editingSpace.name}
                      onChange={(e) => setEditingSpace({ id: space.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && saveSpaceEdit()}
                    />
                    <button onClick={saveSpaceEdit} className="text-xs px-1" style={{ color: theme.accent }}>Save</button>
                    <button onClick={() => setEditingSpace(null)} className="text-xs px-1 opacity-60">Cancel</button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => toggleSpace(space)}
                      className="flex-1 text-left px-1.5 py-1.5 rounded-lg font-medium hover:bg-current/10"
                    >
                      📁 {space.name}
                    </button>
                    <span className="hidden group-hover:flex gap-1 pr-1 text-xs">
                      <button onClick={() => setAddingListForSpace(space.id)} className="opacity-60 hover:opacity-100">+List</button>
                      <button onClick={() => setEditingSpace({ id: space.id, name: space.name })} className="opacity-60 hover:opacity-100">Edit</button>
                      <button onClick={() => deleteSpace(space)} className="opacity-60 hover:text-red-400">Del</button>
                    </span>
                  </>
                )}
              </div>

              {expandedSpaces.has(space.id) && (
                <div className="ml-5 border-l border-current/15 pl-2">
                  {(() => {
                    const realLists = [...(listsBySpace[space.id] || [])].sort((a, b) => {
                      if (isGeneralList(a)) return -1;
                      if (isGeneralList(b)) return 1;
                      return a.name.localeCompare(b.name);
                    });
                    const personLists = peopleForSpace(space.id).map((p) => makePersonList(p, space));
                    return [...realLists, ...personLists];
                  })().map((list) => (
                    <div key={list.id} className="mb-0.5">
                      {isPersonView(list) && peopleForSpace(space.id)[0] && list.personKey === peopleForSpace(space.id)[0].key && (
                        <div className="mt-2 mb-1 px-1 text-xs font-semibold opacity-50 uppercase tracking-wide">
                          People
                        </div>
                      )}
                      <div className="group flex items-center">
                        <button onClick={() => toggleList(list, space)} className="opacity-50 w-4 shrink-0 text-xs">
                          {expandedLists.has(list.id) ? '▾' : '▸'}
                        </button>
                        {editingList?.id === list.id ? (
                          <div className="flex gap-1 flex-1 my-0.5">
                            <input
                              autoFocus
                              className="flex-1 border rounded-lg px-2 py-1 text-sm text-black"
                              value={editingList.name}
                              onChange={(e) => setEditingList({ id: list.id, name: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && saveListEdit(space)}
                            />
                            <button onClick={() => saveListEdit(space)} className="text-xs px-1" style={{ color: theme.accent }}>Save</button>
                            <button onClick={() => setEditingList(null)} className="text-xs px-1 opacity-60">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleList(list, space)}
                              className="flex-1 text-left px-1.5 py-1 rounded-lg hover:bg-current/10 min-w-0"
                            >
                              <span className="block truncate">{isPersonView(list) ? '👤' : '📋'} {list.name}</span>
                              {isPersonView(list) && list.email && (
                                <span className="block truncate text-[11px] opacity-60">
                                  {list.email}
                                  {isPlaceholderEmail(list.email) ? ' · placeholder' : ''}
                                </span>
                              )}
                            </button>
                            {isPersonView(list) &&
                              list.userId &&
                              members.some((member) => member.userId === user.id && (member.role === 'owner' || member.role === 'admin')) && (
                                <button
                                  onClick={() => openManageUser({ userId: list.userId!, name: list.name, email: list.email })}
                                  className="text-[11px] opacity-60 hover:opacity-100 shrink-0 pr-1"
                                >
                                  Manage
                                </button>
                              )}
                            <span className="hidden group-hover:flex gap-1 pr-1 text-xs">
                              <button onClick={() => openListView(list, space)} className="opacity-60 hover:opacity-100" title="Open List/Board view with filters & search">View</button>
                              {!isPersonView(list) && (
                                <button onClick={() => setEditingList({ id: list.id, name: list.name })} className="opacity-60 hover:opacity-100">Edit</button>
                              )}
                              {!isPersonView(list) && !isGeneralList(list) && (
                                <button onClick={() => deleteList(space, list)} className="opacity-60 hover:text-red-400">Del</button>
                              )}
                            </span>
                          </>
                        )}
                      </div>

                      {expandedLists.has(list.id) && (
                        <div className="ml-5 border-l border-current/15 pl-2 max-h-[50vh] overflow-y-auto">
                          {[...space.statuses]
                            .sort((a, b) => a.order - b.order)
                            .map((status) => {
                              let statusTasks = [...new Map((tasksByList[list.id] || []).map((t) => [t.id, t])).values()].filter(
                                (t) => t.statusId === status.id,
                              );
                              if (sortByPriority) {
                                const rank: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
                                statusTasks = [...statusTasks].sort(
                                  (a, b) => (rank[a.priority || ''] ?? 9) - (rank[b.priority || ''] ?? 9),
                                );
                              }
                              const isAdding =
                                addingTaskFor?.listId === list.id && addingTaskFor?.statusId === status.id;
                              return (
                                <div key={status.id} className="mb-1.5 group/status">
                                  <div className="flex items-center gap-1.5 px-1 py-0.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: status.color }}
                                    />
                                    {editingStatus?.id === status.id ? (
                                      <input
                                        autoFocus
                                        className="text-xs px-1 py-0.5 rounded border flex-1 text-black"
                                        value={editingStatus.name}
                                        onChange={(e) => setEditingStatus({ id: status.id, name: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && saveStatusRename(status, space)}
                                        onBlur={() => saveStatusRename(status, space)}
                                      />
                                    ) : (
                                      <span
                                        className="text-xs font-semibold opacity-70 cursor-text hover:opacity-100"
                                        title="Click to rename"
                                        onClick={() => setEditingStatus({ id: status.id, name: status.name })}
                                      >
                                        {status.name}
                                      </span>
                                    )}
                                    <span className="text-xs opacity-40">{statusTasks.length}</span>
                                    <button
                                      onClick={() => deleteStatus(status, space)}
                                      className="hidden group-hover/status:inline text-xs opacity-40 hover:text-red-500 hover:opacity-100 ml-auto"
                                      title="Delete this status"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <div>
                                    {statusTasks.map((task) => (
                                      <div key={task.id} className="group flex items-center relative">
                                        {editingTaskTitle?.taskId === task.id ? (
                                          <input
                                            autoFocus
                                            className="flex-1 px-2 py-1 rounded-lg text-sm text-black"
                                            value={editingTaskTitle.title}
                                            onChange={(e) =>
                                              setEditingTaskTitle({ listId: list.id, taskId: task.id, title: e.target.value })
                                            }
                                            onKeyDown={(e) => e.key === 'Enter' && saveTaskRename()}
                                            onBlur={saveTaskRename}
                                          />
                                        ) : (
                                        <button
                                          onClick={() => openTaskDetail(list, space, task.id, task)}
                                          className="flex-1 text-left px-2 py-1 rounded-lg truncate hover:bg-current/10"
                                          style={
                                            detailTask?.id === task.id
                                              ? { backgroundColor: theme.accent + '33', fontWeight: 600 }
                                              : undefined
                                          }
                                          title={task.title}
                                        >
                                          {isTaskOverdue(task, space.statuses) && (
                                            <span className="mr-1 text-red-500" title="Overdue">⚠</span>
                                          )}
                                          {task.priority && (
                                            <span className={`mr-1 ${priorityColor(task.priority)}`}>⚑</span>
                                          )}
                                          {task.title}
                                        </button>
                                        )}
                                        <span className="hidden group-hover:flex pr-1 text-xs relative">
                                          <button
                                            onClick={() =>
                                              setOpenTaskMenu(
                                                openTaskMenu?.taskId === task.id && openTaskMenu.listId === list.id
                                                  ? null
                                                  : { listId: list.id, taskId: task.id },
                                              )
                                            }
                                            className="opacity-60 hover:opacity-100 px-1"
                                          >
                                            ⋯
                                          </button>
                                          {openTaskMenu?.taskId === task.id && openTaskMenu.listId === list.id && (
                                            <div className="absolute right-0 top-5 z-30 bg-white border rounded-lg shadow-xl py-1 w-32 text-left text-black">
                                              <button
                                                onClick={() => {
                                                  setOpenTaskMenu(null);
                                                  setEditingTaskTitle({ listId: list.id, taskId: task.id, title: task.title });
                                                }}
                                                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                                              >
                                                Rename
                                              </button>
                                              <button
                                                onClick={() => duplicateTask(list, task, space)}
                                                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                                              >
                                                Duplicate
                                              </button>
                                              <button
                                                onClick={() => openMoveDialog(list, task)}
                                                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                                              >
                                                Move
                                              </button>
                                              <button
                                                onClick={() => openMergeDialog(list, task)}
                                                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                                              >
                                                Merge into...
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setOpenTaskMenu(null);
                                                  deleteTaskFromList(list, task, space);
                                                }}
                                                className="block w-full text-left px-3 py-1 hover:bg-red-50 text-red-600"
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                    {isAdding ? (
                                      <form
                                        onSubmit={(e) => createTaskInList(e, list, status.id, space)}
                                        className="flex flex-col gap-1 px-1 my-1"
                                      >
                                        <div className="flex gap-1">
                                          <input
                                            autoFocus
                                            className="flex-1 border rounded-lg px-2 py-1 text-sm text-black"
                                            placeholder="Task title"
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                          />
                                          <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                                            Add
                                          </button>
                                        </div>
                                        {!isPersonView(list) && peopleForSpace(space.id).length > 0 && (
                                          <select
                                            className="border rounded-lg px-2 py-1 text-xs text-black"
                                            value={newTaskAssigneeKey}
                                            onChange={(e) => setNewTaskAssigneeKey(e.target.value)}
                                          >
                                            <option value="">Unassigned</option>
                                            {peopleForSpace(space.id).map((p) => (
                                              <option key={p.key} value={p.key}>
                                                {p.email ? `${p.name} — ${p.email}` : p.name}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                      </form>
                                    ) : (
                                      <button
                                        onClick={() => setAddingTaskFor({ listId: list.id, statusId: status.id })}
                                        className="text-xs opacity-50 hover:opacity-100 px-2 py-0.5"
                                      >
                                        + Add task
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          {addingStatusForSpace === space.id && !isPersonView(list) ? (
                            <form onSubmit={(e) => createStatus(e, space)} className="flex flex-wrap gap-1 px-1 my-1 items-center">
                              <input
                                autoFocus
                                className="flex-1 min-w-[80px] border rounded-lg px-2 py-1 text-sm text-black"
                                placeholder="Status name"
                                value={newStatusName}
                                onChange={(e) => setNewStatusName(e.target.value)}
                              />
                              <input
                                type="color"
                                value={newStatusColor}
                                onChange={(e) => setNewStatusColor(e.target.value)}
                                className="w-8 h-8 border rounded"
                                title="Status color"
                              />
                              <select
                                className="border rounded-lg px-1 py-1 text-xs text-black"
                                value={newStatusType}
                                onChange={(e) => setNewStatusType(e.target.value)}
                              >
                                <option value="open">Open</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done">Done</option>
                              </select>
                              <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => setAddingStatusForSpace(null)}
                                className="text-xs opacity-60"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : !isPersonView(list) ? (
                            <button
                              onClick={() => setAddingStatusForSpace(space.id)}
                              className="text-xs opacity-50 hover:opacity-100 px-1 py-0.5"
                            >
                              + Add custom status
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                  {addingListForSpace === space.id ? (
                    <form onSubmit={(e) => createList(e, space)} className="flex gap-1 my-1">
                      <input
                        autoFocus
                        className="flex-1 border rounded-lg px-2 py-1 text-sm text-black"
                        placeholder="List name"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onBlur={() => !newListName && setAddingListForSpace(null)}
                      />
                      <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setAddingListForSpace(space.id)}
                      className="text-xs opacity-50 hover:opacity-100 px-1.5 py-1"
                    >
                      + New List
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-current/15">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="block text-xs opacity-70 truncate">{user.name}</span>
              <span className="block text-[11px] opacity-60 truncate">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => {
                  setProfileEmail(user.email);
                  setProfileNotice('');
                  setProfileOpen((open) => !open);
                }}
                className="text-xs opacity-70 hover:opacity-100"
              >
                Profile
              </button>
              <button onClick={() => setThemePanelOpen(true)} className="text-xs opacity-70 hover:opacity-100" title="Customize colors">
                🎨
              </button>
              <button onClick={handleLogout} className="text-xs text-red-400 underline">
                Log out
              </button>
            </div>
          </div>
          {profileOpen && (
            <form onSubmit={saveProfileEmail} className="mt-2 space-y-1.5">
              {isPlaceholderEmail(user.email) && (
                <p className="text-[11px] opacity-70">This is a placeholder address. Replace it with your email.</p>
              )}
              <input
                type="email"
                required
                className="w-full border rounded-lg px-2 py-1 text-sm text-black"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="name@email.com"
              />
              {profileNotice && <p className="text-[11px] opacity-80">{profileNotice}</p>}
              <button
                type="submit"
                disabled={profileBusy}
                className="text-xs text-white px-2 py-1 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                {profileBusy ? 'Saving...' : 'Save email'}
              </button>
            </form>
          )}
        </div>
      </aside>

      {/* Main panel — empty state, or the full task detail page */}
      <section className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {!aiOpen && selectedWorkspace && (
          <header className="h-[52px] shrink-0 flex items-center justify-center gap-2 px-6 bg-white/90 border-b border-black/[0.04]">
            <SearchTrigger onClick={() => setSearchOpen(true)} wide />
            <NotificationBell
              workspaceId={selectedWorkspace.id}
              onOpenTask={(task) =>
                openTaskFromAi(task, { onMissing: () => setError('Related task is no longer available.') })
              }
              onViewAll={showNotificationCenter}
            />
            <button
              type="button"
              onClick={() => openAiWorkspace()}
              className="h-8 rounded-full border border-black/[0.08] bg-white px-2.5 text-[13px] text-gray-600 inline-flex items-center gap-1.5 hover:bg-gray-50"
            >
              Ask AI <AiIcon size={14} />
            </button>
          </header>
        )}
        <div className={`flex-1 min-h-0 relative ${aiOpen ? 'overflow-hidden' : 'overflow-y-auto'}`} onClick={() => aiMenuFor && setAiMenuFor(null)}>
        {aiOpen && selectedWorkspace ? (
          <AiChatPanel
            workspaceId={selectedWorkspace.id}
            workspaceName={selectedWorkspace.name}
            userName={user.name}
            accent={theme.accent}
            chatId={aiChatId}
            context={aiContext || workspaceAiContext()}
            onEnsureChat={ensureAiChat}
            onChatUpdated={() => loadAiChats(selectedWorkspace.id)}
            onOpenTask={openTaskFromAi}
            onViewTasks={viewTasksFromAi}
            onOpenSearch={() => setSearchOpen(true)}
            openBriefToken={aiBriefToken}
          />
        ) : (
          <>
        {overdueCount > 0 && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-6 py-2 flex items-center gap-2">
            ⚠ {overdueCount} task{overdueCount > 1 ? 's are' : ' is'} overdue — expand the lists in the sidebar
            flagged with ⚠ to address {overdueCount > 1 ? 'them' : 'it'} first.
          </div>
        )}
        {error && <p className="text-red-600 text-sm px-6 pt-4">{error}</p>}

        {!detailTask && !viewingList && aiListedTasks && aiListedTasks.length > 0 && (
          <div className="p-8 max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Tasks ({aiListedTasks.length})</h2>
              <button onClick={() => setAiListedTasks(null)} className="text-xs text-gray-400 hover:text-gray-700">Close</button>
            </div>
            <div className="space-y-1">
              {aiListedTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => openTaskFromAi(task)}
                  className="w-full text-left bg-gray-50 hover:bg-gray-100 border rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3"
                >
                  <span className="truncate">{task.title}</span>
                  <span className="text-xs opacity-60 shrink-0">{task.spaceName} / {task.listName}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!detailTask && !viewingList && !aiListedTasks && (() => {
          const myRecent = recentTasks.filter((r) => r.workspaceId === selectedWorkspace?.id);
          const hasAnything = overdueTasksList.length > 0 || myRecent.length > 0;
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
          return (
            <div className="p-8 max-w-2xl">
              <h2 className="text-xl font-semibold mb-1">
                {greeting}, {user?.name?.split(' ')[0] || 'there'} 👋
              </h2>
              <p className="text-sm opacity-60 mb-6">Here's where you left off.</p>

              {overdueTasksList.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-2 text-red-600">⚠ Overdue ({overdueTasksList.length})</h3>
                  <div className="space-y-1">
                    {overdueTasksList.slice(0, 8).map(({ list, space, task }) => (
                      <button
                        key={task.id}
                        onClick={() => openTaskDetail(list, space, task.id, task)}
                        className="w-full text-left bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{task.title}</span>
                        <span className="text-xs opacity-60 shrink-0">{space.name}{list.name ? ` / ${list.name}` : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {myRecent.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-2 opacity-70">🕓 Recently viewed</h3>
                  <div className="space-y-1">
                    {myRecent.slice(0, 6).map((r) => (
                      <button
                        key={r.taskId}
                        onClick={() => {
                          const sp = spaces.find((s) => s.id === r.spaceId);
                          if (!sp) return;
                          const list = listsBySpace[r.spaceId]?.find((l) => l.id === r.listId) || {
                            id: r.listId,
                            name: r.listName,
                            spaceId: r.spaceId,
                          };
                          openTaskDetail(list, sp, r.taskId);
                        }}
                        className="w-full text-left bg-gray-50 hover:bg-gray-100 border rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{r.taskTitle}</span>
                        <span className="text-xs opacity-60 shrink-0">{r.spaceName} / {r.listName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!hasAnything && (
                <div className="text-gray-400 mt-8">
                  Select a task from the sidebar to view its details, click "View" next to a List for the
                  List/Board view, or create a Space and List to get started.
                </div>
              )}
            </div>
          );
        })()}

        {!detailTask && viewingList && (() => {
          const { list, space } = viewingList;
          const allTasks = tasksByList[list.id] || [];
          const query = listSearchQuery.trim().toLowerCase();
          let rows = allTasks.filter((t) => {
            if (!listShowSubtasks && t.parentTaskId) return false;
            if (query && !t.title.toLowerCase().includes(query)) return false;
            if (listAssigneeFilter && t.assigneeName !== listAssigneeFilter) return false;
            if (!listShowClosed) {
              const st = space.statuses.find((s) => s.id === t.statusId);
              if (st?.type === 'done') return false;
            }
            return true;
          });
          const assigneeOptions = Array.from(
            new Set(allTasks.map((t) => t.assigneeName).filter(Boolean) as string[]),
          );

          function groupKeyFor(t: Task): string {
            if (listGroupBy === 'assignee') return t.assigneeName || 'Unassigned';
            if (listGroupBy === 'priority') return t.priority || 'No priority';
            return space.statuses.find((s) => s.id === t.statusId)?.name || 'No status';
          }
          const groupKeys =
            listGroupBy === 'status'
              ? [...space.statuses].sort((a, b) => a.order - b.order).map((s) => s.name)
              : Array.from(new Set(rows.map(groupKeyFor)));

          return (
            <div className="p-4">
              {/* Top toolbar row: Channel / List / Board / +View tabs, right-side Agents/Automate/Brain/Share */}
              <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                <div className="flex items-center gap-1 text-sm">
                  <button onClick={() => setComingSoon('Channel (in-list chat)')} className="px-3 py-1.5 text-gray-500 hover:text-gray-800">
                    # Channel
                  </button>
                  <button
                    onClick={() => setListViewMode('list')}
                    className="px-3 py-1.5 rounded-t-lg"
                    style={listViewMode === 'list' ? { borderBottom: `2px solid ${theme.accent}`, color: theme.accent, fontWeight: 600 } : { color: '#6b7280' }}
                  >
                    ☰ List
                  </button>
                  <button
                    onClick={() => setListViewMode('board')}
                    className="px-3 py-1.5 rounded-t-lg"
                    style={listViewMode === 'board' ? { borderBottom: `2px solid ${theme.accent}`, color: theme.accent, fontWeight: 600 } : { color: '#6b7280' }}
                  >
                    ▤ Board
                  </button>
                  <button onClick={() => setComingSoon('Saved custom Views')} className="px-3 py-1.5 text-gray-500 hover:text-gray-800">
                    + View
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => setComingSoon('Agents (AI agent builder)')} className="px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100">🤖 Agents</button>
                  <button onClick={() => setComingSoon('Automate (workflow automation rules)')} className="px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100">⚡ Automate</button>
                  <button onClick={() => setComingSoon('Brain² (AI knowledge assistant)')} className="px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100">🧠 Brain²</button>
                  <button onClick={() => setComingSoon('Share with others')} className="px-2 py-1 rounded-lg text-white" style={{ backgroundColor: theme.accent }}>👥 Share</button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-lg">📋 {list.name}</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      openAiWorkspace({
                        newChat: true,
                        context: { type: 'list', id: list.id, name: list.name, spaceId: space.id },
                      })
                    }
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    ✨ Ask AI
                  </button>
                  <button onClick={() => setViewingList(null)} className="text-xs text-gray-400 hover:text-gray-700">Close</button>
                </div>
              </div>

              {/* Filter / Group / Columns / Search toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                <div className="relative">
                  <button
                    onClick={() => setListFilterOpen((v) => !v)}
                    className="border rounded-lg px-2 py-1 flex items-center gap-1 hover:bg-gray-50"
                  >
                    ▽ Filter
                  </button>
                  {listFilterOpen && (
                    <div className="absolute z-20 mt-1 bg-white border rounded-lg shadow-xl p-3 w-56 space-y-2">
                      <div>
                        <label className="text-xs font-semibold text-gray-500">Assignee</label>
                        <select
                          className="w-full border rounded-lg px-2 py-1 text-sm mt-0.5"
                          value={listAssigneeFilter}
                          onChange={(e) => setListAssigneeFilter(e.target.value)}
                        >
                          <option value="">All assignees</option>
                          {assigneeOptions.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={listShowSubtasks} onChange={(e) => setListShowSubtasks(e.target.checked)} />
                        Show subtasks
                      </label>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setListShowClosed((v) => !v)}
                  className="border rounded-lg px-2 py-1 hover:bg-gray-50"
                  style={!listShowClosed ? { borderColor: theme.accent, color: theme.accent } : undefined}
                >
                  {listShowClosed ? '◻ Closed shown' : '☑ Closed hidden'}
                </button>

                <select
                  className="border rounded-lg px-2 py-1"
                  value={listAssigneeFilter}
                  onChange={(e) => setListAssigneeFilter(e.target.value)}
                  title="Assignee filter"
                >
                  <option value="">👤 All assignees</option>
                  {assigneeOptions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>

                <input
                  className="border rounded-lg px-2 py-1 flex-1 min-w-[140px]"
                  placeholder="🔍 Search tasks..."
                  value={listSearchQuery}
                  onChange={(e) => setListSearchQuery(e.target.value)}
                />

                <select
                  className="border rounded-lg px-2 py-1"
                  value={listGroupBy}
                  onChange={(e) => setListGroupBy(e.target.value as any)}
                  title="Group by"
                >
                  <option value="status">Group: Status</option>
                  <option value="assignee">Group: Assignee</option>
                  <option value="priority">Group: Priority</option>
                </select>

                <div className="relative">
                  <button
                    onClick={() => setListColumnsOpen((v) => !v)}
                    className="border rounded-lg px-2 py-1 hover:bg-gray-50"
                  >
                    ⚙ Customize
                  </button>
                  {listColumnsOpen && (
                    <div className="absolute right-0 z-20 mt-1 bg-white border rounded-lg shadow-xl p-3 w-44 space-y-1.5 text-xs">
                      <p className="font-semibold text-gray-500 mb-1">Columns</p>
                      {(['assignee', 'dueDate', 'priority'] as const).map((col) => (
                        <label key={col} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={listVisibleCols[col]}
                            onChange={(e) => setListVisibleCols({ ...listVisibleCols, [col]: e.target.checked })}
                          />
                          {col === 'dueDate' ? 'Due date' : col.charAt(0).toUpperCase() + col.slice(1)}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {listQuickAddOpen ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addQuickTask(list, space);
                    }}
                    className="flex gap-1 ml-auto"
                  >
                    <input
                      autoFocus
                      className="border rounded-lg px-2 py-1 text-sm"
                      placeholder="Task title"
                      value={listQuickAddTitle}
                      onChange={(e) => setListQuickAddTitle(e.target.value)}
                      onBlur={() => !listQuickAddTitle && setListQuickAddOpen(false)}
                    />
                    <button className="text-white rounded-lg px-3 py-1" style={{ backgroundColor: theme.accent }}>
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setListQuickAddOpen(true)}
                    className="text-white rounded-lg px-3 py-1 ml-auto flex items-center gap-1"
                    style={{ backgroundColor: theme.accent }}
                  >
                    + Add Task ▾
                  </button>
                )}
              </div>

              {comingSoon && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                  <span>🚧 {comingSoon} is on the roadmap — not built yet.</span>
                  <button onClick={() => setComingSoon(null)} className="opacity-60 hover:opacity-100">✕</button>
                </div>
              )}

              {/* LIST MODE */}
              {listViewMode === 'list' && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="flex items-center bg-gray-50 border-b text-xs font-semibold text-gray-500 px-3 py-2">
                    <span className="flex-1">Name</span>
                    {listVisibleCols.assignee && <span className="w-28">Assignee</span>}
                    {listVisibleCols.dueDate && <span className="w-24">Due date</span>}
                    {listVisibleCols.priority && <span className="w-20">Priority</span>}
                  </div>
                  {groupKeys.map((gk) => {
                    const groupRows = rows.filter((t) => groupKeyFor(t) === gk);
                    if (groupRows.length === 0) return null;
                    return (
                      <div key={gk}>
                        <div className="bg-gray-50/60 px-3 py-1 text-xs font-semibold text-gray-500 border-b">
                          {gk} <span className="opacity-50">{groupRows.length}</span>
                        </div>
                        {groupRows.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => openTaskDetail(list, space, t.id, t)}
                            className="flex items-center w-full text-left px-3 py-1.5 border-b text-sm hover:bg-gray-50"
                          >
                            <span className="flex-1 truncate flex items-center gap-1">
                              {isTaskOverdue(t, space.statuses) && <span className="text-red-500" title="Overdue">⚠</span>}
                              {t.title}
                            </span>
                            {listVisibleCols.assignee && (
                              <span className="w-28 truncate text-xs text-gray-500">{t.assigneeName || '—'}</span>
                            )}
                            {listVisibleCols.dueDate && (
                              <span className="w-24 text-xs text-gray-500">{toDateInput(t.dueDate) || '—'}</span>
                            )}
                            {listVisibleCols.priority && (
                              <span className={`w-20 text-xs ${priorityColor(t.priority)}`}>{t.priority || '—'}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {rows.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-4">No tasks match the current filters.</p>
                  )}
                </div>
              )}

              {/* BOARD MODE — kanban by status, drag cards between columns */}
              {listViewMode === 'board' && (
                <div className="flex gap-3 overflow-x-auto pb-4">
                  {[...space.statuses].sort((a, b) => a.order - b.order).map((status) => {
                    const colTasks = rows.filter((t) => t.statusId === status.id);
                    return (
                      <div
                        key={status.id}
                        className="bg-gray-50 rounded-xl w-64 shrink-0 flex flex-col max-h-[75vh]"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const taskId = e.dataTransfer.getData('text/plain');
                          const dropped = (tasksByList[list.id] || []).find((t) => t.id === taskId);
                          if (dropped) updateTaskStatusInline(list, dropped, status.id);
                        }}
                      >
                        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                          <span className="text-sm font-semibold text-gray-700">{status.name}</span>
                          <span className="text-xs text-gray-400">{colTasks.length}</span>
                        </div>
                        <div className="p-2 space-y-2 overflow-y-auto">
                          {colTasks.map((t) => (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                              onClick={() => openTaskDetail(list, space, t.id, t)}
                              className="bg-white rounded-lg border border-gray-200 shadow-sm px-2.5 py-2 text-sm cursor-pointer hover:shadow-md"
                            >
                              <p className="truncate flex items-center gap-1">
                                {isTaskOverdue(t, space.statuses) && <span className="text-red-500">⚠</span>}
                                {t.title}
                              </p>
                              <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
                                <span>{t.assigneeName || ''}</span>
                                {t.priority && <span className={priorityColor(t.priority)}>⚑ {t.priority}</span>}
                              </div>
                            </div>
                          ))}
                          {colTasks.length === 0 && (
                            <p className="text-xs text-gray-300 px-1">Drop tasks here</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {detailTask && detailForm && detailSpace && (
          <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={closeTaskDetail} className="text-gray-500 hover:text-gray-800 text-sm">
                ← Back
              </button>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() =>
                    openAiWorkspace({
                      newChat: true,
                      context: {
                        type: 'task',
                        id: detailTask.id,
                        name: detailTask.title,
                        spaceId: detailSpace.id,
                        listId: detailListId || undefined,
                      },
                    })
                  }
                  className="text-gray-400 hover:opacity-100"
                  onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                >
                  ✨ Ask AI
                </button>
                <button
                  onClick={() => {
                    const p = detailAsListTaskPair();
                    if (p) duplicateTask(p.list, p.task, detailSpace);
                  }}
                  className="text-gray-400 hover:opacity-100"
                  style={{ color: undefined }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                >
                  ⧉ Duplicate
                </button>
                <button
                  onClick={() => {
                    const p = detailAsListTaskPair();
                    if (p) openMoveDialog(p.list, p.task);
                  }}
                  className="text-gray-400"
                  onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                >
                  ⇄ Move
                </button>
                <button
                  onClick={() => {
                    const p = detailAsListTaskPair();
                    if (p) openMergeDialog(p.list, p.task);
                  }}
                  className="text-gray-400"
                  onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                >
                  ⚭ Merge
                </button>
                <button
                  onClick={openEmailComposer}
                  className="text-gray-400"
                  onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                >
                  ✉ Email
                </button>
                <button
                  onClick={() => detailListId && deleteTaskFromList({ id: detailListId, name: '', spaceId: detailSpace.id }, detailTask, detailSpace)}
                  className="text-gray-400 hover:text-red-600"
                >
                  🗑 Delete
                </button>
                <div className="relative">
                  <button
                    onClick={() => setCustomizeFieldsOpen((v) => !v)}
                    className="text-gray-400 hover:opacity-100"
                    onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                  >
                    ⚙ Customize fields
                  </button>
                  {customizeFieldsOpen && (
                    <div className="absolute right-0 top-5 z-30 bg-white border rounded-lg shadow-xl p-3 w-72 text-left text-black space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Show/hide sections on this task page
                      </p>
                      {FIELD_TOGGLES.map((f) => (
                        <label key={f.key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={!hiddenFields.has(f.key)}
                            onChange={() => toggleFieldVisibility(f.key)}
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {emailSentNotice && (
              <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {emailSentNotice}
              </p>
            )}

            <input
              className="text-2xl font-bold w-full border-none outline-none mb-4"
              value={detailForm.title}
              onChange={(e) => setDetailForm({ ...detailForm, title: e.target.value })}
            />

            <div className="space-y-4">
              {!hiddenFields.has('description') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                {/* Daily log — what used to be the separate "Next Action" card, now here, shown
                    first per request. Each entry is saved permanently (never auto-deleted),
                    can be edited in place, and entries from the same calendar day share a color. */}
                <label className="text-xs font-semibold text-gray-500">🗒 Daily Log</label>
                <div className="mt-1">
                  <textarea
                    className="w-full border rounded-lg px-2 py-1.5 text-sm resize-y"
                    rows={3}
                    placeholder="What happened today on this task? (write as much as you need — this box expands)"
                    value={nextActionText}
                    onChange={(e) => setNextActionText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNextAction();
                    }}
                  />
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={addNextAction}
                      disabled={!nextActionText.trim()}
                      className="text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
                      style={{ backgroundColor: theme.accent }}
                    >
                      Log
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {detailTask.nextActions.length === 0 && (
                    <p className="text-xs text-gray-400">No entries logged yet.</p>
                  )}
                  {[...detailTask.nextActions]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, showAllLogs ? undefined : 5)
                    .map((na) => (
                      <div
                        key={na.id}
                        className={`rounded-lg border px-2.5 py-1.5 ${dayColorClass(na.createdAt, detailTask.nextActions.map((x) => x.createdAt))}`}
                      >
                        {editingNextActionId === na.id ? (
                          <div className="space-y-1">
                            <textarea
                              autoFocus
                              className="w-full border rounded-lg px-2 py-1 text-sm bg-white"
                              rows={2}
                              value={editingNextActionText}
                              onChange={(e) => setEditingNextActionText(e.target.value)}
                            />
                            <div className="flex gap-2 text-xs">
                              <button
                                onClick={() => saveNextActionEdit(na.id)}
                                disabled={!editingNextActionText.trim()}
                                className="text-white px-2 py-0.5 rounded disabled:opacity-40"
                                style={{ backgroundColor: theme.accent }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingNextActionId(null)}
                                className="opacity-60 hover:opacity-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm whitespace-pre-wrap flex-1">{na.text}</p>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingNextActionId(na.id);
                                    setEditingNextActionText(na.text);
                                  }}
                                  className="text-xs text-gray-500 hover:opacity-100"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteNextAction(na.id)}
                                  className="text-xs text-gray-400 hover:text-red-600"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(na.createdAt).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
                {detailTask.nextActions.length > 5 && (
                  <button
                    onClick={() => setShowAllLogs((v) => !v)}
                    className="text-xs mt-1.5 hover:underline"
                    style={{ color: theme.accent }}
                  >
                    {showAllLogs ? 'Show fewer' : `Show ${detailTask.nextActions.length - 5} more`}
                  </button>
                )}

                <div className="mt-4 pt-3 border-t border-gray-100">
                  <label className="text-xs font-semibold text-gray-500">📝 Description</label>
                  <textarea
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    rows={3}
                    placeholder="Overall description of this task..."
                    value={detailForm.description}
                    onChange={(e) => setDetailForm({ ...detailForm, description: e.target.value })}
                  />
                </div>
              </div>
              )}

              {!hiddenFields.has('coreFields') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500">◎ Status</label>
                  <select
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.statusId}
                    onChange={(e) => setDetailForm({ ...detailForm, statusId: e.target.value })}
                  >
                    {[...detailSpace.statuses]
                      .sort((a, b) => a.order - b.order)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">🚩 Priority</label>
                  <select
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.priority}
                    onChange={(e) => setDetailForm({ ...detailForm, priority: e.target.value })}
                  >
                    <option value="">None</option>
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500">🔗 Link (URL)</label>
                  <input
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    placeholder="https://..."
                    value={detailForm.url}
                    onChange={(e) => setDetailForm({ ...detailForm, url: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500">👤 Assignee</label>
                  <select
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={
                      detailForm.assigneeId ||
                      (detailForm.assigneeName ? `name:${detailForm.assigneeName}` : '')
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      const person = peopleForSpace(detailSpace.id).find(
                        (p) => p.key === value || p.userId === value,
                      );
                      setDetailForm({
                        ...detailForm,
                        assigneeId: person?.userId || '',
                        assigneeName: person?.name || '',
                      });
                    }}
                  >
                    <option value="">Unassigned</option>
                    {peopleForSpace(detailSpace.id).map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.email ? `${p.name} — ${p.email}` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">🧑‍💼 Owner</label>
                  <select
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.ownerName}
                    onChange={(e) => setDetailForm({ ...detailForm, ownerName: e.target.value })}
                  >
                    <option value="">None</option>
                    {detailForm.ownerName &&
                      !peopleForSpace(detailSpace.id).some((p) => p.name === detailForm.ownerName) && (
                        <option value={detailForm.ownerName}>{detailForm.ownerName}</option>
                      )}
                    {peopleForSpace(detailSpace.id).map((p) => (
                      <option key={p.key} value={p.name}>
                        {p.email ? `${p.name} — ${p.email}` : p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500">🏷️ Work Category</label>
                  <input
                    list="work-category-options"
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.workCategory}
                    onChange={(e) => setDetailForm({ ...detailForm, workCategory: e.target.value })}
                  />
                  <datalist id="work-category-options">
                    {WORK_CATEGORY_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">📏 Scope</label>
                  <input
                    list="scope-options"
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.scope}
                    onChange={(e) => setDetailForm({ ...detailForm, scope: e.target.value })}
                  />
                  <datalist id="scope-options">
                    {SCOPE_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
              </div>
              )}

              {!hiddenFields.has('dates') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500">📅 Start Date</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.startDate}
                    onChange={(e) => setDetailForm({ ...detailForm, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">📅 Due Date</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.dueDate}
                    onChange={(e) => setDetailForm({ ...detailForm, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">📅 Progress Date</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                    value={detailForm.progressDate}
                    onChange={(e) => setDetailForm({ ...detailForm, progressDate: e.target.value })}
                  />
                </div>
              </div>
              )}

              {!hiddenFields.has('handoff') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <label className="text-xs font-semibold text-gray-500">🔁 Hand off task to</label>
                <div className="flex gap-2 mt-1">
                  <input
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                    placeholder="New owner's name"
                    value={handOffTo}
                    onChange={(e) => setHandOffTo(e.target.value)}
                  />
                  <button
                    onClick={handOffTask}
                    disabled={!handOffTo.trim()}
                    className="bg-gray-700 text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
                  >
                    Hand Off
                  </button>
                </div>
                {detailForm.ownerName && (
                  <p className="text-xs text-gray-500 mt-1">Current owner: {detailForm.ownerName}</p>
                )}
              </div>
              )}

              {/* Custom Fields */}
              {!hiddenFields.has('customFields') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">🔧 Custom Fields</label>
                  <button
                    onClick={() => setAddingCustomField((v) => !v)}
                    className="text-xs hover:underline"
                    style={{ color: theme.accent }}
                  >
                    + Add Field
                  </button>
                </div>

                {addingCustomField && (
                  <form onSubmit={addCustomFieldDef} className="mt-2 space-y-2">
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="flex-1 border rounded-lg px-2 py-1 text-sm"
                        placeholder="Field name"
                        value={newCustomFieldName}
                        onChange={(e) => setNewCustomFieldName(e.target.value)}
                      />
                      <select
                        className="border rounded-lg px-2 py-1 text-sm"
                        value={newCustomFieldType}
                        onChange={(e) => setNewCustomFieldType(e.target.value)}
                      >
                        {CUSTOM_FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                        Add
                      </button>
                    </div>
                    {newCustomFieldType === 'dropdown' && (
                      <input
                        className="w-full border rounded-lg px-2 py-1 text-sm"
                        placeholder="Options, comma-separated (e.g. Low, Medium, High)"
                        value={newCustomFieldOptions}
                        onChange={(e) => setNewCustomFieldOptions(e.target.value)}
                      />
                    )}
                  </form>
                )}

                <div className="mt-2 space-y-2">
                  {detailTask.customFieldDefs.length === 0 && !addingCustomField && (
                    <p className="text-xs text-gray-400">
                      No custom fields yet for this space. Click "+ Add Field" to create one.
                    </p>
                  )}
                  {detailTask.customFieldDefs
                    .filter((def) => !hiddenCustomFieldIds.has(def.id))
                    .map((def) => (
                    <div key={def.id} className="group/field">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-500">{def.name}</label>
                        <button
                          onClick={() => toggleCustomFieldVisibility(def.id)}
                          className="text-xs text-gray-300 hover:text-gray-600 opacity-0 group-hover/field:opacity-100"
                          title={`Hide "${def.name}"`}
                        >
                          🙈 Hide
                        </button>
                      </div>
                      {def.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          className="block mt-1"
                          checked={customFieldValues[def.id] === 'true'}
                          onChange={(e) =>
                            setCustomFieldValues({ ...customFieldValues, [def.id]: String(e.target.checked) })
                          }
                        />
                      ) : def.type === 'date' ? (
                        <input
                          type="date"
                          className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                          value={customFieldValues[def.id] || ''}
                          onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })}
                        />
                      ) : def.type === 'number' ? (
                        <input
                          type="number"
                          className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                          value={customFieldValues[def.id] || ''}
                          onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })}
                        />
                      ) : def.type === 'dropdown' ? (
                        <select
                          className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                          value={customFieldValues[def.id] || ''}
                          onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })}
                        >
                          <option value="">Select...</option>
                          {((def.config?.options as string[]) || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full border rounded-lg px-2 py-1.5 mt-1 text-sm"
                          value={customFieldValues[def.id] || ''}
                          onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {detailTask.customFieldDefs.some((def) => hiddenCustomFieldIds.has(def.id)) && (
                  <div className="relative mt-2">
                    <button
                      onClick={() => setManageHiddenCustomFieldsOpen((v) => !v)}
                      className="text-xs hover:underline"
                      style={{ color: theme.accent }}
                    >
                      {detailTask.customFieldDefs.filter((def) => hiddenCustomFieldIds.has(def.id)).length} field(s) hidden — Manage
                    </button>
                    {manageHiddenCustomFieldsOpen && (
                      <div className="absolute left-0 z-20 mt-1 bg-white border rounded-lg shadow-xl p-2 w-56 space-y-1">
                        {detailTask.customFieldDefs
                          .filter((def) => hiddenCustomFieldIds.has(def.id))
                          .map((def) => (
                            <div key={def.id} className="flex items-center justify-between text-xs px-1 py-0.5">
                              <span className="text-gray-600">{def.name}</span>
                              <button
                                onClick={() => toggleCustomFieldVisibility(def.id)}
                                className="hover:underline"
                                style={{ color: theme.accent }}
                              >
                                Show
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {!hiddenFields.has('subtasks') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <label className="text-xs font-semibold text-gray-500">🧩 Subtasks</label>
                <div className="mt-1 space-y-1">
                  {detailTask.subtasks.length === 0 && (
                    <p className="text-xs text-gray-400">No subtasks yet.</p>
                  )}
                  {detailTask.subtasks.map((st) => (
                    <div key={st.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1 text-sm">
                      <span>{st.title}</span>
                      <button onClick={() => deleteSubtask(st)} className="text-xs text-gray-400 hover:text-red-600">
                        Del
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={addSubtask} className="flex gap-1 mt-2">
                  <input
                    className="flex-1 border rounded-lg px-2 py-1 text-sm"
                    placeholder="New subtask"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  />
                  <button className="text-white px-2 rounded-lg text-sm" style={{ backgroundColor: theme.accent }}>
                    Add
                  </button>
                </form>
              </div>
              )}

              {/* Comments — including Approver quick-insert */}
              {!hiddenFields.has('comments') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">💬 Comments</label>
                  <button
                    onClick={() => setAddingApprover((v) => !v)}
                    className="text-xs hover:underline"
                    style={{ color: theme.accent }}
                  >
                    + Insert Approver
                  </button>
                </div>

                {addingApprover && (
                  <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-2">
                    <input
                      autoFocus
                      className="w-full border rounded-lg px-2 py-1 text-sm"
                      placeholder="Approver's name"
                      value={approverName}
                      onChange={(e) => setApproverName(e.target.value)}
                    />
                    <div className="flex gap-1">
                      <input
                        type="datetime-local"
                        className="flex-1 border rounded-lg px-2 py-1 text-sm"
                        value={approverDateTime}
                        onChange={(e) => setApproverDateTime(e.target.value)}
                      />
                      <button
                        onClick={addApprover}
                        disabled={!approverName.trim()}
                        className="text-white text-sm px-3 py-1 rounded-lg disabled:opacity-40"
                        style={{ backgroundColor: theme.accent }}
                      >
                        Insert
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
                      Leave the date/time blank to use the current date &amp; time.
                    </p>
                  </div>
                )}

                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {detailTask.comments.length === 0 && (
                    <p className="text-xs text-gray-400">No comments yet.</p>
                  )}
                  {detailTask.comments.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg px-2 py-1.5 group transition-colors ${ageBgClass(c.createdAt, nowTick)}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">
                          {c.authorName || user?.name || 'You'}
                          {Date.now() - new Date(c.createdAt).getTime() < 2 * 60 * 60 * 1000 && (
                            <span
                              className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white align-middle"
                              style={{ backgroundColor: theme.accent }}
                            >
                              New
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="text-xs text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100"
                        >
                          Del
                        </button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <div className="relative flex-1">
                    {(() => {
                      const mention = commentText.match(/(?:^|\s)@([^\s@]*)$/);
                      const query = mention ? mention[1].toLowerCase() : null;
                      const suggestions = query === null
                        ? []
                        : members.filter((m) => m.name.toLowerCase().includes(query)).slice(0, 6);
                      if (!suggestions.length) return null;
                      return (
                        <div className="absolute bottom-full left-0 z-20 mb-1 w-full rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden">
                          {suggestions.map((m) => (
                            <button
                              key={m.userId}
                              type="button"
                              className="block w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setCommentText((prev) => prev.replace(/(?:^|\s)@([^\s@]*)$/, (full) => `${full.startsWith('@') ? '' : full[0]}@${m.name} `));
                              }}
                            >
                              @{m.name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    <input
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                      placeholder="Write a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addComment()}
                    />
                  </div>
                  <button
                    onClick={addComment}
                    disabled={!commentText.trim()}
                    className="text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
                    style={{ backgroundColor: theme.accent }}
                  >
                    Post
                  </button>
                </div>
              </div>
              )}

              {!hiddenFields.has('attachments') && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">📎 Attachments</label>
                  <label
                    className="text-xs hover:underline cursor-pointer"
                    style={{ color: theme.accent, opacity: uploadingAttachment ? 0.5 : 1 }}
                  >
                    {uploadingAttachment ? 'Uploading...' : '+ Upload'}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={uploadingAttachment}
                      onChange={(e) => {
                        uploadAttachment(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="mt-2 space-y-1.5">
                  {detailTask.attachments.length === 0 && (
                    <p className="text-xs text-gray-400">No files attached yet — click "+ Upload" to add one.</p>
                  )}
                  {detailTask.attachments.map((a) => {
                    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name);
                    const fullUrl = `${API_URL}${a.url}`;
                    return (
                      <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                        {isImage ? (
                          <a href={fullUrl} target="_blank" rel="noreferrer" className="shrink-0">
                            <img src={fullUrl} alt={a.name} className="w-10 h-10 object-cover rounded border" />
                          </a>
                        ) : (
                          <span className="text-lg shrink-0">📄</span>
                        )}
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm flex-1 truncate hover:underline"
                          style={{ color: theme.accent }}
                          title={a.name}
                        >
                          {a.name}
                        </a>
                        <button
                          onClick={() => deleteAttachment(a.id)}
                          className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                        >
                          Del
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Selected files can be included when you email this task from the header.
                </p>
              </div>
              )}

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-semibold text-gray-500 mb-2">Activity</h3>
                {(detailTask.activityLogs || []).length === 0 && (
                  <p className="text-xs text-gray-400">No email activity yet.</p>
                )}
                <div className="space-y-1.5">
                  {(detailTask.activityLogs || []).map((entry) => (
                    <p key={entry.id} className="text-sm text-gray-700">
                      {entry.action}
                      <span className="block text-[11px] text-gray-400">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 py-6">
              <button
                onClick={saveTaskDetail}
                disabled={detailSaving}
                className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                {detailSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={closeTaskDetail} className="text-gray-500 px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
          </>
        )}
        </div>
        {!aiOpen && centerView === 'notifications' && selectedWorkspace && (
          <div className="absolute left-0 right-0 bottom-0 top-[52px] z-20 bg-[#f6f7f8] overflow-y-auto">
            <NotificationCenter
              workspaceId={selectedWorkspace.id}
              onOpenTask={(task) => openTaskFromAi(task, { onMissing: () => {} })}
              onOpenSettings={showNotificationSettings}
              onViewBrief={openDailyBrief}
            />
          </div>
        )}
        {!aiOpen && centerView === 'notification-settings' && (
          <div className="absolute left-0 right-0 bottom-0 top-[52px] z-20 bg-[#f6f7f8] overflow-y-auto">
            <NotificationSettings onBack={showNotificationCenter} />
          </div>
        )}
      </section>

      {selectedWorkspace && (
        <WorkspaceSearch
          open={searchOpen}
          workspaceId={selectedWorkspace.id}
          accent={theme.accent}
          onClose={() => setSearchOpen(false)}
          onOpenTask={openTaskFromSearch}
          onOpenList={openListFromSearch}
          onOpenSpace={openSpaceFromSearch}
          onOpenPerson={openPersonFromSearch}
          onOpenChat={(chatId) => {
            setSearchOpen(false);
            openAiWorkspace({ chatId });
          }}
          onAskAi={askAiFromSearch}
          onGoHome={() => {
            setSearchOpen(false);
            goHome();
          }}
          onOpenAiHome={() => {
            setSearchOpen(false);
            openAiWorkspace();
          }}
        />
      )}

      {manageUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <form onSubmit={saveManagedUser} className="bg-white rounded-xl shadow-2xl p-4 w-80">
            <h3 className="font-semibold mb-3">Edit User</h3>
            <label className="block text-xs font-semibold text-gray-500">Name</label>
            <input
              className="w-full border rounded-lg px-2 py-1.5 mt-1 mb-2 text-sm"
              value={manageName}
              onChange={(e) => setManageName(e.target.value)}
              required
            />
            <label className="block text-xs font-semibold text-gray-500">Email</label>
            <input
              type="email"
              className="w-full border rounded-lg px-2 py-1.5 mt-1 mb-2 text-sm"
              value={manageEmail}
              onChange={(e) => setManageEmail(e.target.value)}
              required
            />
            {isPlaceholderEmail(manageUser.email) && (
              <p className="text-[11px] text-gray-500 mb-2">This is a placeholder address. You can replace it.</p>
            )}
            {manageNotice && <p className="text-sm text-red-600 mb-2">{manageNotice}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setManageUser(null)} className="text-gray-500 text-sm px-3 py-1.5">
                Cancel
              </button>
              <button
                type="submit"
                disabled={manageBusy}
                className="text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                {manageBusy ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {emailOpen && detailTask && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-4 w-[28rem] max-w-[92vw]">
            <h3 className="font-semibold mb-3">Email “{detailTask.title}”</h3>
            <label className="block text-xs font-semibold text-gray-500">To</label>
            <input
              className="w-full border rounded-lg px-2 py-1.5 mt-1 mb-2 text-sm"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="name@example.com"
            />
            <label className="block text-xs font-semibold text-gray-500">CC</label>
            <input
              className="w-full border rounded-lg px-2 py-1.5 mt-1 mb-2 text-sm"
              value={emailCc}
              onChange={(e) => setEmailCc(e.target.value)}
              placeholder="Optional"
            />
            <label className="block text-xs font-semibold text-gray-500">Subject</label>
            <input
              className="w-full border rounded-lg px-2 py-1.5 mt-1 mb-2 text-sm"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <label className="block text-xs font-semibold text-gray-500">Message</label>
            <textarea
              className="w-full border rounded-lg px-2 py-1.5 mt-1 mb-2 text-sm min-h-24"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
            />
            {detailTask.attachments.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-500 mb-1">Attachments</p>
                {detailTask.attachments.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={emailAttach.includes(item.id)}
                      onChange={(e) =>
                        setEmailAttach((prev) =>
                          e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            )}
            {emailNotice && <p className="text-sm text-red-600 mb-2">{emailNotice}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEmailOpen(false)} className="text-gray-500 text-sm px-3 py-1.5">
                Cancel
              </button>
              {emailRetryId && (
                <button
                  onClick={() => submitTaskEmail(true)}
                  disabled={emailBusy}
                  className="text-sm px-3 py-1.5 rounded-lg border"
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => submitTaskEmail(false)}
                disabled={emailBusy}
                className="text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                {emailBusy ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveDialogTask && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-4 w-80">
            <h3 className="font-semibold mb-2">Move "{moveDialogTask.task.title}"</h3>
            <select
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              value={moveDialogTargetListId}
              onChange={(e) => setMoveDialogTargetListId(e.target.value)}
            >
              <option value="">Select a list...</option>
              {spaces.map((space) =>
                (listsBySpace[space.id] || [])
                  .filter((l) => l.id !== moveDialogTask.list.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {space.name} / {l.name}
                    </option>
                  )),
              )}
            </select>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setMoveDialogTask(null)} className="text-gray-500 text-sm px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={confirmMoveTask}
                disabled={!moveDialogTargetListId}
                className="text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ backgroundColor: theme.accent }}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeDialogTask && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-4 w-80">
            <h3 className="font-semibold mb-2">Merge "{mergeDialogTask.task.title}" into...</h3>
            <p className="text-xs text-gray-500 mb-2">
              Pick another task in the same list. Its subtasks and next-action history move over, then this task is
              deleted.
            </p>
            <select
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              value={mergeDialogTargetTaskId}
              onChange={(e) => setMergeDialogTargetTaskId(e.target.value)}
            >
              <option value="">Select a task...</option>
              {(tasksByList[mergeDialogTask.list.id] || [])
                .filter((t) => t.id !== mergeDialogTask.task.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setMergeDialogTask(null)} className="text-gray-500 text-sm px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={confirmMergeTask}
                disabled={!mergeDialogTargetTaskId}
                className="text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ backgroundColor: theme.accent }}
              >
                Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {themePanelOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-5 w-96">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">🎨 Customize Appearance</h3>
              <button onClick={() => setThemePanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                &times;
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">Presets</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyTheme(p.theme)}
                  className="flex items-center gap-1.5 border rounded-lg px-2 py-1 text-xs hover:bg-gray-50"
                >
                  <span
                    className="w-3 h-3 rounded-full border"
                    style={{ backgroundColor: p.theme.accent }}
                  />
                  {p.name}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm">Accent color</label>
                <input
                  type="color"
                  value={theme.accent}
                  onChange={(e) => applyTheme({ ...theme, accent: e.target.value })}
                  className="w-10 h-8 border rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Sidebar background</label>
                <input
                  type="color"
                  value={theme.sidebarBg}
                  onChange={(e) => applyTheme({ ...theme, sidebarBg: e.target.value })}
                  className="w-10 h-8 border rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Sidebar text</label>
                <input
                  type="color"
                  value={theme.sidebarText}
                  onChange={(e) => applyTheme({ ...theme, sidebarText: e.target.value })}
                  className="w-10 h-8 border rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Main background</label>
                <input
                  type="color"
                  value={theme.mainBg}
                  onChange={(e) => applyTheme({ ...theme, mainBg: e.target.value })}
                  className="w-10 h-8 border rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Font</label>
                <select
                  className="border rounded-lg px-2 py-1 text-sm"
                  value={theme.font}
                  onChange={(e) => applyTheme({ ...theme, font: e.target.value })}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => applyTheme(DEFAULT_THEME)} className="text-xs text-gray-500 hover:underline">
                Reset to default
              </button>
              <button
                onClick={() => setThemePanelOpen(false)}
                className="text-white text-sm px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: theme.accent }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {aiRename && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-5 w-80">
            <h3 className="font-semibold mb-3">Rename chat</h3>
            <input
              autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={aiRename.title}
              onChange={(e) => setAiRename({ ...aiRename, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && renameAiChat()}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button className="text-sm px-3 py-1.5 rounded-lg text-gray-600" onClick={() => setAiRename(null)}>
                Cancel
              </button>
              <button className="text-sm px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: theme.accent }} onClick={renameAiChat}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {aiDeleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-5 w-80">
            <h3 className="font-semibold mb-2">Delete this chat?</h3>
            <p className="text-sm text-gray-500 mb-4">
              “{aiDeleteConfirm.title}” and all of its messages will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button className="text-sm px-3 py-1.5 rounded-lg text-gray-600" onClick={() => setAiDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="text-sm px-3 py-1.5 rounded-lg text-white bg-red-600" onClick={() => deleteAiChat(aiDeleteConfirm)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
