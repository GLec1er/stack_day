const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c={URL};vm.createContext(c);for(const f of ['model.js','learning-model.js','control-model.js','control-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+f),'utf8'),c);
const m=c.GoalsModel,ui=c.ControlUI,date='2026-10-14';
const goal=(id,kind)=>({id,title:id,category:'it',horizon:'day',kind,date,recurrence:'daily',steps:['Шаг'],completions:{}});
const state=(...goals)=>({version:1,schemaRevision:3,goals,notes:{}});

test('day closure waits for extra daily tasks beyond the reading baseline and disappears after undo',()=>{
  const a=goal('a','system'),b=goal('b','algorithms'),extra=goal('extra','practice'),s=state(a,b,extra);
  m.toggleDone(a,date);m.toggleDone(b,date);
  assert.equal(ui.dayClosure(s,date,date,'day'),'');
  m.toggleDone(extra,date);const before=JSON.stringify(s);
  assert.match(ui.dayClosure(s,date,date,'day'),/3 \/ 3/);
  assert.equal(JSON.stringify(s),before);
  m.toggleDone(extra,date);assert.equal(ui.dayClosure(s,date,date,'day'),'');
});

test('no-task days, planned rest and future backup marks do not announce a completed day',()=>{
  assert.equal(ui.dayClosure(state(),date,date,'day'),'');
  const g=goal('a','system');m.skipOccurrence(g,date,true);
  assert.equal(ui.dayClosure(state(g),date,date,'day'),'');
  const future=goal('f','algorithms');m.toggleDone(future,date);
  assert.equal(ui.dayClosure(state(future),'2026-10-13',date,'day'),'');
});

test('unfinished monthly goals do not block the daily closure, and other tabs do not display it',()=>{
  const g=goal('a','system'),monthly={...goal('month','project'),horizon:'month',recurrence:'monthly'},s=state(g,monthly);m.toggleDone(g,date);
  assert.match(ui.dayClosure(s,date,date,'day'),/1 \/ 1/);
  for(const view of ['month','achievements','archive'])assert.equal(ui.dayClosure(s,date,date,view),'');
});

test('a closed selected day has its own date and does not close the following day',()=>{
  const g=goal('a','review'),s=state(g);m.toggleDone(g,date);
  assert.match(ui.dayClosure(s,'2026-10-15',date,'day'),/14 окт/);
  assert.equal(ui.dayClosure(s,'2026-10-15','2026-10-15','day'),'');
});
