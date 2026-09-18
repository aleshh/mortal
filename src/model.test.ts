import test from 'node:test';
import assert from 'node:assert/strict';
import { completeTask, deleteTask, moveAllTask, moveContext, moveProjectTask, taskProjectEmoji, newTask, normalizeData, reorderContexts, reorderTasks, upsertTask, visibleTasks, type Data } from './model';
function fixture(): Data { return { contexts: [{ id: 'home', name: 'Home', color: '#000000', emoji: '' }], tasks: [newTask('Project', { id: 'p', project: true, contexts: ['home'] }), newTask('Step', { id: 's', parentId: 'p', nextAction: true, contexts: ['home'] }), newTask('Unsorted', { id: 'u' })] }; }
const ids = (data: Data, view: string, completed = false) => visibleTasks(data, view, completed).map(t => t.id);
test('a project with open steps appears only in Projects, not action or context lists', () => { const d = fixture(); assert.deepEqual(ids(d, 'projects'), ['p']); assert.deepEqual(ids(d, 'all'), ['s', 'u']); assert.deepEqual(ids(d, 'context:home'), ['s']); assert.deepEqual(ids(d, 'project:p'), ['s']); });
test('finishing the last step returns the project to main and context lists', () => { const d = completeTask(fixture(), 's'); assert.deepEqual(ids(d, 'all'), ['p', 'u']); assert.deepEqual(ids(d, 'context:home'), ['p']); assert.deepEqual(ids(d, 'projects'), ['p']); });
test('a project cannot be completed while a step is open', () => { const d = fixture(); assert.equal(completeTask(d, 'p'), d); });
test('completed projects hide and can be shown; reopening a step reopens its project', () => { const done = completeTask(completeTask(fixture(), 's'), 'p'); assert.deepEqual(ids(done, 'projects'), []); assert.deepEqual(ids(done, 'projects', true), ['p']); const reopened = completeTask(done, 's'); assert.equal(reopened.tasks.find(t => t.id === 'p')?.completed, false); assert.deepEqual(ids(reopened, 'all'), ['s', 'u']); });
test('multiple contexts do not duplicate tasks and no-context tasks remain in the main list', () => { const d = fixture(); d.tasks[1].contexts.push('work'); assert.deepEqual(ids(d, 'context:work'), ['s']); assert.equal(ids(d, 'all').filter(id => id === 's').length, 1); assert.ok(ids(d, 'all').includes('u')); });
test('deleting a project removes all descendants and preserves unrelated tasks', () => { const d = fixture(); d.tasks.push(newTask('Nested', { id: 'nested', parentId: 's' })); assert.deepEqual(deleteTask(d, 'p').tasks.map(t => t.id), ['u']); });
test('an empty project is an actionable task and a project', () => { const d = fixture(); d.tasks = d.tasks.filter(t => t.id !== 's'); assert.ok(ids(d, 'all').includes('p')); assert.ok(ids(d, 'context:home').includes('p')); assert.ok(ids(d, 'projects').includes('p')); });

test('upgrading keeps legacy category tasks visible and removes obsolete fields', () => {
  const legacy = fixture();
  Object.assign(legacy.tasks[2], { status: 'someday', notes: 'Old note' });
  const migrated = normalizeData(legacy);
  assert.deepEqual(ids(migrated, 'all'), ['s', 'u']);
  assert.equal('notes' in migrated.tasks[2], false);
  assert.equal('status' in migrated.tasks[2], false);
  assert.deepEqual(migrated.contexts, legacy.contexts);
  assert.equal(migrated.tasks[1].parentId, 'p');
});

test('completion records a timestamp and reopening clears it on the task and its parent', () => {
  const original = fixture();
  const created = original.tasks[1].createdAt;
  const completed = completeTask(completeTask(original, 's'), 'p');
  assert.ok(Number.isFinite(Date.parse(completed.tasks[1].completedAt!)));
  assert.ok(completed.tasks[0].completedAt);
  assert.equal(completed.tasks[1].createdAt, created);
  const reopened = completeTask(completed, 's');
  assert.equal(reopened.tasks[1].completedAt, null);
  assert.equal(reopened.tasks[0].completedAt, null);
});

