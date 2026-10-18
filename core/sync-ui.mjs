import {DriveHistory,createSyncController} from './drive-sync.mjs';
import {GoogleDriveAuth,loadGoogleIdentity} from './google-drive-auth.mjs?v=20261018-autosync1';
import {readLibrarySource} from './library-storage.mjs';

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
export function installCloudSync({host,storage=localStorage,getLocal=()=>{const raw=readLibrarySource(storage);return raw?JSON.parse(raw):null;},canApply=()=>true,onApplied=()=>{},mode='editor'}={}){
 installStyle();
 const launch=button('Sincronización',()=>open());host.append(launch);
 const CLIENT_STORAGE_KEY='midiHudGoogleWebClientId';
 let auth,account=null,configured=false,identityReady=false,last={state:'local',message:'Guardado en este dispositivo'},panel=null,busy=false,stopped=false;
 let queued=false,saveTimer=null;
 let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
 const status=next=>{
  last=next;
  launch.textContent=next.state==='synced'?'Sincronizado':
   next.state==='reauth'?'Reconectar Google':
   ['pending','deferred','offline'].includes(next.state)?'Cambios pendientes':'Sincronización';
  launch.setAttribute('data-sync-state',next.state);
  launch.title=next.message;refresh();
 };
 const controller=createSyncController({storage,history:new DriveHistory(request=>auth.request(request)),getLocal,canApply,onApplied,onStatus:status,resolveConflict:chooseConflict});
 const refresh=()=>{
  if(!panel?.open)return;
  panel.querySelector('[data-status]').textContent=last.message;
  panel.querySelector('[data-account]').textContent=account?'Cuenta: '+account.email:configured?'Conecta la misma cuenta de Google en tus dispositivos.':'La conexión con Drive todavía necesita configurarse para esta versión.';
  const connect=panel.querySelector('[data-connect]');connect.disabled=busy||!configured||!identityReady;connect.textContent=account?'Cambiar cuenta de Google':'Conectar con Google';
  panel.querySelector('[data-sync]').disabled=busy||!account;panel.querySelector('[data-disconnect]').disabled=busy||!account;
 };
 async function synchronize(options={}){
  if(!account||stopped)return;
  if(busy){queued=true;return;}
  // Esperar a que el editor guarde el borrador. LIVE no cambia su motor activo.
  if(!canApply(options)){status({state:'deferred',message:'Cambios locales sin guardar. Sincronizaré después de Guardar.'});return;}
  busy=true;refresh();
  try{
   const result=await controller.synchronize(options);
   // Puede haberse guardado otro cambio mientras Drive respondía.
   if(result?.pending&&!result?.deferred&&!result?.conflict)queued=true;
   return result;
  }catch(error){
   if(error?.code==='AUTH_REQUIRED'){
    account=null;
    controller.setAccount(null);
    status({state:'reauth',message:'La autorización de Google ha caducado. Los cambios permanecen en este dispositivo; vuelve a conectar una vez para reanudar.'});
   }else status({state:'error',message:'Sincronización pendiente. Se reintentará al recuperar la conexión: '+error.message});
  }finally{
   busy=false;refresh();
   if(queued&&account&&!stopped&&canApply({})&&document.visibilityState!=='hidden'){
    queued=false;queueMicrotask(()=>{void synchronize({reason:'queued'});});
   }
  }
 }
 function recoveries(){
  const node=dialog('Versiones conservadas');let count=0;
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i);if(!key?.startsWith('midiHudSyncRecovery:'))continue;
   let item;try{item=JSON.parse(storage.getItem(key));}catch{continue;}
   if(account&&item.accountId!==account.id)continue;
   const row=make('section');row.className='hud-sync-recovery';row.append(make('p',new Date(item.createdAt).toLocaleString()));
   for(const [label,library] of [['Este dispositivo',item.local],['Drive',item.remote]]){
    if(!library)continue;
    row.append(button('Recuperar '+label+' · '+library.repertoires.map(rep=>rep.name).join(', '),()=>{
     if(!canApply({explicit:true})){status({state:'deferred',message:'Guarda tus cambios antes de recuperar una versión.'});return;}
     if(!window.confirm('¿Recuperar esta versión completa? La biblioteca actual se conservará como copia anterior.'))return;
     // La recuperación usa el mismo guardado transaccional que la sincronización.
     import('./library-storage.mjs').then(({replaceLibrary})=>{
      const previous=getLocal();replaceLibrary(storage,library,previous||library);onApplied(library);status({state:'pending',message:'Versión recuperada. Pulsa Sincronizar ahora para compartirla.'});node.close();
     }).catch(error=>status({state:'error',message:error.message}));
    }));
   }
   node.append(row);count++;
  }
  if(!count)node.append(make('p','No hay conflictos guardados en este dispositivo.'));
  node.append(button('Cerrar',()=>node.close()));node.showModal();
 }
 function open(){
  if(panel?.open){panel.focus();return;}
  panel=dialog('Sincronización de repertorios');
  panel.append(make('p','Sincronización automática: al guardar, al abrir o regresar al MIDI HUD y al recuperar internet. Se conserva una copia local para usar LIVE sin conexión.'));
  const accountLine=make('p');accountLine.dataset.account='';const readout=make('p');readout.dataset.status='';readout.className='hud-sync-status';readout.setAttribute('role','status');panel.append(accountLine,readout);
  const setup=make('details');setup.className='hud-sync-recovery';
  setup.append(make('summary','Configuración avanzada de Google (OAuth)'));
  const label=make('label','Identificador OAuth web de MIDI HUD (no introduzcas contraseñas)');
  const clientInput=make('input');clientInput.type='text';clientInput.autocomplete='off';
  clientInput.placeholder='123456789-abc.apps.googleusercontent.com';
  clientInput.value=storage.getItem(CLIENT_STORAGE_KEY)||auth?.clientId||'';
  label.append(clientInput);setup.append(label);
  const saveClient=button('Guardar identificador',()=>{
   const id=clientInput.value.trim();
   if(!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)){
    status({state:'error',message:'El identificador debe terminar en .apps.googleusercontent.com. No introduzcas contraseñas ni secretos.'});return;
   }
   if(account){
    status({state:'error',message:'Desconecta tu cuenta antes de cambiar el identificador OAuth.'});return;
   }
   auth=new GoogleDriveAuth({clientId:id});
   storage.setItem(CLIENT_STORAGE_KEY,id);configured=auth.configured;identityReady=false;
   status({state:'setup',message:'ID configurado. Cargando Google…'});
   void loadGoogleIdentity().then(()=>{identityReady=true;status({state:'local',message:'Puedes conectar tu cuenta de Google.'});})
     .catch(error=>status({state:'error',message:error.message}));
  });
  setup.append(saveClient,make('p','Requiere un cliente OAuth web de Google Cloud con origen autorizado https://geobit1989-crypto.github.io. El permiso solicitado es solo el almacenamiento privado de MIDI HUD.'));
  const actions=make('div');actions.className='hud-sync-actions';
  const connect=button('Conectar con Google',()=>{
   // connect() abre Google inmediatamente, dentro de esta pulsación.
   if(busy)return;busy=true;refresh();
   auth.connect().then(next=>{account=next;controller.setAccount(account);status({state:'connected',message:'Cuenta conectada. Sincronización automática activada.'});}).catch(error=>status({state:'error',message:error.message})).finally(()=>{busy=false;refresh();if(account)void synchronize({explicit:true});});
  });connect.dataset.connect='';
  const sync=button(mode==='live'?'Actualizar repertorios':'Sincronizar ahora',()=>synchronize({explicit:true}));sync.dataset.sync='';
  const disconnect=button('Desconectar',async()=>{if(busy)return;busy=true;try{await auth.disconnect();account=null;controller.setAccount(null);status({state:'local',message:'Cuenta desconectada. Los repertorios permanecen en este dispositivo.'});}catch(error){status({state:'error',message:error.message});}finally{busy=false;refresh();}});disconnect.dataset.disconnect='';
  actions.append(connect,sync,disconnect,button('Versiones conservadas',recoveries),button('Cerrar',()=>panel.close()));
  panel.append(actions,setup);panel.showModal();panel.scrollTop=0;refresh();
 }
 async function initialize(){
  try{
   if(globalThis.MidiHudNative){
    auth=new GoogleDriveAuth();const config=await globalThis.MidiHudNative.call('cloud.config');configured=config.configured;identityReady=configured;
   }else{
    const response=await globalThis.fetch(new URL('../config/cloud-sync.json',import.meta.url),{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo leer la configuración de sincronización.');
    const config=await response.json();auth=new GoogleDriveAuth({clientId:storage.getItem(CLIENT_STORAGE_KEY)||config.googleWebClientId||''});configured=auth.configured;
    if(configured){void loadGoogleIdentity().then(()=>{identityReady=true;refresh();}).catch(error=>status({state:'offline',message:error.message+' Tus datos locales siguen disponibles.'}));}
   }
   if(configured){
    account=await auth.restore();
    if(account){controller.setAccount(account);await synchronize({reason:'startup'});}
    else status({state:'reauth',message:'Conecta tu cuenta de Google una vez para activar la sincronización automática. Tu repertorio local está a salvo.'});
   }else status({state:'setup',message:'La conexión con Drive todavía necesita configurarse.'});
  }catch(error){status({state:'error',message:error.message});}
  finally{resolveReady();refresh();}
 }
 const resume=()=>{
  if(last.state!=='conflict'&&document.visibilityState!=='hidden'&&account)void synchronize({reason:'resume'});
 };
 const onSaved=()=>{
  if(!account){
   status({state:'reauth',message:'Cambios guardados localmente. Conecta Google para activar la sincronización automática.'});
   return;
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
 void initialize();
 return {ready,synchronize,open,destroy(){
  stopped=true;clearInterval(interval);if(saveTimer!==null)clearTimeout(saveTimer);
  window.removeEventListener('online',resume);window.removeEventListener('focus',resume);
  window.removeEventListener('pageshow',resume);window.removeEventListener('hud-foreground',resume);
  window.removeEventListener('hud-library-saved',onSaved);
  document.removeEventListener('visibilitychange',resume);launch.remove();
 }};
}
