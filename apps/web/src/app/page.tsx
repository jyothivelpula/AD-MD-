'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, API_URL } from '@/lib/api';
import AiChatPanel from '@/components/ai/AiChatPanel';
import NotificationBell from '@/components/notifications/NotificationBell';
import { timeAgo, type NotificationItem } from '@/components/notifications/shared';
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
  listId?: string;
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
  code?: string | null;
  taskType?: string | null;
  team?: string | null;
  reviewerId?: string | null;
  estimatedTime?: string | null;
  actualTime?: string | null;
  dependencyType?: string | null;
  dependencyTaskId?: string | null;
  acceptanceCriteria?: string | null;
  approvalStatus?: string | null;
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
  reviewerName?: string | null;
  dependencyTask?: { id: string; title: string; code?: string | null } | null;
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
const TASK_TYPE_OPTIONS = ['Development', 'Bug', 'Research', 'Documentation', 'Meeting', 'Testing', 'Design', 'Marketing', 'HR', 'Other'];
const TEAM_OPTIONS = ['Development', 'AI / ML', 'GenAI', 'HR', 'Marketing', 'Sales', 'Finance', 'Operations', 'Management', 'Other'];
const DURATION_OPTIONS = ['30 minutes', '1 hour', '2 hours', '1 day', '3 days'];
const APPROVAL_OPTIONS = ['Not Required', 'Pending', 'Approved', 'Rejected', 'Changes Requested'];
const DEPENDENCY_OPTIONS = ['Blocked by', 'Blocks', 'Related to'];
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

