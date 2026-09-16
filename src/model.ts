export type Context = { id: string; name: string; color: string; emoji: string };
export type Task = { id: string; title: string; contexts: string[]; project: boolean; parentId: string | null; completed: boolean; createdAt: string; completedAt: string | null };
export type Data = { tasks: Task[]; contexts: Context[] };
export const palette = ['#65836b', '#c59155', '#738caf', '#a982a1', '#b77766', '#699a99', '#a69a50'];
export const uid = () => crypto.randomUUID();
export const newTask = (title: string, patch: Partial<Task> = {}): Task => ({ id: uid(), title: title.trim(), contexts: [], project: false, parentId: null, completed: false, createdAt: new Date().toISOString(), completedAt: patch.completed ? new Date().toISOString() : null, ...patch });
export function hasOpenChildren(task: Task, tasks: Task[]): boolean { return tasks.some(t => t.parentId === task.id && !t.completed); }
export function isActionable(task: Task, tasks: Task[]): boolean { return !task.completed && !hasOpenChildren(task, tasks); }
export function visibleTasks(data: Data, view: string, showCompleted = false): Task[] {
  return data.tasks.filter(t => {
    if (t.completed && !showCompleted) return false;
    if (view === 'projects') return t.project;
    if (view.startsWith('project:')) return t.parentId === view.slice(8);
    if (!t.completed && !isActionable(t, data.tasks)) return false;
    if (view === 'all') return true;
    if (view.startsWith('context:')) return t.contexts.includes(view.slice(8));
    return false;
  });
}
export function completeTask(data: Data, id: string): Data {
  const task = data.tasks.find(t => t.id === id);
  if (!task || (!task.completed && hasOpenChildren(task, data.tasks))) return data;
  const reopening = task.completed;
  const ancestors = new Set<string>();
  let parentId = task.parentId;
  while (parentId && !ancestors.has(parentId)) { ancestors.add(parentId); parentId = data.tasks.find(t => t.id === parentId)?.parentId ?? null; }
  return { ...data, tasks: data.tasks.map(t => t.id === id ? { ...t, completed: !t.completed, completedAt: reopening ? null : new Date().toISOString() } : reopening && ancestors.has(t.id) ? { ...t, completed: false, completedAt: null } : t) };
}
export function deleteTask(data: Data, id: string): Data {
  const ids = new Set([id]);
  let count = 0;
  while (count !== ids.size) { count = ids.size; data.tasks.forEach(t => { if (t.parentId && ids.has(t.parentId)) ids.add(t.id); }); }
  return { ...data, tasks: data.tasks.filter(t => !ids.has(t.id)) };
}
export function seedData(): Data {
  const contexts: Context[] = [
    { id: 'work', name: 'Work', color: palette[0], emoji: '💻' },
    { id: 'home', name: 'Home', color: palette[1], emoji: '🏡' },
    { id: 'out', name: 'Out & about', color: palette[2], emoji: '🚲' },
    { id: 'personal', name: 'Personal', color: palette[3], emoji: '🌱' },
  ];
  const p1 = newTask('Give the living room a little love', { id: 'living', project: true, contexts: ['home'] });
  const p2 = newTask('Launch the portfolio refresh', { id: 'portfolio', project: true, contexts: ['work'] });
  return { contexts, tasks: [
    newTask('Sketch a few ideas for the portfolio', { contexts: ['work'], parentId: 'portfolio' }),
    newTask('Find a good spot for the reading lamp', { contexts: ['home'], parentId: 'living' }),
    newTask('Take those books back to the library', { contexts: ['out', 'personal'] }),
    newTask('Make a playlist for slow mornings', { contexts: ['personal'] }),
    newTask('Get back to Sam about the weekend', { contexts: ['personal'] }),
    newTask('Clear the downloads folder', { contexts: ['work'] }),
    newTask('Try the little bakery on the corner', { contexts: ['out'] }),
    newTask('A place to keep interesting recipes'),
    newTask('Ask about the workshop space', { contexts: ['work'] }),
    newTask('Learn to make a really good sourdough', { contexts: ['home', 'personal'] }),
    p1, p2,
    newTask('Choose a direction for the new site', { contexts: ['work'], parentId: 'portfolio', completed: true }),
  ] };
}

// Keep existing tasks and contexts when upgrading from the notes/status version.
export function normalizeData(data: Data): Data {
  return { contexts: data.contexts, tasks: data.tasks.map(task => ({
    id: task.id, title: task.title, contexts: task.contexts, project: task.project,
    parentId: task.parentId, completed: task.completed, createdAt: task.createdAt, completedAt: task.completed ? task.completedAt ?? null : null,
  })) };
}

export function upsertTask(data: Data, task: Task): Data {
  const exists = data.tasks.some(t => t.id === task.id);
  const tasks = exists ? data.tasks.map(t => t.id === task.id ? task : t) : [task, ...data.tasks];
  return { ...data, tasks: tasks.map(t => t.id === task.parentId && !task.completed ? { ...t, completed: false, completedAt: null } : t) };
}

export function moveContext(data: Data, id: string, offset: -1 | 1): Data {
  const from = data.contexts.findIndex(context => context.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= data.contexts.length) return data;

  const contexts = [...data.contexts];
  [contexts[from], contexts[to]] = [contexts[to], contexts[from]];
  return { ...data, contexts };
}

export function reorderContexts(data: Data, orderedIds: string[]): Data {
  if (orderedIds.length !== data.contexts.length || new Set(orderedIds).size !== orderedIds.length) return data;
  const contexts = orderedIds.map(id => data.contexts.find(context => context.id === id));
  if (contexts.some(context => !context)) return data;
  return { ...data, contexts: contexts as Context[] };
}

export function reorderTasks(data: Data, orderedIds: string[]): Data {
  const ids = new Set(orderedIds);
  if (ids.size !== orderedIds.length) return data;

  const orderedTasks = orderedIds.map(id => data.tasks.find(task => task.id === id));
  if (orderedTasks.some(task => !task)) return data;

  const positions = data.tasks
    .map((task, index) => ids.has(task.id) ? index : -1)
    .filter(index => index >= 0);
  if (positions.length !== orderedTasks.length) return data;

  const tasks = [...data.tasks];
  positions.forEach((position, index) => { tasks[position] = orderedTasks[index]!; });
  return { ...data, tasks };
}
