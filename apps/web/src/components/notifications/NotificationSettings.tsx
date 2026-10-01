'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Preferences = {
  taskAssigned: boolean;
  taskReassigned: boolean;
  taskStatusChanged: boolean;
  taskPriorityChanged: boolean;
  taskCompleted: boolean;
  taskReopened: boolean;
  taskDueToday: boolean;
  taskDueTomorrow: boolean;
  taskOverdue: boolean;
  taskComment: boolean;
  taskMention: boolean;
  workspaceActivity: boolean;
  dailyAiBrief: boolean;
  dailyDigest: boolean;
  emailTaskAssigned: boolean;
  emailTaskReassigned: boolean;
  emailTaskDueToday: boolean;
  emailTaskDueTomorrow: boolean;
  emailTaskOverdue: boolean;
  emailTaskComment: boolean;
  emailTaskMention: boolean;
  emailTaskStatusChanged: boolean;
  emailTaskPriorityChanged: boolean;
  emailDailySummary: boolean;
};

const SECTIONS: { title: string; fields: { key: keyof Preferences; label: string }[] }[] = [
  {
    title: 'Tasks',
    fields: [
      { key: 'taskAssigned', label: 'Task assigned to me' },
      { key: 'taskReassigned', label: 'Task reassigned to me' },
      { key: 'taskStatusChanged', label: 'Task status changed' },
      { key: 'taskPriorityChanged', label: 'Task priority changed' },
      { key: 'taskCompleted', label: 'Task completed' },
      { key: 'taskReopened', label: 'Task reopened' },
    ],
  },
  {
    title: 'Deadlines',
    fields: [
      { key: 'taskDueToday', label: 'Task due today' },
      { key: 'taskDueTomorrow', label: 'Task due tomorrow' },
      { key: 'taskOverdue', label: 'Task overdue' },
    ],
  },
  {
    title: 'Comments',
    fields: [
      { key: 'taskComment', label: 'New comments on my tasks' },
      { key: 'taskMention', label: 'Mentions' },
    ],
  },
  {
    title: 'Workspace activity',
    fields: [{ key: 'workspaceActivity', label: 'Relevant workspace activity' }],
  },
  {
    title: 'Daily brief',
    fields: [
      { key: 'dailyAiBrief', label: 'Daily AI Brief' },
      { key: 'dailyDigest', label: 'Daily notification digest' },
      { key: 'emailDailySummary', label: 'Daily email summary' },
    ],
  },
  {
    title: 'Email',
    fields: [
      { key: 'emailTaskAssigned', label: 'Email when a task is assigned' },
      { key: 'emailTaskReassigned', label: 'Email when a task is reassigned' },
      { key: 'emailTaskDueToday', label: 'Email when a task is due today' },
      { key: 'emailTaskDueTomorrow', label: 'Email when a task is due tomorrow' },
      { key: 'emailTaskOverdue', label: 'Email when a task is overdue' },
      { key: 'emailTaskComment', label: 'Email for new comments' },
      { key: 'emailTaskMention', label: 'Email for mentions' },
      { key: 'emailTaskStatusChanged', label: 'Email when status changes' },
      { key: 'emailTaskPriorityChanged', label: 'Email when priority changes' },
    ],
  },
];

export default function NotificationSettings({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/notification-preferences')
      .then((data: Preferences) => setPrefs(data))
      .catch(() => setPrefs(null));
  }, []);

  async function toggle(key: keyof Preferences) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setSaved(false);
    try {
      const updated: Preferences = await apiFetch('/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      setPrefs(updated);
      setSaved(true);
    } catch {
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      <button type="button" onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">
        Back to notifications
      </button>
      <h1 className="mt-3 text-lg font-semibold text-gray-900">Notification Preferences</h1>
      <p className="mt-1 text-sm text-gray-500">Control which notifications you receive.</p>
      {saving && <p className="mt-2 text-xs text-gray-400">Saving…</p>}
      {saved && !saving && <p className="mt-2 text-xs text-gray-400">Saved</p>}

      <div className="mt-6 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-xl border border-black/[0.06] bg-white">
            <h2 className="px-4 pt-3 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{section.title}</h2>
            <div className="mt-1">
              {section.fields.map((field) => (
                <label key={field.key} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={Boolean(prefs?.[field.key])}
                    disabled={!prefs}
                    onChange={() => toggle(field.key)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