function statusTone(status?: { name?: string; type?: string }) {
  const name = (status?.name || '').toLowerCase();
  if (name.includes('block')) return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-600', bar: 'bg-red-500' };
  if (status?.type === 'done' || name === 'done') return { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-600', bar: 'bg-green-500' };
  if (status?.type === 'in_progress' || name.includes('progress')) return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-600', bar: 'bg-blue-500' };
  if (name.includes('poc')) return { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500', bar: 'bg-violet-500' };
  return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', bar: 'bg-gray-400' };
}

function progressFromStatus(status?: { name?: string; type?: string }) {
  const name = (status?.name || '').toLowerCase();
  if (name.includes('block')) return 15;
  if (status?.type === 'done' || name === 'done') return 100;
  if (status?.type === 'in_progress' || name.includes('progress')) return 55;
  if (name.includes('poc')) return 35;
  return 8;
}

function personInitials(name?: string | null) {
  if (!name?.trim()) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function shortDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function criterionChecked(line: string) {
  return /^\s*(\[[xX]\]|☑)/.test(line);
}

function criterionBody(line: string) {
  return line.replace(/^\s*(\[[ xX]\]|☑|□)\s*/, '');
}

function toggleCriterion(text: string, index: number) {
  const lines = text.split('\n');
  const current = lines[index] || '';
  const body = criterionBody(current);
  lines[index] = criterionChecked(current) ? body : `[x] ${body}`;
  return lines.join('\n');
}

function groupDailyLogs(entries: { id: string; text: string; createdAt: string }[]) {
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const groups: { key: string; label: string; items: typeof sorted }[] = [];
  for (const entry of sorted) {
    const date = new Date(entry.createdAt);
    const key = date.toDateString();
    const label = key === new Date().toDateString()
      ? 'Today'
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const group = groups.find((item) => item.key === key);
    if (group) group.items.push(entry);
    else groups.push({ key, label, items: [entry] });
  }
  return groups.reverse();
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
    taskType: string;
    team: string;
    reviewerId: string;
    estimatedTime: string;
    actualTime: string;
    dependencyType: string;
    dependencyTaskId: string;
    dependencyLabel: string;
    acceptanceCriteria: string;
    approvalStatus: string;
  } | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [handOffTo, setHandOffTo] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);
  const [taskSavedNotice, setTaskSavedNotice] = useState('');
  const [criterionDraft, setCriterionDraft] = useState('');
  const taskFileInput = useRef<HTMLInputElement | null>(null);
  const [nextActionText, setNextActionText] = useState('');
  const [editingNextActionId, setEditingNextActionId] = useState<string | null>(null);
  const [editingNextActionText, setEditingNextActionText] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [reviewerFilter, setReviewerFilter] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [dependencyQuery, setDependencyQuery] = useState('');
  const [dependencyHits, setDependencyHits] = useState<{ id: string; title: string; code?: string | null; spaceName?: string }[]>([]);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [customizeFieldsOpen, setCustomizeFieldsOpen] = useState(false);
  const [hiddenCustomFieldIds, setHiddenCustomFieldIds] = useState<Set<string>>(new Set());
  const [manageHiddenCustomFieldsOpen, setManageHiddenCustomFieldsOpen] = useState(false);

  useEffect(() => {
    setHiddenFields(new Set(loadHiddenFields()));
    setHiddenCustomFieldIds(new Set(loadHiddenCustomFields()));
  }, []);

  useEffect(() => {
    if (!taskSavedNotice) return;
    const timer = window.setTimeout(() => setTaskSavedNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [taskSavedNotice]);

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
  const [homeActivity, setHomeActivity] = useState<NotificationItem[]>([]);
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

  useEffect(() => {
    if (!selectedWorkspace || spaces.length === 0) return;
    if (detailTask || viewingList || aiOpen || centerView) return;
    let cancelled = false;
    (async () => {
      for (const space of spaces) {
        let lists = listsBySpace[space.id];
        if (!lists) {
          try {
            lists = (await loadSpaceListsAndPeople(space)).data;
          } catch {
            continue;
          }
        }
        if (cancelled || !lists) continue;
        await Promise.all(lists.filter((list) => !isPersonView(list)).map((list) => refreshListTasks(list.id)));
      }
      try {
        const data: { notifications?: NotificationItem[] } = await apiFetch(
          `/notifications?workspaceId=${encodeURIComponent(selectedWorkspace.id)}&page=1&limit=6&filter=all`,
        );
        if (!cancelled) setHomeActivity(data.notifications || []);
      } catch {
        if (!cancelled) setHomeActivity([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspace?.id, spaces.map((space) => space.id).join(','), !!detailTask, viewingList?.list.id, aiOpen, centerView]);

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
        taskType: data.taskType || '',
        team: data.team || '',
        reviewerId: data.reviewerId || '',
        estimatedTime: data.estimatedTime || '',
        actualTime: data.actualTime || '',
        dependencyType: data.dependencyType || '',
        dependencyTaskId: data.dependencyTaskId || '',
        dependencyLabel: data.dependencyTask
          ? `${data.dependencyTask.code ? `${data.dependencyTask.code} · ` : ''}${data.dependencyTask.title}`
          : '',
        acceptanceCriteria: data.acceptanceCriteria || '',
        approvalStatus: data.approvalStatus || 'Not Required',
      });
      setReviewerFilter('');
      setPeopleQuery('');
      setDependencyQuery('');
      setDependencyHits([]);
      setCriterionDraft('');
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
    setCriterionDraft('');
    setPeopleQuery('');
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
          taskType: detailForm.taskType || null,
          team: detailForm.team || null,
          reviewerId: detailForm.reviewerId || null,
          estimatedTime: detailForm.estimatedTime || null,
          actualTime: detailForm.actualTime || null,
          dependencyType: detailForm.dependencyTaskId ? detailForm.dependencyType || 'Related to' : null,
          dependencyTaskId: detailForm.dependencyTaskId || null,
          acceptanceCriteria: detailForm.acceptanceCriteria || null,
          approvalStatus: detailForm.approvalStatus || 'Not Required',
          customFieldValues,
        }),
      });
      const listId = detailListId;
      const space = detailSpace;
      closeTaskDetail();
      setTaskSavedNotice('Task saved');
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
        {taskSavedNotice && (
          <div className="sticky top-3 z-30 mx-auto mb-2 w-fit rounded-full border border-green-200 bg-white px-3 py-1.5 text-sm text-green-700 shadow-sm">
            {taskSavedNotice}
          </div>
        )}
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
          const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          const firstName = user?.name?.split(' ')[0] || 'there';
          return (
            <div className="min-h-full bg-[#f4f5f7] px-5 py-8 sm:px-8">
              <div className="mx-auto max-w-5xl">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{todayLabel}</p>
                    <h2 className="mt-1 text-[28px] font-semibold tracking-tight text-gray-900">{greeting}, {firstName}</h2>
                    <p className="mt-1 text-sm text-gray-500">Continue a task, or open a space to see the work in progress.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSearchOpen(true)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50">Search</button>
                    <button type="button" onClick={() => openAiWorkspace()} className="rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm" style={{ backgroundColor: theme.accent }}>Ask AI</button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ['Spaces', String(spaces.length)],
                    ['Recent', String(myRecent.length)],
                    ['Overdue', String(overdueTasksList.length)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
                      <p className={`mt-1 text-2xl font-semibold ${label === 'Overdue' && overdueTasksList.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {overdueTasksList.length > 0 && (
                  <section className="mt-6 rounded-xl border border-red-100 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-red-700">Overdue · {overdueTasksList.length}</h3>
                    <div className="mt-3 divide-y divide-gray-100">
                      {overdueTasksList.slice(0, 8).map(({ list, space, task }) => (
                        <button
                          key={task.id}
                          onClick={() => openTaskDetail(list, space, task.id, task)}
                          className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-red-50/60"
                        >
                          <span className="truncate font-medium text-gray-800">{task.title}</span>
                          <span className="shrink-0 text-xs text-gray-400">{space.name}{list.name ? ` / ${list.name}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-800">Recently viewed</h3>
                  {myRecent.length === 0 && <p className="mt-3 text-sm text-gray-400">Tasks you open will show up here.</p>}
                  <div className="mt-2 divide-y divide-gray-100">
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
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-gray-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-800">{r.taskTitle}</span>
                          <span className="mt-0.5 block text-xs text-gray-400">{r.spaceName}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{r.listName}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {spaces.length > 0 && (
                  <section className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-800">Spaces</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {spaces.map((space) => {
                        const lists = (listsBySpace[space.id] || []).filter((list) => !isPersonView(list));
                        return (
                          <div key={space.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900">{space.name}</p>
                              <span className="text-[11px] text-gray-400">{lists.length} list{lists.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {lists.length === 0 && <p className="text-xs text-gray-400">No lists yet. Add one from the sidebar.</p>}
                              {lists.slice(0, 6).map((list) => (
                                <button
                                  key={list.id}
                                  type="button"
                                  onClick={() => openListView(list, space)}
                                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 hover:border-gray-300 hover:bg-white"
                                >
                                  {list.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {!hasAnything && spaces.length === 0 && (
                  <p className="mt-8 text-sm text-gray-400">
                    Select a task from the sidebar, open a list, or create a space to get started.
                  </p>
                )}
              </div>
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

        {detailTask && detailForm && detailSpace && (() => {
          const card = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 transition-shadow hover:shadow-md';
          const field = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 mt-1 text-sm bg-white';
          const currentStatus = detailSpace.statuses.find((item) => item.id === detailForm.statusId);
          const tone = statusTone(currentStatus);
          const progress = progressFromStatus(currentStatus);
          const people = peopleForSpace(detailSpace.id).filter((person) => person.userId);
          const reviewer = people.find((person) => person.userId === detailForm.reviewerId);
          const assignee = people.find((person) => person.userId === detailForm.assigneeId);
          const criteria = detailForm.acceptanceCriteria.split('\n').filter((line) => criterionBody(line).trim());
          const orderedLogs = [...detailTask.nextActions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const logs = groupDailyLogs(showAllLogs ? orderedLogs : orderedLogs.slice(0, 5));
          const peopleQueryText = peopleQuery.trim().toLowerCase();
          const matchingPeople = peopleForSpace(detailSpace.id).filter((person) => !peopleQueryText || `${person.name} ${person.email || ''}`.toLowerCase().includes(peopleQueryText) || person.name === detailForm.ownerName || person.userId === detailForm.assigneeId);
          const parentTask = detailTask.parentTaskId
            ? Object.values(tasksByList).flat().find((task) => task.id === detailTask.parentTaskId)
            : null;
          return (
          <div className="min-h-full overflow-x-hidden bg-[#f6f7f9]">
            <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <button onClick={closeTaskDetail} className="text-xs text-gray-500 hover:text-gray-800">← Back</button>
                  <p className="mt-1 text-[11px] font-medium tracking-wide text-gray-400">{detailTask.code || 'TASK'}</p>
                  <input
                    className="w-full border-none bg-transparent text-2xl font-semibold text-gray-900 outline-none"
                    value={detailForm.title}
                    onChange={(e) => setDetailForm({ ...detailForm, title: e.target.value })}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone.bg} ${tone.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {currentStatus?.name || 'No status'}
                    </span>
                    {detailForm.priority && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{detailForm.priority} priority</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button type="button" onClick={() => openAiWorkspace({ newChat: true, context: { type: 'task', id: detailTask.id, name: detailTask.title, spaceId: detailSpace.id, listId: detailListId || undefined } })} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Ask AI</button>
                  <button type="button" onClick={() => { const pair = detailAsListTaskPair(); if (pair) duplicateTask(pair.list, pair.task, detailSpace); }} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Duplicate</button>
                  <button type="button" onClick={() => { const pair = detailAsListTaskPair(); if (pair) openMoveDialog(pair.list, pair.task); }} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Move</button>
                  <button type="button" onClick={() => { const pair = detailAsListTaskPair(); if (pair) openMergeDialog(pair.list, pair.task); }} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Merge</button>
                  <button type="button" onClick={openEmailComposer} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Email</button>
                  <button type="button" onClick={() => detailListId && deleteTaskFromList({ id: detailListId, name: '', spaceId: detailSpace.id }, detailTask, detailSpace)} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600">Delete</button>
                  <div className="relative">
                    <button type="button" onClick={() => setCustomizeFieldsOpen((value) => !value)} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Customize fields</button>
                    {customizeFieldsOpen && (
                      <div className="absolute right-0 top-8 z-30 w-72 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-lg">
                        <p className="mb-1 text-xs font-semibold text-gray-500">Show or hide sections</p>
                        {FIELD_TOGGLES.map((item) => (
                          <label key={item.key} className="flex items-center gap-2 py-0.5 text-xs text-gray-700">
                            <input type="checkbox" checked={!hiddenFields.has(item.key)} onChange={() => toggleFieldVisibility(item.key)} />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={saveTaskDetail} disabled={detailSaving} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: theme.accent }}>{detailSaving ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </header>

            {emailSentNotice && <p className="mx-4 mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{emailSentNotice}</p>}

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(240px,1fr)] lg:p-6">
              <div className="min-w-0 space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Assignee', assignee?.name || detailForm.assigneeName],
                    ['Reviewer', reviewer?.name || detailTask.reviewerName],
                    ['Priority', detailForm.priority],
                    ['Due', shortDate(detailForm.dueDate)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
                      <p className="mt-1 truncate text-sm text-gray-800">{value || '—'}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Progress</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{progress}%</p>
                  </div>
                </div>

                {!hiddenFields.has('description') && (
                  <section className={card}>
                    <h3 className="text-sm font-semibold text-gray-800">Description</h3>
                    <textarea className={`${field} min-h-24 resize-y`} rows={4} placeholder="Overall description of this task..." value={detailForm.description} onChange={(e) => setDetailForm({ ...detailForm, description: e.target.value })} />
                  </section>
                )}

                {!hiddenFields.has('description') && (
                  <section className={card}>
                    <h3 className="text-sm font-semibold text-gray-800">Daily Log</h3>
                    <textarea className={`${field} resize-y`} rows={3} placeholder="What happened today on this task?" value={nextActionText} onChange={(e) => setNextActionText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNextAction(); }} />
                    <div className="mt-2 flex justify-end">
                      <button type="button" onClick={addNextAction} disabled={!nextActionText.trim()} className="rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-40" style={{ backgroundColor: theme.accent }}>+ Add Log</button>
                    </div>
                    <div className="mt-4 space-y-4">
                      {detailTask.nextActions.length === 0 && <p className="text-sm text-gray-400">No entries logged yet.</p>}
                      {logs.map((group) => (
                        <div key={group.key}>
                          <p className="text-xs font-semibold text-gray-500">{group.label}</p>
                          <div className="mt-2 space-y-2 border-l border-gray-200 pl-3">
                            {group.items.map((entry) => (
                              <div key={entry.id} className={`rounded-lg border px-3 py-2 ${dayColorClass(entry.createdAt, detailTask.nextActions.map((item) => item.createdAt))}`}>
                                {editingNextActionId === entry.id ? (
                                  <div className="space-y-2">
                                    <textarea autoFocus className={field} rows={2} value={editingNextActionText} onChange={(e) => setEditingNextActionText(e.target.value)} />
                                    <div className="flex gap-2 text-xs">
                                      <button type="button" onClick={() => saveNextActionEdit(entry.id)} disabled={!editingNextActionText.trim()} className="rounded px-2 py-1 text-white disabled:opacity-40" style={{ backgroundColor: theme.accent }}>Save</button>
                                      <button type="button" onClick={() => setEditingNextActionId(null)} className="text-gray-500">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="whitespace-pre-wrap text-sm text-gray-800">{entry.text}</p>
                                      <div className="flex shrink-0 gap-2 text-xs">
                                        <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => { setEditingNextActionId(entry.id); setEditingNextActionText(entry.text); }}>Edit</button>
                                        <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => deleteNextAction(entry.id)}>Delete</button>
                                      </div>
                                    </div>
                                    <p className="mt-1 text-[11px] text-gray-400">{new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {detailTask.nextActions.length > 5 && (
                      <button type="button" onClick={() => setShowAllLogs((value) => !value)} className="mt-2 text-xs hover:underline" style={{ color: theme.accent }}>{showAllLogs ? 'Show fewer' : `Show ${detailTask.nextActions.length - 5} more`}</button>
                    )}
                  </section>
                )}

                {!hiddenFields.has('dates') && (
                  <section className={card}>
                    <h3 className="text-sm font-semibold text-gray-800">Planning</h3>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="text-xs text-gray-500">Start date<input type="date" className={field} value={detailForm.startDate} onChange={(e) => setDetailForm({ ...detailForm, startDate: e.target.value })} /></label>
                      <label className="text-xs text-gray-500">Due date<input type="date" className={field} value={detailForm.dueDate} onChange={(e) => setDetailForm({ ...detailForm, dueDate: e.target.value })} /></label>
                      <label className="text-xs text-gray-500">Estimated time<select className={field} value={detailForm.estimatedTime} onChange={(e) => setDetailForm({ ...detailForm, estimatedTime: e.target.value })}><option value="">None</option>{DURATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
                      <label className="text-xs text-gray-500">Actual time<select className={field} value={detailForm.actualTime} onChange={(e) => setDetailForm({ ...detailForm, actualTime: e.target.value })}><option value="">None</option>{DURATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
                      <label className="col-span-2 text-xs text-gray-500">Progress date<input type="date" className={field} value={detailForm.progressDate} onChange={(e) => setDetailForm({ ...detailForm, progressDate: e.target.value })} /></label>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">Estimated {detailForm.estimatedTime || '—'} vs actual {detailForm.actualTime || '—'}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${progress}%` }} /></div>
                      <span className="text-xs text-gray-500">{progress}%</span>
                    </div>
                  </section>
                )}

                {!hiddenFields.has('coreFields') && (
                  <section className={card}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-800">Ownership</h3>
                      <input className="w-40 rounded-lg border border-gray-200 px-2 py-1 text-xs" placeholder="Search people" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs text-gray-500">Assignee
                        <span className="mt-1 flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-600">{personInitials(assignee?.name || detailForm.assigneeName)}</span>
                          <select className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm" value={detailForm.assigneeId || (detailForm.assigneeName ? `name:${detailForm.assigneeName}` : '')} onChange={(e) => { const person = peopleForSpace(detailSpace.id).find((item) => item.key === e.target.value || item.userId === e.target.value); setDetailForm({ ...detailForm, assigneeId: person?.userId || '', assigneeName: person?.name || '' }); }}>
                            <option value="">Unassigned</option>
                            {matchingPeople.map((person) => <option key={person.key} value={person.key}>{person.email ? `${person.name} — ${person.email}` : person.name}</option>)}
                          </select>
                        </span>
                      </label>
                      <label className="text-xs text-gray-500">Owner
                        <span className="mt-1 flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-600">{personInitials(detailForm.ownerName)}</span>
                          <select className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm" value={detailForm.ownerName} onChange={(e) => setDetailForm({ ...detailForm, ownerName: e.target.value })}>
                            <option value="">None</option>
                            {detailForm.ownerName && !matchingPeople.some((person) => person.name === detailForm.ownerName) && <option value={detailForm.ownerName}>{detailForm.ownerName}</option>}
                            {matchingPeople.map((person) => <option key={person.key} value={person.name}>{person.email ? `${person.name} — ${person.email}` : person.name}</option>)}
                          </select>
                        </span>
                      </label>
                      <label className="text-xs text-gray-500">Reviewer
                        <input className={field} placeholder="Search a member" value={reviewerFilter} onChange={(e) => setReviewerFilter(e.target.value)} />
                        <select className={field} value={detailForm.reviewerId} onChange={(e) => setDetailForm({ ...detailForm, reviewerId: e.target.value })}>
                          <option value="">No reviewer</option>
                          {detailForm.reviewerId && !people.some((person) => person.userId === detailForm.reviewerId) && <option value={detailForm.reviewerId}>{detailTask.reviewerName || 'Reviewer'}</option>}
                          {people.filter((person) => { const query = reviewerFilter.trim().toLowerCase(); return !query || person.userId === detailForm.reviewerId || `${person.name} ${person.email || ''}`.toLowerCase().includes(query); }).map((person) => <option key={person.key} value={person.userId || ''}>{person.email ? `${person.name} — ${person.email}` : person.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-gray-500">Team / department
                        <select className={field} value={detailForm.team} onChange={(e) => setDetailForm({ ...detailForm, team: e.target.value })}>
                          <option value="">None</option>
                          {TEAM_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>
                )}

                {!hiddenFields.has('coreFields') && (
                  <section className={card}>
                    <h3 className="text-sm font-semibold text-gray-800">Classification</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs text-gray-500">Task type<select className={field} value={detailForm.taskType} onChange={(e) => setDetailForm({ ...detailForm, taskType: e.target.value })}><option value="">None</option>{TASK_TYPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
                      <label className="text-xs text-gray-500">Work category<input list="work-category-options" className={field} value={detailForm.workCategory} onChange={(e) => setDetailForm({ ...detailForm, workCategory: e.target.value })} /><datalist id="work-category-options">{WORK_CATEGORY_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist></label>
                      <label className="text-xs text-gray-500">Scope<input list="scope-options" className={field} value={detailForm.scope} onChange={(e) => setDetailForm({ ...detailForm, scope: e.target.value })} /><datalist id="scope-options">{SCOPE_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist></label>
                      <label className="text-xs text-gray-500">Link<input className={field} placeholder="https://..." value={detailForm.url} onChange={(e) => setDetailForm({ ...detailForm, url: e.target.value })} /></label>
                    </div>
                  </section>
                )}

                <section className={card}>
                  <h3 className="text-sm font-semibold text-gray-800">Acceptance criteria</h3>
                  {criteria.length === 0 && <p className="mt-2 text-sm text-gray-400">No criteria yet. Add what must be finished before this task is done.</p>}
                  <div className="mt-2 space-y-1.5">
                    {detailForm.acceptanceCriteria.split('\n').map((line, index) => criterionBody(line).trim() ? (
                      <label key={`${index}-${line}`} className="flex items-start gap-2 rounded-lg px-1 py-1 text-sm text-gray-800 hover:bg-gray-50">
                        <input type="checkbox" className="mt-1" checked={criterionChecked(line)} onChange={() => setDetailForm({ ...detailForm, acceptanceCriteria: toggleCriterion(detailForm.acceptanceCriteria, index) })} />
                        <span className={criterionChecked(line) ? 'text-gray-400 line-through' : ''}>{criterionBody(line)}</span>
                      </label>
                    ) : null)}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" placeholder="Add a criterion" value={criterionDraft} onChange={(e) => setCriterionDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && criterionDraft.trim()) { e.preventDefault(); const next = detailForm.acceptanceCriteria.trim() ? `${detailForm.acceptanceCriteria.replace(/\s+$/, '')}\n${criterionDraft.trim()}` : criterionDraft.trim(); setDetailForm({ ...detailForm, acceptanceCriteria: next }); setCriterionDraft(''); } }} />
                    <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-white" style={{ backgroundColor: theme.accent }} onClick={() => { if (!criterionDraft.trim()) return; const next = detailForm.acceptanceCriteria.trim() ? `${detailForm.acceptanceCriteria.replace(/\s+$/, '')}\n${criterionDraft.trim()}` : criterionDraft.trim(); setDetailForm({ ...detailForm, acceptanceCriteria: next }); setCriterionDraft(''); }}>Add</button>
                  </div>
                </section>

                <section id="task-dependencies" className={card}>
                  <h3 className="text-sm font-semibold text-gray-800">Dependencies</h3>
                  <div className="mt-3 grid gap-2 text-sm">
                    {['Blocked by', 'Blocks', 'Related to'].map((kind) => (
                      <div key={kind}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{kind}</p>
                        {detailForm.dependencyLabel && (detailForm.dependencyType || 'Related to') === kind ? (
                          <div className="mt-1 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="truncate text-gray-800">{detailForm.dependencyLabel}</span>
                            <button type="button" className="text-xs text-gray-400 hover:text-red-600" onClick={() => setDetailForm({ ...detailForm, dependencyTaskId: '', dependencyType: '', dependencyLabel: '' })}>Remove</button>
                          </div>
                        ) : <p className="mt-1 text-xs text-gray-400">None</p>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select className={field} value={detailForm.dependencyType} onChange={(e) => setDetailForm({ ...detailForm, dependencyType: e.target.value })}>
                      <option value="">Type</option>
                      {DEPENDENCY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    <input className={field} placeholder="Search a task" value={dependencyQuery} onChange={(e) => {
                      const value = e.target.value;
                      setDependencyQuery(value);
                      if (!selectedWorkspace || value.trim().length < 1) { setDependencyHits([]); return; }
                      apiFetch(`/workspaces/${selectedWorkspace.id}/search?q=${encodeURIComponent(value.trim())}`).then((result: { tasks?: { id: string; title: string; code?: string | null }[] }) => setDependencyHits((result.tasks || []).filter((item) => item.id !== detailTask.id).slice(0, 8))).catch(() => setDependencyHits([]));
                    }} />
                  </div>
                  {dependencyHits.length > 0 && (
                    <div className="mt-1 overflow-hidden rounded-lg border border-gray-200">
                      {dependencyHits.map((hit) => (
                        <button key={hit.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setDetailForm({ ...detailForm, dependencyTaskId: hit.id, dependencyType: detailForm.dependencyType || 'Related to', dependencyLabel: `${hit.code ? `${hit.code} · ` : ''}${hit.title}` }); setDependencyQuery(''); setDependencyHits([]); }}>
                          {hit.code ? `${hit.code} · ` : ''}{hit.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-gray-400">Space: {detailSpace.name}</p>
                </section>

                {!hiddenFields.has('subtasks') && (
                  <section id="task-subtasks" className={card}>
                    <h3 className="text-sm font-semibold text-gray-800">Subtasks</h3>
                    <div className="mt-2 space-y-1">
                      {detailTask.subtasks.length === 0 && <p className="text-sm text-gray-400">No subtasks yet.</p>}
                      {detailTask.subtasks.map((subtask) => (
                        <div key={subtask.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                          <span>{subtask.title}</span>
                          <button type="button" onClick={() => deleteSubtask(subtask)} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={addSubtask} className="mt-2 flex gap-2">
                      <input className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" placeholder="New subtask" value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} />
                      <button className="rounded-lg px-3 text-sm text-white" style={{ backgroundColor: theme.accent }}>Add</button>
                    </form>
                  </section>
                )}

                {!hiddenFields.has('attachments') && (
                  <section
                    id="task-attachments"
                    className={card}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-blue-200'); }}
                    onDragLeave={(e) => e.currentTarget.classList.remove('ring-2', 'ring-blue-200')}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-blue-200'); uploadAttachment(e.dataTransfer.files); }}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-800">Attachments</h3>
                      <button type="button" className="text-xs hover:underline" style={{ color: theme.accent }} onClick={() => taskFileInput.current?.click()}>{uploadingAttachment ? 'Uploading...' : '+ Upload files'}</button>
                      <input ref={taskFileInput} type="file" multiple className="hidden" disabled={uploadingAttachment} onChange={(e) => { uploadAttachment(e.target.files); e.target.value = ''; }} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {detailTask.attachments.length === 0 && <p className="text-sm text-gray-400 sm:col-span-2">No files attached yet. Drop files here or upload.</p>}
                      {detailTask.attachments.map((file) => {
                        const image = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
                        const fullUrl = `${API_URL}${file.url}`;
                        return (
                          <div key={file.id} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                            {image ? <img src={fullUrl} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-lg">📄</span>}
                            <a href={fullUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline" style={{ color: theme.accent }}>{file.name}</a>
                            <button type="button" onClick={() => deleteAttachment(file.id)} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">Selected files can be included when you email this task from the header.</p>
                  </section>
                )}

                {!hiddenFields.has('comments') && (
                  <section id="task-comments" className={card}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-800">Comments</h3>
                      <button type="button" onClick={() => setAddingApprover((value) => !value)} className="text-xs hover:underline" style={{ color: theme.accent }}>+ Insert approver</button>
                    </div>
                    {addingApprover && (
                      <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-2">
                        <input className={field} placeholder="Approver's name" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
                        <div className="flex gap-2">
                          <input type="datetime-local" className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={approverDateTime} onChange={(e) => setApproverDateTime(e.target.value)} />
                          <button type="button" onClick={addApprover} disabled={!approverName.trim()} className="rounded-lg px-3 text-sm text-white disabled:opacity-40" style={{ backgroundColor: theme.accent }}>Insert</button>
                        </div>
                        <p className="text-xs text-gray-400">Leave the date and time blank to use the current date and time.</p>
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      {detailTask.comments.length === 0 && <p className="text-sm text-gray-400">No comments yet.</p>}
                      {detailTask.comments.map((comment) => (
                        <div key={comment.id} className={`rounded-xl px-3 py-2 ${ageBgClass(comment.createdAt, nowTick)}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[10px] text-gray-500">{personInitials(comment.authorName || user?.name)}</span>
                              {comment.authorName || user?.name || 'You'}
                              {nowTick - new Date(comment.createdAt).getTime() < 2 * 60 * 60 * 1000 && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: theme.accent }}>New</span>}
                            </p>
                            <button type="button" onClick={() => deleteComment(comment.id)} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{comment.body}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{new Date(comment.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="relative mt-3 flex gap-2">
                      {(() => {
                        const mention = commentText.match(/(?:^|\s)@([^\s@]*)$/);
                        const query = mention ? mention[1].toLowerCase() : null;
                        const suggestions = query === null ? [] : members.filter((member) => member.name.toLowerCase().includes(query)).slice(0, 6);
                        if (!suggestions.length) return null;
                        return (
                          <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
                            {suggestions.map((member) => (
                              <button key={member.userId} type="button" className="block w-full px-2 py-1.5 text-left text-sm hover:bg-gray-50" onMouseDown={(e) => { e.preventDefault(); setCommentText((prev) => prev.replace(/(?:^|\s)@([^\s@]*)$/, (full) => `${full.startsWith('@') ? '' : full[0]}@${member.name} `)); }}>@{member.name}</button>
                            ))}
                          </div>
                        );
                      })()}
                      <input className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" placeholder="Write a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
                      <button type="button" onClick={addComment} disabled={!commentText.trim()} className="rounded-lg px-3 text-sm text-white disabled:opacity-40" style={{ backgroundColor: theme.accent }}>Post</button>
                    </div>
                  </section>
                )}

                {!hiddenFields.has('customFields') && (
                  <section className={card}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-800">Custom fields</h3>
                      <button type="button" onClick={() => setAddingCustomField((value) => !value)} className="text-xs hover:underline" style={{ color: theme.accent }}>+ Add field</button>
                    </div>
                    {addingCustomField && (
                      <form onSubmit={addCustomFieldDef} className="mt-2 space-y-2">
                        <div className="flex gap-2">
                          <input className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm" placeholder="Field name" value={newCustomFieldName} onChange={(e) => setNewCustomFieldName(e.target.value)} />
                          <select className="rounded-lg border border-gray-200 px-2 py-1 text-sm" value={newCustomFieldType} onChange={(e) => setNewCustomFieldType(e.target.value)}>{CUSTOM_FIELD_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                          <button className="rounded-lg px-2 text-sm text-white" style={{ backgroundColor: theme.accent }}>Add</button>
                        </div>
                        {newCustomFieldType === 'dropdown' && <input className="w-full rounded-lg border border-gray-200 px-2 py-1 text-sm" placeholder="Options, comma-separated" value={newCustomFieldOptions} onChange={(e) => setNewCustomFieldOptions(e.target.value)} />}
                      </form>
                    )}
                    <div className="mt-3 space-y-2">
                      {detailTask.customFieldDefs.filter((def) => !hiddenCustomFieldIds.has(def.id)).length === 0 && <p className="text-sm text-gray-400">No custom fields are shown. Use Customize fields or add one.</p>}
                      {detailTask.customFieldDefs.filter((def) => !hiddenCustomFieldIds.has(def.id)).map((def) => (
                        <div key={def.id}>
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-500">{def.name}</label>
                            <button type="button" onClick={() => toggleCustomFieldVisibility(def.id)} className="text-xs text-gray-400">Hide</button>
                          </div>
                          {def.type === 'checkbox' ? <input type="checkbox" className="mt-1" checked={customFieldValues[def.id] === 'true'} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: String(e.target.checked) })} />
                            : def.type === 'date' ? <input type="date" className={field} value={customFieldValues[def.id] || ''} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })} />
                            : def.type === 'number' ? <input type="number" className={field} value={customFieldValues[def.id] || ''} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })} />
                            : def.type === 'dropdown' ? <select className={field} value={customFieldValues[def.id] || ''} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })}><option value="">Select...</option>{((def.config?.options as string[]) || []).map((option) => <option key={option}>{option}</option>)}</select>
                            : <input className={field} value={customFieldValues[def.id] || ''} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [def.id]: e.target.value })} />}
                        </div>
                      ))}
                    </div>
                    {detailTask.customFieldDefs.some((def) => hiddenCustomFieldIds.has(def.id)) && (
                      <div className="relative mt-3">
                        <button type="button" onClick={() => setManageHiddenCustomFieldsOpen((value) => !value)} className="text-xs hover:underline" style={{ color: theme.accent }}>
                          {detailTask.customFieldDefs.filter((def) => hiddenCustomFieldIds.has(def.id)).length} field(s) hidden — Manage
                        </button>
                        {manageHiddenCustomFieldsOpen && (
                          <div className="absolute left-0 z-20 mt-1 w-56 space-y-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                            {detailTask.customFieldDefs.filter((def) => hiddenCustomFieldIds.has(def.id)).map((def) => (
                              <div key={def.id} className="flex items-center justify-between px-1 py-0.5 text-xs">
                                <span className="text-gray-600">{def.name}</span>
                                <button type="button" onClick={() => toggleCustomFieldVisibility(def.id)} className="hover:underline" style={{ color: theme.accent }}>Show</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {!hiddenFields.has('handoff') && (
                  <section className={card}>
                    <h3 className="text-sm font-semibold text-gray-800">Hand off</h3>
                    <div className="mt-2 flex gap-2">
                      <input className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" placeholder="New owner's name" value={handOffTo} onChange={(e) => setHandOffTo(e.target.value)} />
                      <button type="button" onClick={handOffTask} disabled={!handOffTo.trim()} className="rounded-lg bg-gray-800 px-3 text-sm text-white disabled:opacity-40">Hand off</button>
                    </div>
                    {detailForm.ownerName && <p className="mt-1 text-xs text-gray-500">Current owner: {detailForm.ownerName}</p>}
                  </section>
                )}

                <section className={card}>
                  <h3 className="text-sm font-semibold text-gray-800">Activity</h3>
                  {(detailTask.activityLogs || []).length === 0 && <p className="mt-2 text-sm text-gray-400">No email activity yet.</p>}
                  <div className="mt-2 space-y-2">
                    {(detailTask.activityLogs || []).map((entry) => (
                      <p key={entry.id} className="text-sm text-gray-700">{entry.action}<span className="block text-[11px] text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span></p>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="h-fit space-y-4 lg:sticky lg:top-24">
                <details open className={card}>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-400">Task summary</summary>
                  <label className="mt-3 block text-xs text-gray-500">Status
                    <select className={field} value={detailForm.statusId} onChange={(e) => setDetailForm({ ...detailForm, statusId: e.target.value })}>
                      {[...detailSpace.statuses].sort((a, b) => a.order - b.order).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                    </select>
                  </label>
                  <label className="mt-2 block text-xs text-gray-500">Priority
                    <select className={field} value={detailForm.priority} onChange={(e) => setDetailForm({ ...detailForm, priority: e.target.value })}>
                      <option value="">None</option>
                      {PRIORITY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="mt-2 block text-xs text-gray-500">Approval
                    <select className={field} value={detailForm.approvalStatus} onChange={(e) => setDetailForm({ ...detailForm, approvalStatus: e.target.value })}>
                      {APPROVAL_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <div className="mt-3 space-y-2 text-sm text-gray-700">
                    <p className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px]">{personInitials(assignee?.name || detailForm.assigneeName)}</span>{assignee?.name || detailForm.assigneeName || 'Unassigned'}</p>
                    <p className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px]">{personInitials(reviewer?.name || detailTask.reviewerName)}</span>{reviewer?.name || detailTask.reviewerName || 'No reviewer'}</p>
                    <p className="text-xs text-gray-500">Due {shortDate(detailForm.dueDate)}</p>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${progress}%` }} /></div>
                  <p className="mt-1 text-xs text-gray-500">{progress}% based on status</p>
                </details>
                <details open className={card}>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-400">Quick actions</summary>
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    <button type="button" className="rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => document.getElementById('task-subtasks')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>+ Add subtask</button>
                    <button type="button" className="rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => taskFileInput.current?.click()}>Attach file</button>
                    <button type="button" className="rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => document.getElementById('task-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Add comment</button>
                    <button type="button" className="rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={openEmailComposer}>Send update</button>
                    <button type="button" className="rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => openAiWorkspace({ newChat: true, context: { type: 'task', id: detailTask.id, name: detailTask.title, spaceId: detailSpace.id, listId: detailListId || undefined } })}>Ask AI</button>
                  </div>
                </details>
                <details open className={card}>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-400">Relationships</summary>
                  <p className="mt-2 text-sm text-gray-700">Parent · {parentTask ? `${parentTask.code ? `${parentTask.code} · ` : ''}${parentTask.title}` : detailTask.parentTaskId ? 'Linked parent' : 'None'}</p>
                  <p className="mt-1 text-sm text-gray-700">Space · {detailSpace.name}</p>
                  <p className="mt-1 text-sm text-gray-700">{detailForm.dependencyLabel ? `${detailForm.dependencyType || 'Related to'} · ${detailForm.dependencyLabel}` : 'No dependency'}</p>
                  <button type="button" className="mt-2 text-xs hover:underline" style={{ color: theme.accent }} onClick={() => document.getElementById('task-dependencies')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Edit dependency</button>
                </details>
              </aside>
            </div>
          </div>
          );
        })()}
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
