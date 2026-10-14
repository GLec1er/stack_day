var LearningModel=(()=>{
  const M=GoalsModel;
  const stages=['Не начато','Изучаю','Практикую','Могу объяснить'];
  const topics=[
    {id:'cache',kind:'system',title:'Кеширование',hint:'Разобрать TTL и инвалидацию кеша'},
    {id:'balance',kind:'system',title:'Балансировка нагрузки',hint:'Нарисовать схему с двумя серверами'},
    {id:'queues',kind:'system',title:'Очереди сообщений',hint:'Разобрать повторную доставку сообщения'},
    {id:'database',kind:'system',title:'Базы данных',hint:'Сравнить индекс и полный просмотр таблицы'},
    {id:'api',kind:'system',title:'Проектирование API',hint:'Описать запрос и ответ небольшого сервиса'},
    {id:'partition',kind:'system',title:'Репликация и шардинг',hint:'Разобрать, как распределяются данные'},
    {id:'complexity',kind:'algorithms',title:'Сложность алгоритмов',hint:'Оценить время и память одного решения'},
    {id:'binary',kind:'algorithms',title:'Бинарный поиск',hint:'Разобрать бинарный поиск и крайние случаи'},
    {id:'sorting',kind:'algorithms',title:'Сортировки',hint:'Сравнить две сортировки на одном примере'},
    {id:'hash',kind:'algorithms',title:'Хеш-таблицы',hint:'Решить задачу с поиском через хеш-таблицу'},
    {id:'graphs',kind:'algorithms',title:'Графы: BFS и DFS',hint:'Пройти небольшой граф двумя способами'},
    {id:'dp',kind:'algorithms',title:'Динамическое программирование',hint:'Сформулировать состояние и переход для задачи'}
  ];
  const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const suggestTopic=(value,skill)=>String(value||'').trim()?value:(skill?.hint||skill?.title||'');
  function safeLink(value){if(!value)return '';try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch(e){return null;}}
  function catalog(state){return [...topics,...(state.customSkills||[])].map(t=>({...t,stage:state.skillProgress?.[t.id]?.stage||0}));}
  function entryFor(g,s,key=null,field='entries'){return g[field]?.[key||M.periodKey(M.goalAt(g,s).horizon,s)]||null;}
  function validEntry(key,e){
    if(!plain(e)||!M.validDate(e.date)||!['day','week','month'].includes(e.horizon)||M.periodKey(e.horizon,e.date)!==key)throw Error('Некорректная дата записи занятия.');
    for(const [field,max] of [['topic',240],['result',3000],['nextStep',500],['link',2048],['skillId',160]])if(typeof e[field]!=='string'||e[field].length>max)throw Error('Некорректная запись занятия.');
    if(safeLink(e.link)===null)throw Error('Используйте ссылку, начинающуюся с https:// или http://.');
    if(e.shortDone!==undefined&&typeof e.shortDone!=='boolean')throw Error('Некорректная короткая отметка.');
    if(e.shortDone&&(e.horizon!=='day'||!['system','algorithms'].includes(e.kind)||!e.topic.trim()||![10,15].includes(e.shortMinutes)))throw Error('Некорректное короткое занятие.');
    for(const name of ['actualMinutes','pages','problems','diagrams'])if(e[name]!==undefined&&(!Number.isFinite(e[name])||e[name]<0||e[name]>100000))throw Error('Фактические значения должны быть от 0 до 100000.');
    if(e.recall!==undefined&&(typeof e.recall!=='string'||e.recall.length>3000))throw Error('Самопроверка — до 3000 символов.');
    if(e.selfRating!==undefined&&!['','understood','repeat'].includes(e.selfRating))throw Error('Выберите результат самопроверки.');
    for(const name of ['reviewOf','reviewOn'])if(e[name]!==undefined&&e[name]!==''&&!M.validDate(e[name]))throw Error('Выберите дату повторения.');
    for(const name of ['reviewGoalId','reviewKey'])if(e[name]!==undefined&&(typeof e[name]!=='string'||e[name].length>500))throw Error('Некорректный источник повторения.');
  }
  function validateLearning(state){
    for(const g of state.goals)for(const field of ['entries','legacyEntries']){if(g[field]!==undefined){if(!plain(g[field])||Object.keys(g[field]).length>10000)throw Error('Некорректный дневник занятий.');for(const [key,e] of Object.entries(g[field]))validEntry(key,e);}}
    const ids=new Set(topics.map(t=>t.id));
    if(state.customSkills!==undefined){if(!Array.isArray(state.customSkills)||state.customSkills.length>100)throw Error('Некорректная карта навыков.');for(const t of state.customSkills){if(!t||typeof t.id!=='string'||!t.id||t.id.length>160||ids.has(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||!['system','algorithms'].includes(t.kind))throw Error('Некорректная тема в карте навыков.');ids.add(t.id);}}
    if(state.skillProgress!==undefined){if(!plain(state.skillProgress))throw Error('Некорректный прогресс навыков.');for(const [id,p] of Object.entries(state.skillProgress)){if(!ids.has(id)||!plain(p)||!Number.isInteger(p.stage)||p.stage<0||p.stage>3||!M.validDate(p.updatedOn))throw Error('Некорректный прогресс навыка.');}}
  }
  function saveEntry(g,s,fields,recordKey=null,recordField='entries'){
    if(!M.validDate(s))throw Error('Выберите дату занятия.');
    const a=M.goalAt(g,s),key=recordKey||M.periodKey(a.horizon,s);let old=g[recordField]?.[key];if(recordKey&&!old){const p=g.completions?.[key];if(!p?.horizon)throw Error('Запись занятия не найдена.');old={date:s,horizon:p.horizon,kind:p.kind||M.kindOf(g)};}
    const e={date:s,horizon:a.horizon,kind:old?.shortDone?old.kind:M.kindOf(a),topic:'',result:'',nextStep:'',link:'',skillId:'',...old};
    for(const name of ['topic','result','nextStep','link','skillId'])if(fields[name]!==undefined)e[name]=String(fields[name]).trim();
    for(const name of ['actualMinutes','pages','problems','diagrams'])if(fields[name]!==undefined){if(fields[name]===''||fields[name]===null)delete e[name];else e[name]=Number(fields[name]);}
    for(const name of ['recall','reviewOf','selfRating','reviewOn','reviewGoalId','reviewKey'])if(fields[name]!==undefined)e[name]=String(fields[name]).trim();
    validEntry(key,e);(g[recordField]||={})[key]=e;return e;
  }
  function nextStep(g,s){return Object.values(g.entries||{}).filter(e=>e.horizon===g.horizon&&M.periodKey(e.horizon,e.date)<M.periodKey(g.horizon,s)&&e.nextStep.trim()).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;}
  function setShort(g,s,done,today,minutes=15){
    const a=M.goalAt(g,s);
    if(a.horizon!=='day'||!['system','algorithms'].includes(M.kindOf(a))||!M.occurs(g,'day',s)||!M.validDate(today)||s>today)throw Error('Короткое занятие можно отметить в день чтения или позже.');
    if(![10,15].includes(minutes))throw Error('Короткое занятие — 10 или 15 минут.');
    const old=entryFor(g,s);if(!old?.topic.trim())throw Error('Сначала укажи тему короткого занятия.');
    const e={...old,shortDone:Boolean(done),shortMinutes:minutes,kind:old.shortDone?old.kind:M.kindOf(a)};
    validEntry(s,e);g.entries[s]=e;return e;
  }
  function completeSession(g,s,today){
    const a=M.goalAt(g,s);
    if(!M.validDate(s)||!M.validDate(today)||M.periodKey(a.horizon,s)>M.periodKey(a.horizon,today)||a.metric||!M.occurs(g,a.horizon,s))throw Error('На эту дату занятие не запланировано. Сначала верни его в план или выбери нужный день.');
    if(!entryFor(g,s)?.result.trim())throw Error('Перед завершением запиши результат занятия.');
    if(!M.progress(g,s).done)M.toggleDone(g,s,today);
  }
  function shortEvents(state,today){
    const events=[];
    for(const g of state.goals)for(const [key,e] of Object.entries(g.entries||{})){
      const full=g.completions?.[key],fullDone=full?.done&&(full.horizon||g.horizon)==='day';
      if(e.shortDone&&e.horizon==='day'&&e.date<=today&&!fullDone)events.push({id:g.id,key,date:e.date,kind:e.kind,horizon:'day',xp:15,minutes:e.shortMinutes,title:g.title,short:true});
    }
    return events;
  }
  function setSkill(state,id,stage,today){
    if(!catalog(state).some(t=>t.id===id)||!Number.isInteger(stage)||stage<0||stage>3||!M.validDate(today))throw Error('Выберите тему и этап освоения.');
    (state.skillProgress||={})[id]={stage,updatedOn:today};
  }
  function addSkill(state,fields,today){
    const title=String(fields.title||'').trim(),id=fields.id;
    if(typeof id!=='string'||!id||id.length>160||!title||title.length>80||!['system','algorithms'].includes(fields.kind)||!M.validDate(today))throw Error('Укажите название темы — до 80 символов.');
    if(catalog(state).some(t=>t.id===id||t.kind===fields.kind&&t.title.toLocaleLowerCase('ru')===title.toLocaleLowerCase('ru')))throw Error('Такая тема уже есть в карте.');
    if((state.customSkills||[]).length>=100)throw Error('В карте уже 100 своих тем.');
    const t={id,title,kind:fields.kind,hint:'Выбрать небольшой шаг по этой теме'};(state.customSkills||=[]).push(t);return t;
  }
  function records(state,today){return state.goals.flatMap(g=>['entries','legacyEntries'].flatMap(field=>Object.values(g[field]||{}).filter(e=>e.date<=today&&(e.result||e.link)).map(entry=>({goalId:g.id,title:g.title,entry,legacy:field==='legacyEntries'})))).sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||a.goalId.localeCompare(b.goalId));}
  return {stages,topics,catalog,entryFor,saveEntry,nextStep,setShort,shortEvents,setSkill,addSkill,records,validateLearning,safeLink,suggestTopic,completeSession};
})();
