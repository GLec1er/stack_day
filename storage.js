var PlanStorage=(()=>{
  function create(storage,key){
    const snapshots=()=>{try{const value=JSON.parse(storage.getItem(key+':snapshots')||'[]');return Array.isArray(value)?value:[];}catch(e){return [];}};
    const read=()=>{const raw=storage.getItem(key);return raw?GoalsModel.validateState(JSON.parse(raw)):null;};
    function save(state,label='Изменение плана',now=Date.now()){
      const valid=GoalsModel.validateState(state),raw=JSON.stringify(valid),previous=storage.getItem(key);
      if(previous===raw)return valid;
      if(previous){let old;try{old=GoalsModel.validateState(JSON.parse(previous));}catch(e){}
        if(old){const previousRows=snapshots();let id=String(now),suffix=0;while(previousRows.some(r=>r.id===id))id=now+'-'+(++suffix);const rows=[{id,savedAt:now,label,state:old},...previousRows].slice(0,20);while(rows.length>1&&JSON.stringify(rows).length*2>2*1024*1024)rows.pop();storage.setItem(key+':snapshots',JSON.stringify(rows));}
      }
      storage.setItem(key,raw);try{storage.setItem(key+':saved-at',String(now));}catch(e){}return valid;
    }
    return {save,read,snapshots};
  }
  return {create};
})();
