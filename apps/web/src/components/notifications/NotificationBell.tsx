'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { AiTaskCard } from '@/components/ai/types';
import {
  NOTIFICATIONS_CHANGED,
  notifyNotificationsChanged,
  digestRows,
  timeAgo,
  toTaskCard,
  typeIcon,
  type NotificationItem,
  type NotificationPage,
} from './shared';

export default function NotificationBell({
  workspaceId,
  onOpenTask,
  onViewAll,
}: {
  workspaceId: string;
  onOpenTask: (task: AiTaskCard) => Promise<boolean> | boolean | void;
  onViewAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [groups, setGroups] = useState({ overdue: 0, dueToday: 0, mentions: 0, taskUpdates: 0 });
  const [dailyDigest, setDailyDigest] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  async function refreshCount() {
    try {
      const data = await apiFetch(`/notifications/unread-count?workspaceId=${encodeURIComponent(workspaceId)}`);
      setUnread(typeof data.count === 'number' ? data.count : 0);
      if (data.groups) setGroups(data.groups);
      setDailyDigest(Boolean(data.dailyDigest));
    } catch {
      /* leave the last count if the request fails */
    }
  }

  async function refreshList() {
    setLoading(true);
    try {
      const data: NotificationPage = await apiFetch(
        `/notifications?workspaceId=${encodeURIComponent(workspaceId)}&page=1&limit=8`,
      );
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, 30000);
    function onChanged() {
      refreshCount();
      if (open) refreshList();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [workspaceId, open]);

  useEffect(() => {
    if (!open) return;
    refreshList();
    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, workspaceId]);

  async function openNotification(item: NotificationItem) {
    if (!item.isRead) {
      try {
        const updated: NotificationItem = await apiFetch(`/notifications/${item.id}/read`, { method: 'PATCH' });
        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...updated, isRead: true } : row)));
        setUnread((count) => Math.max(0, count - 1));
      } catch {
        /* still try to open the task */
      }
    }
    setOpen(false);
    if (item.task) {
      const opened = await onOpenTask(toTaskCard(item.task));
      if (opened === false) return;
    }
  }

  async function readAll() {
    try {
      await apiFetch(`/notifications/read-all?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'PATCH' });
      setItems((prev) => prev.map((row) => ({ ...row, isRead: true })));
      setUnread(0);
      notifyNotificationsChanged();
    } catch {
      /* keep the current list */
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="h-8 rounded-full border border-black/[0.08] bg-white px-2.5 text-[13px] text-gray-600 inline-flex items-center gap-1.5 hover:bg-gray-50"
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? <span>{unread}</span> : null}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[min(340px,calc(100vw-1.5rem))] max-h-[min(70vh,420px)] overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-lg flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-black/[0.06]">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            <button type="button" onClick={readAll} className="text-xs text-gray-500 hover:text-gray-800">
              Read all
            </button>
          </div>
          {[groups.overdue, groups.dueToday, groups.mentions, groups.taskUpdates].some((count) => count > 0) && (
            <p className="px-3 py-2 text-[12px] text-gray-500 border-b border-black/[0.04]">
              {[
                groups.overdue ? `${groups.overdue} overdue` : '',
                groups.dueToday ? `${groups.dueToday} due today` : '',
                groups.mentions ? `${groups.mentions} mention${groups.mentions === 1 ? '' : 's'}` : '',
                groups.taskUpdates ? `${groups.taskUpdates} task update${groups.taskUpdates === 1 ? '' : 's'}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="overflow-y-auto">
            {loading && items.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">Loading…</p>}
            {!loading && items.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">No notifications</p>}
            {digestRows(items, dailyDigest).map((row) => row.kind === 'digest' ? (
              <button
                key={row.key}
                type="button"
                onClick={() => {
                  row.items.forEach((item) => {
                    if (!item.isRead) {
                      apiFetch(`/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => undefined);
                    }
                  });
                  setItems((prev) => prev.map((item) => (row.items.some((entry) => entry.id === item.id) ? { ...item, isRead: true } : item)));
                  notifyNotificationsChanged();
                  if (row.task) onOpenTask(toTaskCard(row.task));
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 border-b border-black/[0.04] bg-white"
              >
                <div className="text-[13px] text-gray-900">{row.count} updates happened on {row.task?.title || 'a task'}.</div>
              </button>
            ) : (
              <button
                key={row.item.id}
                type="button"
                onClick={() => openNotification(row.item)}
                className={`w-full text-left px-3 py-2.5 border-b border-black/[0.04] last:border-b-0 ${row.item.isRead ? 'bg-white' : 'bg-blue-50/70'}`}
              >
                <div className={`text-[13px] text-gray-900 ${row.item.isRead ? 'font-normal' : 'font-semibold'}`}>
                  {typeIcon(row.item.type, !row.item.isRead)}
                  {row.item.title}
                </div>
                <div className="mt-0.5 text-[12px] text-gray-600">{row.item.message}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">{timeAgo(row.item.createdAt)}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onViewAll();
            }}
            className="shrink-0 w-full text-left px-3 py-2.5 border-t border-black/[0.06] text-[13px] text-gray-600 hover:bg-gray-50"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
