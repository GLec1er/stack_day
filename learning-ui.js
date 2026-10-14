var LearningUI=(()=>{
  const M=GoalsModel,L=LearningModel,$=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=n=>'<svg aria-hidden="true"><use href="#i-'+n+'"/></svg>';
  const fmt=s=>new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(M.date(s));
  let state,today,selected,actions,editing=null,skillEditing=null,feedbackTimer;
  function init(callbacks){
    actions=callbacks;
    $('#goal-list').addEventListener('click',e=>{const b=e.target.closest('[data-learning-open]');if(b){const g=actions.getState().goals.find(g=>g.id===b.dataset.learningOpen);if(g)open(g,selected);}});
    $('#next-session').onclick=e=>{const b=e.target.closest('[data-continue]');if(b){const g=state.goals.find(g=>g.id===b.dataset.continue);if(g)open(g,selected);}};
    $('#skill-grid').onclick=e=>{const b=e.target.closest('[data-skill]');if(b)openSkill(b.dataset.skill);};
    $('#add-skill').onclick=()=>openSkill(null);
    $('#skill-form').onsubmit=saveSkill;
    $('#plan-skill').onclick=()=>{const t=L.catalog(state).find(t=>t.id===skillEditing);const g=state.goals.find(g=>M.occurs(g,'day',selected)&&M.kindOf(g)===t?.kind);if(g){$('#skill-dialog').close();open(g,selected,t);}};
    $('#practice-form').onsubmit=savePractice;
    $('#practice-skill').onchange=()=>{const t=L.catalog(state).find(t=>t.id===$('#practice-skill').value);$('#practice-stage-row').hidden=!t;if(t){$('#practice-stage').value=t.stage;$('#practice-topic').value=L.suggestTopic($('#practice-topic').value,t);}};
    $('#practice-mode').onchange=updateMode;
    $('#remove-short').onclick=()=>{try{actions.commit(s=>{const target=s.goals.find(g=>g.id===editing.id);L.setShort(target,editing.date,false,actions.today());});hideFeedback();$('#practice-dialog').close();actions.notify('Короткая отметка снята. Запись занятия сохранена.');}catch(e){formError(e.message);}};
    $('#feedback-close').onclick=hideFeedback;
    $('#feedback-note').onclick=()=>{const g=state.goals.find(g=>g.id===$('#feedback-note').dataset.goal);if(g){hideFeedback();open(g,$('#feedback-note').dataset.date);}};
  }
  function inline(g,date,archived){
    const e=L.entryFor(g,date),previous=L.nextStep(g,date),full=M.progress(g,date).done;
    const short=e?.shortDone&&!full;
    return '<div class="learning-inline">'+(e?.topic?'<p class="session-topic"><span>Тема</span>'+esc(e.topic)+'</p>':full?'<p class="session-topic empty-topic">Занятие завершено. Сохрани короткий вывод, чтобы вернуться к нему позже.</p>':previous?'<p class="session-topic"><span>Продолжить</span>'+esc(previous.nextStep)+'</p>':'<p class="session-topic empty-topic">Выбери конкретную тему для этого занятия.</p>')+
      (e?.result?'<p class="session-result">'+icon('check')+esc(e.result.slice(0,110))+(e.result.length>110?'…':'')+'</p>':'')+
      '<div class="session-controls">'+(e?.actualMinutes!==undefined?'<span class="fact-label">Факт: '+e.actualMinutes+' мин</span>':'')+(short?'<span class="short-label">'+icon('clock')+'Коротко · '+e.shortMinutes+' мин · 15 XP</span>':'')+'<button data-learning-open="'+esc(g.id)+'" aria-label="Тема и результат: '+esc(g.title)+'">'+icon(e?.topic?'edit':'book')+(archived?'Открыть запись':full&&!e?.result?'Записать результат':e?.topic?'Тема и результат':'Выбрать тему')+'</button>'+(!archived&&g.horizon==='day'&&['system','algorithms'].includes(M.kindOf(g))&&!full&&!short?'<small>Есть режим на 10–15 минут</small>':'')+'</div></div>';
  }
  function render(s,date,current){state=s;today=date;selected=current;renderNext();renderSkills();}
  function renderNext(){
    const tasks=state.goals.filter(g=>M.occurs(g,'day',selected)&&!M.progress(g,selected).done).map(g=>({g,e:L.nextStep(g,selected)})).filter(x=>x.e).slice(0,2);
    $('#next-session').hidden=!tasks.length;
    $('#next-session').innerHTML='<div class="next-heading">'+icon('arrow')+'<div><span class="eyebrow">ЕСТЬ ОТКУДА ПРОДОЛЖИТЬ</span><h2>Следующий шаг уже выбран</h2></div></div><div class="next-tasks">'+tasks.map(({g,e})=>'<button data-continue="'+esc(g.id)+'"><small>'+esc(g.title)+' · из записи '+fmt(e.date)+'</small><strong>'+esc(e.nextStep)+'</strong><span>Открыть занятие '+icon('arrow')+'</span></button>').join('')+'</div>';
  }
  function renderSkills(){
    const all=L.catalog(state),explained=all.filter(t=>t.stage===3).length,started=all.filter(t=>t.stage>0).length;
    $('#skill-summary').textContent='В работе: '+started+' · Могу объяснить: '+explained;
    $('#skill-grid').innerHTML=[['system','Системный дизайн','nodes'],['algorithms','Алгоритмы','code']].map(([kind,title,i])=>'<section class="skill-path '+kind+'"><div class="skill-path-title">'+icon(i)+'<h3>'+title+'</h3></div>'+all.filter(t=>t.kind===kind).map(t=>'<button class="skill-row stage-'+t.stage+'" data-skill="'+esc(t.id)+'" aria-label="'+esc(t.title)+' — '+esc(L.stages[t.stage])+'"><span class="skill-name">'+esc(t.title)+'<span class="skill-segments" aria-hidden="true">'+[1,2,3].map(n=>'<i class="'+(t.stage>=n?'filled':'')+'"></i>').join('')+'</span></span><span class="skill-stage">'+esc(L.stages[t.stage])+'</span>'+icon('arrow')+'</button>').join('')+'</section>').join('');
  }
  function formError(message){$('#practice-error').textContent=message;$('#practice-error').hidden=false;}
  function open(g,date,preset=null,recordKey=null,recordField='entries'){
    state=actions.getState();today=actions.today();editing={id:g.id,date,recordKey,recordField};
    const e=L.entryFor(g,date,recordKey,recordField),historical=Boolean(recordKey&&e?.horizon!==M.goalAt(g,date).horizon),previous=L.nextStep(g,date),all=L.catalog(state);
    $('#practice-form').reset();$('#practice-error').hidden=true;
    $('#practice-title').textContent=M.progress(g,date).done?'Результат занятия':'План и результат';
    $('#practice-context').textContent=M.goalAt(g,date).title+' · '+fmt(date);
    $('#practice-topic').value=preset?(preset.hint||preset.title):(e?.topic||previous?.nextStep||'');
    $('#practice-result').value=e?.result||'';$('#practice-link').value=e?.link||'';$('#practice-next').value=e?.nextStep||'';
    const kind=M.kindOf(M.goalAt(g,date));const options=all.filter(t=>!['system','algorithms'].includes(kind)||t.kind===kind);
    $('#practice-skill').innerHTML='<option value="">Не связывать с картой</option>'+options.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('');
    $('#practice-skill').value=preset?.id||e?.skillId||'';
    const skill=all.find(t=>t.id===$('#practice-skill').value);$('#practice-stage-row').hidden=!skill;$('#practice-stage').value=skill?.stage||0;
    const canShort=M.goalAt(g,date).horizon==='day'&&['system','algorithms'].includes(kind)&&!g.archived&&!M.progress(g,date).done&&date<=today&&M.occurs(g,'day',date);
    $('#practice-mode-row').hidden=g.archived||date>today||historical;$('#practice-mode option[value="short"]').hidden=!canShort;$('#practice-mode option[value="complete"]').hidden=true;ControlUI.openPractice(g,date,recordKey,recordField);$('#practice-mode').value='note';$('#short-minutes').value=e?.shortMinutes||15;
    const a=M.goalAt(g,date);$('#practice-finish').dataset.eligible=String(!(historical||Boolean(a.metric)||!M.occurs(g,a.horizon,date)||M.progress(g,date).done||M.periodKey(a.horizon,date)>M.periodKey(a.horizon,today)));
    $('#remove-short').hidden=!e?.shortDone||!canShort;
    const changedTopic=preset&&e?.topic&&preset.id!==e.skillId;
    $('#practice-handoff').hidden=!(changedTopic||previous&&!e?.topic&&!preset);
    $('#practice-handoff').textContent=changedTopic?'Ты меняешь тему этого занятия. Сохранённый результат оставлен ниже.':previous?'Продолжение из записи '+fmt(previous.date)+': '+previous.nextStep:'';
    updateMode();$('#practice-dialog').showModal();$('#practice-topic').focus();
  }
  function updateMode(){const short=$('#practice-mode').value==='short'&&!$('#practice-mode-row').hidden;$('#short-duration-row').hidden=!short;const complete=$('#practice-mode').value==='complete';$('#practice-save-label').textContent=short?'Завершить коротко':complete?'Сохранить результат и завершить':'Сохранить запись';$('#practice-topic').required=short||complete;$('#practice-finish').hidden=short||$('#practice-finish').dataset.eligible!=='true';}
  function savePractice(event){
    event.preventDefault();const g=state.goals.find(g=>g.id===editing.id);if(!g)return;
    const fields={topic:$('#practice-topic').value,result:$('#practice-result').value,link:$('#practice-link').value,nextStep:$('#practice-next').value,skillId:$('#practice-skill').value,...ControlUI.practiceFields()};
    const complete=event.submitter?.id==='practice-finish'||$('#practice-mode').value==='complete',short=!complete&&$('#practice-mode').value==='short'&&!$('#practice-mode-row').hidden;
    try{
      const draft={...g,completions:JSON.parse(JSON.stringify(g.completions||{})),entries:JSON.parse(JSON.stringify(g.entries||{}))};draft.legacyEntries=JSON.parse(JSON.stringify(g.legacyEntries||{}));L.saveEntry(draft,editing.date,fields,editing.recordKey,editing.recordField);if(short)L.setShort(draft,editing.date,true,actions.today(),Number($('#short-minutes').value));
      const skillDraft={...state,skillProgress:JSON.parse(JSON.stringify(state.skillProgress||{}))};if(fields.skillId)L.setSkill(skillDraft,fields.skillId,Number($('#practice-stage').value),actions.today());
      if(complete)L.completeSession(draft,editing.date,actions.today());
      const before=M.journal(state,actions.today());const saved=actions.commit(s=>{const target=s.goals.find(g=>g.id===editing.id);target.entries=draft.entries;target.legacyEntries=draft.legacyEntries;if(complete)target.completions=draft.completions;s.skillProgress=skillDraft.skillProgress;});state=actions.getState();
      $('#practice-dialog').close();const after=M.journal(state,actions.today()),delta=after.xp-before.xp,rewards=after.achievements.filter(a=>a.unlockedOn&&!before.achievements.find(b=>b.id===a.id)?.unlockedOn);
      if(delta>0)celebrate(g,editing.date,delta,false,short,rewards);else actions.notify(saved?'Запись сохранена. Следующий шаг останется под рукой.':'Запись в памяти. Скачай копию плана.');
    }catch(e){formError(e.message);}
  }
  function openSkill(id){
    skillEditing=id;const t=L.catalog(state).find(t=>t.id===id);
    $('#skill-form').reset();$('#skill-error').hidden=true;$('#skill-dialog-title').textContent=t?t.title:'Своя тема';$('#skill-new-fields').hidden=Boolean(t);$('#skill-level').value=t?.stage||0;
    const relevant=t?L.records(state,today).filter(r=>r.entry.skillId===id).slice(0,3):[];
    $('#skill-evidence').innerHTML=relevant.length?'<h3>Твои записи по теме</h3>'+relevant.map(r=>'<p><small>'+fmt(r.entry.date)+'</small>'+esc(r.entry.result||r.entry.topic)+'</p>').join(''):'<p class="skill-evidence-empty">Этап выбираешь ты. Связанные записи занятий появятся здесь.</p>';
    $('#plan-skill').hidden=!t||!state.goals.some(g=>M.occurs(g,'day',selected)&&M.kindOf(g)===t.kind);$('#skill-dialog').showModal();
  }
  function saveSkill(event){event.preventDefault();try{
    const stage=Number($('#skill-level').value),id=skillEditing||('custom-'+(typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
    const saved=actions.commit(s=>{if(!skillEditing)L.addSkill(s,{id,title:$('#skill-name').value,kind:$('#skill-kind').value},actions.today());L.setSkill(s,id,stage,actions.today());});$('#skill-dialog').close();actions.notify(saved?'Карта навыков обновлена':'Карта обновлена в памяти. Скачай копию плана.');
  }catch(e){$('#skill-error').textContent=e.message;$('#skill-error').hidden=false;}}
  function hideFeedback(){clearTimeout(feedbackTimer);$('#completion-feedback').hidden=true;}
  function celebrate(g,date,delta,fullDay,short=false,rewards=[]){
    clearTimeout(feedbackTimer);const panel=$('#completion-feedback');panel.hidden=false;panel.classList.remove('feedback-enter');void panel.offsetWidth;panel.classList.add('feedback-enter');
    $('#feedback-title').textContent=fullDay?(M.isWeekend(date)?'Повторение закрыто':'Оба чтения закрыты'):short?'Маленький шаг сделан':'Занятие закрыто';
    $('#feedback-detail').textContent='+'+delta+' XP'+(fullDay?' · полный день':short?' · короткое занятие':' · '+(L.entryFor(g,date)?.topic||g.title));
    $('#feedback-rewards').textContent=rewards.length?'Открыто: '+rewards.map(a=>a.name).join(' · '):'';$('#feedback-rewards').hidden=!rewards.length;
    $('#feedback-note').dataset.goal=g.id;$('#feedback-note').dataset.date=date;
    const row=[...document.querySelectorAll('.goal-row')].find(e=>e.dataset.id===g.id);if(row){row.classList.add('completion-pulse');setTimeout(()=>row.classList.remove('completion-pulse'),700);}
    feedbackTimer=setTimeout(hideFeedback,10000);
  }
  return {init,render,inline,open,celebrate,hideFeedback};
})();
