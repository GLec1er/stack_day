var ControlModel=(()=>{
  const M=GoalsModel,L=LearningModel;
  const units={sessions:'занятий',pages:'страниц',problems:'задач',diagrams:'схем',projects:'проектов'};
  function allEntries(state,today){return state.goals.flatMap(g=>['entries','legacyEntries'].flatMap(field=>Object.entries(g[field]||{}).filter(([,e])=>e.date<=today).map(([key,e])=>({g,key,e,field}))));}
  function summary(state,today,from=M.addDays(today,-6)){
    const rows=allEntries(state,today).filter(x=>x.e.date>=from),events=M.journal(state,today).events.filter(e=>e.date>=from),calendar=Array.from({length:Math.max(0,Math.round((M.date(today)-M.date(from))/86400000))+1},(_,i)=>M.calendarDay(state,M.addDays(from,i),today));
    const value=k=>rows.reduce((n,x)=>n+(Number(x.e[k])||0),0);
    const plannedMinutes=calendar.flatMap(d=>d.rows.filter(r=>r.planned)).reduce((n,r)=>n+(Number(r.goal.minutes)||0),0);
    return {completed:events.filter(e=>!e.short).length,short:events.filter(e=>e.short).length,actualMinutes:value('actualMinutes'),tracked:rows.filter(x=>x.e.actualMinutes!==undefined).length,pages:value('pages'),problems:value('problems'),diagrams:value('diagrams'),plannedMinutes,missed:calendar.filter(d=>d.status==='missed').length,fullDays:calendar.filter(d=>d.allDone).length};
  }
  function monthProgress(state,g,s,today=s){
    const metric=M.goalAt(g,s).metric;if(!metric)return null;
    const month=s.slice(0,7),events=M.journal(state,today).events.filter(e=>!e.short&&e.date.startsWith(month)&&e.horizon==='day'&&(metric.kind==='all'||e.kind===metric.kind));
    let value=0;
    if(metric.unit==='sessions')value=events.length;
    else if(metric.unit==='projects')value=M.journal(state,today).events.filter(e=>!e.short&&e.kind==='project'&&e.date.startsWith(month)&&e.id!==g.id).length;
    else value=allEntries(state,today).filter(x=>x.e.date.startsWith(month)&&(metric.kind==='all'||x.e.kind===metric.kind)).reduce((n,x)=>n+(Number(x.e[metric.unit])||0),0);
    return {value,target:metric.target,done:value>=metric.target,percent:Math.min(100,value/metric.target*100),unit:units[metric.unit]};
  }
  function timerSeconds(t,now){return t?Math.max(0,Number(t.seconds)||0)+(t.running?Math.max(0,(now-t.startedAt)/1000):0):0;}
  function timerStart(t,id,date,now){if(t&&(t.id!==id||t.date!==date))throw Error('Сначала заверши текущий таймер.');return {...t,id,date,seconds:timerSeconds(t,now),startedAt:now,running:true};}
  function timerPause(t,now){return t?{...t,seconds:timerSeconds(t,now),running:false,startedAt:null}:null;}
  function timerFinish(t,now){return {timer:null,minutes:Math.round(timerSeconds(t,now)/60*10)/10};}
  function dueReviews(state,today){
    const rows=allEntries(state,today),last=new Map();
    for(const x of rows){const key=x.g.id+'|'+(x.e.skillId||x.e.topic);if(!last.has(key)||last.get(key).e.date<x.e.date)last.set(key,x);}
    return [...last.values()].filter(x=>!x.g.archived&&x.e.reviewOn&&x.e.reviewOn<=today&&!rows.some(y=>y.e.reviewGoalId===x.g.id&&y.e.reviewKey===x.key&&y.e.reviewOf===x.e.date&&y.e.date>=x.e.reviewOn&&['understood','repeat'].includes(y.e.selfRating))).sort((a,b)=>a.e.reviewOn.localeCompare(b.e.reviewOn));
  }
  function reviewCandidates(state,s){return allEntries(state,s).filter(x=>x.e.date<s&&x.e.result.trim()).sort((a,b)=>b.e.date.localeCompare(a.e.date));}
  function copySummary(state,today){const j=M.journal(state,today),rows=allEntries(state,today),dates=[...j.events.map(e=>e.date),...rows.filter(x=>x.e.topic||x.e.result||x.e.actualMinutes!==undefined).map(x=>x.e.date)].sort();return {goals:state.goals.length,xp:j.xp,completed:j.events.length,records:rows.length,lastDate:dates.at(-1)||null};}
  function recentSessions(state,today,limit=8){
    const rows=allEntries(state,today),items=new Map(),identity=x=>x.g.id+'|'+x.field+'|'+x.key;
    for(const x of rows)if(x.e.topic||x.e.result||x.e.actualMinutes!==undefined)items.set(identity(x),{...x,date:x.e.date,title:M.goalAt(x.g,x.e.date).title,status:'note',hasResult:Boolean(x.e.result.trim())});
    for(const event of M.journal(state,today).events){const g=state.goals.find(g=>g.id===event.id);if(!g)continue;const row=rows.find(x=>x.g.id===g.id&&x.key===event.key&&x.e.date===event.date)||rows.find(x=>x.g.id===g.id&&x.e.date===event.date),key=row?identity(row):g.id+'|completion|'+event.key;
      items.set(key,{g,key:row?.key||(event.horizon!==M.goalAt(g,event.date).horizon?event.key:null),field:row?.field||'entries',e:row?.e||{},date:event.date,title:event.title,status:event.short?'short':'done',hasResult:Boolean(row?.e.result.trim())});
    }
    return [...items.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title)).slice(0,limit);
  }
  function reviewSource(state,g,s){
    const kind=M.kindOf(M.goalAt(g,s));return allEntries(state,s).filter(x=>x.e.date<s&&x.e.result&&(kind==='review'||x.e.kind===kind)).sort((a,b)=>b.e.date.localeCompare(a.e.date))[0]||null;
  }
  function search(state,query,today){const q=String(query).toLocaleLowerCase('ru').trim();return q?allEntries(state,today).filter(x=>[x.g.title,x.e.topic,x.e.result,x.e.nextStep,x.e.recall||''].some(t=>t.toLocaleLowerCase('ru').includes(q))).sort((a,b)=>b.e.date.localeCompare(a.e.date)):[];}
  function achievements(state,today,events){
    const rows=allEntries(state,today),checked=rows.filter(x=>x.e.selfRating==='understood'&&x.e.recall?.trim()&&x.e.reviewOf&&M.addDays(x.e.reviewOf,7)<=x.e.date).sort((a,b)=>a.e.date.localeCompare(b.e.date)),solved=rows.filter(x=>x.e.problems>0&&x.e.result?.trim()&&events.some(e=>e.id===x.g.id&&e.date===x.e.date&&!e.short)).sort((a,b)=>a.e.date.localeCompare(b.e.date)),built=rows.filter(x=>x.e.kind==='project'&&(x.e.result?.trim()||x.e.link)&&events.some(e=>e.id===x.g.id&&e.date===x.e.date)).sort((a,b)=>a.e.date.localeCompare(b.e.date));
    return [{id:'recall7',name:'Помню через неделю',description:'Объяснить тему по памяти через 7 дней и отметить «Понял»',icon:'repeat',target:1,progress:checked.length,unlockedOn:checked[0]?.e.date||null},{id:'solved',name:'Решение своими руками',description:'Завершить занятие с решённой задачей и записанным результатом',icon:'terminal',target:1,progress:solved.length,unlockedOn:solved[0]?.e.date||null},{id:'artifact',name:'Есть что показать',description:'Завершить учебный проект и сохранить результат или ссылку',icon:'cube',target:1,progress:built.length,unlockedOn:built[0]?.e.date||null}];
  }
  return {units,summary,monthProgress,timerStart,timerPause,timerSeconds,timerFinish,dueReviews,reviewSource,reviewCandidates,recentSessions,copySummary,search,achievements};
})();
