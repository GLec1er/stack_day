const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modelPath = require('node:path').join(__dirname, '../model.js');
const context = { console, Intl, Date, Math, JSON, Object, Array, Set, Map, String, Number, Boolean };
vm.createContext(context);
if (fs.existsSync(modelPath)) vm.runInContext(fs.readFileSync(modelPath, 'utf8'), context);
const m = context.GoalsModel || {};
test('weeks start on Monday across a year boundary', () => {
  assert.equal(typeof m.periodKey, 'function', 'period logic is not implemented');
  assert.equal(m.periodKey('week', '2027-01-01'), '2026-12-28');
  assert.equal(m.periodKey('week', '2026-10-18'), '2026-10-12');
  assert.equal(m.periodKey('month', '2026-10-31'), '2026-10');
});
test('recurring daily goal appears only from its start; weekdays exclude weekends', () => {
  assert.equal(typeof m.occurs, 'function', 'recurrence logic is not implemented');
  const goal = { horizon: 'day', date: '2026-10-12', recurrence: 'weekdays', archived: false };
  assert.equal(m.occurs(goal, 'day', '2026-10-11'), false);
  assert.equal(m.occurs(goal, 'day', '2026-10-13'), true);
  assert.equal(m.occurs(goal, 'day', '2026-10-17'), false);
  assert.equal(m.occurs({ ...goal, recurrence: 'daily' }, 'day', '2026-10-17'), true);
  assert.equal(m.occurs({ ...goal, recurrence: 'none' }, 'day', '2026-10-13'), false);
});
test('completing one recurring occurrence leaves the next day and other goals untouched', () => {
  assert.equal(typeof m.toggleDone, 'function', 'completion is not implemented');
  const goal = { id: 'a', horizon: 'day', date: '2026-10-12', steps: ['a', 'b'], completions: {} };
  m.toggleDone(goal, '2026-10-12');
  assert.equal(m.progress(goal, '2026-10-12').done, true);
  assert.equal(m.progress(goal, '2026-10-13').done, false);
  assert.equal(m.progress(goal, '2026-10-12').steps.filter(Boolean).length, 2);
  m.toggleStep(goal, '2026-10-12', 0);
  assert.equal(m.progress(goal, '2026-10-12').done, false);
  assert.equal(m.progress(goal, '2026-10-12').steps[1], true);
});
test('import rejects invalid dates and duplicate ids before replacing saved data', () => {
  assert.equal(typeof m.validateState, 'function', 'backup validation is not implemented');
  const goal = {id:'a', title:'Учить английский', horizon:'day', date:'2026-10-12', category:'english', recurrence:'none', steps:[], completions:{}};
  assert.equal(m.validateState({version:1, goals:[goal], notes:{}}).goals[0].title, 'Учить английский');
  assert.throws(() => m.validateState({version:1, goals:[{...goal,date:'2026-02-30'}]}));
  assert.throws(() => m.validateState({version:1, goals:[goal,goal]}));
  assert.throws(() => m.validateState({version:1, goals:[{...goal,title:''}]}));
  assert.throws(() => m.validateState({version:1, goals:[{...goal,completions:{'2026-10-12':{done:'false',steps:[]}}}]}));
});
test('IT focus removes other directions while preserving IT progress, archives and notes', () => {
  assert.equal(typeof m.itOnlyState, 'function', 'IT-only migration is not implemented');
  const goal = {id:'it', title:'Разобрать алгоритмы', horizon:'day', date:'2026-10-12', category:'it', recurrence:'none', steps:['Решить задачу'], archived:true, completions:{'2026-10-12':{done:true,steps:[true]}}};
  const mixed = {version:1,goals:[goal,...['english','sport','work','personal'].map(category=>({...goal,id:category,category,title:category}))],notes:{'day:2026-10-12':'Разобрать бинарный поиск'}};
  const focused = m.itOnlyState(mixed);
  assert.deepEqual(Array.from(focused.goals,g=>g.id), ['it']);
  assert.equal(focused.goals[0].archived, true);
  assert.equal(focused.goals[0].completions['2026-10-12'].done, true);
  assert.equal(focused.notes['day:2026-10-12'], 'Разобрать бинарный поиск');
  assert.equal(focused.focus, 'it');
  assert.equal(mixed.goals.length, 5, 'original backup remains unchanged');
});
test('restoring an old mixed backup cannot reintroduce non-IT goals', () => {
  assert.equal(typeof m.itOnlyState, 'function', 'IT-only import is not implemented');
  const old = {version:1,goals:[{id:'english',title:'Урок',horizon:'day',date:'2026-10-12',category:'english',recurrence:'none',steps:[],completions:{}}],notes:{}};
  assert.equal(m.itOnlyState(old).goals.length, 0);
  assert.equal(m.itOnlyState(m.itOnlyState(old)).goals.length, 0);
});
