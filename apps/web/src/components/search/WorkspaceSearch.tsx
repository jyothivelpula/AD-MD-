'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import AiIcon from '@/components/ai/AiIcon';
import type { AiContext } from '@/components/ai/types';

export type SearchTaskHit = {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
  assigneeName: string | null;
  createdAt: string;
  isOverdue: boolean;
};

export type SearchListHit = { id: string; name: string; spaceId: string; spaceName: string };
export type SearchSpaceHit = { id: string; name: string };
export type SearchPersonHit = { id: string; name: string; email: string };
export type SearchChatHit = { id: string; title: string; updatedAt: string };
export type SearchCommentHit = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  taskId: string;
  taskTitle: string;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
};

type SearchResponse = {
  query: string;
  tasks: SearchTaskHit[];
  lists: SearchListHit[];
  spaces: SearchSpaceHit[];
  people: SearchPersonHit[];
  chats: SearchChatHit[];
  comments: SearchCommentHit[];
};

type Filter = 'all' | 'tasks' | 'lists' | 'people' | 'spaces' | 'chats';

type CommandHit = { id: string; title: string; subtitle: string };

type FlatHit =
  | { key: string; kind: 'command'; command: CommandHit }
  | { key: string; kind: 'task'; task: SearchTaskHit }
  | { key: string; kind: 'list'; list: SearchListHit }
  | { key: string; kind: 'space'; space: SearchSpaceHit }
  | { key: string; kind: 'person'; person: SearchPersonHit }
  | { key: string; kind: 'chat'; chat: SearchChatHit }
  | { key: string; kind: 'comment'; comment: SearchCommentHit };

const EMPTY: SearchResponse = {
  query: '',
  tasks: [],
  lists: [],
  spaces: [],
  people: [],
  chats: [],
  comments: [],
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'lists', label: 'Lists' },
  { id: 'people', label: 'People' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'chats', label: 'Chats' },
];

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function shortcutLabel() {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}

