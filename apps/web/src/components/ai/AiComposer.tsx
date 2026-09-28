'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type ComposerChip =
  | { kind: 'task'; id: string; name: string; listId?: string; spaceId?: string }
  | { kind: 'list'; id: string; name: string; spaceId?: string; spaceName?: string }
  | { kind: 'person'; id: string; name: string }
  | { kind: 'link'; id: string; name: string; url: string }
  | { kind: 'file'; id: string; name: string; type: string; size: number; text?: string };

type Picker = {
  tasks: {
    id: string;
    title: string;
    status: string;
    listId: string;
    listName: string;
    spaceId: string;
    spaceName: string;
    assigneeName: string | null;
  }[];
  lists: { id: string; name: string; spaceId: string; spaceName: string }[];
  people: { id: string; name: string; email: string }[];
};

type Menu = 'add' | 'skills' | 'tasks' | 'lists' | 'people' | 'link' | 'create' | null;

const SKILLS: { icon: string; title: string; subtitle: string; id: string }[] = [
  { id: 'search', icon: '🔎', title: 'Search Workspace', subtitle: 'Find tasks, people, lists, and projects.' },
  { id: 'find-tasks', icon: '📋', title: 'Find Tasks', subtitle: 'Search workspace tasks.' },
  { id: 'progress', icon: '📊', title: 'Analyze Progress', subtitle: 'Analyze current task progress.' },
  { id: 'summarize', icon: '📝', title: 'Summarize Work', subtitle: 'Summarize workspace activity.' },
  { id: 'overdue', icon: '⚠️', title: 'Find Overdue Work', subtitle: 'Find overdue tasks.' },
  { id: 'member', icon: '👤', title: 'Member Tasks', subtitle: 'Show tasks assigned to a person.' },
  { id: 'workspace', icon: '📈', title: 'Workspace Summary', subtitle: 'Summarize the workspace.' },
  { id: 'create', icon: '➕', title: 'Create Task', subtitle: 'Create a new workspace task.' },
];

type Props = {
  workspaceId: string;
  accent: string;
  value: string;
  sending: boolean;
  compact?: boolean;
  chips: ComposerChip[];
  onChange: (v: string) => void;
  onChipsChange: (chips: ComposerChip[]) => void;
  onSend: (text?: string, extraChips?: ComposerChip[]) => void;
  onCreateTask?: (listId: string, title: string) => Promise<ComposerChip | null>;
};