test('older completed tasks do not get fabricated completion dates', () => {
  const d = fixture();
  const legacy = { ...d.tasks[1], completed: true } as Partial<typeof d.tasks[1]>;
  delete legacy.completedAt;
  d.tasks[1] = legacy as typeof d.tasks[1];
  assert.equal(normalizeData(d).tasks[1].completedAt, null);
});

test('new tasks go first in All, contexts, and project lists; editing preserves order', () => {
  const d = fixture();
  const task = newTask('Newest', { contexts: ['home'], parentId: 'p', nextAction: true });
  const added = upsertTask(d, task);
  for (const view of ['all', 'context:home', 'project:p']) assert.equal(ids(added, view)[0], task.id);
  const edited = upsertTask(added, { ...d.tasks[2], title: 'Edited' });
  assert.equal(ids(edited, 'all')[0], task.id);
  const project = newTask('New project', { project: true });
  assert.equal(ids(upsertTask(edited, project), 'projects')[0], project.id);
});

test('adding a subtask reopens a completed project and clears its completion date', () => {
  const done = completeTask(completeTask(fixture(), 's'), 'p');
  const updated = upsertTask(done, newTask('Another step', { parentId: 'p' }));
  const parent = updated.tasks.find(t => t.id === 'p')!;
  assert.equal(parent.completed, false);
  assert.equal(parent.completedAt, null);
});

test('contexts can move earlier and later without changing task assignments', () => {
  const data = fixture();
  data.contexts.push(
    { id: 'work', name: 'Work', color: '#111111', emoji: '💻' },
    { id: 'out', name: 'Out', color: '#222222', emoji: '🚲' },
  );
  data.tasks[1].contexts.push('work');

  const earlier = moveContext(data, 'work', -1);
  assert.deepEqual(earlier.contexts.map(context => context.id), ['work', 'home', 'out']);
  assert.deepEqual(earlier.tasks[1].contexts, ['home', 'work']);

  const later = moveContext(earlier, 'work', 1);
  assert.deepEqual(later.contexts.map(context => context.id), ['home', 'work', 'out']);
  assert.equal(moveContext(later, 'home', -1), later);
  assert.equal(moveContext(later, 'out', 1), later);
});

test('contexts can be reordered by id without changing task assignments', () => {
  const data = fixture();
  data.contexts.push(
    { id: 'work', name: 'Work', color: '#111111', emoji: '💻' },
    { id: 'out', name: 'Out', color: '#222222', emoji: '🚲' },
  );
  data.tasks[1].contexts.push('work');

  const reordered = reorderContexts(data, ['out', 'home', 'work']);
  assert.deepEqual(reordered.contexts.map(context => context.id), ['out', 'home', 'work']);
  assert.deepEqual(reordered.tasks[1].contexts, ['home', 'work']);
  assert.equal(reorderContexts(data, ['home', 'missing', 'out']), data);
});

test('reordering a visible task subset preserves hidden tasks and task data', () => {
  const data = fixture();
  data.tasks.splice(1, 0, newTask('Hidden step', { id: 'hidden', parentId: 'other-project' }));
  const reordered = reorderTasks(data, ['u', 's']);

  assert.deepEqual(reordered.tasks.map(task => task.id), ['p', 'hidden', 'u', 's']);
  assert.deepEqual(reordered.tasks.find(task => task.id === 's')?.contexts, ['home']);
});

test('invalid reorder requests leave task data unchanged', () => {
  const data = fixture();
  assert.equal(reorderTasks(data, ['s', 's']), data);
  assert.equal(reorderTasks(data, ['missing']), data);
});