export function SearchTrigger({ onClick, wide }: { onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 ${wide ? 'w-[min(340px,42vw)]' : 'w-[min(300px,38vw)]'} rounded-lg border border-black/[0.08] bg-white/80 px-3 text-left text-[13px] text-gray-400 hover:bg-white inline-flex items-center gap-2`}
    >
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" strokeLinecap="round" />
      </svg>
      <span className="flex-1 truncate">Search</span>
      <kbd className="text-[11px] text-gray-400 font-normal">{shortcutLabel()}</kbd>
    </button>
  );
}

type Props = {
  open: boolean;
  workspaceId: string | null;
  accent: string;
  onClose: () => void;
  onOpenTask: (task: SearchTaskHit) => void;
  onOpenList: (list: SearchListHit) => void;
  onOpenSpace: (space: SearchSpaceHit) => void;
  onOpenPerson: (person: SearchPersonHit) => void;
  onOpenChat: (chatId: string) => void;
  onAskAi: (query: string, context?: AiContext) => void;
  onGoHome: () => void;
  onOpenAiHome: () => void;
};

export default function WorkspaceSearch({
  open,
  workspaceId,
  accent,
  onClose,
  onOpenTask,
  onOpenList,
  onOpenSpace,
  onOpenPerson,
  onOpenChat,
  onAskAi,
  onGoHome,
  onOpenAiHome,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [data, setData] = useState<SearchResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFilter('all');
    setActive(0);
    setError('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res: SearchResponse = await apiFetch(
          `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}`,
        );
        if (!cancelled) {
          setData(res);
          setError('');
          setActive(0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim() ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, workspaceId, query]);

  const commands = useMemo<CommandHit[]>(() => {
    const all: CommandHit[] = [
      { id: 'home', title: 'Go to Home', subtitle: 'Open the workspace home' },
      { id: 'ai', title: 'Open AI Workspace', subtitle: 'Ask questions about this workspace' },
      { id: 'my-tasks', title: 'My assigned tasks', subtitle: 'Ask AI to list your work' },
      { id: 'overdue', title: 'Overdue tasks', subtitle: 'Find overdue work in this workspace' },
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => `${c.title} ${c.subtitle}`.toLowerCase().includes(q));
  }, [query]);

  const hits = useMemo<FlatHit[]>(() => {
    const show = (kind: Filter) => filter === 'all' || filter === kind;
    const next: FlatHit[] = [];
    if (show('tasks')) for (const task of data.tasks) next.push({ key: `task-${task.id}`, kind: 'task', task });
    if (show('lists')) for (const list of data.lists) next.push({ key: `list-${list.id}`, kind: 'list', list });
    if (show('people')) for (const person of data.people) next.push({ key: `person-${person.id}`, kind: 'person', person });
    if (show('spaces')) for (const space of data.spaces) next.push({ key: `space-${space.id}`, kind: 'space', space });
    if (show('chats')) for (const chat of data.chats) next.push({ key: `chat-${chat.id}`, kind: 'chat', chat });
    if (filter === 'all') for (const comment of data.comments) next.push({ key: `comment-${comment.id}`, kind: 'comment', comment });
    if (filter === 'all') {
      for (const command of commands) next.push({ key: `cmd-${command.id}`, kind: 'command', command });
    }
    return next;
  }, [commands, data, filter]);

  function run(hit: FlatHit) {
    if (hit.kind === 'command') {
      if (hit.command.id === 'home') onGoHome();
      if (hit.command.id === 'ai') onOpenAiHome();
      if (hit.command.id === 'my-tasks') onAskAi('Show my assigned tasks');
      if (hit.command.id === 'overdue') onAskAi('Show overdue tasks');
      return;
    }
    if (hit.kind === 'task') onOpenTask(hit.task);
    if (hit.kind === 'list') onOpenList(hit.list);
    if (hit.kind === 'space') onOpenSpace(hit.space);
    if (hit.kind === 'person') onOpenPerson(hit.person);
    if (hit.kind === 'chat') onOpenChat(hit.chat.id);
    if (hit.kind === 'comment') {
      onOpenTask({
        id: hit.comment.taskId,
        title: hit.comment.taskTitle,
        status: '',
        statusColor: '#94a3b8',
        listId: hit.comment.listId,
        listName: hit.comment.listName,
        spaceId: hit.comment.spaceId,
        spaceName: hit.comment.spaceName,
        assigneeName: null,
        createdAt: hit.comment.createdAt,
        isOverdue: false,
      });
    }
  }

  function askCurrent() {
    const text = query.trim();
    if (!text) {
      onOpenAiHome();
      return;
    }
    const hit = hits[active];
    if (hit?.kind === 'task') {
      onAskAi(text || `Tell me everything about ${hit.task.title}`, {
        type: 'task',
        id: hit.task.id,
        name: hit.task.title,
        listId: hit.task.listId,
        spaceId: hit.task.spaceId,
      });
      return;
    }
    onAskAi(text);
  }

  if (!open) return null;

  const grouped = {
    commands: hits.filter((h) => h.kind === 'command'),
    tasks: hits.filter((h) => h.kind === 'task'),
    lists: hits.filter((h) => h.kind === 'list'),
    people: hits.filter((h) => h.kind === 'person'),
    spaces: hits.filter((h) => h.kind === 'space'),
    chats: hits.filter((h) => h.kind === 'chat'),
    comments: hits.filter((h) => h.kind === 'comment'),
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-4 bg-black/25"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[680px] rounded-2xl bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] overflow-hidden flex flex-col max-h-[78vh]">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-100">
          <svg className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, run a command, or ask a question..."
            className="flex-1 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 bg-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(hits.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (e.metaKey || e.ctrlKey) askCurrent();
                else if (hits[active]) run(hits[active]);
                else askCurrent();
              }
            }}
          />
          <button
            type="button"
            onClick={askCurrent}
            className="h-8 rounded-full border border-black/[0.08] bg-white px-2.5 text-[13px] text-gray-600 inline-flex items-center gap-1.5 hover:bg-gray-50 shrink-0"
          >
            Ask AI <AiIcon size={14} />
          </button>
        </div>

        <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto border-b border-gray-50">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setActive(0);
              }}
              className={`h-7 px-2.5 rounded-full text-xs font-medium shrink-0 ${
                filter === f.id ? 'text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={filter === f.id ? { backgroundColor: accent } : undefined}
            >
              {f.label}
            </button>
          ))}
          {loading && <span className="ml-auto text-[11px] text-gray-400">Searching…</span>}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
          {!error && hits.length === 0 && !loading && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">
              {query.trim() ? `No workspace matches for “${query.trim()}”` : 'Start typing to search this workspace'}
            </p>
          )}

          <Section
            title="Results"
            items={grouped.tasks}
            active={active}
            hits={hits}
            onRun={run}
            onAsk={(hit) => {
              if (hit.kind !== 'task') return;
              onAskAi(`Tell me everything about this task.`, {
                type: 'task',
                id: hit.task.id,
                name: hit.task.title,
                listId: hit.task.listId,
                spaceId: hit.task.spaceId,
              });
            }}
          />
          <Section title="Lists" items={grouped.lists} active={active} hits={hits} onRun={run} />
          <Section title="People" items={grouped.people} active={active} hits={hits} onRun={run} />
          <Section title="Spaces" items={grouped.spaces} active={active} hits={hits} onRun={run} />
          <Section title="Chats" items={grouped.chats} active={active} hits={hits} onRun={run} />
          <Section title="Comments" items={grouped.comments} active={active} hits={hits} onRun={run} />
          <Section title="Commands" items={grouped.commands} active={active} hits={hits} onRun={run} />
        </div>

        <div className="h-9 px-4 border-t border-gray-100 flex items-center text-[11px] text-gray-400 gap-3">
          <span>↑↓ to navigate</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
          <span className="ml-auto">Ask AI sends this search as a question</span>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  active,
  hits,
  onRun,
  onAsk,
}: {
  title: string;
  items: FlatHit[];
  active: number;
  hits: FlatHit[];
  onRun: (hit: FlatHit) => void;
  onAsk?: (hit: FlatHit) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="px-2 mb-1">
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      {items.map((hit) => {
        const index = hits.findIndex((h) => h.key === hit.key);
        const selected = index === active;
        return (
          <button
            key={hit.key}
            type="button"
            onClick={() => onRun(hit)}
            className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 group ${
              selected ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <RowIcon hit={hit} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-gray-800 truncate">{rowTitle(hit)}</div>
              {rowSubtitle(hit) && <div className="text-[11px] text-gray-400 truncate">{rowSubtitle(hit)}</div>}
            </div>
            <div className="shrink-0 text-[11px] text-gray-400">{rowMeta(hit)}</div>
            {onAsk && hit.kind === 'task' && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onAsk(hit);
                }}
                className="hidden group-hover:inline-flex h-6 px-2 rounded-full border border-gray-200 bg-white text-[11px] text-gray-600 items-center gap-1"
              >
                Ask AI <AiIcon size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function rowTitle(hit: FlatHit) {
  if (hit.kind === 'command') return hit.command.title;
  if (hit.kind === 'task') return hit.task.title;
  if (hit.kind === 'list') return hit.list.name;
  if (hit.kind === 'space') return hit.space.name;
  if (hit.kind === 'person') return hit.person.name;
  if (hit.kind === 'chat') return hit.chat.title;
  return hit.comment.taskTitle;
}

function rowSubtitle(hit: FlatHit) {
  if (hit.kind === 'command') return hit.command.subtitle;
  if (hit.kind === 'task') return `${hit.task.spaceName} / ${hit.task.listName}${hit.task.assigneeName ? ` · ${hit.task.assigneeName}` : ''}`;
  if (hit.kind === 'list') return hit.list.spaceName;
  if (hit.kind === 'person') return hit.person.email;
  if (hit.kind === 'comment') return hit.comment.body;
  return '';
}

function rowMeta(hit: FlatHit) {
  if (hit.kind === 'task') return timeAgo(hit.task.createdAt);
  if (hit.kind === 'chat') return timeAgo(hit.chat.updatedAt);
  if (hit.kind === 'comment') return timeAgo(hit.comment.createdAt);
  return '';
}

function RowIcon({ hit }: { hit: FlatHit }) {
  if (hit.kind === 'task') {
    return (
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: hit.task.statusColor }}
        title={hit.task.status}
      />
    );
  }
  const cls = 'h-4 w-4 text-gray-400 shrink-0';
  if (hit.kind === 'list') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
      </svg>
    );
  }
  if (hit.kind === 'space') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (hit.kind === 'person') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" />
      </svg>
    );
  }
  if (hit.kind === 'chat') return <AiIcon size={16} />;
  if (hit.kind === 'comment') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 6h14v10H8l-3 3V6z" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
    </svg>
  );
}
