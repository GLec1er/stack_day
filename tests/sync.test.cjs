const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c={};vm.createContext(c);if(fs.existsSync(path.join(__dirname,'../sync.js')))vm.runInContext(fs.readFileSync(path.join(__dirname,'../sync.js'),'utf8'),c);
test('changes made during an in-flight save are sent again rather than marked synced prematurely',async()=>{
 assert.ok(c.SyncModel,'sync model missing');let local={value:'A'},cloud={revision:0,state:null},release;
 const controller=c.SyncModel.create({getState:()=>local,onRemote:x=>local=x,onStatus:()=>{},onConflict:()=>{},saveMeta:()=>{},transport:async(path,body)=>{if(!body)return cloud;if(body.state.value==='A')await new Promise(r=>release=r);if(body.baseRevision!==cloud.revision)return {...cloud,conflict:true};cloud={state:body.state,revision:cloud.revision+1};return cloud;}});
 const connecting=controller.connect();while(!release)await new Promise(r=>setImmediate(r));local={value:'B'};controller.changed();release();await connecting;assert.equal(cloud.state.value,'B');assert.equal(cloud.revision,2);assert.equal(controller.meta().dirty,false);
});
test('a stale local copy surfaces both versions and never overwrites cloud until explicitly resolved',async()=>{
 assert.ok(c.SyncModel,'sync model missing');let local={value:'Local'},cloud={revision:5,state:{value:'Cloud'}},conflict;
 const controller=c.SyncModel.create({getState:()=>local,onRemote:x=>local=x,onStatus:()=>{},onConflict:x=>conflict=x,saveMeta:()=>{},meta:{enabled:true,revision:4,baseRaw:'{"value":"Before"}',dirty:true},transport:async(path,body)=>body?{...cloud,conflict:true}:cloud});
 await controller.pull();assert.equal(local.value,'Local');assert.equal(cloud.state.value,'Cloud');assert.equal(conflict.state.value,'Cloud');controller.useRemote();assert.equal(local.value,'Cloud');assert.equal(controller.meta().revision,5);
});
test('a clean device receives a newer cloud plan while a failed write keeps local changes pending',async()=>{
 assert.ok(c.SyncModel,'sync model missing');let local={value:'A'},fail=false;
 const controller=c.SyncModel.create({getState:()=>local,onRemote:x=>local=x,onStatus:()=>{},onConflict:()=>{},saveMeta:()=>{},meta:{enabled:true,revision:1,baseRaw:'{"value":"A"}',dirty:false},transport:async(path,body)=>{if(fail)throw Error('offline');return {revision:2,state:{value:'B'}};}});
 await controller.pull();assert.equal(local.value,'B');local={value:'C'};controller.changed();fail=true;await controller.flush();assert.equal(local.value,'C');assert.equal(controller.meta().dirty,true);
});
