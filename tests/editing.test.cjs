const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c={URL};vm.createContext(c);for(const f of ['model.js','learning-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+f),'utf8'),c);
const m=c.GoalsModel,l=c.LearningModel;
const goal=()=>({id:'a',title:'Чтение',category:'it',horizon:'day',kind:'system',date:'2026-10-01',recurrence:'weekdays',steps:['Прочитать','Конспект'],completions:{}});
const state=g=>({version:1,schemaRevision:3,goals:[g],notes:{}});
test('changing a partially completed daily goal to month preserves a readable daily history',()=>{
 const g=goal(),s=state(g);m.toggleStep(g,'2026-10-13',0);m.editGoal(s,g.id,{...g,horizon:'month',recurrence:'monthly'},'all','2026-10-13');
 const restored=m.validateState(JSON.parse(JSON.stringify(s)));assert.equal(restored.goals[0].completions['2026-10-13'].horizon,'day');assert.equal(restored.goals[0].completions['2026-10-13'].done,false);assert.equal(m.progress(restored.goals[0],'2026-10-13').done,false);
});
test('removing an unchecked step never completes an old monthly record or awards backdated XP',()=>{
 const g={...goal(),horizon:'month',recurrence:'monthly',completions:{'2026-10':{done:false,steps:[true,false]}}},s=state(g);m.editGoal(s,g.id,{...g,steps:['Прочитать']},'all','2026-10-13');
 assert.equal(g.completions['2026-10'].done,false);assert.equal(m.journal(s,'2026-10-13').xp,0);
});
test('completed records retain original steps and kind when the template is edited',()=>{
 const g=goal(),s=state(g);m.toggleDone(g,'2026-10-12');m.editGoal(s,g.id,{...g,steps:['Новый шаг'],kind:'project'},'all','2026-10-13');
 assert.deepEqual(Array.from(m.progress(g,'2026-10-12').steps),[true,true]);assert.equal(m.journal(s,'2026-10-13').xp,40);assert.equal(g.completions['2026-10-12'].stepLabels[0],'Прочитать');
});
test('creation from achievements and archive defaults to a valid daily period',()=>{assert.equal(m.defaultHorizon('achievements'),'day');assert.equal(m.defaultHorizon('archive'),'day');assert.equal(m.defaultHorizon('month'),'month');});
test('invalid edited period is rejected without mutating the plan',()=>{const g=goal(),s=state(g),before=JSON.stringify(s);assert.throws(()=>m.editGoal(s,g.id,{...g,horizon:''},'all','2026-10-13'));assert.equal(JSON.stringify(s),before);});
test('known corrupted period keys are repaired while retaining all original goals and results',()=>{
 const g=goal();g.horizon='month';g.recurrence='monthly';g.completions={'2026-10-12':{done:false,steps:[true,false]}};const b={...goal(),id:'b',horizon:'',recurrence:'none'};
 const s=m.repairState({version:1,schemaRevision:3,goals:[g,b],notes:{}});assert.equal(s.goals.length,2);assert.equal(s.goals[0].completions['2026-10-12'].horizon,'day');assert.equal(s.goals[1].horizon,'day');assert.doesNotThrow(()=>m.validateState(s));
});
test('skill suggestions preserve a manually typed plan and only fill empty text',()=>{assert.equal(l.suggestTopic('Мой план: LRU и LFU',{hint:'Разобрать TTL'}),'Мой план: LRU и LFU');assert.equal(l.suggestTopic('',{hint:'Разобрать TTL'}),'Разобрать TTL');});