test('project tasks only appear on home when promoted, while contexts retain all steps', () => {
  const data = fixture();
  const step = newTask('Later', { id: 'later', parentId: 'p', contexts: ['home'] });
  data.tasks.push(step);
  assert.deepEqual(ids(data, 'all'), ['s', 'u']);
  assert.deepEqual(ids(data, 'context:home'), ['s', 'later']);
  assert.deepEqual(ids(data, 'project:p'), ['s', 'later']);
  const promoted = moveProjectTask(data, 'p', 'later', true, 's');
  assert.deepEqual(ids(promoted, 'all'), ['later', 'u', 's']);
  const demoted = moveProjectTask(promoted, 'p', 'later', false);
  assert.deepEqual(ids(demoted, 'all'), ['u', 's']);
  assert.ok(ids(demoted, 'project:p').includes('later'));
  assert.ok(!ids(completeTask(demoted, 'later'), 'all', true).includes('later'));
});

test('moving the only project task works with empty sections and survives reload', () => {
  const data = fixture();
  const demoted = moveProjectTask(data, 'p', 's', false);
  assert.deepEqual(ids(demoted, 'all'), ['u']);
  const promoted = normalizeData(JSON.parse(JSON.stringify(moveProjectTask(demoted, 'p', 's', true))));
  assert.deepEqual(ids(promoted, 'all'), ['s', 'u']);
  assert.equal(moveProjectTask(data, 'other', 's', false), data);
  assert.equal(moveProjectTask(data, 'p', 'u', true), data);
});

test('section reordering preserves other tasks and promotion flags', () => {
  const data = fixture();
  data.tasks.push(newTask('Second', { id: 'second', parentId: 'p', nextAction: true }));
  const moved = moveProjectTask(data, 'p', 's', true, 'second');
  assert.deepEqual(ids(moved, 'project:p'), ['second', 's']);
  assert.deepEqual(moved.tasks.find(t => t.id === 'u'), data.tasks.find(t => t.id === 'u'));
  assert.equal(moved.tasks.find(t => t.id === 's')?.nextAction, true);
});

test('All tasks can move between Today and Other tasks while preserving project visibility rules', () => {
  const data = fixture();
  const today = moveAllTask(data, 'u', true, 's');
  assert.deepEqual(ids(today, 'all'), ['u', 's']);
  assert.equal(today.tasks.find(t => t.id === 'u')?.nextAction, true);

  const later = moveAllTask(today, 's', false);
  assert.deepEqual(ids(later, 'all'), ['u']);
  assert.equal(later.tasks.find(t => t.id === 's')?.nextAction, false);
  assert.deepEqual(ids(later, 'project:p'), ['s']);
  assert.equal(moveAllTask(data, 'p', true), data);
});

test('older tasks default to the project backlog and new project fields persist', () => {
  const data = fixture();
  const legacy = { ...data.tasks[1] } as Partial<typeof data.tasks[1]>;
  delete legacy.nextAction;
  delete legacy.emoji;
  data.tasks[1] = legacy as typeof data.tasks[1];
  data.tasks[0].emoji = '🏡';
  const restored = normalizeData(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.tasks[1].nextAction, false);
  assert.equal(restored.tasks[1].emoji, '');
  assert.equal(restored.tasks[0].emoji, '🏡');
  assert.deepEqual(ids(restored, 'all'), ['u']);
});

test('project emoji prefixes tasks only outside their own project view', () => {
  const data = fixture();
  data.tasks[0].emoji = '🏡';
  for (const view of ['all', 'context:home', 'project:other']) {
    assert.equal(taskProjectEmoji(data.tasks[1], data, view), '🏡');
  }
  assert.equal(taskProjectEmoji(data.tasks[1], data, 'project:p'), '');
  assert.equal(taskProjectEmoji(data.tasks[0], data, 'projects'), '🏡');
  assert.equal(taskProjectEmoji(data.tasks[2], data, 'all'), '');
});
