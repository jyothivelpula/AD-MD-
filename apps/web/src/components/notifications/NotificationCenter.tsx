'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { AiTaskCard } from '@/components/ai/types';
import { fetchDailyBrief, workLine } from '@/components/ai/DailyBrief';
import {
  EMPTY_BY_FILTER,
  NOTIFICATIONS_CHANGED,
  digestRows,
  groupNotifications,
  notifyNotificationsChanged,
  timeAgo,
  toTaskCard,
  typeIcon,
  type NotificationFilter,
  type NotificationItem,
  type NotificationPage,
} from './shared';

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'comments', label: 'Comments' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'deadlines', label: 'Deadlines' },
];

export default function NotificationCenter({
  workspaceId,
  onOpenTask,
  onOpenSettings,
  onViewBrief,
}: {
  workspaceId: string;
  onOpenTask: (task: AiTaskCard) => Promise<boolean>;
  onOpenSettings: () => void;
  onViewBrief: () => void;
}) {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [digest, setDigest] = useState(false);
  const [briefLine, setBriefLine] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function load(nextPage: number, append: boolean) {
    const id = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams({
      workspaceId,
      page: String(nextPage),
      limit: '20',
      filter,
    });
    if (search) params.set('q', search);
    try {
      const data: NotificationPage = await apiFetch(`/notifications?${params.toString()}`);
      if (id !== requestId.current) return;
      const rows = Array.isArray(data.notifications) ? data.notifications : [];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setPage(data.page || nextPage);
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (id !== requestId.current) return;
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    load(1, false);
  }, [workspaceId, filter, search]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/notification-preferences')
      .then((prefs: { dailyDigest?: boolean }) => {
        if (!cancelled) setDigest(Boolean(prefs.dailyDigest));
      })
      .catch(() => undefined);
    fetchDailyBrief(workspaceId)
      .then((brief) => {
        if (!cancelled) setBriefLine(brief.aiSummary || workLine(brief));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    function onChanged() {
      load(1, false);
    }
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
  }, [workspaceId, filter, search]);

  async function markRead(item: NotificationItem) {
    if (item.isRead) return;
    const updated: NotificationItem = await apiFetch(`/notifications/${item.id}/read`, { method: 'PATCH' });
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...updated, isRead: true } : row)));
    notifyNotificationsChanged();
  }

  async function openNotification(item: NotificationItem) {
    setMenuId(null);
    setNotice(null);
    try {
      await markRead(item);
    } catch {
      /* still try to open the task */
    }
    if (item.task) {
      const opened = await onOpenTask(toTaskCard(item.task));
      if (!opened) setNotice('Related task is no longer available.');
      return;
    }
    if (item.taskId) setNotice('Related task is no longer available.');
  }

  async function readAll() {
    await apiFetch(`/notifications/read-all?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'PATCH' });
    setItems((prev) => prev.map((row) => ({ ...row, isRead: true })));
    notifyNotificationsChanged();
  }

  async function remove(item: NotificationItem) {
    await apiFetch(`/notifications/${item.id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    setMenuId(null);
    notifyNotificationsChanged();
  }

  const groups = groupNotifications(items);
  const empty = EMPTY_BY_FILTER[filter];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6" onClick={() => setMenuId(null)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Notifications</h1>
          {briefLine && (
            <div className="mt-2 text-sm text-gray-600">
              <div className="text-[13px] text-gray-800">✨ {briefLine}</div>
              <button type="button" onClick={onViewBrief} className="mt-1 text-[13px] text-gray-500 hover:text-gray-800">
                View Daily Brief
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={onOpenSettings} className="text-sm text-gray-500 hover:text-gray-800">
          Preferences
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`h-8 px-3 rounded-full text-[13px] border ${
              filter === item.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button type="button" onClick={readAll} className="ml-auto text-sm text-gray-500 hover:text-gray-800">
          Mark all as read
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search notifications..."
        className="mt-4 w-full h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-sm text-gray-800"
      />

      {notice && <p className="mt-4 text-sm text-gray-600">{notice}</p>}

      <div className="mt-4">
        {loading && items.length === 0 && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && items.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-gray-800">{empty.title}</p>
            {empty.body ? <p className="mt-1 text-sm text-gray-500">{empty.body}</p> : null}
          </div>
        )}
        {groups.map(({ group, items: rows }) => (
          <section key={group} className="mb-6">
            <h2 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{group}</h2>
            <div className="mt-2 rounded-xl border border-black/[0.06] bg-white overflow-hidden">
              {digestRows(rows, digest).map((row) => row.kind === 'digest' ? (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => {
                    const task = row.task;
                    row.items.forEach((item) => {
                      if (!item.isRead) markRead(item).catch(() => undefined);
                    });
                    if (task) onOpenTask(toTaskCard(task));
                  }}
                  className="w-full text-left px-3 py-3 border-b border-black/[0.04] last:border-b-0 bg-white"
                >
                  <div className="text-[13px] text-gray-900">{row.count} updates happened on {row.task?.title || 'a task'}.</div>
                </button>
              ) : (
                <div
                  key={row.item.id}
                  className={`relative flex items-start gap-2 border-b border-black/[0.04] last:border-b-0 ${
                    row.item.isRead ? 'bg-white' : 'bg-blue-50/70'
                  }`}
                >
                  <button type="button" onClick={() => openNotification(row.item)} className="flex-1 min-w-0 text-left px-3 py-3">
                    <div className={`text-[13px] text-gray-900 ${row.item.isRead ? 'font-normal' : 'font-semibold'}`}>
                      {typeIcon(row.item.type, !row.item.isRead)}
                      {row.item.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-gray-600">{row.item.message}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">{timeAgo(row.item.createdAt)}</div>
                  </button>
                  <button
                    type="button"
                    aria-label="Notification actions"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuId((current) => (current === row.item.id ? null : row.item.id));
                    }}
                    className="mt-2 mr-2 h-7 w-7 rounded-md text-gray-400 hover:bg-black/[0.04] hover:text-gray-700"
                  >
                    ⋮
                  </button>
                  {menuId === row.item.id && (
                    <div
                      className="absolute right-2 top-9 z-10 w-36 rounded-lg border border-black/[0.08] bg-white py-1 shadow-lg"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {!row.item.isRead && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => markRead(row.item).then(() => setMenuId(null)).catch(() => setMenuId(null))}
                        >
                          Mark as read
                        </button>
                      )}
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => remove(row.item).catch(() => setMenuId(null))}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => load(page + 1, true)}
            disabled={loading}
            className="h-9 px-4 rounded-lg border border-black/[0.08] bg-white text-sm text-gray-700 hover:bg-gray-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
