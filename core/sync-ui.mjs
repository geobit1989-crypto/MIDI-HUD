import {appStorage as localStorage,appSessionStorage as sessionStorage,IS_TEST_ENVIRONMENT} from "./environment.mjs";
import {DriveHistory,createSyncController,lastSuccessfulSync} from './drive-sync.mjs?v=20261127-sync2';
import {GoogleDriveAuth,loadGoogleIdentity} from './google-drive-auth.mjs?v=20261018-autosync1';
import {readLibrarySource} from './library-storage.mjs';
import {PersistentDriveAuth} from './persistent-drive-auth.mjs?v=20261127-sync2';

const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const button=(text,callback)=>{const node=make('button',text);node.type='button';node.onclick=callback;return node;};
function dialog(title){
 const node=make('dialog');node.className='hud-sync-dialog';node.setAttribute('aria-label',title);
 const heading=make('h2',title);node.append(heading);document.body.append(node);
 node.addEventListener('close',()=>node.remove(),{once:true});return node;
}
function installStyle(){
 if(document.getElementById('hud-sync-style'))return;
 const style=make('style');style.id='hud-sync-style';style.textContent=`
 .hud-sync-dialog{box-sizing:border-box;color:#f3f8fc;background:#112638;border:1px solid #62869b;border-radius:14px;padding:20px;width:min(620px,calc(100vw - 24px));max-height:calc(100dvh - 28px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;font:16px/1.5 system-ui,sans-serif}
 .hud-sync-dialog::backdrop{background:#000b}.hud-sync-dialog h2{font-size:22px;margin-top:0}.hud-sync-dialog p{overflow-wrap:anywhere}.hud-sync-dialog button,.hud-sync-dialog select{font:inherit;min-height:44px;background:#193b50;color:#fff;border:1px solid #64869a;border-radius:8px;padding:9px 13px}.hud-sync-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding:8px 0;background:#112638;position:sticky;top:0;z-index:2}.hud-sync-status{font-size:16px;line-height:1.4;color:#c1e2ef}.hud-sync-dialog input{box-sizing:border-box;width:100%;font:inherit;min-height:44px;background:#0b2232;color:#fff;border:1px solid #64869a;border-radius:8px;padding:9px 13px}.hud-sync-dialog button:disabled{opacity:.55}.hud-sync-recovery{border-top:1px solid #456174;padding-top:12px;margin-top:16px}.hud-sync-recovery summary{cursor:pointer;font-weight:650;color:#b7e7f7;padding:8px 0}.hud-sync-dialog [data-account]{font-weight:600}.hud-sync-dialog [data-status]{margin:5px 0 9px}.hud-sync-dialog [data-connect],.hud-sync-dialog [data-sync]{background:#15506d;border-color:#62b3d3;font-weight:700}@media(max-width:600px){.hud-sync-dialog{width:calc(100vw - 18px);padding:14px;max-height:calc(100dvh - 18px);font-size:15px}.hud-sync-dialog h2{font-size:20px;margin-bottom:7px}.hud-sync-dialog p{margin:8px 0}.hud-sync-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.hud-sync-actions button{min-width:0;padding:9px 6px;font-size:14px}.hud-sync-actions [data-connect],.hud-sync-actions [data-sync]{grid-column:1/-1}.hud-sync-dialog .hud-sync-recovery{margin-top:12px}}`;
 document.head.append(style);
}
function chooseConflict(info){
 return new Promise(resolve=>{
  const panel=dialog('Cambios simultáneos');
  panel.append(make('p','Se editaron los mismos datos en varios dispositivos. Ambas versiones ya están conservadas. La elección se aplica a los elementos en conflicto; los demás cambios se mantienen.'));
  panel.append(make('p',info.conflicts.map(item=>item.label).join(' · ')));
  const summary=library=>library.repertoires.map(rep=>rep.name).join(', ');
  panel.append(make('p','Este dispositivo: '+summary(info.local)),make('p','Drive: '+summary(info.remote)));
  let finished=false;
  const finish=choice=>{if(finished)return;finished=true;panel.close();resolve(choice);};
  const actions=make('div');actions.className='hud-sync-actions';
  actions.append(button('Conservar mis cambios',()=>finish('local')),button('Conservar los cambios de Drive',()=>finish('remote')),button('Decidir después',()=>finish(null)));
  panel.append(actions);panel.addEventListener('cancel',event=>{event.preventDefault();finish(null);});panel.addEventListener('close',()=>finish(null));panel.showModal();
 });
}
/** Copia local siempre utilizable. En LIVE solo se aplican cambios por elección
 * explícita o antes de crear el motor, nunca durante una interpretación. */
