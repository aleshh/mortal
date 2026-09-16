import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronRight, Folder, House, LogOut, MoreHorizontal, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { completeTask, deleteTask, hasOpenChildren, newTask, normalizeData, palette, reorderContexts, reorderTasks, seedData, uid, upsertTask, visibleTasks, type Context, type Data, type Task } from './model';
import { supabase } from './supabase';

const LOCAL_KEY = 'mortal.demo.v1';
const empty: Data = { tasks: [], contexts: [] };
type PublicRoute = 'landing' | 'login' | 'register';
function getPublicRoute(): PublicRoute {
  if (window.location.hash === '#/login') return 'login';
  if (window.location.hash === '#/register') return 'register';
  return 'landing';
}
function setPublicRoute(route: PublicRoute) {
  window.location.hash = route === 'landing' ? '' : `#/${route}`;
}
function localData(): Data {
  try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? normalizeData(JSON.parse(raw)) : seedData(); }
  catch { return seedData(); }
}
function contextStyle(color: string): CSSProperties { return { '--context-color': color } as CSSProperties; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className="modal" aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20}/></button></div>
    {children}
  </dialog>;
}

function SortableTaskRow({ task, data, busy, reorderEnabled, onComplete, onOpen, onOpenProject }: {
  task: Task;
  data: Data;
  busy: boolean;
  reorderEnabled: boolean;
  onComplete: () => void;
  onOpen: () => void;
  onOpenProject: () => void;
}) {
  const blocked = hasOpenChildren(task, data.tasks);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !reorderEnabled });
  const style: CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  return <div ref={setNodeRef} style={style} className={`task-row ${task.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}>
    <button className={`check-target ${task.completed ? 'checked' : ''}`} disabled={busy || (!task.completed && blocked)} title={blocked ? 'Complete subtasks first' : task.completed ? 'Reopen' : 'Complete'} aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`} onClick={onComplete}><span className={`checkbox ${blocked ? 'blocked' : ''}`}>{task.completed ? <Check size={13}/> : blocked ? <Folder size={12}/> : null}</span></button>
    <div className="task-content">
      <button className="task-title" onClick={task.project ? onOpenProject : onOpen}>{task.title}{task.project && <ChevronRight size={15}/>}</button>
    </div>
    <button className={`drag-zone ${reorderEnabled ? '' : 'disabled'}`} disabled={!reorderEnabled} aria-label={`Reorder ${task.title}`} title={reorderEnabled ? 'Drag to reorder' : undefined} {...attributes} {...listeners}/>
    <button className="icon-button task-more" aria-label={`Edit ${task.title}`} onClick={onOpen}><MoreHorizontal size={19}/></button>
  </div>;
}

