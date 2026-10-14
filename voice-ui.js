var VoiceUI=(()=>{
  const fields=['goal-title','goal-steps','practice-topic','practice-result','practice-next','practice-recall','skill-name','period-note'];
  const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  const controls=new Map();let controller,activeField=null,writing=false,pendingSave=null,noteContext=null;
  function statusFor(field,message,interim=''){const c=controls.get(field.id);if(!c)return;c.status.hidden=false;c.message.textContent=message;c.interim.textContent=interim;c.interim.hidden=!interim;}
  function refreshButtons(){for(const [id,c] of controls){const active=activeField?.id===id&&controller.active();c.button.disabled=controller.active()&&!active;c.button.classList.toggle('recording',active);c.button.setAttribute('aria-pressed',String(active));c.button.innerHTML=icon(active?'voice-stop':'mic')+'<span>'+(active?'Остановить':'Надиктовать')+'</span>';c.button.setAttribute('aria-label',(active?'Остановить диктовку: ':'Надиктовать: ')+c.label);}}
  function init(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    controller=VoiceInput.createController({Recognition,getText:()=>activeField?.value,
      onUpdate:output=>{if(!activeField)return;writing=true;activeField.value=output.value;activeField.setSelectionRange(output.caret,output.caret);activeField.dispatchEvent(new Event('input',{bubbles:true}));writing=false;},
      onStatus:s=>{if(activeField){statusFor(activeField,s.message,s.interim);controls.get(activeField.id)?.status.classList.toggle('voice-error',s.state==='error'||s.state==='unsupported');}refreshButtons();},
      onEnd:result=>{const pending=pendingSave;pendingSave=null;refreshButtons();if(pending&&!result.failed&&!result.cancelled&&pending.form.isConnected&&(!pending.form.closest('dialog')||pending.form.closest('dialog').open)){if(typeof pending.form.requestSubmit==='function')pending.form.requestSubmit(pending.submitter?.isConnected?pending.submitter:undefined);}activeField=null;}
    });
    for(const id of fields){const field=document.getElementById(id);if(!field)continue;
      const existing=field.closest('label.form-label'),wrapper=document.createElement('div'),heading=document.createElement('div'),label=document.createElement('label'),button=document.createElement('button');
      wrapper.className=existing?'form-label voice-field':'voice-field voice-note';heading.className='voice-heading';label.htmlFor=id;
      if(existing){for(const node of [...existing.childNodes])if(node!==field)label.append(node);existing.replaceWith(wrapper);}else{label.textContent=field.getAttribute('aria-label')||'Заметка';field.before(wrapper);}
      const title=label.textContent.trim().replace(/\s+/g,' ');button.type='button';button.className='voice-button';button.dataset.voiceField=id;button.setAttribute('aria-pressed','false');
      heading.append(label,button);wrapper.append(heading,field);
      const panel=document.createElement('div'),message=document.createElement('p'),interim=document.createElement('p');panel.className='voice-status';panel.id=id+'-voice-status';panel.hidden=true;panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');interim.className='voice-interim';interim.hidden=true;panel.append(message,interim);wrapper.append(panel);button.setAttribute('aria-describedby',panel.id);
      controls.set(id,{button,status:panel,message,interim,label:title});
      if(id==='goal-steps'){const hint=document.createElement('small');hint.className='voice-step-hint';hint.textContent='Голосом: скажи «новый шаг», чтобы начать следующий пункт.';wrapper.append(hint);}
      button.onclick=()=>{if(controller.active()){controller.stop();return;}activeField=field;field.focus();pendingSave=null;
        controller.start({text:field.value,start:field.selectionStart??field.value.length,end:field.selectionEnd??field.value.length,maxLength:field.maxLength<0?Infinity:field.maxLength,multiline:field.tagName==='TEXTAREA',steps:id==='goal-steps'});refreshButtons();};
      field.addEventListener('input',()=>{if(activeField===field&&!writing&&controller.active()){controller.cancel();statusFor(field,'Диктовка остановлена, чтобы сохранить твою правку.');}});
      field.addEventListener('change',()=>{if(activeField===field&&!writing&&controller.active())controller.cancel();});
    }
    for(const form of document.querySelectorAll('form')){
      form.addEventListener('submit',event=>{if(controller.active()&&activeField?.form===form){event.preventDefault();event.stopImmediatePropagation();pendingSave={form,submitter:event.submitter};controller.stop();}},true);
      form.addEventListener('reset',()=>{if(activeField?.form===form){pendingSave=null;controller.cancel();}for(const [id,c] of controls)if(document.getElementById(id).form===form){c.status.hidden=true;c.interim.textContent='';}});
    }
    for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{if(activeField?.closest('dialog')===dialog){pendingSave=null;controller.cancel();}});
    window.addEventListener('pagehide',()=>{pendingSave=null;controller.cancel();});document.addEventListener('visibilitychange',()=>{if(document.hidden){pendingSave=null;controller.cancel();}});
    const help=document.createElement('details');help.className='voice-help';help.innerHTML='<summary>О голосовом вводе</summary><p>Нажми микрофон у нужного поля и говори по-русски. Останови диктовку и проверь текст перед сохранением. Для нового пункта в списке шагов скажи «новый шаг».</p><p>Речь распознаёт браузер. Он может передавать аудио своему сервису распознавания; обычно нужен интернет. Stackday сохраняет только текст.</p><p>Если распознавание недоступно, выбери поле и используй системную диктовку или открой эту же страницу в другом браузере.</p>';
    document.getElementById('practice-context').after(help);
    if(!Recognition){const note=document.createElement('p');note.className='voice-support-note';note.textContent='В этом браузере встроенное распознавание недоступно. Кнопка выберет поле для системной диктовки.';help.after(note);}
    refreshButtons();
  }
  function setNoteContext(key){if(noteContext!==key&&activeField?.id==='period-note'&&controller?.active()){const field=activeField;pendingSave=null;controller.cancel();statusFor(field,'Диктовка остановлена: выбран другой период.');}noteContext=key;}
  return {init,setNoteContext};
})();
