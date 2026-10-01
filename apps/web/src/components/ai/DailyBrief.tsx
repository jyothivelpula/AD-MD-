'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { AiTaskCard } from './types';

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

export type WorkCounts = {
  overdueCount: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  highPriorityCount: number;
  unreadNotifications: number;
  unreadMentions: number;
  completedRecently: number;
  inProgressCount: number;
};

export type DailyBriefData = {
  userName: string;
  aiEnabled: boolean;
  aiSummary: string | null;
  summaryUnavailable: boolean;
  cached: boolean;
  summary: WorkCounts;
  attention: BriefTask[];
  overdue: BriefTask[];
  dueToday: BriefTask[];
  mentions: BriefMention[];
  completed: BriefTask[];
  inProgress: BriefTask[];
};

const QUESTIONS = [
  { label: "What's overdue?", query: 'Show my overdue tasks.' },
  { label: "What's due today?", query: 'Show tasks assigned to me that are due today.' },
  { label: "What's my priority?", query: 'Which of my tasks should I focus on?' },
  { label: 'Show my progress', query: 'Show my progress.' },
  { label: 'What needs my attention?', query: 'What needs my attention?' },
];

function greeting(name: string) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${hello}, ${name}`;
}

export function workLine(data: Pick<DailyBriefData, 'summary' | 'overdue' | 'dueToday' | 'completed' | 'inProgress'>) {
  const counts = data.summary;
  const hasWork = counts.overdueCount + counts.dueTodayCount + counts.inProgressCount + counts.completedRecently > 0;
  if (!hasWork && data.overdue.length + data.dueToday.length + data.completed.length + data.inProgress.length === 0) {
    return "You don't have any assigned tasks yet.";
  }
  if (counts.overdueCount === 0 && counts.dueTodayCount === 0 && counts.unreadMentions === 0) {
    return "You're all caught up.";
  }
  const parts = [];
  if (counts.overdueCount) parts.push(`${counts.overdueCount} overdue task${counts.overdueCount === 1 ? '' : 's'}`);
  if (counts.dueTodayCount) parts.push(`${counts.dueTodayCount} task${counts.dueTodayCount === 1 ? '' : 's'} due today`);
  if (!parts.length && counts.unreadMentions) return `You have ${counts.unreadMentions} unread mention${counts.unreadMentions === 1 ? '' : 's'}.`;
  return `You have ${parts.join(' and ')}.`;
}

function toCard(task: BriefTask): AiTaskCard {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    statusType: task.statusType,
    statusColor: '#6B7280',
    priority: task.priority,
    assigneeName: task.assigneeName,
    assigneeId: null,
    ownerName: null,
    dueDate: task.dueDate,
    startDate: null,
    listId: task.listId,
    listName: task.listName,
    spaceId: task.spaceId,
    spaceName: task.spaceName,
    isOverdue: task.overdueDays > 0,
  };
}

function dueText(iso: string | null) {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function marker(task: BriefTask) {
  if (task.overdueDays > 0 || /high|urgent/i.test(task.priority || '')) return '🔴';
  if (/due today|due tomorrow/i.test(task.reason)) return '🟠';
  return '•';
}

export async function fetchDailyBrief(workspaceId: string, refresh = false): Promise<DailyBriefData> {
  const path = refresh ? `/workspaces/${workspaceId}/ai/daily-brief/refresh` : `/workspaces/${workspaceId}/ai/daily-brief?generate=0`;
  return apiFetch(path, refresh ? { method: 'POST' } : undefined);
}

export default function DailyBrief({
  workspaceId,
  userName,
  mode,
  onOpenTask,
  onAsk,
  onClose,
}: {
  workspaceId: string;
  userName: string;
  mode: 'compact' | 'full';
  onOpenTask: (task: AiTaskCard) => void;
  onAsk: (question: string) => void;
  onClose?: () => void;
}) {
  const [data, setData] = useState<DailyBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setFailed(false);
    try {
      let next = await fetchDailyBrief(workspaceId, refresh);
      if ((refresh || mode === 'full') && next.aiEnabled && !next.aiSummary) {
        next = await apiFetch(`/workspaces/${workspaceId}/ai/daily-brief?generate=1`);
      }
      setData(next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
  }, [workspaceId, mode]);

  if (loading && !data) return <p className="mt-6 text-sm text-gray-400">Loading your work summary…</p>;
  if (failed || !data) {
    return (
      <div className="mt-6 rounded-2xl border border-black/[0.06] bg-white px-4 py-4 text-sm text-gray-600">
        Work summary is temporarily unavailable.
        <button type="button" onClick={() => load(false)} className="ml-2 text-gray-800 underline">
          Retry
        </button>
      </div>
    );
  }

  const line = workLine(data);
  const caughtUp = data.summary.overdueCount === 0 && data.summary.dueTodayCount === 0 && data.summary.unreadMentions === 0;

  if (mode === 'compact') {
    return (
      <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white/90 px-4 py-4 text-left">
        <div className="text-[13px] font-medium text-gray-900">✨ Your Work Today</div>
        <p className="mt-1 text-sm text-gray-800">{greeting(userName)}</p>
        <p className="mt-1 text-sm text-gray-600">{line}</p>
        {data.attention.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] font-semibold tracking-wide text-gray-400">NEEDS ATTENTION</div>
            {data.attention.slice(0, 4).map((task) => (
              <button key={`${task.id}-${task.reason}`} type="button" onClick={() => onOpenTask(toCard(task))} className="block w-full text-left">
                <div className="text-[13px] text-gray-900">
                  {marker(task)} {task.title}
                </div>
                <div className="text-[12px] text-gray-500">{task.reason}</div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
          <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-900">
            View Attention
          </button>
          <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-900">
            View Full Brief
          </button>
          <button type="button" onClick={() => onAsk('Summarize my current workload.')} className="text-gray-600 hover:text-gray-900">
            Ask AI
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-6 py-8">
      <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
        Back
      </button>
      <h2 className="mt-3 text-lg font-semibold text-gray-900">✨ Your Work Today</h2>
      <p className="mt-1 text-sm text-gray-700">{greeting(userName)}</p>
      {data.aiSummary ? <p className="mt-3 text-sm text-gray-800 leading-relaxed">{data.aiSummary}</p> : <p className="mt-3 text-sm text-gray-800">{line}</p>}
      {data.summaryUnavailable && (
        <p className="mt-2 text-sm text-gray-500">
          AI summary is temporarily unavailable.{' '}
          <button type="button" onClick={() => load(true)} className="underline">
            Retry
          </button>
        </p>
      )}
      <button type="button" onClick={() => load(true)} disabled={refreshing} className="mt-3 text-[13px] text-gray-500 hover:text-gray-800">
        {refreshing ? 'Refreshing…' : '↻ Refresh brief'}
      </button>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-700">
        <div>{data.summary.overdueCount} overdue</div>
        <div>{data.summary.dueTodayCount} due today</div>
        <div>{data.summary.highPriorityCount} high priority</div>
        <div>{data.summary.unreadMentions} unread mentions</div>
      </div>

      {caughtUp && (
        <div className="mt-6 text-sm text-gray-600">
          <p>No overdue tasks</p>
          <p>No tasks due today</p>
          <p>No unread mentions</p>
          <p className="mt-2">Keep working!</p>
          <button type="button" onClick={() => onAsk('Summarize my current workload.')} className="mt-3 text-gray-800 underline">
            Ask AI
          </button>
        </div>
      )}

      <TaskSection title="Overdue" tasks={data.overdue} onOpenTask={onOpenTask} />
      <TaskSection title="Due today" tasks={data.dueToday} onOpenTask={onOpenTask} />
      {data.mentions.length > 0 && (
        <section className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-wide text-gray-400">MENTIONS</h3>
          <div className="mt-2 space-y-2">
            {data.mentions.map((item) => (
              <article key={item.id + item.message} className="rounded-xl border border-black/[0.06] bg-white px-3 py-3">
                <div className="text-sm text-gray-900">💬 {item.message}</div>
                <div className="mt-1 text-xs text-gray-500">{item.title}</div>
                <button type="button" onClick={() => onOpenTask(toCard(item))} className="mt-2 text-[13px] text-gray-600 hover:text-gray-900">
                  Open Task
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {data.completed.length > 0 && (
        <section className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-wide text-gray-400">RECENTLY COMPLETED</h3>
          <ul className="mt-2 text-sm text-gray-700">
            {data.completed.map((task) => (
              <li key={task.id}>✓ {task.title}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {QUESTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onAsk(item.query)}
            className="h-8 px-3 rounded-full border border-black/[0.08] bg-white text-[13px] text-gray-600 hover:bg-gray-50"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskSection({ title, tasks, onOpenTask }: { title: string; tasks: BriefTask[]; onOpenTask: (task: AiTaskCard) => void }) {
  if (!tasks.length) return null;
  return (
    <section className="mt-6">
      <h3 className="text-[11px] font-semibold tracking-wide text-gray-400">{title.toUpperCase()}</h3>
      <div className="mt-2 space-y-2">
        {tasks.map((task) => (
          <article key={task.id} className="rounded-xl border border-black/[0.06] bg-white px-3 py-3">
            <div className="text-sm font-medium text-gray-900">
              {marker(task)} {task.title}
            </div>
            <div className="mt-1 text-xs text-gray-500">{task.reason}</div>
            <div className="mt-1 text-xs text-gray-600">
              Status: {task.status}
              {task.priority ? ` · Priority: ${task.priority}` : ''}
              {` · Due: ${dueText(task.dueDate)}`}
              {task.assigneeName ? ` · ${task.assigneeName}` : ''}
            </div>
            <button type="button" onClick={() => onOpenTask(toCard(task))} className="mt-2 text-[13px] text-gray-600 hover:text-gray-900">
              Open Task
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
