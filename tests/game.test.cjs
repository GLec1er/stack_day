const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../model.js'),'utf8'),context);const m=context.GoalsModel;
const goal=(id,kind='system',extra={})=>({id,title:kind==='system'?'Системный дизайн':kind==='algorithms'?'Алгоритмы':'Практика',kind,category:'it',horizon:'day',date:'2026-10-01',recurrence:'daily',steps:['Прочитать','Конспект'],completions:{},...extra});
const plan=goals=>({version:1,goals,notes:{}});
test('daily migration preserves progress, removes source metadata and runs only once',()=>{
  assert.equal(typeof m.upgradeState,'function','daily migration is missing');
  const old=plan([goal('legacy-30','system',{date:'2026-10-12',recurrence:'none',source:'https://old.example/task',completions:{'2026-10-12':{done:true,steps:[true,true]}}}),goal('legacy-15','algorithms',{date:'2026-10-12',recurrence:'none'})]);old.importedFrom='old service';
  const upgraded=m.upgradeState(old,'2026-10-12');
  assert.equal(upgraded.goals.length,3);assert.equal(upgraded.goals[0].recurrence,'weekdays');assert.equal(upgraded.goals[0].completions['2026-10-12'].done,true);assert.equal('source' in upgraded.goals[0],false);assert.equal('importedFrom' in upgraded,false);
  upgraded.goals[0].archived=true;
  const again=m.upgradeState(upgraded,'2026-10-13');assert.equal(again.goals.length,3);assert.equal(again.goals[0].archived,true);
});
test('missing daily routines are created with today as their start',()=>{
  assert.equal(typeof m.upgradeState,'function','daily migration is missing');
  const upgraded=m.upgradeState(plan([]),'2026-10-12');assert.equal(upgraded.goals.length,3);assert.deepEqual(Array.from(upgraded.goals,g=>g.kind),['system','algorithms','review']);assert.equal(upgraded.goals[0].date,'2026-10-12');assert.equal(m.occurs(upgraded.goals[0],'day','2026-10-13'),true);
});
test('XP is derived once per completion; undo and recheck cannot farm points',()=>{
  assert.equal(typeof m.journal,'function','reward journal is missing');
  const g=goal('one');m.toggleStep(g,'2026-10-12',0);assert.equal(m.journal(plan([g]),'2026-10-12').xp,0);
  m.toggleDone(g,'2026-10-12');assert.equal(m.journal(plan([g]),'2026-10-12').xp,40);
  const restored=JSON.parse(JSON.stringify(plan([g])));assert.equal(m.journal(restored,'2026-10-12').xp,40);
  m.toggleDone(g,'2026-10-12');assert.equal(m.journal(plan([g]),'2026-10-12').xp,0);m.toggleDone(g,'2026-10-12');assert.equal(m.journal(plan([g]),'2026-10-12').xp,40);
});
test('future completions earn no XP; archiving preserves earned progress',()=>{
  assert.equal(typeof m.journal,'function','reward journal is missing');
  const g=goal('one');m.toggleDone(g,'2026-10-13');assert.equal(m.journal(plan([g]),'2026-10-12').xp,0);m.toggleDone(g,'2026-10-12');g.archived=true;assert.equal(m.journal(plan([g]),'2026-10-12').xp,40);
});
test('double reading days form a streak; unfinished today preserves yesterday’s streak',()=>{
  assert.equal(typeof m.journal,'function','streak journal is missing');
  const a=goal('system'),b=goal('algorithms','algorithms');for(const day of ['2026-10-09','2026-10-10','2026-10-11']){m.toggleDone(a,day);m.toggleDone(b,day);}
  const j=m.journal(plan([a,b]),'2026-10-12');assert.equal(j.streak,3);assert.equal(j.bestStreak,3);assert.equal(j.xp,240);assert.equal(j.level,2);assert.equal(j.levelProgress,40);
  assert.equal(j.achievements.find(a=>a.id==='first').unlockedOn,'2026-10-09');assert.equal(j.achievements.find(a=>a.id==='streak3').unlockedOn,'2026-10-11');assert.equal(j.achievements.find(a=>a.id==='streak7').unlockedOn,null);
  assert.equal(m.journal(plan([a,b]),'2026-10-13').streak,0);
});
test('weekly review reward belongs to the actual completion day',()=>{
  assert.equal(typeof m.journal,'function','reward event dating is missing');
  const g=goal('review','review',{horizon:'week',date:'2026-10-17',recurrence:'weekly'});m.toggleDone(g,'2026-10-14');
  const j=m.journal(plan([g]),'2026-10-14');assert.equal(j.days['2026-10-14'].xp,25);assert.equal(j.achievements.find(a=>a.id==='review').unlockedOn,'2026-10-14');
});
test('ten algorithm readings unlock the milestone on the tenth day',()=>{
  assert.equal(typeof m.journal,'function','milestones are missing');
  const g=goal('algorithms','algorithms');for(let n=1;n<=10;n++)m.toggleDone(g,'2026-10-'+String(n).padStart(2,'0'));
  const j=m.journal(plan([g]),'2026-10-12');assert.equal(j.achievements.find(a=>a.id==='algorithms10').unlockedOn,'2026-10-10');assert.equal(j.xp,400);
});
test('month calendar handles leap years and Monday padding',()=>{
  assert.equal(typeof m.calendarMonth,'function','month calendar is missing');
  const grid=m.calendarMonth('2028-02-10');const dates=Array.from(grid).filter(Boolean);assert.equal(dates.length,29);assert.equal(dates[0],'2028-02-01');assert.equal(dates.at(-1),'2028-02-29');assert.equal(grid[0],null);assert.equal(grid[1],'2028-02-01');
});
test('editing an archived goal does not rewrite its awarded XP or reading type',()=>{
  const g=goal('saved');m.toggleDone(g,'2026-10-12');g.kind='project';g.minutes=10;g.archived=true;
  const j=m.journal(plan([g]),'2026-10-12');assert.equal(j.xp,40);assert.equal(j.days['2026-10-12'].system,true);assert.equal(j.minutes,0);
});
test('legacy id normalization preserves all goals when target identifiers collide',()=>{
  const upgraded=m.upgradeState(plan([goal('legacy-30'),goal('goal-30','algorithms')]),'2026-10-12');assert.equal(new Set(upgraded.goals.map(g=>g.id)).size,3);assert.doesNotThrow(()=>m.validateState(upgraded));
});
test('a partial step colours the calendar but earns no XP or active-day milestone',()=>{
  const g=goal('partial');m.toggleStep(g,'2026-10-12',0);const j=m.journal(plan([g]),'2026-10-12');assert.equal(j.days['2026-10-12']?.hasProgress,true);assert.equal(j.xp,0);assert.equal(j.activeDays,0);
});