export function installCloudSync({host,storage=localStorage,getLocal=()=>{const raw=readLibrarySource(storage);return raw?JSON.parse(raw):null;},canApply=()=>true,onApplied=()=>{},mode='editor',inline=false}={}){
 installStyle();
 const autoKey='midiHudAutoSync';
 let auto=IS_TEST_ENVIRONMENT||storage.getItem(autoKey)!=='off';
 if(IS_TEST_ENVIRONMENT)storage.setItem(autoKey,'on');
 const launch=button('Sincronización',()=>open());host.append(launch);
 const CLIENT_STORAGE_KEY='midiHudGoogleWebClientId';
 let auth,account=null,configured=false,identityReady=false,last={state:'local',message:'Guardado en este dispositivo'},panel=null,busy=false,stopped=false;
 let queued=false,queuedOptions={},saveTimer=null,initializing=false,restoring=false;
 let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
 const status=next=>{
  last=next;
  launch.textContent=next.state==='synced'?'Sincronizado':
   next.state==='reauth'?'Reconectar Google':
   ['pending','deferred','offline'].includes(next.state)?'Cambios pendientes':'Sincronización';
  launch.setAttribute('data-sync-state',next.state);
  launch.title=next.message;refresh();
 };
 const history=new DriveHistory(request=>auth.request(request));
 const controller=createSyncController({storage,history,getLocal,canApply:options=>mode==='live'||canApply(options),onApplied:(library,options)=>{if(mode!=='live')onApplied(library);},onStatus:status,resolveConflict:chooseConflict,authoritative:IS_TEST_ENVIRONMENT,confirmSeed:()=>window.confirm('Drive todavía no contiene una biblioteca. ¿Publicar la biblioteca confirmada de este dispositivo como biblioteca inicial compartida?')});
 const refresh=()=>{
  if(!panel||(!inline&&!panel.open))return;
  panel.querySelector('[data-status]').textContent=last.message;
  panel.querySelector('[data-account]').textContent=account?'Cuenta: '+account.email:configured?'Conecta la misma cuenta de Google en tus dispositivos.':'La conexión con Drive todavía necesita configurarse para esta versión.';
  if(inline){
   const timestamp=lastSuccessfulSync(storage,account?.id);
   panel.querySelector('[data-last-sync]').textContent=timestamp?'Última sincronización correcta: '+new Date(timestamp).toLocaleString():'Sin sincronizaciones registradas para esta cuenta.';
  }
  const connect=panel.querySelector('[data-connect]');connect.disabled=busy||!configured||!identityReady;connect.textContent=account?'Cambiar cuenta de Google':'Conectar con Google';
  const manage=panel.querySelector('[data-manage-devices]');if(manage)manage.hidden=!auth?.isPersistent;
  panel.querySelector('[data-sync]').disabled=busy||!account;panel.querySelector('[data-disconnect]').disabled=busy||!account;
 };
 async function synchronize(options={}){
  if(!account||stopped||(!auto&&!options.explicit))return;
  if(busy){queued=true;queuedOptions={...queuedOptions,...options};return;}
  // Esperar a que el editor guarde el borrador. LIVE no cambia su motor activo.
  if(mode!=='live'&&!canApply(options)){status({state:'deferred',message:'Cambios locales sin guardar. Sincronizaré después de Guardar.'});return;}
  busy=true;refresh();
  try{
   const result=await controller.synchronize(options);
   if(mode==='live'&&(!inline&&options.explicit||inline&&canApply(options))&&!result?.pending&&!result?.conflict&&!result?.deferred&&result?.library){onApplied(result.library);}

   // Puede haberse guardado otro cambio mientras Drive respondía.
   if(result?.pending&&!result?.deferred&&!result?.conflict)queued=true;
   return result;
  }catch(error){
   if(error?.code==='AUTH_REQUIRED'){
    account=null;
    controller.setAccount(null);
    status({state:'reauth',message:'La autorización de Google ha caducado. Los cambios permanecen en este dispositivo; vuelve a conectar una vez para reanudar.'});
   }else {queued=false;status({state:'error',message:'Sincronización pendiente. Se reintentará al recuperar la conexión: '+error.message});}
  }finally{
   busy=false;refresh();
   if(queued&&account&&!stopped&&document.visibilityState!=='hidden'){
    const pendingOptions=queuedOptions;queued=false;queuedOptions={};queueMicrotask(()=>{void synchronize({reason:'queued',...pendingOptions});});
   }
  }
 }
 function recoveries(){
  const node=dialog('Historial de versiones');
  const recoveryStatus=make('p');recoveryStatus.setAttribute('role','status');
  node.append(recoveryStatus);
  async function restore(read,source){
   if(busy){recoveryStatus.textContent='Espera a que termine la sincronización.';return;}
   if(!inline&&!canApply({explicit:true})){recoveryStatus.textContent='Guarda tus cambios antes de recuperar una versión.';return;}
   busy=true;refresh();
   try{
    const previous=getLocal(),origin=JSON.stringify(previous);
    const library=await read();
    if(!node.open)return;
    const names=library.repertoires.map(rep=>rep.name).join(', ');
    if(!window.confirm('¿Recuperar la versión de '+source+' con '+names+'? La biblioteca actual se conservará como copia anterior.'))return;
    if(origin!==JSON.stringify(getLocal()))throw Error('La biblioteca local cambió. Vuelve a abrir el historial.');
    if(!inline&&!canApply({explicit:true}))throw Error('Guarda tus cambios antes de recuperar una versión.');
    const {replaceLibrary}=await import('./library-storage.mjs');
    if(origin!==JSON.stringify(getLocal()))throw Error('La biblioteca local cambió. Vuelve a abrir el historial.');
    replaceLibrary(storage,library,previous||library);
    status({state:'pending',message:'Versión recuperada en este dispositivo. Pulsa Sincronizar ahora para compartirla.'});
    if(!inline||canApply({explicit:true}))onApplied(library);
    node.close();
   }catch(error){recoveryStatus.textContent=error.message;}
   finally{busy=false;refresh();}
  }
  const remote=make('section');remote.className='hud-sync-recovery';
  const local=make('section');local.className='hud-sync-recovery';
  remote.append(make('h3','Versiones en Drive'));
  local.append(make('h3','Copias de conflictos locales'));
  let count=0;
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i);if(!key?.startsWith('midiHudSyncRecovery:'))continue;
   let item;try{item=JSON.parse(storage.getItem(key));}catch{continue;}
   if(account&&item.accountId!==account.id)continue;
   const row=make('section');
   const date=new Date(item.createdAt).toLocaleString();
   row.append(make('p',date));
   for(const [label,library] of [['Este dispositivo',item.local],['Drive',item.remote]]){
    if(library)row.append(button('Recuperar '+label+' · '+library.repertoires.map(rep=>rep.name).join(', '),()=>restore(()=>library,label+' del '+date)));
   }
   local.append(row);count++;
  }
  if(!count)local.append(make('p','No hay conflictos guardados en este dispositivo.'));
  node.append(remote,local,button('Cerrar',()=>node.close()));node.showModal();
  const accountId=account?.id;
  if(!accountId){remote.append(make('p','Conecta Google para ver las versiones en Drive.'));return;}
  const listing=make('p','Cargando historial…');remote.append(listing);
  void history.list().then(({graph})=>{
   const entries=[...graph.values()].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
   if(!entries.length){listing.textContent='No hay versiones en Drive.';return;}
   listing.remove();
   const versions=make('select');versions.setAttribute('aria-label','Versión de biblioteca en Drive');
   for(const entry of entries){
    const date=entry.createdAt?new Date(entry.createdAt).toLocaleString():'Fecha no disponible';
    versions.add(new Option(date+' · '+entry.id.slice(0,8),entry.id));
   }
   remote.append(versions,button('Recuperar versión de Drive',()=>restore(async()=>{
    if(account?.id!==accountId)throw Error('La cuenta de Google cambió. Vuelve a abrir el historial.');
    return (await history.read(graph.get(versions.value))).library;
   },versions.selectedOptions[0].textContent)));
  }).catch(error=>{listing.textContent='No se pudo cargar el historial: '+error.message;});
 }
 function open(){
  if(inline&&panel){host.closest('details').open=true;panel.querySelector('input')?.focus();return;}
  if(panel?.open){panel.focus();return;}
  panel=inline?make('div'):dialog('Sincronización de repertorios');
  if(!inline)panel.append(make('p','Sincronización automática: al guardar, al abrir o regresar al MIDI HUD y al recuperar internet. Se conserva una copia local para usar LIVE sin conexión.'));
  const accountLine=make('p');accountLine.dataset.account='';const readout=make('p');readout.dataset.status='';readout.className='hud-sync-status';readout.setAttribute('role','status');panel.append(accountLine,readout);
  if(inline){
   const lastSync=make('p');lastSync.dataset.lastSync='';
   const autoLabel=make('label');
   const toggle=make('input');toggle.type='checkbox';toggle.checked=auto;toggle.disabled=IS_TEST_ENVIRONMENT;
   toggle.onchange=()=>{if(IS_TEST_ENVIRONMENT){toggle.checked=true;return;}auto=toggle.checked;storage.setItem(autoKey,auto?'on':'off');if(auto)void resume();};
   autoLabel.append(toggle,' Sincronización automática');
   panel.append(lastSync,autoLabel);
   if(IS_TEST_ENVIRONMENT)panel.append(make('p','Siempre activa. Sin conexión se utiliza la última copia local; al recuperar internet se reanuda automáticamente.'));
  }
  const actions=make('div');actions.className='hud-sync-actions';
  const connect=button('Conectar con Google',()=>{
   // connect() abre Google inmediatamente, dentro de esta pulsación.
   if(busy)return;busy=true;refresh();
   auth.connect().then(next=>{account=next;controller.setAccount(account);status({state:'connected',message:'Cuenta de Google conectada.'});}).catch(error=>status({state:'error',message:error.message})).finally(()=>{busy=false;refresh();if(account)void synchronize({reason:'connected'});});
  });connect.dataset.connect='';
  const sync=button('Sincronizar ahora',()=>synchronize({explicit:true}));sync.dataset.sync='';
  const disconnect=button('Desconectar',async()=>{if(busy)return;busy=true;try{await auth.disconnect();account=null;controller.setAccount(null);status({state:'reauth',message:'Cuenta desconectada. La copia local está a salvo; vuelve a autorizar Google para mantenerla actualizada.'});}catch(error){status({state:'error',message:error.message});}finally{busy=false;refresh();}});disconnect.dataset.disconnect='';
  const manage=button('Dispositivos autorizados',async()=>{
   if(!auth?.isPersistent)return;
   const list=dialog('Dispositivos autorizados');
   list.append(make('p','Cada navegador autorizado tiene su propia sesión. Puedes revocar cualquier dispositivo desde aquí.'));
   const container=make('div');list.append(container);
   list.append(button('Cerrar',()=>list.close()));list.showModal();
   try{
    const data=await auth.listDevices();
    if(!data.devices?.length){container.append(make('p','No hay dispositivos activos.'));return;}
    for(const d of data.devices){
     const item=make('section');item.className='hud-sync-recovery';
     const current=d.id===data.current;
     item.append(make('p',(current?'Este dispositivo · ':'Dispositivo · ')+
      'Última actividad: '+new Date(d.last_seen_at*1000).toLocaleString()));
     const revoke=button('Revocar autorización',async()=>{
      if(!window.confirm('¿Revocar la sesión de este dispositivo?'))return;
      try{
       await auth.revokeDevice(d.id);item.remove();
       if(current){account=null;controller.setAccount(null);status({state:'reauth',message:'Dispositivo desconectado.'});}
      }catch(error){container.prepend(make('p',error.message));}
     });item.append(revoke);container.append(item);
    }
   }catch(error){container.append(make('p',error.message));}
  });
  manage.dataset.manageDevices='';manage.hidden=!auth?.isPersistent;
  actions.append(connect,sync,disconnect,manage,button('Historial de versiones',recoveries));
  if(!inline)actions.append(button('Cerrar',()=>panel.close()));
  panel.append(actions);
  if(inline){launch.hidden=true;host.append(panel);}
  else {panel.showModal();panel.scrollTop=0;}
  refresh();
 }
 async function initialize(){
  if(initializing||stopped)return;
  initializing=true;
  try{
   if(globalThis.MidiHudNative?.platform){
    auth=new PersistentDriveAuth({native:globalThis.MidiHudNative,store:()=>storage});configured=true;identityReady=await auth.ready();
    if(!identityReady)status({state:'offline',message:'Servidor común de Drive no disponible. Se conserva la caché local.'});
   }else if(globalThis.MidiHudNative){
    auth=new GoogleDriveAuth();const config=await globalThis.MidiHudNative.call('cloud.config');configured=config.configured;identityReady=configured;
   }else{
    const response=await globalThis.fetch(new URL('../config/cloud-sync.json',import.meta.url),{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo leer la configuración de sincronización.');
    const config=await response.json();
    const persistent=new PersistentDriveAuth();
    const callback=globalThis.location.search.includes('hud_auth_ticket=')||
     globalThis.location.search.includes('hud_auth_error=');
    if(IS_TEST_ENVIRONMENT||callback||persistent.hasSession||await persistent.ready()){
     auth=persistent;configured=true;identityReady=await persistent.ready()||callback||persistent.hasSession;
    }else{
     // Preserve the existing Google Identity flow until the new Worker has its
     // D1 database, Google OAuth secret and encryption key fully configured.
     auth=new GoogleDriveAuth({clientId:storage.getItem(CLIENT_STORAGE_KEY)||config.googleWebClientId||''});
     configured=auth.configured;
     if(configured){void loadGoogleIdentity().then(()=>{identityReady=true;refresh();})
       .catch(error=>status({state:'offline',message:error.message+' Tus datos locales siguen disponibles.'}));}
    }
   }
   if(configured){
    account=await auth.restore();
    if(account){controller.setAccount(account);await synchronize({reason:'startup'});}
    else status(identityReady?{state:'reauth',message:'Autoriza la misma cuenta de Google para acceder a la biblioteca única. Tu copia local está a salvo.'}:{state:'offline',message:'Servidor común de Drive no disponible. Se conserva la caché local.'});
   }else status({state:'setup',message:'La conexión con Drive todavía necesita configurarse.'});
  }catch(error){status({state:'error',message:error.message});}
  finally{initializing=false;resolveReady();refresh();}
 }
 const resume=async()=>{
  if(stopped||initializing||last.state==='conflict'||document.visibilityState==='hidden')return;
  if(!auth||!configured||(!identityReady&&auth.isPersistent)){await initialize();return;}
  if(!account){
   if(restoring||busy)return;
   restoring=true;
   try{const recovered=await auth.restore();if(recovered&&!stopped){account=recovered;controller.setAccount(account);}}
   catch(error){status({state:'offline',message:'Sesión pendiente de recuperar: '+error.message});}
   finally{restoring=false;refresh();}
  }
  if(account)await synchronize({reason:'resume'});
 };
 const onSaved=()=>{
  if(!auto){status({state:'local',message:'Cambios guardados en este dispositivo.'});return;}
  if(!account){
   status({state:'pending',message:'Cambios guardados localmente. Recuperando la sesión autorizada…'});
   void resume();return;
  }
  if(saveTimer!==null)clearTimeout(saveTimer);
  status({state:'pending',message:'Cambios guardados. Sincronizando con Google Drive automáticamente…'});
  saveTimer=setTimeout(()=>{saveTimer=null;void synchronize({reason:'saved'});},350);
 };
 window.addEventListener('online',resume);
 window.addEventListener('focus',resume);
 window.addEventListener('pageshow',resume);
 window.addEventListener('hud-foreground',resume);
 window.addEventListener('hud-library-saved',onSaved);
 document.addEventListener('visibilitychange',resume);
 const interval=setInterval(resume,60000);
 if(inline)open();
 void initialize();
 return {ready,synchronize,open,destroy(){
  stopped=true;clearInterval(interval);if(saveTimer!==null)clearTimeout(saveTimer);
  window.removeEventListener('online',resume);window.removeEventListener('focus',resume);
  window.removeEventListener('pageshow',resume);window.removeEventListener('hud-foreground',resume);
  window.removeEventListener('hud-library-saved',onSaved);
  document.removeEventListener('visibilitychange',resume);launch.remove();
 }};
}
