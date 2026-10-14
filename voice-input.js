var VoiceInput=(()=>{
  function format(text,options={}){
    const commands=options.steps?'новый шаг|новая строка|с новой строки':'новая строка|с новой строки';
    let value=String(text||'').replace(new RegExp('(^|[\\s,.;!?])(?:'+commands+')(?=$|[\\s,.;!?])[,.;!?]*\\s*','giu'),'\n').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').trim();
    return options.multiline?value:value.replace(/\s+/g,' ');
  }
  function insert(text,start,end,spoken,options={}){
    text=String(text||'');start=Math.max(0,Math.min(text.length,Number.isInteger(start)?start:text.length));end=Math.max(start,Math.min(text.length,Number.isInteger(end)?end:start));
    const transcript=format(spoken,options);if(!transcript)return {value:text,caret:start,limited:false};
    const prefix=text.slice(0,start),suffix=text.slice(end),sep=options.steps?'\n':' ';
    const before=prefix&&!/\s$/.test(prefix)?sep:'',after=suffix&&!/^[\s,.;!?:]/.test(suffix)?sep:'';
    const max=Number.isFinite(options.maxLength)&&options.maxLength>=0?options.maxLength:Infinity;
    const room=Math.max(0,max-prefix.length-suffix.length-before.length-after.length);
    let fitted=transcript.slice(0,room);if(fitted&&/[\uD800-\uDBFF]$/.test(fitted))fitted=fitted.slice(0,-1);
    if(!fitted)return {value:text,caret:start,limited:true};
    return {value:prefix+before+fitted+after+suffix,caret:prefix.length+before.length+fitted.length,limited:fitted.length<transcript.length};
  }
  function errorMessage(code){return ({
    'not-allowed':'Нет доступа к микрофону. Разреши его для этой страницы в браузере и попробуй снова.',
    'service-not-allowed':'Браузер не разрешил распознавание речи. Можно использовать системную диктовку или открыть страницу в другом браузере.',
    'audio-capture':'Микрофон недоступен. Проверь, подключён ли он и разрешён ли браузеру.',
    'no-speech':'Речь не распознана. Нажми микрофон и попробуй ещё раз.',
    'network':'Сервис распознавания недоступен. Проверь интернет и попробуй снова.',
    'language-not-supported':'Браузер не поддерживает распознавание на русском. Можно использовать системную диктовку.',
    'aborted':'Диктовка остановлена. Уже распознанный текст сохранён в поле.'
  })[code]||'Не удалось запустить диктовку. Можно использовать системную диктовку или другой браузер.';}
  function createController({Recognition,getText,onUpdate=()=>{},onStatus=()=>{},onEnd=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
    let current=null,epoch=0;
    const valid=s=>current===s&&s.token===epoch;
    function finish(s,cancelled=false){if(!valid(s))return;clearTimer(s.timer);current=null;epoch++;if(!s.failed&&!cancelled)onStatus({state:'idle',message:s.finals.size?'Готово. Проверь текст перед сохранением.':'Речь не распознана. Можно попробовать ещё раз.'});onEnd({failed:s.failed||!s.finals.size,cancelled});}
    function start(options={}){
      if(current)return false;
      if(!Recognition){onStatus({state:'unsupported',message:'В этом браузере нет распознавания речи. Нажми клавишу системной диктовки для выбранного поля или открой страницу в браузере с поддержкой голоса.'});return false;}
      const s={token:++epoch,options,finals:new Map(),lastValue:String(options.text||''),failed:false,stopping:false,timer:null};current=s;
      onStatus({state:'starting',message:'Подключаю микрофон… Разреши доступ, если браузер спросит.'});
      try{
        s.recognition=new Recognition();const r=s.recognition;r.lang='ru-RU';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
        r.onstart=()=>{if(valid(s))onStatus({state:'listening',message:'Слушаю по-русски. Нажми «Остановить», когда закончишь.'});};
        r.onresult=event=>{
          if(!valid(s)||s.failed)return;
          if(getText&&getText()!==s.lastValue){onStatus({state:'idle',message:'Диктовка остановлена: текст поля уже изменился. Твоя правка сохранена.'});cancel();return;}
          const interim=[];
          for(let i=0;i<event.results.length;i++){const result=event.results[i],t=String(result?.[0]?.transcript||'');if(result.isFinal)s.finals.set(i,t);else interim.push(t);}
          const spoken=[...s.finals.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(options.steps?'\n':' ');
          const output=insert(options.text,options.start,options.end,spoken,options);
          if(output.value!==s.lastValue){s.lastValue=output.value;onUpdate(output);}
          if(output.limited){s.failed=true;onStatus({state:'error',message:'Достигнут лимит поля. Уже введённый текст оставлен целиком; проверь последнюю фразу.'});stop();}
          else onStatus({state:s.stopping?'finishing':'listening',message:s.stopping?'Завершаю последнюю фразу…':'Слушаю по-русски.',interim:interim.join(' ')});
        };
        r.onerror=event=>{if(valid(s)){s.failed=true;onStatus({state:'error',message:errorMessage(event.error)});finish(s);try{r.abort();}catch(e){}}};
        r.onend=()=>finish(s);r.start();return valid(s);
      }catch(e){s.failed=true;onStatus({state:'error',message:errorMessage(e.name==='NotAllowedError'?'not-allowed':e.name)});finish(s);return false;}
    }
    function stop(){const s=current;if(!s||s.stopping)return;s.stopping=true;if(!s.failed)onStatus({state:'finishing',message:'Завершаю последнюю фразу…'});s.timer=setTimer(()=>{if(valid(s)){s.failed=true;onStatus({state:'error',message:'Браузер не завершил распознавание. Введённый текст сохранён в поле; можно попробовать ещё раз.'});cancel();}},5000);try{s.recognition.stop();}catch(e){cancel();}}
    function cancel(){const s=current;if(!s)return;finish(s,true);try{s.recognition.abort();}catch(e){}}
    return {start,stop,cancel,active:()=>Boolean(current)};
  }
  return {format,insert,errorMessage,createController};
})();
