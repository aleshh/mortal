import test from 'node:test';
import assert from 'node:assert/strict';
import { completeTask, deleteTask, moveContext, newTask, normalizeData, upsertTask, visibleTasks, type Data } from './model';
function fixture(): Data { return { contexts: [{ id: 'home', name: 'Home', color: '#000000', emoji: '' }], tasks: [newTask('Project', { id: 'p', project: true, contexts: ['home'] }), newTask('Step', { id: 's', parentId: 'p', contexts: ['home'] }), newTask('Unsorted', { id: 'u' })] }; }
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
  const task = newTask('Newest', { contexts: ['home'], parentId: 'p' });
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
