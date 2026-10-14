const MAX_BYTES=2*1024*1024;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
async function readBody(request){
  if(!request.body)throw Error('Пустой запрос.');
  const reader=request.body.getReader(),chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw Error('План превышает 2 МБ. Сохраните резервный файл.');}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler(validate,html){
  return {async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')){
      if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Метод не поддерживается.'},405);
      if(url.pathname!=='/'&&url.pathname!=='/index.html')return new Response('Not found',{status:404});
      return new Response(request.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin'}});
    }
    const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Войдите на сайт, чтобы синхронизировать план.'},401);
    if(!env.DB)return json({error:'Облачное хранилище пока недоступно.'},503);
    const current=async()=>{const row=await env.DB.prepare('SELECT revision, body, updated_at FROM plans WHERE user_id = ?').bind(user).first();return row?{state:JSON.parse(row.body),revision:row.revision,updatedAt:row.updated_at}:{state:null,revision:0,updatedAt:null};};
    try{
      if(url.pathname==='/api/snapshots'&&request.method==='GET'){
        const rows=await env.DB.prepare("SELECT revision, saved_at, json_array_length(json_extract(body, '$.goals')) AS goals FROM snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT 30").bind(user).all();return json({snapshots:rows.results.map(r=>({revision:r.revision,savedAt:r.saved_at,goals:r.goals}))});
      }
      if(/^\/api\/snapshots\/\d+$/.test(url.pathname)&&request.method==='GET'){const row=await env.DB.prepare('SELECT body FROM snapshots WHERE user_id = ? AND revision = ?').bind(user,Number(url.pathname.split('/').pop())).first();return row?json({state:JSON.parse(row.body)}):json({error:'Копия не найдена.'},404);}
      if(url.pathname!=='/api/plan')return json({error:'Не найдено.'},404);
      if(request.method==='GET')return json(await current());
      if(request.method!=='POST')return json({error:'Метод не поддерживается.'},405);
      const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Запрос с другого сайта отклонён.'},403);
      let value,state;try{value=await readBody(request);if(!Number.isInteger(value.baseRevision)||value.baseRevision<0)throw Error('Некорректная ревизия.');state=validate(value.state);}catch(e){return json({error:e.message},400);}
      const old=await current();if(old.revision!==value.baseRevision)return json({error:'План изменён на другом устройстве.',...old},409);
      const body=JSON.stringify(state),savedAt=new Date().toISOString();
      const result=await env.DB.batch([
        env.DB.prepare('INSERT INTO plans (user_id, revision, body, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = plans.revision + 1, body = excluded.body, updated_at = excluded.updated_at WHERE plans.revision = ? RETURNING revision').bind(user,body,savedAt,value.baseRevision),
        env.DB.prepare('INSERT OR IGNORE INTO snapshots (user_id, revision, body, saved_at) SELECT user_id, revision, body, updated_at FROM plans WHERE user_id = ? AND revision = ? AND body = ?').bind(user,value.baseRevision+1,body),
        env.DB.prepare('DELETE FROM snapshots WHERE user_id = ? AND revision NOT IN (SELECT revision FROM snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT 30)').bind(user,user)
      ]);
      if(!result[0].results?.length)return json({error:'План изменён на другом устройстве.',...await current()},409);
      return json({revision:result[0].results[0].revision,updatedAt:savedAt});
    }catch(e){return json({error:'Не удалось сохранить в облаке. Локальная копия остаётся в браузере.'},503);}
  }};
}
