const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../model.js'),'utf8'),ctx);
const m=ctx.GoalsModel;
const goal=(id,priority,extra={})=>({id,priority,horizon:'day',steps:[],completions:{},...extra});

test('unfinished goals sort by priority before favourites; completed goals stay below every unfinished goal',()=>{
  assert.equal(typeof m.sortGoals,'function');
  const goals=[goal('low','low'),goal('normal-favourite','normal',{favorite:true}),goal('high','high'),goal('done-high','high',{completions:{'2026-10-17':{done:true,steps:[]}}})];
  assert.deepEqual(Array.from(m.sortGoals(goals,'2026-10-17'),g=>g.id),['high','normal-favourite','low','done-high']);
  assert.deepEqual(goals.map(g=>g.id),['low','normal-favourite','high','done-high'],'sorting does not mutate the stored plan');
});

test('old goals without a recognised priority use normal priority instead of jumping above high goals',()=>{
  assert.equal(typeof m.priorityOf,'function');
  assert.equal(m.priorityOf({}), 'normal');assert.equal(m.priorityOf({priority:'urgent'}),'normal');
  const goals=[goal('old',undefined),goal('low','low'),goal('high','high')];
  assert.deepEqual(Array.from(m.sortGoals(goals,'2026-10-17'),g=>g.id),['high','old','low']);
});
