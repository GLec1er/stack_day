var ControlUI=(()=>{
  const M=GoalsModel,L=LearningModel,C=ControlModel,$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let actions,state,selected,today,timer=null,moving=null,practice=null,reviewRows=[];
  const TIMER_KEY='my-focus:personal-goals:v1:timer';
  const fmt=s=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(M.date(s));
  function init(a){
    actions=a;try{const t=JSON.parse(localStorage.getItem(TIMER_KEY));if(t&&typeof t.id==='string'&&M.validDate(t.date)&&Number.isFinite(t.seconds)&&t.seconds>=0&&(!t.running||Number.isFinite(t.startedAt)))timer=t;}catch(e){}
    $('#goal-scope').onchange=editorScope;$('#goal-metric-unit').onchange=metricOptions;
    $('#practice-timer-start').onclick=()=>startTimer(practice?.id,practice?.date);
    $('#timer-pause').onclick=()=>{timer=timer.running?C.timerPause(timer,Date.now()):C.timerStart(timer,timer.id,timer.date,Date.now());saveTimer();renderTimer();};
    $('#timer-finish').onclick=finishTimer;
    $('#review-source').onchange=()=>{$('#review-notes').hidden=true;};
    $('#review-reveal').onclick=()=>{const r=$('#review-source').value===''?null:reviewRows[Number($('#review-source').value)];$('#review-notes').textContent=r?r.e.result:'Выбери запись для сравнения.';$('#review-notes').hidden=false;};
    $('#history-query').oninput=searchHistory;
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-control-open],[data-control-move],[data-control-rest],[data-control-restore],[data-history-open]');if(!b)return;
      const id=b.dataset.controlOpen||b.dataset.controlMove||b.dataset.controlRest||b.dataset.controlRestore||b.dataset.historyOpen,date=b.dataset.date||selected,g=actions.getState().goals.find(g=>g.id===id);if(!g)return;
      if(b.dataset.controlOpen||b.dataset.historyOpen){actions.openPractice(id,date,b.dataset.entryKey||null,b.dataset.entryField||'entries');if(b.dataset.reviewGoal){const i=reviewRows.findIndex(x=>x.g.id===b.dataset.reviewGoal&&x.key===b.dataset.reviewKey);if(i>=0){$('#review-source').value=String(i);$('#self-check').open=true;$('#review-notes').hidden=true;}}return;}
      if(b.dataset.controlMove){moving={id,date};$('#move-context').textContent=M.goalAt(g,date).title+' · '+fmt(date);$('#move-date').value=M.addDays(date,1);$('#move-error').hidden=true;$('#move-dialog').showModal();return;}
      try{actions.commit(s=>{const base=s.goals.find(x=>x.id===id);if(b.dataset.controlRestore&&base.overrides?.[date]?.status==='moved')throw Error('Перенесённое занятие находится на новой дате. Его можно перенести обратно из календаря.');M.skipOccurrence(base,date,!b.dataset.controlRestore);});actions.notify(b.dataset.controlRestore?'Занятие возвращено в план':'Отдых запланирован только на этот день');}catch(err){actions.notify(err.message);}
    });
    $('#move-form').onsubmit=e=>{e.preventDefault();try{const date=$('#move-date').value;actions.commit(s=>M.moveOccurrence(s,moving.id,moving.date,date));$('#move-dialog').close();actions.selectDay(date);actions.notify('Занятие перенесено вместе с записью');}catch(err){$('#move-error').textContent=err.message;$('#move-error').hidden=false;}};
    setInterval(renderTimer,1000);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveTimer();});
  }
  function editor(g,s){
    $('#goal-scope-row').hidden=!g;$('#goal-scope').value=g?(g.recurrence&&g.recurrence!=='none'?'one':'all'):'all';
    $('#goal-scope-row').dataset.date=s;$('#goal-scope-row').dataset.horizon=g?M.goalAt(g,s).horizon:$('#goal-horizon').value;
    const metric=g?M.goalAt(g,s).metric:null;$('#goal-metric-unit').value=metric?.unit||'';$('#goal-metric-target').value=metric?.target||20;$('#goal-metric-kind').value=metric?.kind||'all';
    editorScope();metricOptions();
  }
  function editorScope(){const one=!$('#goal-scope-row').hidden&&$('#goal-scope').value==='one';$('#goal-horizon').disabled=one;$('#goal-recurrence').disabled=one;$('#goal-date').disabled=one;$('#goal-date-label').firstChild.textContent=one?'Занятие':'Дата начала';if(one)$('#goal-date').value=$('#goal-scope-row').dataset.date;}
  function metricOptions(){const month=$('#goal-horizon').value==='month';$('#goal-metric-row').hidden=!month;const automatic=month&&$('#goal-metric-unit').value;$('#goal-metric-target').disabled=!automatic;$('#goal-metric-kind').disabled=!automatic;}
  function metricFields(){return $('#goal-horizon').value==='month'&&$('#goal-metric-unit').value?{unit:$('#goal-metric-unit').value,target:Number($('#goal-metric-target').value),kind:$('#goal-metric-kind').value}:undefined;}
  function render(s,date,current){state=s;today=date;selected=current;
    const stats=C.summary(state,today);$('#seven-day-summary').innerHTML='<div><span class="eyebrow">ПОСЛЕДНИЕ 7 ДНЕЙ</span><strong>'+stats.completed+' занятий <small>+ '+stats.short+' коротких</small></strong></div><div><span>План / факт времени</span><strong>'+stats.plannedMinutes+' / '+(stats.tracked?stats.actualMinutes:'—')+' мин</strong><small>Время записано у '+stats.tracked+' занятий</small></div><div><span>Практика</span><strong>'+stats.problems+' задач · '+stats.diagrams+' схем</strong><small>'+stats.pages+' страниц · '+stats.missed+' дней без отметок</small></div>';
    const due=C.dueReviews(state,today).slice(0,3);if(due.length)$('#seven-day-summary').innerHTML+='<div class="due-review"><span>Пора вернуться к теме:</span>'+due.map(x=>{const review=state.goals.find(g=>M.occurs(g,'day',today)&&M.kindOf(M.goalAt(g,today))==='review');return '<button data-control-open="'+esc(review?.id||x.g.id)+'" data-date="'+today+'" data-review-goal="'+esc(x.g.id)+'" data-review-key="'+esc(x.key)+'">'+esc(x.e.topic)+' · '+fmt(x.e.reviewOn)+'</button>';}).join('')+'</div>';
    searchHistory();renderTimer();
  }
  function monthMarkup(g,date){const p=C.monthProgress(actions.getState(),g,date,actions.today());return p?'<div class="month-counter"><div><strong>'+p.value+' / '+p.target+'</strong><span>'+p.unit+(p.done?' · цель достигнута':'')+'</span></div><progress value="'+Math.min(p.value,p.target)+'" max="'+p.target+'" aria-label="Прогресс: '+esc(g.title)+'"></progress><small>Из результатов занятий этого месяца</small></div>':'';}
  function calendarControls(r,date){const g=r.goal;if(r.skipped)return '<div class="calendar-task-actions">'+(r.status==='moved'?'<button data-open-day="'+esc(r.movedTo)+'">Перенесено на '+fmt(r.movedTo)+'</button>':'<button data-control-restore="'+esc(g.id)+'" data-date="'+date+'">Вернуть в план</button>')+'</div>';
    return '<div class="calendar-task-actions"><button data-control-open="'+esc(g.id)+'" data-date="'+date+'" data-entry-key="'+esc(r.entryKey||'')+'">План и результат</button>'+(r.daily&&r.planned&&!r.done?'<button data-control-move="'+esc(g.id)+'" data-date="'+date+'">Перенести</button><button data-control-rest="'+esc(g.id)+'" data-date="'+date+'">Отдых</button>':'')+'</div>';}
  function openPractice(g,date,key=null,field='entries'){
    practice={id:g.id,date};const e=L.entryFor(g,date,key,field);for(const [id,key] of [['practice-minutes','actualMinutes'],['practice-pages','pages'],['practice-problems','problems'],['practice-diagrams','diagrams']])$('#'+id).value=e?.[key]??'';
    $('#practice-timer-start').disabled=date>actions.today()||g.archived||Boolean(key&&e?.horizon!==M.goalAt(g,date).horizon);
    reviewRows=C.reviewCandidates(actions.getState(),date);
    $('#review-source').innerHTML='<option value="">Выбрать прошлую запись</option>'+reviewRows.map((r,i)=>'<option value="'+i+'">'+esc(fmt(r.e.date)+' · '+(r.e.topic||r.g.title))+'</option>').join('');
    const existing=reviewRows.findIndex(r=>e?.reviewGoalId?r.g.id===e.reviewGoalId&&r.key===e.reviewKey:r.e.date===e?.reviewOf&&(r.e.skillId===e?.skillId||r.e.topic===e?.topic));$('#review-source').value=existing>=0?String(existing):'';
    $('#practice-recall').value=e?.recall||'';$('#review-rating').value=e?.selfRating||'';$('#review-date').value=e?.reviewOn||'';$('#review-notes').hidden=true;$('#self-check').open=M.kindOf(M.goalAt(g,date))==='review';
  }
  function practiceFields(){const r=$('#review-source').value===''?null:reviewRows[Number($('#review-source').value)];return {actualMinutes:$('#practice-minutes').value,pages:$('#practice-pages').value,problems:$('#practice-problems').value,diagrams:$('#practice-diagrams').value,recall:$('#practice-recall').value,selfRating:$('#review-rating').value,reviewOn:$('#review-date').value,reviewOf:r?.e.date||'',reviewGoalId:r?.g.id||'',reviewKey:r?.key||''};}
  function saveTimer(){try{timer?localStorage.setItem(TIMER_KEY,JSON.stringify(timer)):localStorage.removeItem(TIMER_KEY);}catch(e){actions.notify('Таймер не удалось сохранить в браузере.');}}
  function startTimer(id,date){if(!id||date>actions.today())return;try{timer=C.timerStart(timer,id,date,Date.now());saveTimer();renderTimer();actions.notify('Таймер запущен. Можно закрыть форму.');}catch(e){actions.notify(e.message);}}
  function finishTimer(){if(!timer)return;const t=timer,minutes=C.timerFinish(t,Date.now()).minutes;try{actions.commit(s=>{const g=s.goals.find(g=>g.id===t.id);if(!g)throw Error('Цель таймера не найдена.');L.saveEntry(g,t.date,{actualMinutes:Math.round(((L.entryFor(g,t.date)?.actualMinutes||0)+minutes)*10)/10});});timer=null;saveTimer();renderTimer();if(practice?.id===t.id&&practice.date===t.date)$('#practice-minutes').value=L.entryFor(actions.getState().goals.find(g=>g.id===t.id),t.date).actualMinutes;actions.notify('Фактическое время сохранено: '+minutes+' мин');}catch(e){actions.notify(e.message);}}
  function renderTimer(){const bar=$('#session-timer');if(!bar)return;bar.hidden=!timer;if(!timer)return;const g=actions.getState().goals.find(g=>g.id===timer.id),sec=Math.floor(C.timerSeconds(timer,Date.now()));$('#timer-title').textContent=(g?M.goalAt(g,timer.date).title:'Занятие')+' · '+fmt(timer.date);$('#timer-clock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');$('#timer-pause').textContent=timer.running?'Пауза':'Продолжить';}
  function searchHistory(){
    if(!state)return;const q=$('#history-query').value.trim(),rows=q?C.search(state,q,today).slice(0,30):C.recentSessions(state,today);
    $('#history-results').innerHTML=rows.map(x=>{const date=x.date||x.e.date,status=x.status==='done'?'Выполнено':x.status==='short'?'Короткое занятие':q?'Запись занятия':'Запись сохранена · выполнение не отмечено',result=x.e.result||'';
      return '<button class="history-result" data-history-open="'+esc(x.g.id)+'" data-date="'+date+'" data-entry-key="'+esc(x.key||'')+'" data-entry-field="'+(x.field||'entries')+'"><small>'+fmt(date)+' · '+esc(status)+'</small><strong>'+esc(x.e.topic||x.title||x.g.title)+'</strong><span>'+esc(result.slice(0,140)||(x.status==='done'?'Добавить короткий результат занятия':'Открыть план и результат'))+'</span>'+ (x.e.actualMinutes!==undefined?'<small>Факт: '+x.e.actualMinutes+' мин</small>':'')+'</button>';
    }).join('')||(q?'<p>Записей не найдено.</p>':'<p class="recent-empty">Здесь появятся последние выполнения и записи. Результат можно добавить и после отметки задачи.</p>');
  }
  return {init,render,editor,editorScope,metricOptions,metricFields,monthMarkup,calendarControls,openPractice,practiceFields};
})();
