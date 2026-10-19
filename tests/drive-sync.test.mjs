import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DriveHistory,createSyncController,SYNC_KEY,COMMIT_KIND,commitMetadata,validateCommit,commonAncestor} from '../core/drive-sync.mjs';
import {mergeLibraries,clone,sameLibrary} from '../core/sync-merge.mjs';
import {LIBRARY_KEY,BACKUP_KEY} from '../core/library-storage.mjs';
import {GoogleDriveAuth,validateDriveRequest} from '../core/google-drive-auth.mjs';
import {validateLibrary} from '../core/engine-v1.mjs';

const fixture=()=>JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
function storage(library=null){
 const map=new Map(library?[[LIBRARY_KEY,JSON.stringify(library)]]:[]),writes=[];
 return {map,writes,getItem:key=>map.get(key)??null,setItem(key,value){writes.push(key);map.set(key,String(value));},removeItem:key=>map.delete(key),get length(){return map.size;},key:i=>[...map.keys()][i]??null};
}
let sequence=0;const id=()=> 'test-hud-'+String(++sequence).padStart(8,'0');
class MemoryHistory{
 commits=new Map();offline=false;beforeList=null;beforeAppend=null;
 async list(){
  if(this.offline)throw Error('Sin conexión');
  const graph=new Map([...this.commits].map(([id,commit])=>[id,{id,fileId:id,parents:clone(commit.parents)}]));
  const used=new Set([...graph.values()].flatMap(item=>item.parents));
  const snapshot={graph,heads:[...graph.keys()].filter(id=>!used.has(id)).sort()};
  await this.beforeList?.();return snapshot;
 }
 async read(entry){return validateCommit(clone(this.commits.get(entry.id)),entry);}
 async append(commit){if(this.offline)throw Error('Sin conexión');await this.beforeAppend?.(commit);assert(!this.commits.has(commit.id));this.commits.set(commit.id,clone(commit));return {id:commit.id};}
}
function device(history,library=null,options={}){
 const store=storage(library),statuses=[],applied=[],conflicts=[];
 const controller=createSyncController({storage:store,history,id,onStatus:value=>statuses.push(value),onApplied:value=>applied.push(value),resolveConflict:async value=>{conflicts.push(value);return options.choice||null;},...options});
 controller.setAccount({id:'google-user-000001',email:'georges@example.test'});
 return {store,controller,statuses,applied,conflicts,get:()=>JSON.parse(store.getItem(LIBRARY_KEY)),save:library=>store.setItem(LIBRARY_KEY,JSON.stringify(library)),sync:opts=>controller.synchronize(opts)};
}
const change=(device,fn)=>{const db=device.get();fn(db);db.revision++;device.save(db);return db;};

