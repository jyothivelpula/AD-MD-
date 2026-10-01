'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AiContext, AiMessage, AiStructured, AiTaskCard, SUGGESTION_CARDS } from './types';
import AiComposer, { ComposerChip } from './AiComposer';
import AiIcon from './AiIcon';
import DailyBrief from './DailyBrief';

type Props = {
  workspaceId: string;
  workspaceName: string;
  userName: string;
  accent: string;
  chatId: string | null;
  context: AiContext;
  openBriefToken?: number;
  onEnsureChat: () => Promise<string>;
  onChatUpdated: () => void;
  onOpenTask: (task: AiTaskCard) => void;
  onViewTasks?: (tasks: AiTaskCard[]) => void;
  onOpenSearch?: () => void;
};

function dueLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function priorityIcon(p?: string | null) {
  if (p === 'Urgent') return '🔴 Urgent';
  if (p === 'High') return '🟠 High';
  if (p === 'Normal') return '🔵 Normal';
  if (p === 'Low') return '⚪ Low';
  return null;
}

function SuggestionIcon({ id }: { id: string }) {
  const cls = 'h-[18px] w-[18px] text-gray-400';
  if (id === 'tasks') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }
  if (id === 'workspace') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (id === 'overdue') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function focusComposer() {
  document.getElementById('ai-composer-input')?.focus();
}

function TaskCard({ task, accent, onOpen }: { task: AiTaskCard; accent: string; onOpen: () => void }) {
  const due = dueLabel(task.dueDate);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm">
      <div className="font-medium text-sm text-gray-900">{task.title}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
        {priorityIcon(task.priority) && <span>{priorityIcon(task.priority)}</span>}
        <span>
          <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: task.statusColor }} />
          {task.status}
        </span>
        <span>👤 {task.assigneeName || 'Unassigned'}</span>
        {task.createdByName && <span>created by {task.createdByName}</span>}
        {due && <span className={task.isOverdue ? 'text-red-600' : ''}>{task.isOverdue ? '⚠' : '📅'} {due}</span>}
      </div>
      <div className="text-[11px] text-gray-400 mt-1">
        {task.spaceName} / {task.listName}
      </div>
      <button
        onClick={onOpen}
        className="mt-2 text-xs font-medium px-2.5 py-1 rounded-lg text-white"
        style={{ backgroundColor: accent }}
      >
        Open Task
      </button>
    </div>
  );
}