export default function AiComposer({
  workspaceId,
  accent,
  value,
  sending,
  compact,
  chips,
  onChange,
  onChipsChange,
  onSend,
  onCreateTask,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newListId, setNewListId] = useState('');
  const [skillAfterPick, setSkillAfterPick] = useState<'about-task' | 'member-tasks' | null>(null);

  useEffect(() => {
    if (compact) return;
    textRef.current?.focus();
  }, [compact]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function loadPicker(q = '') {
    const data: Picker = await apiFetch(
      `/workspaces/${workspaceId}/ai/picker${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
    );
    setPicker(data);
    if (!newListId && data.lists[0]) setNewListId(data.lists[0].id);
    return data;
  }

  function openMenu(next: Menu) {
    setMenu(next);
    setQuery('');
    if (next === 'tasks' || next === 'lists' || next === 'people' || next === 'create') {
      loadPicker().catch(() => setPicker({ tasks: [], lists: [], people: [] }));
    }
  }

  function addChip(chip: ComposerChip) {
    onChipsChange([...chips.filter((c) => !(c.kind === chip.kind && c.id === chip.id)), chip]);
    setMenu(null);
    setSkillAfterPick(null);
  }

  function removeChip(id: string) {
    onChipsChange(chips.filter((c) => c.id !== id));
  }

  async function onPickFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!/\.(pdf|docx|txt|csv|xlsx)$/.test(lower)) return;
    let text: string | undefined;
    if (/\.(txt|csv)$/.test(lower)) {
      text = (await file.text()).slice(0, 6000);
    }
    addChip({
      kind: 'file',
      id: `file-${Date.now()}`,
      name: file.name,
      type: file.type || lower.split('.').pop() || '',
      size: file.size,
      text,
    });
  }

  async function runSkill(id: string) {
    if (id === 'search') {
      setMenu(null);
      onSend('Search this workspace for tasks, people, lists, and projects.');
      return;
    }
    if (id === 'progress') {
      setMenu(null);
      onSend('Analyze the progress of work in this workspace.');
      return;
    }
    if (id === 'summarize') {
      setMenu(null);
      onSend('Summarize the current workspace work.');
      return;
    }
    if (id === 'overdue') {
      setMenu(null);
      onSend('Show me all overdue tasks in this workspace.');
      return;
    }
    if (id === 'workspace') {
      setMenu(null);
      onSend('Summarize my workspace.');
      return;
    }
    if (id === 'find-tasks') {
      setSkillAfterPick('about-task');
      openMenu('tasks');
      return;
    }
    if (id === 'member') {
      setSkillAfterPick('member-tasks');
      openMenu('people');
      return;
    }
    if (id === 'create') {
      openMenu('create');
    }
  }

  async function pickTask(task: Picker['tasks'][0]) {
    const chip: ComposerChip = {
      kind: 'task',
      id: task.id,
      name: task.title,
      listId: task.listId,
      spaceId: task.spaceId,
    };
    if (skillAfterPick === 'about-task') {
      const next = [...chips.filter((c) => c.kind !== 'task' || c.id !== task.id), chip];
      onChipsChange(next);
      setMenu(null);
      setSkillAfterPick(null);
      onSend('Tell me everything about this task.', next);
      return;
    }
    addChip(chip);
  }

  async function pickPerson(person: Picker['people'][0]) {
    const chip: ComposerChip = { kind: 'person', id: person.id, name: person.name };
    if (skillAfterPick === 'member-tasks') {
      const next = [...chips.filter((c) => c.kind !== 'person' || c.id !== person.id), chip];
      onChipsChange(next);
      setMenu(null);
      setSkillAfterPick(null);
      onSend(`Show me all tasks assigned to ${person.name}.`, next);
      return;
    }
    addChip(chip);
  }

  async function submitCreate() {
    if (!newTitle.trim() || !newListId || !onCreateTask) return;
    const chip = await onCreateTask(newListId, newTitle.trim());
    if (!chip) return;
    const next = [...chips.filter((c) => c.id !== chip.id), chip];
    onChipsChange(next);
    setNewTitle('');
    setMenu(null);
    onSend('Tell me everything about this task.', next);
  }

  const filteredTasks =
    picker?.tasks.filter((t) => !query || t.title.toLowerCase().includes(query.toLowerCase())) || [];
  const filteredLists =
    picker?.lists.filter(
      (l) => !query || `${l.spaceName} ${l.name}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  const filteredPeople =
    picker?.people.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase())) || [];

  return (
    <div
      ref={rootRef}
      className={`relative overflow-visible bg-white ${compact ? 'rounded-2xl border border-gray-200' : 'rounded-[28px]'}`}
      style={
        compact
          ? { boxShadow: `0 8px 24px ${accent}12` }
          : {
              boxShadow:
                '0 0 0 1px rgba(196,181,253,0.45), 0 12px 40px rgba(251,146,180,0.16), 0 24px 60px rgba(147,197,253,0.14)',
            }
      }
    >
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.txt,.csv,.xlsx,application/pdf,text/plain,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPickFile(file);
        }}
      />

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {chips.map((chip) => (
            <span
              key={`${chip.kind}-${chip.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
            >
              {chip.kind === 'task' && '📋'}
              {chip.kind === 'list' && '📁'}
              {chip.kind === 'person' && '👤'}
              {chip.kind === 'link' && '🔗'}
              {chip.kind === 'file' && '📄'} {chip.name}
              <button type="button" className="ml-0.5 text-gray-400 hover:text-gray-700" onClick={() => removeChip(chip.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        id="ai-composer-input"
        ref={textRef}
        className={`w-full outline-none resize-none bg-transparent text-gray-800 placeholder:text-gray-400 ${
          compact ? 'px-4 pt-3 min-h-[56px] max-h-36 text-sm' : 'px-6 pt-8 min-h-[128px] max-h-48 text-[15px] leading-6'
        }`}
        placeholder="Search, Ask, or Create"
        value={value}
        rows={compact ? 2 : 3}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />

      <div className={`flex items-center gap-1 ${compact ? 'px-3 pb-2.5 pt-1' : 'px-4 pb-3 pt-1'}`}>
        <button
          type="button"
          className={`h-8 w-8 rounded-full text-lg leading-none text-gray-400 hover:bg-gray-100 ${menu === 'add' ? 'bg-gray-100 text-gray-700' : ''}`}
          title="Add"
          onClick={() => openMenu(menu === 'add' ? null : 'add')}
        >
          +
        </button>
        <button
          type="button"
          className={`h-8 px-2.5 rounded-full text-sm text-gray-500 hover:bg-gray-100 inline-flex items-center gap-1 ${menu === 'skills' ? 'bg-gray-100 text-gray-800' : ''}`}
          title="Skills"
          onClick={() => openMenu(menu === 'skills' ? null : 'skills')}
        >
          <span className="text-violet-400">✦</span> Skills
        </button>
        <div className="flex-1" />
        <button type="button" className="h-8 w-8 rounded-full text-gray-400 hover:bg-gray-100" title="Voice input coming soon">
          🎙
        </button>
        {value.trim() && (
          <button
            type="button"
            disabled={sending}
            onClick={() => onSend()}
            className="h-8 px-3 rounded-full text-white text-xs font-medium disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {sending ? '…' : 'Ask'}
          </button>
        )}
      </div>

      {menu === 'add' && (
        <div className="absolute left-3 bottom-12 z-40 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-xl text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400">+ Add</div>
          <div className="mx-2 border-t border-gray-100 mb-1" />
          <button className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => { setMenu(null); fileRef.current?.click(); }}>
            📎 Attach File
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => openMenu('tasks')}>
            📋 Add Task
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => openMenu('lists')}>
            📁 Add List
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => openMenu('people')}>
            👤 Add Person
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => openMenu('link')}>
            🔗 Add Link
          </button>
        </div>
      )}

      {menu === 'skills' && (
        <div className="absolute left-3 bottom-12 z-40 w-80 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl text-sm">
          <div className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-400">AI Skills</div>
          {SKILLS.map((skill) => (
            <button
              key={skill.id}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-t border-gray-50"
              onClick={() => runSkill(skill.id)}
            >
              <div className="font-medium text-gray-900">
                {skill.icon} {skill.title}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{skill.subtitle}</div>
            </button>
          ))}
        </div>
      )}

      {(menu === 'tasks' || menu === 'lists' || menu === 'people') && (
        <div className="absolute left-3 bottom-12 z-40 w-80 max-h-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl text-sm flex flex-col">
          <input
            autoFocus
            className="mx-2 mt-2 mb-1 border rounded-lg px-2.5 py-1.5 text-sm outline-none"
            placeholder={
              menu === 'tasks' ? 'Search tasks...' : menu === 'lists' ? 'Search lists...' : 'Search people...'
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (menu === 'tasks') loadPicker(e.target.value).catch(() => {});
            }}
          />
          <div className="overflow-y-auto py-1">
            {menu === 'tasks' &&
              filteredTasks.map((t) => (
                <button key={t.id} className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => pickTask(t)}>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-gray-500">
                    {t.spaceName} / {t.listName} · {t.status}
                  </div>
                </button>
              ))}
            {menu === 'lists' &&
              filteredLists.map((l) => (
                <button
                  key={l.id}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={() => addChip({ kind: 'list', id: l.id, name: l.name, spaceId: l.spaceId, spaceName: l.spaceName })}
                >
                  📁 {l.spaceName} / {l.name}
                </button>
              ))}
            {menu === 'people' &&
              filteredPeople.map((p) => (
                <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => pickPerson(p)}>
                  👤 {p.name}
                </button>
              ))}
            {((menu === 'tasks' && !filteredTasks.length) ||
              (menu === 'lists' && !filteredLists.length) ||
              (menu === 'people' && !filteredPeople.length)) && (
              <div className="px-3 py-4 text-xs text-gray-400">No matches</div>
            )}
          </div>
        </div>
      )}

      {menu === 'link' && (
        <div className="absolute left-3 bottom-12 z-40 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl text-sm">
          <div className="text-xs font-semibold text-gray-500 mb-2">Add Link</div>
          <input
            autoFocus
            className="w-full border rounded-lg px-2.5 py-1.5 outline-none"
            placeholder="https://"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const url = linkUrl.trim();
                if (!url) return;
                addChip({ kind: 'link', id: `link-${Date.now()}`, name: url.replace(/^https?:\/\//, ''), url });
                setLinkUrl('');
              }
            }}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button className="text-xs text-gray-500" onClick={() => setMenu(null)}>
              Cancel
            </button>
            <button
              className="text-xs text-white px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: accent }}
              onClick={() => {
                const url = linkUrl.trim();
                if (!url) return;
                addChip({ kind: 'link', id: `link-${Date.now()}`, name: url.replace(/^https?:\/\//, ''), url });
                setLinkUrl('');
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {menu === 'create' && (
        <div className="absolute left-3 bottom-12 z-40 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl text-sm">
          <div className="text-xs font-semibold text-gray-500 mb-2">Create Task</div>
          <input
            autoFocus
            className="w-full border rounded-lg px-2.5 py-1.5 outline-none mb-2"
            placeholder="Task title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <select
            className="w-full border rounded-lg px-2.5 py-1.5 outline-none mb-2 bg-white"
            value={newListId}
            onChange={(e) => setNewListId(e.target.value)}
          >
            {(picker?.lists || []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.spaceName} / {l.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button className="text-xs text-gray-500" onClick={() => setMenu(null)}>
              Cancel
            </button>
            <button
              className="text-xs text-white px-2.5 py-1 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: accent }}
              disabled={!newTitle.trim() || !newListId}
              onClick={submitCreate}
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
