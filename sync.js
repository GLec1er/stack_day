var SyncModel=(()=>{
  function create(a){
    let m={enabled:false,revision:0,baseRaw:'',dirty:false,...a.meta},conflict=null,busy=false;
    const raw=()=>JSON.stringify(a.getState()),save=()=>a.saveMeta({...m}),status=s=>a.onStatus(s);
    function changed(){m.dirty=raw()!==m.baseRaw;save();}
    function receive(value){a.onRemote(value.state);m.revision=value.revision;m.baseRaw=raw();m.dirty=false;conflict=null;save();status('synced');}
    function disagree(value){conflict=value;a.onConflict(value);status('conflict');}
    async function flush(){
      if(!m.enabled||!m.dirty||busy||conflict)return;busy=true;status('saving');
      try{while(m.dirty&&!conflict){const payload=raw(),value=await a.transport('/api/plan',{state:JSON.parse(payload),baseRevision:m.revision});if(value.conflict){disagree(value);break;}m.revision=value.revision;m.baseRaw=payload;m.dirty=raw()!==payload;save();}if(!conflict)status('synced');}
      catch(e){status('offline');}finally{busy=false;}
    }
    async function pull(){
      if(!m.enabled||busy||conflict)return;
      try{const value=await a.transport('/api/plan');if(busy)return;
        if(!value.state){if(m.revision>0){status('offline');return;}m.dirty=true;save();await flush();return;}
        if(JSON.stringify(value.state)===raw()){m.revision=value.revision;m.baseRaw=raw();m.dirty=false;save();status('synced');return;}
        if(value.revision!==m.revision){if(m.dirty||!m.baseRaw)disagree(value);else receive(value);}
        else if(m.dirty)await flush();else status('synced');
      }catch(e){status('offline');}
    }
    async function connect(){m.enabled=true;changed();await pull();}
    function useRemote(){if(!conflict)return;receive(conflict);a.onConflict(null);}
    async function keepLocal(){if(!conflict)return;m.revision=conflict.revision;conflict=null;m.dirty=true;save();a.onConflict(null);await flush();}
    return {connect,changed,flush,pull,useRemote,keepLocal,meta:()=>({...m}),conflict:()=>conflict};
  }
  return {create};
})();
var SyncUI=(()=>{
  const KEY='my-focus:personal-goals:v1',$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let a,controller,store,status='local',pending=null,cloudSnapshots=[],timer,hosted=false;
  async function transport(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'}),value=await response.json();if(response.status===409)return {...value,conflict:true};if(!response.ok)throw Error(value.error||'Сеть недоступна');if(value.state)value.state=GoalsModel.upgradeState(value.state,a.today());return value;}
  function init(actions,localStore){
    a=actions;store=localStore;hosted=location.protocol==='https:'&&location.hostname.endsWith('.chatgpt.site');let meta={};try{meta=JSON.parse(localStorage.getItem(KEY+':sync')||'{}');}catch(e){}
    if(meta.enabled&&!meta.dirty)meta.baseRaw=JSON.stringify(a.getState());else if(meta.enabled)meta.baseRaw='';
    controller=SyncModel.create({getState:a.getState,meta,transport,onRemote:s=>a.replace(s,'Копия с сайта'),saveMeta:m=>localStorage.setItem(KEY+':sync',JSON.stringify({...m,baseRaw:undefined})),onStatus:s=>{status=s;render();},onConflict:s=>{pending=s;render();}});
    $('#sync-controls').onclick=async e=>{const b=e.target.closest('[data-sync]');if(!b)return;const action=b.dataset.sync;
      try{if(action==='connect'){await controller.connect();await loadSnapshots();}if(action==='remote'){controller.useRemote();await loadSnapshots();}if(action==='local'){await controller.keepLocal();await loadSnapshots();}if(action==='refresh'){await controller.pull();await controller.flush();await loadSnapshots();}}catch(e){a.notify(e.message);}
    };
    $('#snapshot-list').onclick=async e=>{const b=e.target.closest('[data-snapshot],[data-cloud-snapshot]');if(!b)return;try{const row=b.dataset.snapshot?store.snapshots().find(x=>x.id===b.dataset.snapshot):await transport('/api/snapshots/'+b.dataset.cloudSnapshot);if(row){a.replace(row.state,'Восстановление снимка');changed();a.notify('План восстановлен. Предыдущая копия сохранена в истории.');render();}}catch(err){a.notify(err.message);}};
    window.addEventListener('online',()=>{if(hosted)controller.pull();});document.addEventListener('visibilitychange',()=>{if(hosted&&!document.hidden&&!document.querySelector('dialog[open]'))controller.pull();});
    setInterval(()=>{if(hosted&&controller.meta().enabled&&!document.hidden&&!document.querySelector('dialog[open]'))controller.pull();},20000);
    render();if(hosted&&meta.enabled)controller.pull();
  }
  function changed(){if(!controller)return;try{controller.changed();}catch(e){a.notify('План сохранён локально; настройки синхронизации не удалось записать.');return;}if(hosted&&controller.meta().enabled){status=controller.conflict()?'conflict':controller.meta().dirty?'pending':'synced';render();clearTimeout(timer);if(controller.meta().dirty)timer=setTimeout(()=>controller.flush(),700);}}
  async function loadSnapshots(){if(!hosted||!controller.meta().enabled)return;try{const res=await transport('/api/snapshots');cloudSnapshots=res.snapshots||[];render();}catch(e){}}
  function render(){if(!a)return;const enabled=hosted&&controller.meta().enabled;
    const names={local:'Сохранено на устройстве',pending:'Локальная копия сохранена · ждём синхронизацию',saving:'Сохраняем на сайте…',synced:'Синхронизировано с сайтом',offline:'Локальная копия сохранена · сайт недоступен',conflict:'Две разные копии · нужен выбор'};
    if(a.canSync()){const savedAt=localStorage.getItem(KEY+':saved-at'),time=savedAt?new Date(Number(savedAt)).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';$('#save-status').classList.toggle('error',status==='conflict');$('#save-status').innerHTML='<span></span>'+esc(names[enabled?status:'local'])+(time?' · '+time:'');}
    const compare=s=>{const p=ControlModel.copySummary(s,a.today());const word=(n,one,few,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many,date=p.lastDate?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(GoalsModel.date(p.lastDate)):'нет';return p.goals+' '+word(p.goals,'цель','цели','целей')+' · '+p.completed+' '+word(p.completed,'отметка','отметки','отметок')+' выполнения · '+p.xp+' XP · последняя запись: '+date;};
    $('#header-sync-status').textContent=!a.canSync()?'Проверь копию':enabled?({synced:'В облаке',pending:'Ждёт синхронизации',saving:'Сохраняем в облаке',offline:'Сохранено локально',conflict:'Выбери рабочую копию'}[status]||'Подключено'):'Только на устройстве';
    const cloudText=pending?'<div class="copy-comparison"><p><strong>На устройстве</strong><br>'+esc(compare(a.getState()))+'</p><p><strong>На сайте</strong><br>'+esc(compare(pending.state))+'</p></div><p>Сравни прогресс перед выбором. Текущая копия сохраняется в истории при замене.</p><div class="sync-actions"><button data-sync="remote">Взять копию с сайта</button><button data-sync="local">Отправить копию устройства</button></div>':enabled?'<p>План доступен на других устройствах после входа на этот сайт. При отсутствии сети изменения остаются локально. В облаке хранятся последние 30 сохранений.</p><div class="sync-actions"><button data-sync="refresh">Проверить синхронизацию и копии</button></div>':hosted?'<p>Первое подключение сохранит этот план на сайте. Если облачная копия уже есть, сначала появится выбор.</p><div class="sync-actions"><button data-sync="connect" '+(!a.canSync()?'disabled':'')+'>Подключить синхронизацию</button></div>':'<p>Эта версия сохраняет план на устройстве. Автоматической синхронизации между браузерами нет. Переноси свой прогресс через «Скачать мой план» и «Восстановить из файла».</p>';
    $('#sync-controls').innerHTML='<strong>'+(hosted?'Синхронизация между устройствами':'Перенос между устройствами')+'</strong>'+cloudText;
    const fmt=s=>new Date(s).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}),rows=store.snapshots();
    $('#snapshot-list').innerHTML='<p class="backup-help">На устройстве — до 20 последних изменений в пределах 2 МБ. Восстановление тоже сохраняет текущий план как снимок.</p>'+rows.map(x=>'<div class="snapshot-row"><div><strong>'+esc(x.label)+'</strong><small>'+fmt(x.savedAt)+' · '+x.state.goals.length+' целей · устройство</small></div><button data-snapshot="'+esc(x.id)+'">Восстановить</button></div>').join('')+cloudSnapshots.map(x=>'<div class="snapshot-row"><div><strong>Копия сайта №'+x.revision+'</strong><small>'+fmt(x.savedAt)+' · '+x.goals+' целей</small></div><button data-cloud-snapshot="'+x.revision+'">Восстановить</button></div>').join('');
  }
  return {init,changed,render,loadSnapshots};
})();