test('Drive sincroniza dos dispositivos y mantiene MIDI y la copia sin conexión',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud);
 a.store.setItem('midiHudSettingsV1','{"midiChannel":3}');b.store.setItem('midiHudSettingsV1','{"midiChannel":8}');
 await a.sync();await b.sync();
 assert(sameLibrary(a.get(),b.get()));assert.equal(cloud.commits.size,1);
 assert.equal(b.store.getItem('midiHudSettingsV1'),'{"midiChannel":8}');
 const edited=change(a,db=>{db.repertoires[0].name='prueba 1';db.songs[0].displaySlots[0].name='Intro';});
 await a.sync();await b.sync();assert(sameLibrary(b.get(),edited));assert.equal(b.get().repertoires[0].name,'prueba 1');
 cloud.offline=true;assert.equal(b.get().repertoires[0].name,'prueba 1');await assert.rejects(b.sync(),/Sin conexión/);
 assert.equal(b.get().repertoires[0].name,'prueba 1');assert.equal(b.statuses.at(-1).state,'error');
});
test('sin guardados no publica la biblioteca de ejemplo ni reemplaza una cuenta vacía',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud);const result=await a.sync();assert(result.empty);assert.equal(cloud.commits.size,0);assert.equal(a.store.getItem(LIBRARY_KEY),null);assert.equal(a.statuses.at(-1).state,'synced');
});
test('cambios en canciones distintas se unen sin mezclar estados, módulos ni MIDI',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud);
 await a.sync();await b.sync();
 const first=change(a,db=>{db.songs[0].title='Intro editada en PC';db.states.find(st=>st.songId===db.songs[0].id).gtPatch=7;});
 const second=change(b,db=>{db.songs[1].title='Solo editado en iPhone';db.states.find(st=>st.songId===db.songs[1].id).gtPatch=82;});
 await a.sync();await b.sync();await a.sync();
 assert(sameLibrary(a.get(),b.get()));assert.equal(a.get().songs[0].title,first.songs[0].title);assert.equal(a.get().songs[1].title,second.songs[1].title);
 assert.deepEqual(a.get().bindings,fixture().bindings);assert.equal(a.conflicts.length+b.conflicts.length,0);assert(validateLibrary(a.get()));
});
test('editar la misma canción conserva ambas versiones y cancelar no cambia los guardados',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud);
 await a.sync();await b.sync();
 change(a,db=>{db.states[0].name='Intro PC';});change(b,db=>{db.states[0].name='Intro iPhone';});
 await a.sync();const before=b.store.getItem(LIBRARY_KEY),backup=b.store.getItem(BACKUP_KEY),state=b.store.getItem(SYNC_KEY),count=cloud.commits.size;
 const result=await b.sync();assert(result.conflict);assert.equal(b.conflicts.length,1);assert.equal(b.store.getItem(LIBRARY_KEY),before);assert.equal(b.store.getItem(BACKUP_KEY),backup);assert.equal(b.store.getItem(SYNC_KEY),state);assert.equal(cloud.commits.size,count);
 const saved=JSON.parse(b.store.getItem(b.conflicts[0].recoveryKey));assert.equal(saved.local.states[0].name,'Intro iPhone');assert.equal(saved.remote.states[0].name,'Intro PC');
});
test('resolver un conflicto conserva también cambios ajenos al elemento en conflicto',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud,null,{choice:'local'});
 await a.sync();await b.sync();
 change(a,db=>{db.states[0].name='PC';db.songs[1].title='Otro cambio PC';});change(b,db=>{db.states[0].name='iPhone';});
 await a.sync();await b.sync();await a.sync();assert.equal(a.get().states[0].name,'iPhone');assert.equal(a.get().songs[1].title,'Otro cambio PC');assert(sameLibrary(a.get(),b.get()));
});
test('dos subidas simultáneas generan ramas inmutables que otro dispositivo puede reunir',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud);
 await a.sync();await b.sync();change(a,db=>{db.songs[0].title='Cambio simultáneo A';});change(b,db=>{db.songs[1].title='Cambio simultáneo B';});
 let count=0,release;const gate=new Promise(resolve=>{release=resolve;});
 cloud.beforeList=async()=>{count++;if(count===2)release();await gate;};await Promise.all([a.sync(),b.sync()]);cloud.beforeList=null;
 const branched=await cloud.list();assert.equal(branched.heads.length,2);
 const c=device(cloud);await c.sync();assert.equal((await cloud.list()).heads.length,1);assert.equal(c.get().songs[0].title,'Cambio simultáneo A');assert.equal(c.get().songs[1].title,'Cambio simultáneo B');assert.equal(c.conflicts.length,0);assert.equal(cloud.commits.size,4);
});
test('un cambio local durante una subida no es reemplazado al regresar la respuesta',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture());await a.sync();change(a,db=>{db.songs[0].title='Guardado 1';});
 cloud.beforeAppend=async()=>{change(a,db=>{db.songs[0].title='Guardado 2 mientras espera';});};
 const result=await a.sync();cloud.beforeAppend=null;assert(result.pending);assert.equal(a.get().songs[0].title,'Guardado 2 mientras espera');
 await a.sync();const b=device(cloud);await b.sync();assert.equal(b.get().songs[0].title,'Guardado 2 mientras espera');
});
test('los borradores y una sesión LIVE bloqueada no se aplican durante la sincronización',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture());await a.sync();
 const b=device(cloud,null,{canApply:options=>!!options?.explicit});const result=await b.sync();assert(result.deferred);assert.equal(b.store.getItem(LIBRARY_KEY),null);
 await b.sync({explicit:true});assert(sameLibrary(a.get(),b.get()));
 let draft=false;const c=device(cloud,null,{canApply:()=>!draft});cloud.beforeList=async()=>{draft=true;};
 await c.sync();assert.equal(c.store.getItem(LIBRARY_KEY),null);assert.equal(c.statuses.at(-1).state,'pending');
});
test('fallos de almacenamiento mantienen la biblioteca y su backup; Drive conserva la versión',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud,fixture());await a.sync();await b.sync();
 change(a,db=>{db.songs[0].title='Versión remota';});await a.sync();
 const before=b.store.getItem(LIBRARY_KEY),backup=b.store.getItem(BACKUP_KEY),base=b.store.getItem(SYNC_KEY),set=b.store.setItem;
 b.store.setItem=(key,value)=>{if(key===LIBRARY_KEY)throw Error('Sin espacio');set(key,value);};
 await assert.rejects(b.sync(),/Sin espacio/);assert.equal(b.store.getItem(LIBRARY_KEY),before);assert.equal(b.store.getItem(BACKUP_KEY),backup);assert.equal(b.store.getItem(SYNC_KEY),base);
});
test('la cuenta no puede cambiar mientras hay una sincronización en curso',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture());let release;cloud.beforeList=()=>new Promise(resolve=>{release=resolve;});
 const pending=a.sync();assert.throws(()=>a.controller.setAccount({id:'google-user-000002',email:'otra@example.test'}),/Espere|Espera/);release();await pending;
});
test('un remoto corrupto o una referencia de antecesor ausente no modifica datos',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture());await a.sync();const [key]=cloud.commits.keys();cloud.commits.get(key).library.states[0].songId='ausente';
 const b=device(cloud,fixture()),before=b.store.getItem(LIBRARY_KEY);await assert.rejects(b.sync(),/huerfano|ajeno/);assert.equal(b.store.getItem(LIBRARY_KEY),before);
 const history=new DriveHistory(async()=>({files:[{id:'drive-file-0001',appProperties:{kind:COMMIT_KIND,commitId:'commit-00000001',parent0:'commit-00000002'}}]}));await assert.rejects(history.list(),/todo el historial/);
});
test('REST de Drive pagina, conserva metadatos y sube versiones sin PATCH ni DELETE',async()=>{
 const db=fixture(),commit={format:COMMIT_KIND,version:1,id:'commit-00000001',parents:[],deviceId:'device-00000001',createdAt:new Date().toISOString(),library:db},calls=[];
 const history=new DriveHistory(async request=>{calls.push(request);if(request.method==='POST')return {id:'drive-file-00002'};if(request.query?.alt==='media')return commit;if(request.query?.pageToken)return {files:[]};return {files:[{id:'drive-file-00001',appProperties:commitMetadata(commit).appProperties}],nextPageToken:'next-page'};});
 const {graph,heads}=await history.list();assert.deepEqual(heads,[commit.id]);assert.equal((await history.read(graph.get(commit.id))).id,commit.id);await history.append(commit);
 assert.equal(calls.filter(call=>call.method==='GET').length,3);const upload=calls.at(-1);assert.equal(upload.path,'/upload/drive/v3/files');assert.match(upload.body,/appDataFolder/);assert.match(upload.body,/"parents":\[\]/);assert.equal(upload.query.uploadType,'multipart');
});
test('la fusión valida referencias y rechaza mezclas de borrado y edición incompatibles',()=>{
 const base=fixture(),local=clone(base),remote=clone(base);local.songs[0].title='Cambio local';remote.songs[0].title='Cambio remoto';
 const conflict=mergeLibraries(base,local,remote);assert.equal(conflict.library,null);assert(conflict.conflicts.some(item=>item.key.startsWith('song:')));
 assert.equal(mergeLibraries(base,local,remote,'remote').library.songs[0].title,'Cambio remoto');
 const graph=new Map([['base',{parents:[]}],['a',{parents:['base']}],['b',{parents:['base']}] ]);assert.equal(commonAncestor(graph,'a','b'),'base');
});
test('las peticiones web no permiten hosts ajenos, borrados ni cabeceras de credenciales',async()=>{
 for(const request of [{method:'DELETE',path:'/drive/v3/files/abcd'},{method:'GET',path:'https://evil.test/'},{method:'POST',path:'/drive/v3/files'},{method:'GET',path:'/drive/v3/files',headers:{Authorization:'otra'}}])assert.throws(()=>validateDriveRequest(request));
 const auth=new GoogleDriveAuth({clientId:'valid-client.apps.googleusercontent.com'});assert.equal(await auth.restore(),null);await assert.rejects(auth.request({method:'GET',path:'/drive/v3/files'}),/Vuelve a conectar/);
 const nativeCalls=[],native=new GoogleDriveAuth({native:{call:async(command,payload)=>{nativeCalls.push({command,payload});return {id:'google-user-000001',email:'test@example.test'};}}});
 await native.connect();await native.request({method:'GET',path:'/drive/v3/files'});await native.disconnect();assert.deepEqual(nativeCalls.map(item=>item.command),['cloud.connect','cloud.request','cloud.disconnect']);assert(!JSON.stringify(nativeCalls).includes('access_token'));
});

