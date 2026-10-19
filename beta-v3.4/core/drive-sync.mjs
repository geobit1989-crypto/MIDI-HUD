import {checkedLibrary,clone,canonical,sameLibrary,mergeLibraries} from './sync-merge.mjs';
import {readLibrarySource,replaceLibrary} from './library-storage.mjs';

export const SYNC_KEY='midiHudDriveSyncV1';
export const SYNC_SCOPE='https://www.googleapis.com/auth/drive.appdata';
export const COMMIT_KIND='midi-hud-sync-v1';
const MAX_BYTES=2_000_000,MAX_FILES=5000,ID=/^[a-zA-Z0-9_-]{8,100}$/;
export const newId=()=>crypto.randomUUID();
const fail=message=>{throw Error(message);};
function readState(storage){
 const raw=storage.getItem(SYNC_KEY);if(!raw)return {accounts:{}};
 const value=JSON.parse(raw);if(!value||typeof value.accounts!=='object'||Array.isArray(value.accounts))fail('El registro de sincronización está dañado; se ha conservado.');return value;
}
export function commitMetadata(commit){
 const appProperties={kind:COMMIT_KIND,commitId:commit.id};
 commit.parents.forEach((id,i)=>{appProperties['parent'+i]=id;});
 return {name:'MIDI-HUD-'+commit.id+'.json',mimeType:'application/json',parents:['appDataFolder'],appProperties};
}
export function validateCommit(value,expected=null){
 if(value?.format!==COMMIT_KIND||value.version!==1||!ID.test(value.id)||!Array.isArray(value.parents)||value.parents.length>16||value.parents.some(id=>!ID.test(id)||id===value.id)||new Set(value.parents).size!==value.parents.length)fail('Versión de Drive inválida.');
 if(expected&&(expected.id!==value.id||canonical([...expected.parents].sort())!==canonical([...value.parents].sort())))fail('Las referencias de la versión de Drive no coinciden.');
 if(typeof value.createdAt!=='string'||typeof value.deviceId!=='string')fail('Versión incompleta en Drive.');
 return {...value,library:checkedLibrary(value.library)};
}
/** REST compartido entre Google Identity Services (web) y URLSession (iOS).
 * Las versiones son inmutables: dos subidas simultáneas no se pisan. */
