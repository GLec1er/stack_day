(() => {
  'use strict';
  const M = GoalsModel;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const KEY = 'my-focus:personal-goals:v1';
  const topicLabels={system:'Системный дизайн',algorithms:'Алгоритмы',practice:'Практика кодом',review:'Повторение',project:'Учебный проект',other:'Другое в IT'};
  const topicIcons={system:'nodes',algorithms:'code',practice:'terminal',review:'repeat',project:'cube',other:'grid'};
  const priorityLabels={high:'Высокий приоритет',normal:'Обычный приоритет',low:'Низкий приоритет'};
  const horizonLabels = {day:'день',month:'месяц'};
  const recurrenceLabels = {daily:'Каждый день',weekdays:'По будням · Пн–Пт',weekends:'По выходным · Сб–Вс',weekly:'В этот день недели',monthly:'Каждый месяц'};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  function goalTags(g){const kind=M.kindOf(g),priority=M.priorityOf(g);return '<div class="goal-tags"><span class="kind-badge" data-kind="'+kind+'">'+icon(topicIcons[kind])+topicLabels[kind]+'</span><span class="priority-badge" data-priority="'+priority+'"><span class="priority-bars" aria-hidden="true"><i></i><i></i><i></i></span>'+priorityLabels[priority]+'</span></div>';}
  const format = (s, options) => new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',...options}).format(M.date(s));
  const now = () => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
  const seed = () => M.upgradeState({version:1,focus:'it',name:'Григорий',goals:[],notes:{}},now());
  const localStore=PlanStorage.create({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)},KEY);
  let state, storageAvailable = true, corruptRaw = null;
  function readFocused(raw) {
    let original;try{original=M.validateState(JSON.parse(raw));}catch(e){original=M.repairState(JSON.parse(raw));if(!localStorage.getItem(KEY+':before-repair'))localStorage.setItem(KEY+':before-repair',raw);}
    const focused = M.upgradeState(original,now());
    if((Number(original.schemaRevision)||0)<3){
      try { if(!localStorage.getItem(KEY+':before-daily-monthly'))localStorage.setItem(KEY+':before-daily-monthly',raw); }
      catch(e) { corruptRaw=raw; }
    }
    if (focused.goals.length !== original.goals.length) {
      try { if (!localStorage.getItem(KEY+':before-it-focus')) localStorage.setItem(KEY+':before-it-focus',raw); }
      catch(e) { corruptRaw=raw; }
    }
    return focused;
  }
  try { const raw = localStorage.getItem(KEY); if(raw){try{state=readFocused(raw);}catch(e){corruptRaw=raw;state=seed();}} else state=seed(); }
  catch(e){state=seed();storageAvailable=false;}
  let view='day', selected=now(), filter='all', category='', query='', editing=null, pendingImport=null, toastTimer, noteTimer, undoAction=null;
  const expanded = new Set();
  function toast(message, undo=null) {
    clearTimeout(toastTimer);$('#toast-text').textContent=message;undoAction=undo;$('#toast-undo').hidden=!undo;$('#toast').classList.add('visible');
    toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),undo?10000:4500);
  }
  function persist() {
    if(corruptRaw){$('#save-status').classList.add('error');$('#save-status').innerHTML='<span></span> Нужна резервная копия';return false;}
    try { M.validateState(state);localStore.save(state);SyncUI.changed();storageAvailable=true;$('#save-status').classList.remove('error');$('#save-status').innerHTML='<span></span> Сохранено в браузере';SyncUI.render();return true; }
    catch(e){storageAvailable=false;$('#save-status').classList.add('error');$('#save-status').innerHTML='<span></span> Скачайте копию плана';toast('Браузер не сохранил изменения. Скачайте резервную копию.');return false;}
  }
  const getGoals = (h=view,s=selected) => h==='archive'?state.goals.filter(g=>g.archived):state.goals.filter(g=>M.occurs(g,h,s)).map(g=>M.goalAt(g,s));
  const progressFor=g=>g.metric?{done:ControlModel.monthProgress(state,g,selected,now()).done,steps:[]}:M.progress(g,selected);
  const sorted = goals => M.sortGoals(goals,selected);
  function periodLabel(h,s,short=false) {
    if(h==='week'){const monday=M.periodKey('week',s),end=M.addDays(monday,6);return format(monday,{day:'numeric',month:'short'})+' — '+format(end,{day:'numeric',month:'short'});}
    if(h==='month')return format(s,{month:'long',...(short?{}:{year:'numeric'})}).replace(' г.','');
    return format(s,{day:'numeric',month:'long'});
  }
  function render() {
    $$('.main-nav [data-view],.period-tabs [data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on&&b.closest('.main-nav'));b.classList.toggle('selected',on&&b.closest('.period-tabs'));if(b.getAttribute('role')==='tab')b.setAttribute('aria-selected',String(on));});
    const achievements=view==='achievements';
    $('#plan-workspace').hidden=achievements;$('#achievements-section').hidden=!achievements;
    $('.daily-challenge').hidden=achievements;$('.progress-dashboard').classList.toggle('awards-view',achievements);
    $('.period-summary').hidden=achievements;$('#new-goal').hidden=achievements;
    for(const k of ['day','month'])$('#'+k+'-nav-count').textContent=getGoals(k).filter(g=>!progressFor(g).done).length;
    if(achievements){
      LearningUI.hideFeedback();
      VoiceUI.setNoteContext('achievements');
      $('#date-eyebrow').textContent='STACKDAY · ТВОЙ ПРОГРЕСС';
      $('#page-heading').textContent='Твои достижения';
      $('#page-subtitle').innerHTML='У каждой награды —<br>условие и дата открытия.';
      StackdayUI.render(state,now(),selected);
      return;
    }
    $('#plan-workspace').setAttribute('aria-labelledby',view+'-tab');
    const h=view==='archive'?'day':view;
    const goals=getGoals(); const done=goals.filter(g=>progressFor(g).done).length;
    $$('.category-nav button').forEach(b=>b.classList.toggle('active',b.dataset.category===category));
    $('#date-eyebrow').textContent=(view==='day'?format(selected,{weekday:'long',day:'numeric',month:'long'}):view==='month'?periodLabel(h,selected):'АРХИВ').toUpperCase();
    $('#page-heading').textContent=view==='archive'?'Архив целей':view==='month'?'План на месяц':M.isWeekend(selected)?'Повторение и конспект':'Твоя IT-практика';
    $('#page-subtitle').innerHTML=view==='archive'?'Цели, которые можно<br>вернуть в план.':view==='month'?'Темы, навыки<br>и учебные проекты.':M.isWeekend(selected)?'Суббота и воскресенье —<br>закрепляем прочитанное.':'Системный дизайн и алгоритмы.<br>Чтение с понедельника по пятницу.';
    $('#stat-total').textContent=goals.length;$('#stat-done').textContent=done;
    const shortCount=goals.filter(g=>LearningModel.entryFor(g,selected)?.shortDone&&!M.progress(g,selected).done).length;
    $('#stat-short').hidden=!shortCount;$('#stat-short').textContent='Коротких: '+shortCount;
    $('#stat-total-title').textContent=goals.length===1?'цель':goals.length>=2&&goals.length<=4?'цели':'целей';
    const minutes=goals.reduce((sum,g)=>sum+(Number.isFinite(g.minutes)&&g.minutes>0?g.minutes:0),0);
    $('#stat-time').parentElement.hidden=!minutes;
    $('#stat-time').innerHTML=minutes>=60?Math.floor(minutes/60)+' <small>ч'+(minutes%60?' '+minutes%60+' мин':'')+'</small>':minutes+' <small>мин</small>';
    $('#date-control-label').textContent=periodLabel(h,selected,true);$('#selected-date').value=selected;
    $('#week-strip').hidden=view==='month'||view==='archive';
    if(!$('#week-strip').hidden){const monday=M.periodKey('week',selected);$('#week-strip').innerHTML=Array.from({length:7},(_,i)=>{const s=M.addDays(monday,i),d=M.calendarDay(state,s,now());return '<button class="day-chip '+(s===selected?'selected ':'')+(s===now()?'today ':'')+d.status+'" data-day="'+s+'" aria-label="'+esc(format(s,{weekday:'long',day:'numeric',month:'long'}))+', '+d.done+' из '+d.total+' задач выполнено" '+(s===selected?'aria-current="date"':'')+'><span>'+format(s,{weekday:'short'}).toUpperCase()+'</span><strong>'+Number(s.slice(8))+'</strong><small>'+d.done+'/'+d.total+'</small></button>';}).join('');}
    $('#list-heading').innerHTML=(view==='archive'?'Сохранённые цели':'Цели на '+horizonLabels[h])+' <span id="list-count">'+goals.length+'</span>';
    $('#filter-all').textContent=goals.length;$('#filter-active').textContent=goals.length-done;$('#filter-done').textContent=done;
    $$('.filter-row button').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));
    renderGoals(goals);
    $('#add-inline').hidden=view==='archive';
    $('#weekend-guide-btn').hidden=view!=='day';
    renderRail();
    const noteKey=h+':'+M.periodKey(h,selected);
    VoiceUI.setNoteContext(noteKey);
    $('#period-note').value=state.notes?.[noteKey]||'';
    $('#note-title').textContent='Заметки';
    $('#period-note').placeholder='Ссылки, вопросы и заметки по изученному.';
    StackdayUI.render(state,now(),selected);
    LearningUI.render(state,now(),selected);ControlUI.render(state,now(),selected);
  }
  function renderGoals(goals) {
    const shown=sorted(goals).filter(g=>(!category||g.category===category)&&(!query||[g.title,...g.steps,LearningModel.entryFor(g,selected)?.topic||''].some(t=>t.toLocaleLowerCase('ru').includes(query)))&&(filter==='all'||M.progress(g,selected).done===(filter==='done')));
    if(!shown.length){const emptyFilter=goals.length>0;$('#goal-list').innerHTML='<div class="empty-state"><h3>'+esc(emptyFilter?'Цели не найдены':view==='archive'?'Архив пока пуст':view==='month'?'Целей на месяц пока нет':'Целей на этот день пока нет')+'</h3><p>'+esc(emptyFilter?'Попробуйте другой фильтр или поисковый запрос.':view==='archive'?'Цели из архива можно вернуть в план в любой момент.':view==='month'?'Добавьте тему, навык или учебный проект.':'Добавьте задачу или тему для изучения.')+'</p>'+(view!=='archive'&&!emptyFilter?'<button class="primary-button" data-action="new">'+icon('plus')+'Добавить цель</button>':'')+'</div>';return;}
    $('#goal-list').innerHTML=shown.map(g=>{
      const p=progressFor(g), labels=M.stepLabels(g,selected),open=expanded.has(g.id),stepsDone=p.steps.filter(Boolean).length;
      const stepsMeta=labels.length?'<span class="meta-part">'+icon('grid')+stepsDone+'/'+labels.length+' шага</span>':'';
      const dateMeta=view==='archive'?'<span>'+esc(periodLabel(g.horizon,g.date))+'</span>':'';
      return '<article class="goal-row '+(p.done?'done ':'')+'" data-kind="'+M.kindOf(g)+'" data-priority="'+M.priorityOf(g)+'" data-id="'+esc(g.id)+'"><div class="goal-main">'+(view==='archive'?'<button class="icon-button restore-goal" data-action="restore" aria-label="Вернуть цель '+esc(g.title)+'">'+icon('repeat')+'</button>':'<input type="checkbox" class="goal-check" data-action="done" aria-label="Выполнить цель: '+esc(g.title)+'" '+(p.done?'checked':'')+(g.metric?' disabled':'')+'>')+'<div class="goal-content"><button class="goal-title" data-action="expand" aria-expanded="'+open+'">'+esc(g.title)+'</button>'+goalTags(g)+'<div class="goal-meta">'+(g.minutes>0?'<span class="meta-part">'+icon('clock')+esc(g.minutes)+' мин</span>':'')+stepsMeta+(g.metric?'':'<span class="goal-xp">+'+M.xpFor[M.kindOf(g)]+' XP</span>')+dateMeta+(g.recurrence&&g.recurrence!=='none'?'<span class="meta-part" title="'+esc(recurrenceLabels[g.recurrence])+'">'+icon('repeat')+esc(recurrenceLabels[g.recurrence])+'</span>':'')+'</div>'+ControlUI.monthMarkup(g,selected)+LearningUI.inline(g,selected,view==='archive')+'</div><div class="goal-actions"><button class="icon-button star-button '+(g.favorite?'starred':'')+'" data-action="star" aria-label="'+(g.favorite?'Убрать из фокуса: ':'Закрепить в фокусе: ')+esc(g.title)+'" aria-pressed="'+Boolean(g.favorite)+'">'+icon('star')+'</button><button class="icon-button edit-button" data-action="edit" aria-label="Редактировать цель: '+esc(g.title)+'">'+icon('edit')+'</button><button class="icon-button expand-button '+(open?'open':'')+'" data-action="expand" aria-label="'+(open?'Свернуть':'Развернуть')+' цель: '+esc(g.title)+'" aria-expanded="'+open+'">'+icon('down')+'</button></div></div>'+(open?'<div class="goal-steps">'+labels.map((step,i)=>'<label class="step-item"><input type="checkbox" data-action="step" data-step="'+i+'" '+(p.steps[i]?'checked':'')+' '+(view==='archive'?'disabled':'')+'><span>'+esc(step)+'</span></label>').join('')+'</div><div class="goal-expanded-actions"><button class="archive-button" data-action="'+(view==='archive'?'restore':'archive')+'">'+(view==='archive'?'Вернуть в план':'Переместить в архив')+'</button><button class="archive-button" data-action="edit">Редактировать</button></div>':'')+'</article>';
    }).join('');
  }
  function renderRail() {
    $('#month-label').textContent=periodLabel('month',selected);
    const months=sorted(getGoals('month'));
    $('#monthly-goals').innerHTML=months.length?months.map(g=>{const p=progressFor(g);return '<div class="month-goal" data-kind="'+M.kindOf(g)+'" data-priority="'+M.priorityOf(g)+'"><h3>'+esc(g.title)+'</h3>'+goalTags(g)+ControlUI.monthMarkup(g,selected)+'<div class="rail-meta" style="margin-top:9px"><span>'+(g.metric?'Автоматический счётчик':'+'+M.xpFor[M.kindOf(g)]+' XP')+'</span><button class="rail-check" data-rail-done="'+esc(g.id)+'" '+(g.metric?'disabled ':'')+'aria-label="'+(p.done?'Отменить выполнение: ':'Выполнить: ')+esc(g.title)+'">'+icon(p.done?'check':'target')+(g.metric?(p.done?'Достигнуто':'Из занятий'):p.done?'Готово':'Отметить')+'</button></div></div>';}).join('')+'<button class="rail-add" data-action="new-month">Добавить цель месяца</button>':'<p class="month-empty">Цель пока не задана.</p><button class="month-add" data-action="new-month">'+icon('plus')+'Добавить цель месяца</button>';
  }
  function switchView(next) {view=next;filter='all';query='';$('#search-input').value='';render();}
  function recurrenceOptions(h, selectedValue='none') {
    const values=h==='day'?['none','daily','weekdays','weekends','weekly']:['none','monthly'];
    $('#goal-recurrence').innerHTML=values.map(v=>'<option value="'+v+'">'+(v==='none'?'Не повторять':recurrenceLabels[v])+'</option>').join('');
    $('#goal-recurrence').value=values.includes(selectedValue)?selectedValue:'none';
  }
  function openGoal(h=view,g=null) {
    editing=g?.id||null;const base=g;if(g)g=M.goalAt(g,selected);$('#goal-form').reset();$('#form-error').hidden=true;
    $('#dialog-title').textContent=g?'Редактировать цель':'Новая цель';
    $('#goal-title').value=g?.title||'';$('#goal-horizon').value=g?.horizon||M.defaultHorizon(h);
    $('#goal-date').value=g?.date||selected;
    $('#goal-kind').value=g?M.kindOf(g):'other';
    $('#goal-priority').value=g?.priority||'normal';$('#goal-minutes').value=g?.minutes||'';
    $('#goal-steps').value=g?.steps.join('\n')||'';$('#goal-favorite').checked=Boolean(g?.favorite);
    recurrenceOptions($('#goal-horizon').value,g?.recurrence);ControlUI.editor(base,selected);$('#goal-dialog').showModal();
    setTimeout(()=>$('#goal-title').focus(),0);
  }
  function openBackup() {
    $('#import-preview').hidden=true;pendingImport=null;
    let previous=false;try{previous=Boolean(localStorage.getItem(KEY+':previous'));}catch(e){}
    $('#restore-previous').hidden=!previous;
    if(corruptRaw&&!$('#download-original')){const b=document.createElement('button');b.id='download-original';b.className='secondary-button';b.textContent='Скачать исходную повреждённую копию';b.onclick=()=>download(corruptRaw,'stackday-recovery.json');$('#backup-dialog').append(b);}
    SyncUI.render();SyncUI.loadSnapshots();$('#backup-dialog').showModal();
  }
  function download(content,name) {const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  $$('.main-nav [data-view],.period-tabs [data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $$('.category-nav button').forEach(b=>b.addEventListener('click',()=>{category=category===b.dataset.category?'':b.dataset.category;render();}));
  $$('.filter-row button').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
  $('#new-goal').onclick=()=>openGoal();$('#add-inline').onclick=()=>openGoal();
  $('#month-shortcut').onclick=()=>switchView('month');
  $('#awards-shortcut').onclick=()=>switchView('achievements');
  $('.jump-nav a[href="#calendar-section"]').onclick=()=>{if(view==='achievements')switchView('day');};
  $('#weekend-guide-btn').onclick=()=>$('#weekend-guide-dialog').showModal();
  $$('#weekend-guide-dialog [data-weekend-example]').forEach(b=>b.onclick=()=>{
    const saturday=b.dataset.weekendExample==='saturday',date=M.addDays(M.periodKey('week',selected),saturday?5:6);
    $('#weekend-guide-dialog').close();openGoal('day');
    $('#goal-title').value=saturday?'Повторение недели: системный дизайн и алгоритмы':'Закрепление недели: объяснить и применить';
    $('#goal-date').value=date;$('#goal-kind').value='review';$('#goal-priority').value=saturday?'high':'normal';$('#goal-minutes').value=saturday?'45':'30';
    $('#goal-steps').value=(saturday?['По памяти выписать 5 главных идей системного дизайна','Разобрать 2 примера по алгоритмам без подсказки','Сверить с материалом и дополнить конспект']:['Объяснить одну тему системного дизайна своими словами','Решить одну задачу по изученному алгоритму','Записать пробелы и темы для следующей недели']).join('\n');
    recurrenceOptions('day','weekly');
  });
  $('.brand').onclick=e=>{e.preventDefault();selected=now();category='';switchView('day');};
  $('#week-strip').onclick=e=>{const b=e.target.closest('[data-day]');if(b){selected=b.dataset.day;switchView('day');}};
  function shiftDate(n) {if(view==='month'){const d=M.date(selected);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);selected=M.iso(d);}else selected=M.addDays(selected,n);render();}
  $('#prev-date').onclick=()=>shiftDate(-1);$('#next-date').onclick=()=>shiftDate(1);$('#today-btn').onclick=()=>{selected=now();render();};
  $('#selected-date').onchange=e=>{if(M.validDate(e.target.value)){selected=e.target.value;render();}};
  $('#search-toggle').onclick=()=>{const box=$('#search-box');box.hidden=!box.hidden;if(!box.hidden)$('#search-input').focus();else{query='';$('#search-input').value='';render();}};
  $('#search-input').oninput=e=>{query=e.target.value.toLocaleLowerCase('ru').trim();renderGoals(getGoals());};
  $('#goal-list').addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b||b.matches('input'))return;
    if(b.dataset.action==='new'){openGoal();return;}
    const row=b.closest('[data-id]'),g=state.goals.find(g=>g.id===row?.dataset.id);if(!g)return;
    const action=b.dataset.action;
    if(action==='expand'){expanded.has(g.id)?expanded.delete(g.id):expanded.add(g.id);renderGoals(getGoals());return;}
    if(action==='edit'){openGoal(g.horizon,g);return;}
    if(action==='star')g.favorite=!g.favorite;
    if(action==='archive'){g.archived=true;const saved=persist();render();toast(saved?'Цель перенесена в архив':'Цель в архиве. Скачайте копию плана.',()=>{g.archived=false;persist();render();toast('Цель возвращена в план');});return;}
    if(action==='restore'){g.archived=false;persist();render();toast('Цель возвращена в план');return;}
    persist();render();
  });
  $('#goal-list').addEventListener('change',e=>{const input=e.target;if(!input.matches('input[data-action]'))return;const g=state.goals.find(g=>g.id===input.closest('[data-id]')?.dataset.id);if(!g||g.archived)return;completeGoal(g,input.dataset.action==='step'?Number(input.dataset.step):null);});
  $('.right-rail').addEventListener('click',e=>{const b=e.target.closest('[data-rail-done],[data-action]');if(!b)return;if(b.dataset.action==='new-month'){openGoal('month');return;}const g=state.goals.find(g=>g.id===b.dataset.railDone);if(g)completeGoal(g);});
  $('#goal-horizon').onchange=()=>{recurrenceOptions($('#goal-horizon').value);ControlUI.metricOptions();};
  $('#goal-form').onsubmit=e=>{
    e.preventDefault();const title=$('#goal-title').value.trim(),h=$('#goal-horizon').value,date=$('#goal-date').value;
    const steps=$('#goal-steps').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(!title||!['day','month'].includes(h)||!M.validDate(date)||steps.length>30||steps.some(s=>s.length>240)){$('#form-error').hidden=false;$('#form-error').textContent='Проверьте название, период, дату и шаги: до 30 шагов, каждый до 240 символов.';return;}
    const old=state.goals.find(g=>g.id===editing);
    const fields={title,horizon:h,date,category:'it',kind:$('#goal-kind').value,priority:$('#goal-priority').value,minutes:Math.max(0,Math.min(9999,Number($('#goal-minutes').value)||0)),recurrence:$('#goal-recurrence').value,favorite:$('#goal-favorite').checked,steps,metric:ControlUI.metricFields()||null};
    try{if(old)M.editGoal(state,old.id,fields,$('#goal-scope').value,selected);
    else {const goal={id:typeof crypto.randomUUID==='function'?crypto.randomUUID():'goal-'+Date.now()+'-'+Math.random().toString(36).slice(2),...fields,completions:{},archived:false};M.validateState({...state,goals:[...state.goals,goal]});state.goals.push(goal);}}
    catch(err){$('#form-error').hidden=false;$('#form-error').textContent=err.message;return;}
    view=h;selected=date;filter='all';category='';query='';$('#search-input').value='';const saved=persist();$('#goal-dialog').close();render();toast(saved?(old?'Цель обновлена':'Цель добавлена'):'Цель добавлена. Скачайте копию, чтобы сохранить её.');
  };
  $$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
  $('#period-note').oninput=e=>{const h=view==='archive'?'day':view;state.notes||={};state.notes[h+':'+M.periodKey(h,selected)]=e.target.value;$('#note-save').textContent='сохраняем…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>{$('#note-save').textContent=persist()?'сохранено':'скачайте копию';},500);};
  $('#backup-btn').onclick=openBackup;
  $('#export-btn').onclick=()=>{download(JSON.stringify(state,null,2),'stackday-'+now()+'.json');toast('Резервная копия готова к скачиванию');};
  $('#import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>8*1024*1024)throw Error('Файл слишком большой. Максимум — 8 МБ.');pendingImport=M.upgradeState(JSON.parse(await file.text()),now());$('#import-summary').textContent='В копии: '+pendingImport.goals.length+' IT-целей и '+Object.keys(pendingImport.notes||{}).length+' заметок.';$('#import-preview').hidden=false;}catch(err){pendingImport=null;$('#import-preview').hidden=true;toast(err instanceof SyntaxError?'Не удалось прочитать JSON-файл. Выберите резервную копию плана.':err.message);}};
  $('#confirm-import').onclick=()=>{if(!pendingImport)return;try{localStorage.setItem(KEY+':previous',JSON.stringify(state));}catch(e){toast('Сначала скачайте текущую копию: браузер не может сохранить предыдущий план.');return;}state=pendingImport;pendingImport=null;corruptRaw=null;persist();$('#backup-dialog').close();category='';view='day';filter='all';render();toast('Ваш план восстановлен');};
  $('#restore-previous').onclick=()=>{try{const previous=M.upgradeState(JSON.parse(localStorage.getItem(KEY+':previous')),now());localStorage.setItem(KEY+':previous',JSON.stringify(state));state=previous;corruptRaw=null;persist();$('#backup-dialog').close();render();toast('Предыдущий план возвращён');}catch(e){toast('Не удалось прочитать предыдущую копию.');}};
  $('#toast-undo').onclick=()=>{const action=undoAction;$('#toast').classList.remove('visible');undoAction=null;action?.();};
  document.addEventListener('keydown',e=>{const typing=e.target.matches('input,textarea,select');if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search-box').hidden=false;$('#search-input').focus();}if(!typing&&!e.metaKey&&!e.ctrlKey&&e.key.toLowerCase()==='n'&&!$$('dialog[open]').length){e.preventDefault();openGoal();}});
  window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{corruptRaw=null;state=readFocused(e.newValue);render();toast('План обновлён из другой вкладки');}catch(err){toast('Другая вкладка сохранила некорректные данные. Текущий план сохранён.');}}});
  function completeGoal(g,step=null) {
    const today=now();g=state.goals.find(x=>x.id===g.id)||g;const actual=M.goalAt(g,selected);if(actual.metric){toast('Этот счётчик обновляется из результатов занятий.');render();return;}
    if(M.periodKey(actual.horizon,selected)>M.periodKey(g.horizon,today)){toast('Будущие цели можно планировать. Выполнение отметьте в день занятия.');render();return;}
    const before=M.journal(state,today);
    if(step===null)M.toggleDone(g,selected,today);else M.toggleStep(g,selected,step,today);
    const after=M.journal(state,today),newRewards=after.achievements.filter(a=>a.unlockedOn&&!before.achievements.find(b=>b.id===a.id)?.unlockedOn);
    const earned=after.xp-before.xp;persist();render();
    if(earned>0)LearningUI.celebrate(g,selected,earned,g.horizon==='day'&&Boolean(after.days[selected]?.full),false,newRewards);
    else if(earned<0){LearningUI.hideFeedback();toast('Отметка снята. Очки и достижения пересчитаны.');}
  }
  ControlUI.init({getState:()=>state,today:now,notify:toast,commit:action=>{const draft=M.validateState(state);action(draft);M.validateState(draft);state=draft;const saved=persist();render();return saved;},selectDay:s=>{selected=s;switchView('day');},openPractice:(id,date,key=null,field='entries')=>{selected=date;switchView('day');const g=state.goals.find(x=>x.id===id);if(g)LearningUI.open(g,date,null,key,field);}});
  LearningUI.init({getState:()=>state,today:now,notify:toast,commit:action=>{const draft=M.validateState(state);action(draft);M.validateState(draft);state=draft;const saved=persist();render();return saved;}});
  VoiceUI.init();
  StackdayUI.init({selectDay:(s,scroll=false)=>{selected=s;switchView('day');if(scroll)$('#list-heading').scrollIntoView({behavior:'smooth',block:'start'});}});
  render();
  SyncUI.init({getState:()=>state,today:now,notify:toast,canSync:()=>!corruptRaw&&storageAvailable,replace:(s,label)=>{const next=M.upgradeState(s,now());localStore.save(next,label);state=next;corruptRaw=null;render();}},localStore);
  if(corruptRaw){persist();toast('Сохранённый план не читается. Скачайте исходную копию в разделе резервирования.');}
  else if(storageAvailable)persist();
  else{persist();}
})();