test('Google Drive OAuth usa fetch ligado al contexto del navegador',async()=>{
 const original=globalThis.fetch,requests=[];
 globalThis.fetch=async function(url,options){
  assert.equal(this,globalThis,'fetch nativo debe recibir Window como this');
  requests.push({url:String(url),options});
  if(String(url).includes('/oauth2/v3/userinfo')){
   return {ok:true,json:async()=>({sub:'google-user-000009',email:'test@example.org'})};
  }
  return {ok:true,text:async()=>JSON.stringify({files:[]})};
 };
 try{
  const auth=new GoogleDriveAuth({
   native:null,
   clientId:'123456789-test.apps.googleusercontent.com',
   google:()=>({accounts:{oauth2:{initTokenClient:options=>({
    requestAccessToken:()=>queueMicrotask(()=>options.callback({
     access_token:'test-token',expires_in:3600,
     scope:'openid email https://www.googleapis.com/auth/drive.appdata'
    }))
   })}}})
  });
  const account=await auth.connect();
  assert.equal(account.email,'test@example.org');
  const answer=await auth.request({method:'GET',path:'/drive/v3/files',query:{pageSize:10}});
  assert.deepEqual(answer,{files:[]});
  assert.equal(requests.length,2);
  assert.match(requests[0].url,/oauth2\/v3\/userinfo/);
  assert.match(requests[1].url,/drive\/v3\/files/);
 }finally{
  if(original===undefined)delete globalThis.fetch;
  else globalThis.fetch=original;
 }
});

