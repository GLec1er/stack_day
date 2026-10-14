var GoalsModel = (() => {
  const date = s => new Date(s + 'T12:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = date(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(date(s).getTime()) && iso(date(s)) === s;
  const isWeekend = s => [0,6].includes(date(s).getUTCDay());
  function periodKey(horizon, s) {
    if (horizon === 'month') return s.slice(0, 7);
    if (horizon === 'week') return addDays(s, -((date(s).getUTCDay() + 6) % 7));
    return s;
  }
  function occurs(goal, horizon, s) {
    goal=goalAt(goal,s);
    if(goal.status==='rest'||goal.status==='moved')return false;
    if (goal.archived || goal.horizon !== horizon) return false;
    const target = periodKey(horizon, s), start = periodKey(horizon, goal.date);
    if (target < start) return false;
    if (!goal.recurrence || goal.recurrence === 'none') return target === start;
    if (goal.recurrence === 'weekdays') return horizon === 'day' && !isWeekend(s);
    if (goal.recurrence === 'weekends') return horizon === 'day' && isWeekend(s);
    if (goal.recurrence === 'weekly' && horizon === 'day') return date(s).getUTCDay() === date(goal.date).getUTCDay();
    return (goal.recurrence === 'daily' && horizon === 'day') || (goal.recurrence === 'weekly' && horizon === 'week') || (goal.recurrence === 'monthly' && horizon === 'month');
  }
  function progress(goal, s) {
    goal=goalAt(goal,s);
    const stored = goal.completions?.[periodKey(goal.horizon, s)];
    const compatible=completionCompatible(stored,goal);
    return { ...(compatible?stored:{}),done: Boolean(compatible&&stored.done === true), steps: (compatible&&stored.stepLabels||goal.steps||[]).map((_, i) => Boolean(compatible&&stored.steps?.[i] === true)) };
  }
  const defaultHorizon=h=>h==='month'?'month':'day';
  const templateFields=['title','horizon','date','category','kind','priority','minutes','recurrence','favorite','steps','metric'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function goalAt(g,s){
    const version=(g.templates||[]).filter(t=>t.from<=s).sort((a,b)=>b.from.localeCompare(a.from))[0];
    const base={...g,...version?.fields};return {...base,...g.overrides?.[periodKey(base.horizon,s)]};
  }
  function completionCompatible(p,g){return Boolean(p&&(!p.horizon||p.horizon===g.horizon||p.horizon==='week'&&g.horizon==='day'&&g.legacySchedule?.horizon==='week'));}
  function stepLabels(g,s){const a=goalAt(g,s),p=g.completions?.[periodKey(a.horizon,s)];return completionCompatible(p,a)&&p.stepLabels||a.steps||[];}
  function fieldsOf(g){return Object.fromEntries(templateFields.filter(k=>g[k]!==undefined).map(k=>[k,clone(g[k])]));}
  function freezeHistory(g){
    for(const [key,p] of Object.entries(g.completions||{})){
      p.horizon||=/^\d{4}-\d{2}$/.test(key)?'month':g.horizon;
      const old=goalAt(g,key.length===7?key+'-01':key);
      p.kind||=kindOf(old);p.stepLabels||=old.steps.slice();p.title||=old.title;p.minutes??=Number(old.minutes)||0;
    }
  }
  function editGoal(state,id,fields,scope='all',s){
    const index=state.goals.findIndex(g=>g.id===id);if(index<0)throw Error('Цель не найдена.');
    const next=clone(state),g=next.goals[index];freezeHistory(g);
    const changed=fieldsOf({...goalAt(g,s||g.date),...fields});
    if(scope==='one'){
      if(!validDate(s)||changed.horizon!==goalAt(g,s).horizon)throw Error('Для одного занятия период менять нельзя. Выберите изменение шаблона.');
      const key=periodKey(changed.horizon,s),old=goalAt(g,s);delete changed.date;delete changed.recurrence;
      (g.overrides||={})[key]={...g.overrides?.[key],...changed};
      const p=g.completions?.[key];if(p&&!p.done){const labels=p.stepLabels||old.steps;p.steps=changed.steps.map(x=>p.steps[labels.indexOf(x)]===true);p.stepLabels=changed.steps.slice();}
    }else if(scope==='from'){
      if(!validDate(s))throw Error('Выберите дату изменения.');
      g.templates=(g.templates||[{from:'0001-01-01',fields:fieldsOf(g)}]).filter(t=>t.from<s);
      g.templates.push({from:s,fields:changed});Object.assign(g,changed);
    }else if(scope==='all'){Object.assign(g,changed);delete g.templates;}
    else throw Error('Выберите область изменения.');
    validateState(next);if(!g.templates)delete state.goals[index].templates;Object.assign(state.goals[index],g);return state.goals[index];
  }
  function skipOccurrence(g,s,skip){
    if(!validDate(s)||goalAt(g,s).horizon!=='day')throw Error('Выберите день занятия.');
    if(skip&&progress(g,s).done)throw Error('Сначала снимите выполнение занятия.');
    (g.overrides||={})[s]={...g.overrides?.[s],status:skip?'rest':'active'};
  }
  function moveOccurrence(state,id,from,to){
    const g=state.goals.find(g=>g.id===id);if(!g||!validDate(from)||!validDate(to)||from===to||!occurs(g,'day',from)||progress(g,from).done)throw Error('Перенести можно невыполненное дневное занятие на другую дату.');
    const a=goalAt(g,from),moved={...fieldsOf(a),id:id+'-move-'+from+'-'+to,date:to,horizon:'day',recurrence:'none',completions:{},archived:false,movedFrom:from,seriesId:g.seriesId||id};
    if(state.goals.some(x=>x.id===moved.id))throw Error('Это занятие уже перенесено на выбранную дату.');
    if(g.completions?.[from])moved.completions[to]={...clone(g.completions[from]),originalDate:from};
    const e=g.entries?.[from];if(e)moved.entries={[to]:{...clone(e),date:to,originalDate:from}};
    validateState({...state,goals:[...state.goals,moved]});
    (g.overrides||={})[from]={...g.overrides?.[from],status:'moved',movedTo:to,movedId:moved.id};
    delete g.completions?.[from];delete g.entries?.[from];state.goals.push(moved);return moved;
  }
  function repairState(input){
    const s=clone(input);if(!Array.isArray(s?.goals))return validateState(s);
    for(const g of s.goals){
      if(g.horizon===''){g.horizon='day';if(!['none','daily','weekdays','weekends','weekly'].includes(g.recurrence))g.recurrence='none';}
      for(const [key,p] of Object.entries(g.completions||{}))if(p&&!p.horizon){p.horizon=/^\d{4}-\d{2}$/.test(key)?'month':g.horizon==='week'?'week':'day';}
    }
    return validateState(s);
  }
  function priorityOf(g){return ['high','normal','low'].includes(g.priority)?g.priority:'normal';}
  function sortGoals(goals,s){
    const rank={high:0,normal:1,low:2};
    return goals.slice().sort((a,b)=>Number(progress(a,s).done)-Number(progress(b,s).done)||rank[priorityOf(a)]-rank[priorityOf(b)]||Number(Boolean(b.favorite))-Number(Boolean(a.favorite)));
  }
  function stamp(goal, s, p, completedOn) {
    p.kind??=kindOf(goal);p.horizon??=goal.horizon;p.minutes??=Number(goal.minutes)||0;p.title??=goal.title;p.stepLabels??=goal.steps.slice();
    if (p.done) p.completedOn=goal.horizon==='day'?s:(completedOn||s);
    return p;
  }
  function toggleDone(goal, s, completedOn) {
    const a=goalAt(goal,s),labels=stepLabels(goal,s),p = progress(goal, s); p.done = !p.done; p.steps = labels.map(() => p.done);
    (goal.completions ||= {})[periodKey(a.horizon, s)] = stamp({...a,steps:labels},s,p,completedOn);
  }
  function toggleStep(goal, s, i, completedOn) {
    const p = progress(goal, s); if (i < 0 || i >= p.steps.length) return;
    p.steps[i] = !p.steps[i]; p.done = p.steps.every(Boolean);
    const a=goalAt(goal,s);(goal.completions ||= {})[periodKey(a.horizon, s)] = stamp({...a,steps:stepLabels(goal,s)},s,p,completedOn);
  }
  function validateState(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.goals) || input.goals.length > 10000) throw Error('Это не резервная копия Stackday.');
    const ids = new Set();
    for (const g of input.goals) {
      if (!g || typeof g.id !== 'string' || !g.id || ids.has(g.id) || typeof g.title !== 'string' || !g.title.trim() || g.title.length > 240 || !['day','week','month'].includes(g.horizon) || !validDate(g.date) || !['none','daily','weekdays','weekends','weekly','monthly'].includes(g.recurrence || 'none')) throw Error('В файле есть некорректная цель или повторяющийся идентификатор.');
      if (g.recurrence && g.recurrence !== 'none' && !(({day:['daily','weekdays','weekends','weekly'],week:['weekly'],month:['monthly']})[g.horizon].includes(g.recurrence))) throw Error('Повторение цели не соответствует её периоду.');
      if (!Array.isArray(g.steps) || g.steps.length > 30 || g.steps.some(s => typeof s !== 'string' || s.length > 240)) throw Error('Некорректные шаги цели.');
      if (g.completions && (typeof g.completions !== 'object' || Array.isArray(g.completions))) throw Error('Некорректная история выполнения.');
      if (g.legacyCompletions && (typeof g.legacyCompletions !== 'object' || Array.isArray(g.legacyCompletions))) throw Error('Некорректная история выполнения.');
      if(g.templates!==undefined){if(!Array.isArray(g.templates)||g.templates.length>1000)throw Error('Некорректная история шаблона.');for(const t of g.templates){if(!validDate(t.from)||!t.fields||typeof t.fields!=='object')throw Error('Некорректный шаблон.');const a={...g,...t.fields};delete a.templates;delete a.overrides;delete a.completions;delete a.legacyCompletions;delete a.entries;delete a.legacyEntries;validateState({version:1,goals:[a]});}}
      if(g.overrides!==undefined){if(!g.overrides||Array.isArray(g.overrides)||typeof g.overrides!=='object'||Object.keys(g.overrides).length>10000)throw Error('Некорректные исключения расписания.');for(const [key,o] of Object.entries(g.overrides)){if(!validDate(key)&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)||!o||typeof o!=='object'||Array.isArray(o)||o.status&&!['rest','moved','active'].includes(o.status))throw Error('Некорректное исключение.');const a={...g,...o};delete a.templates;delete a.overrides;delete a.completions;delete a.legacyCompletions;delete a.entries;delete a.legacyEntries;validateState({version:1,goals:[a]});}}
      if(g.metric!==undefined&&g.metric!==null&&(!g.metric||!['sessions','pages','problems','diagrams','projects'].includes(g.metric.unit)||!['all',...kinds].includes(g.metric.kind)||!Number.isInteger(g.metric.target)||g.metric.target<1||g.metric.target>100000||g.horizon!=='month'))throw Error('Некорректный счётчик месяца.');
      for (const [key,p] of [...Object.entries(g.completions || {}),...Object.entries(g.legacyCompletions || {})]) {
        const loggedHorizon=p?.horizon||g.horizon;
        const correctKey = loggedHorizon === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(key) : validDate(key);
        if (!correctKey || !p || typeof p.done !== 'boolean' || !Array.isArray(p.steps) || p.steps.some(x => typeof x !== 'boolean')) throw Error('Некорректная история выполнения.');
        if(p.completedOn!==undefined&&!validDate(p.completedOn))throw Error('Некорректная дата выполнения.');
        if(p.horizon!==undefined&&!['day','week','month'].includes(p.horizon))throw Error('Некорректный период выполнения.');
        if(p.stepLabels!==undefined&&(!Array.isArray(p.stepLabels)||p.stepLabels.length>30||p.stepLabels.some(x=>typeof x!=='string'||x.length>240)))throw Error('Некорректные сохранённые шаги.');
      }
      ids.add(g.id);
    }
    if (input.notes && (typeof input.notes !== 'object' || Array.isArray(input.notes) || Object.values(input.notes).some(n => typeof n !== 'string' || n.length > 10000))) throw Error('Некорректные заметки.');
    if(typeof LearningModel!=='undefined')LearningModel.validateLearning(input);
    return JSON.parse(JSON.stringify(input));
  }
  function itOnlyState(input) {
    const focused = validateState(input);
    focused.goals = focused.goals.filter(g => g.category === 'it');
    focused.focus = 'it';
    return focused;
  }
  const kinds=['system','algorithms','practice','review','project','other'];
  const xpFor={system:40,algorithms:40,practice:30,review:25,project:60,other:20};
  function kindOf(g) {
    if(kinds.includes(g.kind))return g.kind;
    const title=String(g.title||'').toLocaleLowerCase('ru');
    if(/алгоритм|algorithm/.test(title))return 'algorithms';
    if(/системн.*дизайн|system.*design/.test(title))return 'system';
    if(/повторение|конспект|разбор недели/.test(title))return 'review';
    if(/мини.проект|учебный проект/.test(title))return 'project';
    if(/задач.*код|практика|leetcode/.test(title))return 'practice';
    return 'other';
  }
  function upgradeState(input,today) {
    const s=itOnlyState(input);
    delete s.importedFrom;delete s.importedAt;
    const usedIds=new Set();
    for(const g of s.goals){delete g.source;g.kind=kindOf(g);const legacy=/^[a-z]+-(\d+)$/.exec(g.id);let id=legacy?'goal-'+legacy[1]:g.id;const base=id;let n=2;while(usedIds.has(id))id=base+'-'+n++;g.id=id;usedIds.add(id);}
    if((Number(s.schemaRevision)||0)<2){
      for(const kind of ['system','algorithms']){
        const candidates=s.goals.filter(g=>g.kind===kind&&g.horizon==='day'&&!g.archived&&g.date<=today).sort((a,b)=>b.date.localeCompare(a.date));
        if(candidates.length)candidates[0].recurrence='daily';
        else s.goals.push({id:'daily-'+kind,title:kind==='system'?'Чтение: системный дизайн':'Чтение: алгоритмы',kind,category:'it',horizon:'day',date:today,recurrence:'daily',priority:'high',minutes:60,steps:kind==='system'?['Прочитать материал','Записать 3 ключевые идеи','Нарисовать схему или разобрать пример']:['Прочитать материал','Разобрать пример кода','Решить 1–2 задачи'],completions:{},archived:false,favorite:false});
      }
      const reviews=s.goals.filter(g=>g.kind==='review'&&g.horizon==='week'&&!g.archived).sort((a,b)=>b.date.localeCompare(a.date));if(reviews.length)reviews[0].recurrence='weekly';
      s.schemaRevision=2;
    }
    if((Number(s.schemaRevision)||0)<3){
      for(const g of s.goals){
        if(g.horizon==='day'&&['system','algorithms'].includes(g.kind)&&g.recurrence==='daily')g.recurrence='weekdays';
        if(g.horizon!=='week')continue;
        const oldDate=g.date;
        g.legacySchedule={horizon:'week',date:oldDate,recurrence:g.recurrence||'none'};
        g.horizon='day';
        if(g.recurrence==='weekly'&&g.kind==='review'){g.recurrence='weekends';g.date=addDays(periodKey('week',oldDate),5);}
        const completions=Object.fromEntries(Object.entries(g.completions||{}).filter(([,p])=>p.horizon&&p.horizon!=='week'));
        for(const [key,p] of Object.entries(g.completions||{})){
          if((p.horizon||'week')!=='week')continue;
          const day=p.completedOn||key,value={...p,horizon:'week',completedOn:day,previousKey:key};
          if(completions[day])(g.legacyCompletions||={})[key]=value;
          else completions[day]=value;
        }
        g.completions=completions;
        if(g.entries){const entries=Object.fromEntries(Object.entries(g.entries).filter(([,e])=>e.horizon!=='week'));for(const [key,e] of Object.entries(g.entries)){
          if(e.horizon!=='week')continue;
          if(entries[e.date])(g.legacyEntries||={})[key]=e;
          else entries[e.date]={...e,horizon:'day',previousHorizon:'week',previousKey:key};
        }g.entries=entries;}
      }
      if(!s.goals.some(g=>g.kind==='review'&&g.horizon==='day'&&g.recurrence==='weekends')){
        let id='weekend-review',n=2;while(usedIds.has(id))id='weekend-review-'+n++;
        s.goals.push({id,title:'Повторение прочитанного за неделю и конспект',kind:'review',category:'it',horizon:'day',date:today,recurrence:'weekends',priority:'normal',minutes:25,steps:['Вспомнить главные идеи системного дизайна и алгоритмов','Проверить себя по материалу и заполнить пробелы','Обновить конспект и записать оставшиеся вопросы'],completions:{},archived:false,favorite:false});
      }
      for(const [key,text] of Object.entries(s.notes||{}))if(key.startsWith('week:')&&text&&validDate(key.slice(5))){
        const dayKey='day:'+addDays(key.slice(5),5),combined=[s.notes[dayKey], 'За неделю '+key.slice(5)+':\n'+text].filter(Boolean).join('\n\n');
        if(combined.length<=10000)s.notes[dayKey]=combined;
      }
      s.schemaRevision=3;
    }
    return s;
  }
  function calendarDay(state,s,today){
    const rows=[];
    for(const g of state.goals){
      const actual=goalAt(g,s);
      if(['rest','moved'].includes(actual.status)){rows.push({goal:actual,done:false,planned:false,daily:false,skipped:true,status:actual.status,movedTo:actual.movedTo,stepsDone:0});continue;}
      const planned=occurs(g,'day',s),p=progress(g,s),entry=typeof LearningModel!=='undefined'?LearningModel.entryFor(g,s):null;
      const historical=[...Object.entries(g.completions||{}),...Object.entries(g.legacyCompletions||{})].find(([key,c])=>c.done&&((c.horizon||g.horizon)==='day'?key:c.completedOn||((c.horizon||g.horizon)==='month'?key+'-01':key))===s);
      const oldDaily=g.completions?.[s],oldSteps=(oldDaily?.horizon||g.horizon)==='day'&&oldDaily?.steps?.some(Boolean);
      if(!planned&&!historical&&!oldSteps&&!(g.horizon==='day'&&entry?.date===s&&(entry.result||entry.shortDone)))continue;
      const done=s<=today&&(planned?p.done:Boolean(historical)),daily=planned||g.horizon==='day'||historical?.[1]?.horizon==='day'||Boolean(oldSteps),snapshot=historical?.[1]||(oldSteps?oldDaily:null);
      rows.push({goal:{...actual,title:snapshot?.title||actual.title,kind:snapshot?.kind||actual.kind,steps:snapshot?.stepLabels||actual.steps},done,planned,daily,historical:!planned,entryKey:snapshot&&snapshot.horizon!==actual.horizon?(historical?.[0]||s):g.entries?.[s]?s:g.entries?.[periodKey(actual.horizon,s)]?periodKey(actual.horizon,s):null,stepsDone:s<=today?(oldSteps?oldDaily.steps.filter(Boolean).length:p.steps.filter(Boolean).length):0,short:s<=today&&Boolean(entry?.shortDone&&!done)});
    }
    const daily=rows.filter(r=>r.daily),total=daily.length,done=daily.filter(r=>r.done).length;
    const hasProgress=rows.some(r=>r.done||r.short||r.stepsDone>0);
    const status=s>today?(total?'planned':rows.some(r=>r.skipped)?'rest':'empty'):total&&done===total?'complete':hasProgress?'partial':total?(s<today?'missed':'pending'):rows.some(r=>r.skipped)?'rest':'empty';
    const doneKinds=rows.filter(r=>r.done&&r.daily).map(r=>kindOf(r.goal)),baseline=isWeekend(s)?doneKinds.includes('review'):doneKinds.includes('system')&&doneKinds.includes('algorithms');
    return {rows,total,done,planned:rows.filter(r=>r.planned).length,hasProgress,status,baseline,allDone:total>0&&done===total};
  }
  function calendarMonth(s) {
    const first=s.slice(0,7)+'-01',d=date(first);d.setUTCMonth(d.getUTCMonth()+1);const last=addDays(iso(d),-1),length=Number(last.slice(8));
    const result=Array((date(first).getUTCDay()+6)%7).fill(null);
    for(let i=0;i<length;i++)result.push(addDays(first,i));while(result.length%7)result.push(null);return result;
  }
  function journal(state,today) {
    const events=[],partialDays=new Set();
    for(const g of state.goals){
      for(const [key,p] of [...Object.entries(g.completions||{}),...Object.entries(g.legacyCompletions||{})]){
        const horizon=p.horizon||g.horizon;
        const day=horizon==='day'?key:(p.completedOn||(horizon==='month'?key+'-01':key));
        if(!validDate(day)||day>today)continue;
        if(horizon==='day'&&p.steps?.some(Boolean))partialDays.add(day);
        if(p.done!==true)continue;
        const kind=kinds.includes(p.kind)?p.kind:kindOf(g);
        events.push({id:g.id,key,date:day,kind,horizon,xp:xpFor[kind],minutes:Number(p.minutes??g.minutes)||0,title:p.title||g.title});
      }
    }
    if(typeof LearningModel!=='undefined')events.push(...LearningModel.shortEvents(state,today));
    events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    const days={};for(const s of partialDays)days[s]={xp:0,minutes:0,completed:0,system:false,algorithms:false,full:false,hasProgress:true,rewards:[]};
    for(const e of events){const d=days[e.date]||(days[e.date]={xp:0,minutes:0,completed:0,system:false,algorithms:false,full:false,hasProgress:true,rewards:[]});d.xp+=e.xp;d.minutes+=e.minutes;d.completed++;if(e.short)d.short=(d.short||0)+1;if(e.kind==='system'&&e.horizon==='day'&&!e.short)d.system=true;if(e.kind==='algorithms'&&e.horizon==='day'&&!e.short)d.algorithms=true;if(e.kind==='review'&&['day','week'].includes(e.horizon)&&!e.short)d.review=true;d.full=(d.system&&d.algorithms)||(isWeekend(e.date)&&Boolean(d.review));}
    const fullDays=Object.keys(days).filter(s=>days[s].full).sort();let streak=0,bestStreak=0,run=0,previous=null;const reached={};
    for(const s of fullDays){run=previous&&addDays(previous,1)===s?run+1:1;bestStreak=Math.max(bestStreak,run);if(run>=3&&!reached[3])reached[3]=s;if(run>=7&&!reached[7])reached[7]=s;previous=s;}
    let cursor=days[today]?.full?today:addDays(today,-1);while(days[cursor]?.full){streak++;cursor=addDays(cursor,-1);}
    const activeDays=Object.keys(days).filter(s=>days[s].completed>0).sort();
    const byKind=kind=>events.filter(e=>!e.short&&e.kind===kind);
    const doubleDays=Object.keys(days).filter(s=>days[s].system&&days[s].algorithms).sort();
    const nDate=(items,n)=>items[n-1]?.date||null;
    const definitions=[
      {id:'first',name:'Hello, world!',description:'Завершить первое занятие',icon:'code',target:1,progress:events.length,unlockedOn:nDate(events,1)},
      {id:'double',name:'Двойной коммит',description:'Закрыть оба чтения в один день',icon:'layers',target:1,progress:doubleDays.length,unlockedOn:doubleDays[0]||null},
      {id:'streak3',name:'Три в ряд',description:'3 дня подряд: чтение в будни, повторение в выходные',icon:'flame',target:3,progress:bestStreak,unlockedOn:reached[3]||null},
      {id:'streak7',name:'Неделя в стеке',description:'7 дней подряд: чтение в будни, повторение в выходные',icon:'week',target:7,progress:bestStreak,unlockedOn:reached[7]||null},
      {id:'algorithms10',name:'Алгоритмист',description:'Завершить 10 занятий по алгоритмам',icon:'code',target:10,progress:byKind('algorithms').length,unlockedOn:nDate(byKind('algorithms'),10)},
      {id:'system10',name:'Системное мышление',description:'Завершить 10 занятий по системному дизайну',icon:'nodes',target:10,progress:byKind('system').length,unlockedOn:nDate(byKind('system'),10)},
      {id:'practice',name:'В дело',description:'Завершить практическую задачу',icon:'terminal',target:1,progress:byKind('practice').length,unlockedOn:nDate(byKind('practice'),1)},
      {id:'review',name:'Не потерял контекст',description:'Завершить повторение и конспект',icon:'repeat',target:1,progress:byKind('review').length,unlockedOn:nDate(byKind('review'),1)},
      {id:'project',name:'Собрал руками',description:'Закончить учебный мини-проект',icon:'cube',target:1,progress:byKind('project').length,unlockedOn:nDate(byKind('project'),1)},
      {id:'days30',name:'Месяц практики',description:'Завершить занятия в 30 разных дней',icon:'month',target:30,progress:activeDays.length,unlockedOn:activeDays[29]||null}
    ];
    if(typeof ControlModel!=='undefined')definitions.push(...ControlModel.achievements(state,today,events));
    for(const a of definitions){a.progress=Math.min(a.target,a.progress);if(a.unlockedOn)days[a.unlockedOn]?.rewards.push(a.id);}
    const xp=events.reduce((sum,e)=>sum+e.xp,0);
    return {events,days,xp,level:Math.floor(xp/200)+1,levelProgress:xp%200,toNextLevel:200-xp%200,streak,bestStreak,activeDays:activeDays.length,fullDays:fullDays.length,achievements:definitions,minutes:events.reduce((sum,e)=>sum+e.minutes,0)};
  }
  return { date, iso, addDays, periodKey, occurs, progress, priorityOf, sortGoals, toggleDone, toggleStep, validateState, validDate, isWeekend, itOnlyState, kindOf, upgradeState, calendarMonth, calendarDay, journal, xpFor,defaultHorizon,editGoal,repairState,goalAt,stepLabels,skipOccurrence,moveOccurrence };
})();