function SortableContextRow({ context, busy, reorderEnabled, onEdit }: {
  context: Context;
  busy: boolean;
  reorderEnabled: boolean;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: context.id, disabled: !reorderEnabled });
  const style: CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  return <div ref={setNodeRef} style={style} className={`context-order-row ${isDragging ? 'dragging' : ''}`}>
    <button className="nav-pill context-edit-pill" style={contextStyle(context.color)} onClick={onEdit}>
      {context.emoji && <span>{context.emoji}</span>}{context.name}
    </button>
    <button className={`drag-zone context-drag-zone ${reorderEnabled ? '' : 'disabled'}`} disabled={busy || !reorderEnabled} aria-label={`Reorder ${context.name}`} title={reorderEnabled ? 'Drag to reorder' : undefined} {...attributes} {...listeners}/>
  </div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [publicRoute, setPublicRouteState] = useState<PublicRoute>(getPublicRoute);
  const [demo, setDemo] = useState(!supabase);
  const [data, setData] = useState<Data>(() => supabase ? empty : localData());
  const [loaded, setLoaded] = useState(!supabase);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [view, setView] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [contextEdit, setContextEdit] = useState<Context | null>(null);
  const [settings, setSettings] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<Data | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const updateRoute = () => setPublicRouteState(getPublicRoute());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data: result, error }) => {
      if (!active) return;
      if (error) setNotice(error.message);
      setSession(result.session); setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next); setAuthLoading(false);
      if (next) setDemo(false);
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); setAuthOpen(true); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (demo) { setData(localData()); setLoaded(true); return; }
    if (!session || !supabase) { setData(empty); setLoaded(false); return; }
    let active = true;
    setLoaded(false); setLoadError(false); setUndo(null); setEditing(null); setView('all');
    async function load() {
      const client = supabase!;
      let { data: row, error } = await client.from('workspaces').select('data, revision').eq('user_id', session!.user.id).maybeSingle();
      if (!error && !row) {
        const created = await client.from('workspaces').upsert({ user_id: session!.user.id, data: empty, revision: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });
        if (created.error) error = created.error;
        else {
          const result = await client.from('workspaces').select('data, revision').eq('user_id', session!.user.id).single();
          row = result.data; error = result.error;
        }
      }
      if (!active) return;
      if (error) { setNotice(`Could not load tasks: ${error.message}`); setLoadError(true); return; }
      setData(normalizeData(row!.data as Data)); setRevision(row!.revision); setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [session?.user.id, demo]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); setSearchOpen(true); }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); quickRef.current?.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  async function save(next: Data, allowUndo = false): Promise<boolean> {
    if (lock.current || !loaded) return false;
    lock.current = true; setBusy(true); setNotice('');
    try {
      if (demo) localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      else {
        const result = await supabase!.from('workspaces').update({ data: next, revision: revision + 1 })
          .eq('user_id', session!.user.id).eq('revision', revision).select('revision').maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) {
          const fresh = await supabase!.from('workspaces').select('data, revision').eq('user_id', session!.user.id).single();
          if (fresh.error) throw fresh.error;
          setData(normalizeData(fresh.data.data as Data)); setRevision(fresh.data.revision); setUndo(null);
          throw new Error('Tasks changed in another tab. The latest version is loaded; please try again.');
        }
        setRevision(result.data.revision);
      }
      setUndo(allowUndo ? data : null); setData(next); return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : (error as { message?: string }).message ?? 'Could not save. Please try again.');
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  function navigate(next: string) { setView(next); setQuery(''); setSearchOpen(false); setShowCompleted(false); setQuickTitle(''); }
  const activeContext = data.contexts.find(c => view === `context:${c.id}`);
  const activeProject = data.tasks.find(t => view === `project:${t.id}`);
  const title = activeContext?.name ?? activeProject?.title ?? (view === 'projects' ? 'Projects' : 'All');
  const tasks = visibleTasks(data, view, showCompleted)
    .filter(t => !query || `${t.title} ${data.contexts.filter(c => t.contexts.includes(c.id)).map(c => c.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(a.completed) - Number(b.completed));
  const completedCount = visibleTasks(data, view, true).filter(t => t.completed).length;
  const reorderEnabled = loaded && !busy && !query && !showCompleted && tasks.length > 1;
  const contextReorderEnabled = loaded && !busy && data.contexts.length > 1;
  function newContext() { setContextEdit({ id: uid(), name: '', color: palette[data.contexts.length % palette.length], emoji: '' }); }
  function capturePatch(): Partial<Task> {
    return { contexts: activeContext ? [activeContext.id] : activeProject?.contexts ?? [], parentId: activeProject?.id ?? null, project: view === 'projects' };
  }
  async function capture(e: FormEvent) {
    e.preventDefault(); if (!quickTitle.trim()) return;
    const submitted = quickTitle;
    const task = newTask(submitted, capturePatch());
    const next = upsertTask(data, task);
    if (await save(next)) { setQuickTitle(current => current === submitted ? '' : current); quickRef.current?.focus(); }
  }
  async function saveTask(task: Task) {
    task = { ...task, title: task.title.trim() };
    if (await save(upsertTask(data, task))) setEditing(null);
  }
  function finishTaskDrag(event: DragEndEvent) {
    if (!reorderEnabled || !event.over || event.active.id === event.over.id) return;
    const from = tasks.findIndex(task => task.id === event.active.id);
    const to = tasks.findIndex(task => task.id === event.over!.id);
    if (from < 0 || to < 0) return;
    const orderedIds = arrayMove(tasks, from, to).map(task => task.id);
    void save(reorderTasks(data, orderedIds));
  }
  function finishContextDrag(event: DragEndEvent) {
    if (!contextReorderEnabled || !event.over || event.active.id === event.over.id) return;
    const from = data.contexts.findIndex(context => context.id === event.active.id);
    const to = data.contexts.findIndex(context => context.id === event.over!.id);
    if (from < 0 || to < 0) return;
    const orderedIds = arrayMove(data.contexts, from, to).map(context => context.id);
    void save(reorderContexts(data, orderedIds));
  }

  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mortal-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (authLoading) return <p className="loading" role="status">Loading…</p>;
  if (!demo && !session) return <PublicPage route={publicRoute} onDemo={() => { setDemo(true); setLoaded(true); }}/>;

  return <div className="app-shell">
    <header className="header">
      <div className="header-inner">
        <nav className="navigation" aria-label="Tasks and contexts">
          <button className={`nav-pill neutral ${view === 'all' ? 'active' : ''}`} aria-current={view === 'all' ? 'page' : undefined} onClick={() => navigate('all')}><House size={14}/>All</button>
          <button className={`nav-pill neutral ${view === 'projects' || activeProject ? 'active' : ''}`} aria-current={view === 'projects' || activeProject ? 'page' : undefined} onClick={() => navigate('projects')}><Folder size={14}/>Projects</button>
          {data.contexts.map(c => <button key={c.id} className={`nav-pill ${activeContext?.id === c.id ? 'active' : ''}`} style={contextStyle(c.color)} aria-current={activeContext?.id === c.id ? 'page' : undefined} onClick={() => navigate(`context:${c.id}`)}>{c.emoji && <span>{c.emoji}</span>}{c.name}</button>)}
        </nav>
        <div className="header-tools">
          {busy && <span className="sr-only" role="status">Saving…</span>}
          <button className={`icon-button ${searchOpen ? 'selected' : ''}`} aria-label="Search tasks" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setQuery(''); }}><Search size={18}/></button>
          <button className="icon-button" onClick={() => setSettings(true)} aria-label="Settings and account"><MoreHorizontal size={21}/></button>
        </div>
      </div>
    </header>
    <main className="main">
      <h1 className="sr-only">{title}</h1>
      {activeProject && <div className="project-breadcrumb"><button className="text-button" onClick={() => navigate('projects')} aria-label="Back to projects"><ArrowLeft size={15}/></button><span>{activeProject.title}</span><button className="icon-button" aria-label="Project details" onClick={() => setEditing(activeProject)}><Settings2 size={16}/></button></div>}
      {searchOpen && <div className="search-field"><Search size={17}/><input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this list" aria-label="Search this list"/><button className="icon-button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); }}><X size={17}/></button></div>}
      <form className="quick-add" onSubmit={capture}>
        <input ref={quickRef} value={quickTitle} onChange={e => setQuickTitle(e.target.value)} maxLength={240} placeholder={view === 'projects' ? 'Add a project' : activeProject ? 'Add a subtask' : 'Add a task'} aria-label={view === 'projects' ? 'New project title' : 'New task title'} disabled={!loaded} enterKeyHint="done"/>
        <button className="add-button" type="submit" disabled={!quickTitle.trim() || !loaded || busy} aria-label={view === 'projects' ? 'Add project' : 'Add task'}><Plus size={21}/></button>
      </form>
      {!loaded ? <div className="empty-state" role="status">{loadError ? <>Couldn’t load tasks. <button className="text-button" onClick={() => window.location.reload()}>Retry</button></> : 'Loading…'}</div> : tasks.length === 0 ? <p className="empty-state">{query ? 'No matches.' : 'No tasks.'}</p> : <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={finishTaskDrag}>
        <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
          <div className="task-list">{tasks.map(task => <SortableTaskRow
            key={task.id}
            task={task}
            data={data}
            busy={busy}
            reorderEnabled={reorderEnabled}
            onComplete={() => void save(completeTask(data, task.id), true)}
            onOpen={() => setEditing(task)}
            onOpenProject={() => navigate(`project:${task.id}`)}
          />)}</div>
        </SortableContext>
      </DndContext>}
      <div className="list-footer"><button className="text-button" aria-pressed={showCompleted} onClick={() => setShowCompleted(!showCompleted)}>{showCompleted ? 'Hide' : 'Show'} completed{completedCount > 0 ? ` (${completedCount})` : ''}</button></div>
    </main>
    {(notice || undo) && <div className="toast" role="status"><span>{notice || 'Saved.'}</span>{undo && !notice && <button className="text-button" disabled={busy} onClick={() => void save(undo)}>Undo</button>}<button className="icon-button" aria-label="Dismiss" onClick={() => { setNotice(''); setUndo(null); }}><X size={16}/></button></div>}
    {editing && <TaskEditor key={editing.id} task={editing} data={data} busy={busy} error={notice} onClose={() => setEditing(null)} onSave={saveTask} onDelete={async () => {
      if (await save(deleteTask(data, editing.id), true)) { if (activeProject?.id === editing.id) navigate('projects'); setEditing(null); }
    }}/>}
    {contextEdit && <ContextEditor key={contextEdit.id} context={contextEdit} data={data} busy={busy} error={notice} onClose={() => setContextEdit(null)} onSave={async c => {
      const exists = data.contexts.some(x => x.id === c.id);
      if (await save({ ...data, contexts: exists ? data.contexts.map(x => x.id === c.id ? c : x) : [...data.contexts, c] })) setContextEdit(null);
    }} onDelete={async () => {
      if (await save({ contexts: data.contexts.filter(c => c.id !== contextEdit.id), tasks: data.tasks.map(t => ({ ...t, contexts: t.contexts.filter(id => id !== contextEdit.id) })) }, true)) {
        if (activeContext?.id === contextEdit.id) navigate('all'); setContextEdit(null);
      }
    }}/>}
    {settings && <Modal title="Settings" onClose={() => setSettings(false)}>
      <div className="settings-content">
        <section><h3>Account</h3><p>{demo ? 'Local demo. Saved in this browser.' : session?.user.email}</p>
          {demo ? <button className="text-button" onClick={() => { setSettings(false); setAuthOpen(true); }}>Sign in / create account <ArrowRight size={16}/></button> : <button className="text-button" disabled={busy} onClick={async () => { const result = await supabase!.auth.signOut(); if (result.error) setNotice(result.error.message); else setSettings(false); }}><LogOut size={16}/> Sign out</button>}
        </section>
        <section>
          <h3>Contexts</h3>
          <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={finishContextDrag}>
            <SortableContext items={data.contexts.map(context => context.id)} strategy={verticalListSortingStrategy}>
              <div className="settings-contexts">
                {data.contexts.map(context => <SortableContextRow key={context.id} context={context} busy={busy} reorderEnabled={contextReorderEnabled} onEdit={() => { setSettings(false); setContextEdit(context); }}/>) }
              </div>
            </SortableContext>
          </DndContext>
          <button className="text-button add-context-button" disabled={!loaded || busy} onClick={() => { setSettings(false); newContext(); }}><Plus size={16}/> Add context</button>
          {notice && <p className="form-error" role="alert">{notice}</p>}
        </section>
        <section><h3>iPhone home screen</h3><p>Open Mortal in Safari. Tap Share → Add to Home Screen. Leave “Open as Web App” on if shown.</p></section>
        <section className="settings-export"><button className="text-button" disabled={!loaded} onClick={exportData}><ArrowDownToLine size={16}/> Export data</button><span className="keyboard-help">N to add · / to search</span></section>
      </div>
    </Modal>}
    {authOpen && <Modal title={recovery ? 'New password' : 'Account'} onClose={() => { setAuthOpen(false); setRecovery(false); }}>
      {supabase ? <AuthForm recovery={recovery} onDone={() => { setAuthOpen(false); setRecovery(false); }}/> : <div className="settings-content"><p>Accounts are not connected yet. Follow the Supabase setup in README.md to enable login and sync.</p><p>For now, tasks are saved on this device.</p></div>}
    </Modal>}
  </div>;
}

function TaskEditor({ task, data, busy, error, onClose, onSave, onDelete }: { task: Task; data: Data; busy: boolean; error: string; onClose: () => void; onSave: (t: Task) => Promise<void>; onDelete: () => Promise<void> }) {
  const [draft, setDraft] = useState(task);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const children = data.tasks.filter(t => t.parentId === task.id);
  return <Modal title={draft.project ? 'Edit project' : 'Edit task'} onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); void onSave(draft); }} className="editor-form">
      <label>Title<input required maxLength={240} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      <fieldset><legend>Contexts</legend><div className="context-picker">
        {data.contexts.map(c => <button type="button" key={c.id} style={contextStyle(c.color)} aria-pressed={draft.contexts.includes(c.id)} className={`nav-pill ${draft.contexts.includes(c.id) ? 'active' : 'unchosen'}`} onClick={() => setDraft({ ...draft, contexts: draft.contexts.includes(c.id) ? draft.contexts.filter(id => id !== c.id) : [...draft.contexts, c.id] })}>{c.emoji && <span>{c.emoji}</span>}{c.name}{draft.contexts.includes(c.id) && <Check size={13}/>}</button>)}
        {!data.contexts.length && <p className="muted">No contexts yet.</p>}
      </div></fieldset>
      {!draft.project && <label>Project<select value={draft.parentId ?? ''} onChange={e => setDraft({ ...draft, parentId: e.target.value || null })}><option value="">None</option>{data.tasks.filter(t => t.project && t.id !== task.id && (!t.completed || t.id === draft.parentId)).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
      <label className="project-switch"><span>Make this a project</span><input type="checkbox" role="switch" checked={draft.project} disabled={children.length > 0} onChange={e => setDraft({ ...draft, project: e.target.checked, parentId: e.target.checked ? null : draft.parentId })}/></label>
      {children.length > 0 && <p className="muted">{children.length} subtasks. Remove or move them before converting to a task.</p>}
      <dl className="task-dates">
        <div><dt>Created</dt><dd><time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></dd></div>
        {task.completed && <div><dt>Completed</dt><dd>{task.completedAt ? <time dateTime={task.completedAt}>{new Date(task.completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> : 'Not recorded (older task)'}</dd></div>}
      </dl>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="icon-button danger" disabled={busy} onClick={() => setConfirmDelete(true)} aria-label={draft.project ? 'Delete project' : 'Delete task'}><Trash2 size={18}/></button><div className="action-spacer"/><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !draft.title.trim()}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
    {confirmDelete && <div className="delete-confirm"><p>Delete this {draft.project ? 'project and all its subtasks' : 'task'}?</p><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void onDelete()}>Delete</button></div>}
  </Modal>;
}
function ContextEditor({ context, data, busy, error, onClose, onSave, onDelete }: { context: Context; data: Data; busy: boolean; error: string; onClose: () => void; onSave: (c: Context) => Promise<void>; onDelete: () => Promise<void> }) {
  const [draft, setDraft] = useState(context);
  const [confirm, setConfirm] = useState(false);
  const exists = data.contexts.some(c => c.id === context.id);
  const duplicate = data.contexts.some(c => c.id !== draft.id && c.name.toLowerCase() === draft.name.trim().toLowerCase());
  return <Modal title={exists ? 'Edit context' : 'New context'} onClose={onClose}>
    <form className="editor-form" onSubmit={e => { e.preventDefault(); if (!duplicate) void onSave({ ...draft, name: draft.name.trim() }); }}>
      <label>Name<input required maxLength={40} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      {duplicate && <p className="form-error">This context already exists.</p>}
      <div className="form-columns"><label>Emoji <span className="optional">optional</span><input maxLength={12} value={draft.emoji} onChange={e => setDraft({ ...draft, emoji: e.target.value })}/></label><label>Color<input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })}/></label></div>
      <div className="swatches">{palette.map(color => <button key={color} type="button" aria-label={`Choose ${color}`} aria-pressed={draft.color === color} style={{ background: color }} onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check size={16}/>}</button>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">{exists && <button type="button" className="icon-button danger" aria-label="Delete context" onClick={() => setConfirm(true)}><Trash2 size={18}/></button>}<div className="action-spacer"/><button className="primary-button" disabled={busy || duplicate || !draft.name.trim()}>{busy ? 'Saving…' : exists ? 'Save' : 'Add context'}</button></div>
    </form>
    {confirm && <div className="delete-confirm"><p>Delete this context? Its tasks will stay.</p><button className="secondary-button" onClick={() => setConfirm(false)}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void onDelete()}>Delete</button></div>}
  </Modal>;
}
function PublicPage({ route, onDemo }: { route: PublicRoute; onDemo: () => void }) {
  if (route === 'landing') return <main className="landing-page">
    <header className="public-header">
      <a className="wordmark" href="#">mortal</a>
      <nav aria-label="Account">
        <a className="public-link" href="#/login">Log in</a>
        <a className="public-button" href="#/register">Create account</a>
      </nav>
    </header>
    <section className="landing-hero">
      <p className="landing-kicker">TASKS, PROJECTS, CONTEXTS</p>
      <h1><span>Know what you can do</span><span>where you are.</span></h1>
      <p className="landing-copy">Mortal is a small task manager organized around contexts. Keep simple tasks loose, turn bigger ones into projects, and let finished work get out of the way.</p>
      <div className="landing-actions">
        <a className="public-button large" href="#/register">Create account <ArrowRight size={17}/></a>
        <a className="public-link large" href="#/login">Log in</a>
      </div>
      <p className="landing-footnote">No due dates. No priorities. No score.</p>
    </section>
  </main>;

  const initialMode = route === 'register' ? 'signup' : 'login';
  return <main className="auth-page">
    <a className="wordmark" href="#">mortal</a>
    <AuthForm key={route} initialMode={initialMode} onNavigate={mode => setPublicRoute(mode === 'signup' ? 'register' : 'login')} onDone={() => setPublicRoute('landing')}/>
    <button className="text-button demo-entry" onClick={onDemo}>Try the local demo <ArrowRight size={16}/></button>
  </main>;
}

function AuthForm({ onDone, recovery = false, initialMode = 'login', onNavigate }: { onDone: () => void; recovery?: boolean; initialMode?: 'login' | 'signup'; onNavigate?: (mode: 'login' | 'signup') => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'recovery'>(recovery ? 'recovery' : initialMode);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (recovery) setMode('recovery'); }, [recovery]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!supabase || busy) return; setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') { const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error) throw result.error; onDone(); }
      if (mode === 'signup') { const result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }); if (result.error) throw result.error; if (result.data.session) onDone(); else setMessage('Check your inbox for a verification link, then come back to sign in.'); }
      if (mode === 'reset') { const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (result.error) throw result.error; setMessage('If an account exists, a password reset link is on its way.'); }
      if (mode === 'recovery') { const result = await supabase.auth.updateUser({ password }); if (result.error) throw result.error; onDone(); }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  function switchMode(next: 'login' | 'signup') {
    setMode(next); setError(''); setMessage(''); onNavigate?.(next);
  }
  return <form className="auth-form editor-form" onSubmit={submit}><div><h2>{mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'New password'}</h2><p className="muted">{mode === 'login' ? 'Log in to your tasks.' : mode === 'signup' ? 'Verify your email to get started.' : 'Choose a secure password with at least 8 characters.'}</p></div>{mode !== 'recovery' && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>}{mode !== 'reset' && <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)}/></label>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Update password'}<ArrowRight size={16}/></button>{mode !== 'recovery' && <><button type="button" className="text-button" onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Already have an account? Log in' : 'New here? Create an account'}</button><button type="button" className="text-button" onClick={() => { if (mode === 'reset') switchMode('login'); else { setMode('reset'); setError(''); setMessage(''); } }}>{mode === 'reset' ? 'Back to log in' : 'Forgot your password?'}</button>{mode === 'signup' && message && <button type="button" className="text-button" disabled={busy} onClick={async () => { setBusy(true); const result = await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } }); if (result.error) setError(result.error.message); else setMessage('Verification email sent. Check your inbox.'); setBusy(false); }}>Resend verification email</button>}</>}</form>;
}