test('la sesión OAuth web sobrevive a recargar la misma pestaña sin contraseña permanente',async()=>{
 const values=new Map();
 const session={
  setItem:(key,value)=>values.set(key,String(value)),
  getItem:key=>values.get(key)||null,
  removeItem:key=>values.delete(key)
 };
 const clientId='123456789-autor.apps.googleusercontent.com';
 const fetcher=async(url)=>{
  if(String(url).includes('/oauth2/v3/userinfo'))
   return {ok:true,json:async()=>({sub:'google-user-000055',email:'prueba@example.org'})};
  return {ok:true,text:async()=>JSON.stringify({files:[]})};
 };
 const oauth=()=>({accounts:{oauth2:{initTokenClient:params=>({
  requestAccessToken:()=>queueMicrotask(()=>params.callback({
   access_token:'short-lived-test-token',expires_in:3600,
   scope:'openid email https://www.googleapis.com/auth/drive.appdata'
  }))
 })}}});
 const first=new GoogleDriveAuth({clientId,native:null,session,fetcher,google:oauth});
 const account=await first.connect();
 assert.equal(account.email,'prueba@example.org');
 assert.equal(values.size,1,'Only sessionStorage, not localStorage');
 assert(!JSON.stringify([...values]).includes('client_secret'));
 const refreshed=new GoogleDriveAuth({clientId,native:null,session,fetcher,google:oauth});
 assert.deepEqual(await refreshed.restore(),account);
 assert.deepEqual(await refreshed.request({method:'GET',path:'/drive/v3/files'}),{files:[]});
 await refreshed.disconnect();
 assert.equal(values.size,0,'Logout forgets the temporary bearer token');
 assert.equal(await new GoogleDriveAuth({clientId,native:null,session}).restore(),null);
});
test('sesión caducada o de otro cliente OAuth nunca se reutiliza',async()=>{
 const cache=new Map();
 const session={setItem:(k,v)=>cache.set(k,v),getItem:k=>cache.get(k)||null,removeItem:k=>cache.delete(k)};
 const clientId='123456789-one.apps.googleusercontent.com';
 cache.set('midiHudGoogleOAuthSessionV1',JSON.stringify({
  clientId,account:{id:'google-user-000055',email:'prueba@example.org'},
  token:{value:'already-expired',expiresAt:Date.now()-10000}
 }));
 const expired=new GoogleDriveAuth({clientId,native:null,session});
 assert.equal(await expired.restore(),null);
 assert.equal(cache.size,0);
 cache.set('midiHudGoogleOAuthSessionV1',JSON.stringify({
  clientId,account:{id:'google-user-000055',email:'prueba@example.org'},
  token:{value:'still-valid',expiresAt:Date.now()+3600000}
 }));
 const changed=new GoogleDriveAuth({clientId:'123456789-different.apps.googleusercontent.com',native:null,session});
 assert.equal(await changed.restore(),null);
 assert.equal(cache.size,0);
});
