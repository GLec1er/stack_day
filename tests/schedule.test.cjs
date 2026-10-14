const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx={URL};vm.createContext(ctx);
for(const f of ['model.js','learning-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
const m=ctx.GoalsModel,l=ctx.LearningModel;
const goal=(id,kind,extra={})=>({id,kind,title:kind,category:'it',horizon:'day',date:'2026-01-01',recurrence:'daily',steps:['Материал','Конспект'],minutes:60,completions:{},archived:false,...extra});
const state=goals=>({version:1,schemaRevision:2,goals,notes:{}});

test('weekday readings and weekend review replace daily reading and weekly review, including January 31',()=>{
  const s=m.upgradeState(state([goal('system','system'),goal('algorithms','algorithms'),goal('review','review',{horizon:'week',recurrence:'weekly',date:'2026-01-03'})]),'2026-10-13');
  const kinds=date=>Array.from(s.goals.filter(g=>m.occurs(g,'day',date)),g=>g.kind);
  assert.deepEqual(kinds('2026-01-30'),['system','algorithms']);
  assert.deepEqual(kinds('2026-01-31'),['review']);
  assert.deepEqual(kinds('2026-02-01'),['review']);
  assert.deepEqual(kinds('2026-02-02'),['system','algorithms']);
  assert.equal(s.goals.some(g=>g.horizon==='week'),false);
  assert.doesNotThrow(()=>m.validateState(s));
});

test('Saturday and Sunday review completion are independent and next weekend starts empty',()=>{
  const g=goal('review','review',{recurrence:'weekends',date:'2026-01-03'});
  assert.equal(m.occurs(g,'day','2026-01-31'),true);
  assert.equal(m.occurs(g,'day','2026-02-01'),true);
  assert.equal(m.occurs(g,'day','2026-02-02'),false);
  m.toggleDone(g,'2026-01-31');
  assert.equal(m.progress(g,'2026-01-31').done,true);
  assert.equal(m.progress(g,'2026-02-01').done,false);
  assert.equal(m.progress(g,'2026-02-07').done,false);
});

test('migration keeps award date, learning entry and weekly note while remaining idempotent',()=>{
  const g=goal('review','review',{horizon:'week',recurrence:'weekly',date:'2026-10-17'});
  m.toggleDone(g,'2026-10-14');
  l.saveEntry(g,'2026-10-14',{topic:'Очереди',result:'Разобрал доставку',nextStep:'Проверить дубликаты'});
  const old=state([g]);old.notes={'week:2026-10-12':'Повторить схемы','day:2026-10-17':'Моя заметка'};
  const s=m.upgradeState(old,'2026-10-15');
  assert.equal(s.goals[0].horizon,'day');
  const j=m.journal(s,'2026-10-15');
  assert.equal(j.xp,25);assert.equal(j.events[0].date,'2026-10-14');
  assert.equal(l.records(s,'2026-10-15')[0].entry.result,'Разобрал доставку');
  assert.equal(l.records(s,'2026-10-15')[0].entry.date,'2026-10-14');
  assert.match(s.notes['day:2026-10-17'],/Моя заметка/);assert.match(s.notes['day:2026-10-17'],/Повторить схемы/);
  assert.equal(s.notes['week:2026-10-12'],'Повторить схемы');
  assert.equal(JSON.stringify(m.upgradeState(s,'2026-10-16')),JSON.stringify(s));
  assert.equal(old.goals[0].horizon,'week');
  assert.doesNotThrow(()=>m.validateState(s));
});

test('weekly non-review goal moves to its dated weekday; monthly and archive data survive',()=>{
  const month=goal('project','project',{horizon:'month',recurrence:'monthly',date:'2026-01-31'});
  const archived=goal('archived','review',{horizon:'week',recurrence:'weekly',archived:true,date:'2026-01-03'});
  const s=m.upgradeState(state([goal('code','practice',{horizon:'week',recurrence:'weekly',date:'2026-01-09'}),month,archived]),'2026-10-13');
  const code=s.goals.find(g=>g.id==='code');
  assert.equal(code.horizon,'day');assert.equal(m.occurs(code,'day','2026-01-16'),true);assert.equal(m.occurs(code,'day','2026-01-17'),false);
  assert.equal(s.goals.find(g=>g.id==='project').horizon,'month');
  assert.equal(s.goals.find(g=>g.id==='archived').archived,true);
  assert.equal(s.goals.filter(g=>g.kind==='review').length,1,'archived review is not recreated');
});

test('fresh plan has weekday readings and weekend review; an archive is not resurrected on reload',()=>{
  const s=m.upgradeState({version:1,goals:[],notes:{}},'2026-10-13');
  assert.deepEqual(Array.from(s.goals.filter(g=>m.occurs(g,'day','2026-10-17')),g=>g.kind),['review']);
  s.goals.forEach(g=>g.archived=true);
  const again=m.upgradeState(s,'2026-10-14');
  assert.equal(again.goals.length,3);assert.equal(again.goals.every(g=>g.archived),true);
});

test('five weekday readings and two reviews form a seven-day streak; review undo breaks it',()=>{
  const a=goal('system','system',{recurrence:'weekdays'}),b=goal('algorithms','algorithms',{recurrence:'weekdays'}),r=goal('review','review',{recurrence:'weekends'});
  for(const d of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09']){m.toggleDone(a,d);m.toggleDone(b,d);}
  m.toggleDone(r,'2026-10-10');m.toggleDone(r,'2026-10-11');
  const s=state([a,b,r]),j=m.journal(s,'2026-10-12');
  assert.equal(j.streak,7);assert.equal(j.xp,450);assert.equal(j.days['2026-10-10'].full,true);
  assert.equal(j.achievements.find(a=>a.id==='streak7').unlockedOn,'2026-10-11');
  assert.equal(j.achievements.find(a=>a.id==='double').progress,1);
  assert.equal(j.achievements.find(a=>a.id==='review').unlockedOn,'2026-10-10');
  m.toggleDone(r,'2026-10-11');assert.equal(m.journal(s,'2026-10-12').streak,0);
});

test('calendar distinguishes completed, partial, missed and future scheduled days with exact task counts',()=>{
  assert.equal(typeof m.calendarDay,'function');
  const a=goal('system','system',{recurrence:'weekdays'}),b=goal('algorithms','algorithms',{recurrence:'weekdays'}),r=goal('review','review',{recurrence:'weekends'}),s=state([a,b,r]);
  assert.equal(m.calendarDay(s,'2026-10-09','2026-10-13').status,'missed');
  m.toggleStep(a,'2026-10-09',0);
  assert.equal(m.calendarDay(s,'2026-10-09','2026-10-13').status,'partial');
  m.toggleDone(a,'2026-10-09');m.toggleDone(b,'2026-10-09');
  const completed=m.calendarDay(s,'2026-10-09','2026-10-13');assert.equal(completed.status,'complete');assert.equal(completed.done,2);assert.equal(completed.total,2);
  const sat=m.calendarDay(s,'2026-10-17','2026-10-13');assert.equal(sat.status,'planned');assert.equal(sat.total,1);assert.equal(sat.rows[0].goal.kind,'review');
  assert.equal(m.calendarDay(s,'2026-10-13','2026-10-13').status,'pending');
});

test('calendar preserves historical completed readings on a newly review-only weekend',()=>{
  assert.equal(typeof m.calendarDay,'function');
  const a=goal('system','system'),b=goal('algorithms','algorithms');m.toggleDone(a,'2026-01-31');m.toggleDone(b,'2026-01-31');
  const s=m.upgradeState(state([a,b]),'2026-10-13'),d=m.calendarDay(s,'2026-01-31','2026-10-13');
  assert.equal(d.rows.filter(r=>r.done).length,2);assert.equal(m.journal(s,'2026-10-13').xp,80);
});

test('a future completion from a backup stays planned in the calendar and earns no XP',()=>{
  const a=goal('system','system',{recurrence:'weekdays'});m.toggleDone(a,'2026-10-14');
  const s=state([a]),d=m.calendarDay(s,'2026-10-14','2026-10-13');
  assert.equal(d.status,'planned');assert.equal(d.done,0);assert.equal(d.rows[0].done,false);assert.equal(m.journal(s,'2026-10-13').xp,0);
});

test('monthly goal closure appears on its actual date without duplicating it throughout the month',()=>{
  const g=goal('project','project',{horizon:'month',recurrence:'monthly'});m.toggleDone(g,'2026-10-01','2026-10-13');
  const s=state([g]);assert.equal(m.calendarDay(s,'2026-10-13','2026-10-14').rows[0].done,true);
  assert.equal(m.calendarDay(s,'2026-10-12','2026-10-14').rows.length,0);
  assert.equal(m.calendarDay(s,'2026-10-14','2026-10-14').rows.length,0);
});

test('legacy weekly history with no completion timestamp keeps its previously displayed award date',()=>{
  const g=goal('review','review',{horizon:'week',recurrence:'weekly',date:'2026-10-17',completions:{'2026-10-12':{done:true,steps:[true,true]}}});
  const s=m.upgradeState(state([g]),'2026-10-18');
  assert.equal(m.journal(s,'2026-10-18').events[0].date,'2026-10-12');
  assert.equal(m.journal(s,'2026-10-18').xp,25);
});

test('closing two older weekly occurrences on the same day does not lose either award during migration',()=>{
  const g=goal('review','review',{horizon:'week',recurrence:'weekly',date:'2026-10-03',completions:{
    '2026-10-05':{done:true,steps:[true,true],horizon:'week',completedOn:'2026-10-13'},
    '2026-10-12':{done:true,steps:[true,true],horizon:'week',completedOn:'2026-10-13'}
  }});
  const s=m.upgradeState(state([g]),'2026-10-13');
  assert.equal(m.journal(s,'2026-10-13').xp,50);assert.equal(m.journal(s,'2026-10-13').events.length,2);
  assert.doesNotThrow(()=>m.validateState(s));assert.equal(m.journal(m.upgradeState(s,'2026-10-14'),'2026-10-14').xp,50);
});

test('weekly and daily learning records sharing a date remain in the journal after merging periods',()=>{
  const entry=(horizon,result)=>({date:'2026-10-14',horizon,kind:'review',topic:'Очереди',result,nextStep:'',link:'',skillId:''});
  const g=goal('review','review',{horizon:'week',recurrence:'weekly',date:'2026-10-17',entries:{'2026-10-12':entry('week','Итог недели'),'2026-10-14':entry('day','Итог дня')}});
  const s=m.upgradeState(state([g]),'2026-10-15');
  assert.deepEqual(Array.from(l.records(s,'2026-10-15'),r=>r.entry.result).sort(),['Итог дня','Итог недели']);
  assert.doesNotThrow(()=>m.validateState(s));
});