export default function AiChatPanel({
  workspaceId,
  workspaceName,
  userName,
  accent,
  chatId,
  context,
  openBriefToken = 0,
  onEnsureChat,
  onChatUpdated,
  onOpenTask,
  onViewTasks,
  onOpenSearch,
}: Props) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'ask' | 'agents'>('ask');
  const [briefView, setBriefView] = useState(false);
  const [chips, setChips] = useState<ComposerChip[]>([]);
  const sendingRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const visibleMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const showHome = visibleMessages.length === 0 && !sending;

  useEffect(() => {
    if (openBriefToken) setBriefView(true);
  }, [openBriefToken]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!chatId) {
      if (!sendingRef.current) setMessages([]);
      return;
    }
    if (sendingRef.current) return;
    (async () => {
      try {
        const chat = await apiFetch(`/workspaces/${workspaceId}/ai/chats/${chatId}`);
        if (cancelled || sendingRef.current) return;
        setMessages(chat.messages || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, chatId]);

  useEffect(() => {
    if (!showHome) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, showHome]);

  async function send(text?: string, extraChips?: ComposerChip[]) {
    const content = (text ?? input).trim();
    const active = extraChips || chips;
    if (!content || sending) return;
    const taskIds = active.filter((c) => c.kind === 'task').map((c) => c.id);
    const listIds = active.filter((c) => c.kind === 'list').map((c) => c.id);
    const userIds = active.filter((c) => c.kind === 'person').map((c) => c.id);
    const links = active.filter((c) => c.kind === 'link').map((c) => c.url);
    const attachments = active
      .filter((c) => c.kind === 'file')
      .map((c) => ({ name: c.name, type: c.type, size: c.size, text: c.text }));
    const primary = active.find((c) => c.kind === 'task') || active.find((c) => c.kind === 'list') || active.find((c) => c.kind === 'person');
    const sendContext =
      primary?.kind === 'task'
        ? { type: 'task' as const, id: primary.id, name: primary.name, listId: primary.listId, spaceId: primary.spaceId }
        : primary?.kind === 'list'
          ? { type: 'list' as const, id: primary.id, name: primary.name, spaceId: primary.spaceId }
          : primary?.kind === 'person'
            ? { type: 'person' as const, id: primary.id, name: primary.name }
            : context;

    setBriefView(false);
    setSending(true);
    sendingRef.current = true;
    setError('');
    setInput('');
    setChips([]);
    const optimistic: AiMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const id = chatId || (await onEnsureChat());
      const res = await apiFetch(`/workspaces/${workspaceId}/ai/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          context: sendContext,
          taskIds,
          listIds,
          userIds,
          links,
          attachments,
        }),
      });
      setMessages((prev) => {
        const withoutTmp = prev.filter((m) => m.id !== optimistic.id);
        return [...withoutTmp, res.userMessage, res.assistantMessage];
      });
      onChatUpdated();
    } catch (err: any) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      setChips(active);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function createTaskFromComposer(listId: string, title: string): Promise<ComposerChip | null> {
    try {
      const created = await apiFetch(`/lists/${listId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      return { kind: 'task', id: created.id, name: created.title, listId };
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }

  function structuredOf(m: AiMessage): AiStructured | null {
    return m.responseJson && typeof m.responseJson === 'object' ? m.responseJson : null;
  }

  const composer = (
    <AiComposer
      workspaceId={workspaceId}
      accent={accent}
      value={input}
      sending={sending}
      compact={!showHome}
      chips={chips}
      onChange={setInput}
      onChipsChange={setChips}
      onSend={send}
      onCreateTask={createTaskFromComposer}
    />
  );

  const modeTabs = (
    <div className="absolute left-1/2 -translate-x-1/2 -top-[15px] z-20 flex items-center gap-0.5">
      <button
        type="button"
        className={`h-[30px] px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ${
          mode === 'ask'
            ? 'bg-white text-gray-800 shadow-[0_1px_6px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04]'
            : 'text-gray-400 hover:text-gray-600'
        }`}
        onClick={() => setMode('ask')}
      >
        <AiIcon size={14} /> Ask
      </button>
      <button
        type="button"
        className={`h-[30px] px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ${
          mode === 'agents'
            ? 'bg-white text-gray-800 shadow-[0_1px_6px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04]'
            : 'text-gray-400 hover:text-gray-600'
        }`}
        onClick={() => setMode('agents')}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm14 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM9 12h6" strokeLinecap="round" />
        </svg>
        Agents
      </button>
    </div>
  );

  return (
    <div className="h-full relative flex flex-col bg-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 18% -10%, rgba(253,186,210,0.55), transparent 58%), radial-gradient(ellipse 70% 65% at 52% -20%, rgba(196,181,253,0.5), transparent 55%), radial-gradient(ellipse 75% 70% at 82% -8%, rgba(147,197,253,0.5), transparent 58%)',
        }}
      />

      <header className="relative z-10 h-[52px] shrink-0 flex items-center justify-center gap-2 px-6">
        <button
          type="button"
          onClick={() => (onOpenSearch ? onOpenSearch() : focusComposer())}
          className="h-8 w-[min(300px,38vw)] rounded-lg border border-black/[0.08] bg-white/75 px-3 text-left text-[13px] text-gray-400 hover:bg-white inline-flex items-center gap-2"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
          <span className="flex-1 truncate">Search</span>
          <kbd className="text-[11px] text-gray-400 font-normal">Ctrl K</kbd>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('ask');
            focusComposer();
          }}
          className="h-8 rounded-full border border-black/[0.08] bg-white/80 px-2.5 text-[13px] text-gray-600 inline-flex items-center gap-1.5 hover:bg-white"
        >
          Ask AI <AiIcon size={14} />
        </button>
      </header>

      {briefView ? (
        <div className="relative z-10 flex-1 overflow-y-auto">
          <DailyBrief
            workspaceId={workspaceId}
            userName={userName}
            mode="full"
            onOpenTask={onOpenTask}
            onAsk={send}
            onClose={() => setBriefView(false)}
          />
        </div>
      ) : showHome ? (
        <div className="relative z-10 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-6 pt-[72px] pb-16">
            <div className="flex items-center justify-center gap-3 mb-11">
              <AiIcon size={46} />
              <h1 className="text-[40px] leading-none font-semibold tracking-[-0.03em] text-gray-900">AI Workspace</h1>
            </div>

            <div className="relative overflow-visible">
              {modeTabs}
              {mode === 'agents' ? (
                <div className="rounded-[28px] border border-dashed border-gray-200 bg-white/80 px-6 py-[72px] text-center text-sm text-gray-500">
                  Agents are coming soon. Use Ask to search and manage work in {workspaceName}.
                </div>
              ) : (
                composer
              )}
            </div>

            {mode === 'ask' && (
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-1">
                {SUGGESTION_CARDS.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => send(card.query)}
                    className="text-left rounded-xl px-3 py-3 hover:bg-black/[0.03] transition-colors"
                  >
                    <SuggestionIcon id={card.id} />
                    <div className="mt-2 text-[13px] font-medium text-gray-800 leading-tight">{card.title}</div>
                    <div className="mt-0.5 text-[12px] text-gray-400 leading-snug">{card.subtitle}</div>
                  </button>
                ))}
              </div>
            )}
            {mode === 'ask' && (
              <DailyBrief
                workspaceId={workspaceId}
                userName={userName}
                mode="compact"
                onOpenTask={onOpenTask}
                onAsk={send}
                onClose={() => setBriefView(true)}
              />
            )}
            {error && <p className="text-sm text-red-600 mt-4 text-center">{error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div ref={scroller} className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            <div className="max-w-[720px] mx-auto space-y-4">
              {visibleMessages.map((m) => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl px-4 py-2 text-sm text-white shadow-sm" style={{ backgroundColor: accent }}>
                        {m.content}
                      </div>
                    </div>
                  );
                }
                const structured = structuredOf(m);
                const tasks = (structured?.tasks || []).filter((t) => t && t.id && t.title);
                return (
                  <div key={m.id} className="max-w-3xl">
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed shadow-sm">
                      {structured?.content || m.content}
                    </div>
                    {tasks.length > 0 && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {tasks.map((t) => (
                          <TaskCard key={t.id} task={t} accent={accent} onOpen={() => onOpenTask(t)} />
                        ))}
                      </div>
                    )}
                    {structured?.actions && structured.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {structured.actions.map((a, i) => (
                          <button
                            key={`${a.type}-${i}`}
                            className="text-xs px-2.5 py-1 rounded-lg border bg-white hover:bg-gray-50"
                            onClick={() => {
                              if (a.type === 'open_task' && a.taskId) {
                                const t = tasks.find((x) => x.id === a.taskId);
                                if (t) onOpenTask(t);
                                return;
                              }
                              if (a.type === 'view_tasks' && tasks.length) onViewTasks?.(tasks);
                            }}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {sending && <div className="text-sm text-gray-500 px-1">Looking up workspace records…</div>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </div>
          <div className="relative z-10 px-4 sm:px-6 pb-5 pt-2">
            <div className="max-w-[720px] mx-auto">{composer}</div>
          </div>
        </>
      )}
    </div>
  );
}