export class DriveHistory{
 constructor(request){this.request=request;}
 async list(){
  const files=[];let pageToken;
  do{
   const response=await this.request({method:'GET',path:'/drive/v3/files',query:{spaces:'appDataFolder',q:"trashed = false and appProperties has { key='kind' and value='"+COMMIT_KIND+"' }",pageSize:'1000',fields:'nextPageToken,files(id,appProperties)',...(pageToken?{pageToken}:{})}});
   if(!Array.isArray(response.files))fail('Drive no devolvió una lista válida.');files.push(...response.files);pageToken=response.nextPageToken;
   if(files.length>MAX_FILES)fail('El historial necesita archivarse antes de continuar; tus versiones se conservan.');
  }while(pageToken);
  const graph=new Map();
  for(const file of files){
   const props=file.appProperties||{},id=props.commitId;
   if(!ID.test(id)||!ID.test(file.id))fail('Referencia inválida en el historial de Drive.');
   const parents=Object.keys(props).filter(k=>/^parent\d+$/.test(k)).sort((a,b)=>Number(a.slice(6))-Number(b.slice(6))).map(k=>props[k]);
   if(parents.length>16||parents.some(p=>!ID.test(p)||p===id))fail('Historial de Drive inválido.');
   if(graph.has(id))fail('Hay versiones duplicadas en Drive; se han conservado.');
   graph.set(id,{id,fileId:file.id,parents});
  }
  // Si una lista está incompleta o alguien elimina un antecesor, no publicamos
  // una resolución basada en una historia incompleta.
  for(const item of graph.values())for(const parent of item.parents)if(!graph.has(parent))fail('Drive aún no muestra todo el historial. Vuelve a sincronizar en unos segundos.');
  const referenced=new Set([...graph.values()].flatMap(item=>item.parents));
  const heads=[...graph.keys()].filter(id=>!referenced.has(id)).sort();
  if(graph.size&&!heads.length)fail('Historial circular en Drive.');
  if(heads.length>16)fail('Hay demasiadas ediciones simultáneas. Se han conservado todas.');
  return {graph,heads};
 }
 async read(entry){
  const value=await this.request({method:'GET',path:'/drive/v3/files/'+encodeURIComponent(entry.fileId),query:{alt:'media'}});
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)fail('La versión supera el tamaño permitido.');
  return validateCommit(value,entry);
 }
 async append(commit){
  validateCommit(commit);
  const text=JSON.stringify(commit);if(new TextEncoder().encode(text).length>MAX_BYTES)fail('La biblioteca supera el tamaño permitido para sincronizar.');
  const boundary='hud_'+commit.id;
  const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(commitMetadata(commit))+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+text+'\r\n--'+boundary+'--\r\n';
  const result=await this.request({method:'POST',path:'/upload/drive/v3/files',query:{uploadType:'multipart',fields:'id'},headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  if(!ID.test(result.id))fail('Drive no confirmó el guardado.');return result;
 }
}
function ancestors(graph,id){
 const found=new Set(),pending=[id];
 while(pending.length){const current=pending.shift();if(found.has(current))continue;found.add(current);pending.push(...(graph.get(current)?.parents||[]));}return found;
}
export function commonAncestor(graph,a,b){
 const first=ancestors(graph,a),pending=[b],seen=new Set();
 while(pending.length){const id=pending.shift();if(seen.has(id))continue;seen.add(id);if(first.has(id))return id;pending.push(...(graph.get(id)?.parents||[]));}return null;
}
export function createSyncController({storage,history,getLocal=()=>{const raw=readLibrarySource(storage);return raw?checkedLibrary(JSON.parse(raw)):null;},canApply=()=>true,onApplied=()=>{},onStatus=()=>{},resolveConflict=async()=>null,id=newId,now=()=>new Date().toISOString()}){
 let running=null,account=null;
 const status=(state,message)=>onStatus({state,message});
 async function merge(base,local,remote,context){
  let result=mergeLibraries(base,local,remote);
  if(result.conflicts.length){
   // Antes de abrir ninguna elección, conservar ambas bibliotecas completas.
   const key='midiHudSyncRecovery:'+id();
   storage.setItem(key,JSON.stringify({createdAt:now(),accountId:account.id,base,local,remote,conflicts:result.conflicts}));
   const choice=await resolveConflict({...context,...result,recoveryKey:key,local,remote});
   if(!['local','remote'].includes(choice)){status('conflict','Hay cambios simultáneos. Las dos versiones están conservadas.');return null;}
   result=mergeLibraries(base,local,remote,choice);
  }
  return result.library;
 }
 async function perform(options){
  if(!account)throw Error('Conecta tu cuenta de Google para sincronizar.');
  if(!canApply(options)){status('deferred','Guarda tus cambios antes de sincronizar.');return {deferred:true};}
  status('syncing','Sincronizando…');
  const state=readState(storage),previous=state.accounts[account.id]||{},captured=clone(getLocal());
  if(captured)checkedLibrary(captured);
  const {graph,heads}=await history.list();
  const cache=new Map();
  const read=async commitId=>{if(!cache.has(commitId))cache.set(commitId,(await history.read(graph.get(commitId))).library);return cache.get(commitId);};
  let remote=null,firstHead=null;
  for(const head of heads){
   const version=await read(head);
   if(!remote){remote=version;firstHead=head;continue;}
   const common=commonAncestor(graph,firstHead,head);
   remote=await merge(common?await read(common):null,remote,version,{kind:'remote'});
   if(!remote)return {conflict:true};
  }
  // Base y cuenta son inseparables. Un cambio de cuenta nunca reutiliza el
  // antecesor de otra biblioteca.
  let base=previous.base||null;
  if(base)checkedLibrary(base);
  let merged=captured&&remote?await merge(base,captured,remote,{kind:'local'}):clone(captured||remote);
  if(!merged){if(!captured&&!remote)status('synced','Cuenta conectada. Guarda tu primer repertorio para sincronizarlo.');return {empty:!captured&&!remote,conflict:!!(captured||remote)};}
  const stillCurrent=()=>sameLibrary(getLocal(),captured)&&canApply(options);
  if(!stillCurrent()){status('pending','Hay cambios nuevos en este dispositivo. Se sincronizarán después de guardar.');return {pending:true};}
  const needsUpload=!remote||heads.length>1||!sameLibrary(remote,merged);
  let acceptedHeads=heads;
  if(needsUpload){
   const deviceId=state.deviceId||id();state.deviceId=deviceId;
   const commit={format:COMMIT_KIND,version:1,id:id(),parents:heads,deviceId,createdAt:now(),library:merged};
   await history.append(commit);acceptedHeads=[commit.id];
  }
  // La red puede tardar mientras el usuario sigue editando. Conservar la nueva
  // base remota, pero aplicar solamente si la copia local sigue siendo la leída.
  if(stillCurrent()&&!sameLibrary(captured,merged)){
   replaceLibrary(storage,merged,captured||merged);onApplied(clone(merged),options);
  }
  state.accounts[account.id]={base:merged,heads:acceptedHeads,lastSyncedAt:now(),email:account.email||''};
  storage.setItem(SYNC_KEY,JSON.stringify(state));
  const pending=!sameLibrary(getLocal(),merged);
  status(pending?'pending':'synced',pending?'Guardado en el dispositivo; hay cambios pendientes de sincronizar.':'Sincronizado · disponible sin conexión');
  return {library:merged,pending,uploaded:needsUpload};
 }
 return {
  setAccount(next){if(running)throw Error('Espera a que termine la sincronización antes de cambiar de cuenta.');if(next&&(!ID.test(next.id)||typeof next.email!=='string'))throw Error('Cuenta de Google inválida.');account=next;},
  synchronize(options={}){
   if(running)return running;
   running=perform(options).catch(error=>{status('error',error.message);throw error;}).finally(()=>{running=null;});return running;
  }
 };
}
