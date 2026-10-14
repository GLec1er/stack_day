var StackdayUI=(()=>{
  const M=GoalsModel,$=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  const fmt=(s,options)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',...options}).format(M.date(s));
  let state,today,selected,j,actions,month=null,lastSelected=null;
  function init(callbacks){
    actions=callbacks;
    $('#calendar-prev').onclick=()=>shiftMonth(-1);$('#calendar-next').onclick=()=>shiftMonth(1);
    $('#calendar-today').onclick=()=>{month=today.slice(0,7)+'-01';renderCalendar();};
    $('#calendar-grid').onclick=e=>{const b=e.target.closest('[data-calendar-day]');if(b)actions.selectDay(b.dataset.calendarDay);};
    $('#calendar-details').onclick=e=>{const b=e.target.closest('[data-open-day]');if(b)actions.selectDay(b.dataset.openDay,true);};
    $('#rules-btn').onclick=()=>$('#rules-dialog').showModal();
  }
  function shiftMonth(n){const d=M.date(month);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);month=M.iso(d);renderCalendar();}
  function render(newState,date,currentDate){
    state=newState;today=date;selected=currentDate;j=M.journal(state,today);
    if(!month||lastSelected!==selected)month=selected.slice(0,7)+'-01';lastSelected=selected;
    const earned=j.achievements.filter(a=>a.unlockedOn).length;
    $('#game-level').textContent=j.level;$('#game-xp').textContent=j.xp+' XP';$('#xp-fill').style.width=j.levelProgress/2+'%';$('#xp-track').setAttribute('aria-valuenow',j.levelProgress);$('#xp-next').textContent=j.toNextLevel+' XP до уровня '+(j.level+1);
    $('#game-streak').innerHTML=j.streak+'<span> '+dayWord(j.streak)+'</span>';$('#streak-best').textContent='Рекорд: '+j.bestStreak+' '+dayWord(j.bestStreak);
    $('#game-awards').innerHTML=earned+'<span> / '+j.achievements.length+'</span>';$('#game-active-days').textContent=j.activeDays+' '+dayWord(j.activeDays)+' с завершёнными занятиями';
    $('#achievement-nav-count').textContent=earned+'/'+j.achievements.length;
    const d=j.days[selected],readingCount=Number(Boolean(d?.system))+Number(Boolean(d?.algorithms)),weekend=M.isWeekend(selected);
    $('#daily-reading-status').textContent=weekend?(d?.review?'1 / 1 повторение · 25 XP за основу':'0 / 1 повторение · до 25 XP за основу'):readingCount+' / 2 чтений'+(readingCount===2?' · 80 XP за основу':' · до 80 XP за основу');
    $('#daily-motivation').textContent=weekend?(d?.review?'Повторение закрыто. Конспект сохранит главное до следующего чтения.':'Вспомни прочитанное за неделю. Проверь себя и дополни конспект.'):readingCount===2?'Оба чтения закрыты. Запиши, что стало понятнее.':readingCount===1?'Одно чтение закрыто. Второе закроет базу дня для серии.':d?.short?'Короткое занятие засчитано. Сохрани вывод и следующий шаг.':'Системный дизайн и алгоритмы. Два чтения, по одному понятному выводу.';
    renderCalendar();renderAchievements();
  }
  function dayWord(n){return n%10===1&&n%100!==11?'день':[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?'дня':'дней';}
  function sessionWord(n){return n%10===1&&n%100!==11?'занятие':[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?'занятия':'занятий';}
  function renderCalendar(){
    $('#calendar-month-label').textContent=fmt(month,{month:'long',year:'numeric'}).replace(' г.','');
    const monthDays=M.calendarMonth(month).filter(Boolean),elapsed=monthDays.filter(s=>s<=today).map(s=>M.calendarDay(state,s,today)).filter(d=>d.total);
    const completedDays=elapsed.filter(d=>d.status==='complete').length,taskDone=elapsed.reduce((n,d)=>n+d.done,0),taskTotal=elapsed.reduce((n,d)=>n+d.total,0);
    $('#calendar-summary').textContent=elapsed.length?'Полностью закрыто '+completedDays+' из '+elapsed.length+' дней с планом · '+taskDone+' / '+taskTotal+' задач за прошедшие дни месяца':'План на месяц: в будни — чтение, в выходные — повторение и конспект.';
    $('#calendar-grid').innerHTML=M.calendarMonth(month).map(s=>{
      if(!s)return '<span class="calendar-blank" aria-hidden="true"></span>';
      const d=j.days[s],plan=M.calendarDay(state,s,today),future=s>today;
      const rewardNames=(d?.rewards||[]).map(id=>j.achievements.find(a=>a.id===id)?.name).filter(Boolean);
      const statusLabels={complete:'всё выполнено',partial:'частично выполнено',missed:'не выполнено',pending:'ещё не отмечено',planned:'в плане',empty:'нет задач',rest:'отдых или перенос'};
      const label=fmt(s,{weekday:'long',day:'numeric',month:'long'})+', '+(plan.total?statusLabels[plan.status]+', '+plan.done+' из '+plan.total+' задач':plan.hasProgress?'Результат месяца':statusLabels[plan.status])+(d?.xp?', '+d.xp+' XP':'')+(rewardNames.length?', награды: '+rewardNames.join(', '):'');
      return '<button class="calendar-day '+plan.status+' '+(future?'future ':'')+(s===today?'is-today ':'')+(s===selected?'is-selected':'')+'" data-calendar-day="'+s+'" title="'+esc(label)+'" aria-label="'+esc(label)+'" '+(s===selected?'aria-pressed="true"':'aria-pressed="false"')+'><strong>'+Number(s.slice(8))+'</strong>'+(rewardNames.length?'<span class="calendar-medal">'+icon('medal')+'</span>':'')+'<small>'+(plan.total?plan.done+' / '+plan.total:plan.hasProgress?'✓':'—')+'</small></button>';
    }).join('');
    renderDayDetails();
  }
  function renderDayDetails(){
    const d=j.days[selected],rewards=j.achievements.filter(a=>a.unlockedOn===selected),future=selected>today;
    const plan=M.calendarDay(state,selected,today);
    const readingMarkup=plan.rows.map(r=>{
      const status=r.skipped?(r.status==='moved'?'Перенесено':'Отдых'):r.done?'Готово':future?'В плане':r.short?'Коротко · 15 XP':r.stepsDone?r.stepsDone+'/'+r.goal.steps.length+' шагов':selected<today?'Не выполнено':'Не отмечено';
      return '<div class="calendar-task-wrap"><div class="calendar-reading calendar-task '+(r.done?'complete':'')+'"><span>'+icon(r.done?'check':M.kindOf(r.goal)==='review'?'repeat':'book')+'<span>'+esc(r.goal.title)+(r.daily||r.skipped?'':'<em>Цель месяца</em>')+'</span></span><small>'+esc(status)+'</small></div>'+ControlUI.calendarControls(r,selected)+'</div>';
    }).join('');
    let rewardMarkup=rewards.length?rewards.map(a=>'<div class="day-reward">'+icon(a.icon)+'<div><strong>'+esc(a.name)+'</strong><small>'+esc(a.description)+'</small></div></div>').join(''):'<p class="day-empty">'+(future?'Награды появятся после занятий.':'В этот день награды ещё не открыты.')+'</p>';
    const recent=j.achievements.filter(a=>a.unlockedOn).sort((a,b)=>b.unlockedOn.localeCompare(a.unlockedOn)).slice(0,3);
    if(!rewards.length&&recent.length)rewardMarkup+='<div class="recent-rewards"><span class="metric-label">ПОСЛЕДНИЕ НАГРАДЫ</span>'+recent.map(a=>'<p><span>'+esc(a.name)+'</span><small>'+fmt(a.unlockedOn,{day:'numeric',month:'short'})+'</small></p>').join('')+'</div>';
    $('#calendar-details').innerHTML='<span class="eyebrow">'+fmt(selected,{weekday:'long'}).toUpperCase()+'</span><h3>'+fmt(selected,{day:'numeric',month:'long'})+'</h3><p class="day-format">'+(M.isWeekend(selected)?'Повторение и конспект':'Чтение: системный дизайн и алгоритмы')+'</p><div class="day-score">'+(plan.total?plan.done+' / '+plan.total+' задач дня':'Нет дневных задач')+' · <strong>'+(d?.xp||0)+' XP</strong></div><p class="baseline-status">База для серии: '+(plan.baseline?'выполнена':'не выполнена')+' · Весь план: '+(plan.allDone?'выполнен':plan.total?'ещё не закрыт':'нет задач')+'</p>'+(readingMarkup||'<p class="day-empty">На этот день задач нет.</p>')+'<button class="open-day-button" data-open-day="'+selected+'">Открыть план дня '+icon('arrow')+'</button><h4>Награды этого дня</h4>'+rewardMarkup;
  }
  function renderAchievements(){
    const count=j.achievements.filter(a=>a.unlockedOn).length;$('#achievement-count').textContent=count+' / '+j.achievements.length;
    $('#achievement-grid').innerHTML=j.achievements.map(a=>{
      const earned=Boolean(a.unlockedOn);return '<article class="achievement-card '+(earned?'earned':'locked')+'" aria-label="'+esc(a.name+', '+(earned?'открыто '+fmt(a.unlockedOn,{day:'numeric',month:'long',year:'numeric'}):'не открыто, '+a.description+', прогресс '+a.progress+' из '+a.target))+'"><div class="achievement-icon">'+icon(a.icon)+'<span class="achievement-state">'+icon(earned?'check':'lock')+'</span></div><h3>'+esc(a.name)+'</h3><p>'+esc(a.description)+'</p><div class="achievement-track"><span style="width:'+Math.min(100,a.progress/a.target*100)+'%"></span></div><small>'+(earned?'Открыто '+fmt(a.unlockedOn,{day:'numeric',month:'short'}):a.progress+' / '+a.target)+'</small></article>';
    }).join('');
  }
  return {init,render};
})();
