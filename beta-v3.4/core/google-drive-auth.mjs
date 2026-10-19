import {SYNC_SCOPE} from './drive-sync.mjs';
export const DRIVE_ORIGIN='https://www.googleapis.com';
const SCOPE='openid email '+SYNC_SCOPE;
const CLIENT_ID=/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;
const SESSION_KEY='midiHudGoogleOAuthSessionV1';
const tokenAlive=value=>value&&typeof value.value==='string'&&!!value.value&&Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now()+30_000;
const allowedPath=path=>/^\/drive\/v3\/files(?:\/[a-zA-Z0-9_-]+)?$/.test(path)||path==='/upload/drive/v3/files';

export function validateDriveRequest(request){
 if(!request||!['GET','POST'].includes(request.method)||!allowedPath(request.path))throw Error('Petición a Drive no permitida.');
 if(request.method==='POST'&&request.path!=='/upload/drive/v3/files')throw Error('Solo se pueden añadir versiones; no se sobrescribe el historial.');
 if(request.body!=null&&(typeof request.body!=='string'||request.body.length>3_000_000))throw Error('Petición a Drive demasiado grande.');
 if(Object.keys(request.headers||{}).some(key=>key.toLowerCase()!=='content-type'))throw Error('Cabeceras no permitidas.');
}
function requestError(status,body){
 const detail=body?.error?.message;
 return Error(status===401?'Vuelve a conectar tu cuenta de Google.':status===403?'Drive no autorizó la sincronización. Revisa el permiso de MIDI HUD.':'No se pudo sincronizar con Drive ('+status+').'+(detail?' '+detail:''));
}
export class GoogleDriveAuth{
 constructor({clientId='',native=globalThis.MidiHudNative,fetcher=(...args)=>globalThis.fetch(...args),google=()=>globalThis.google,session=()=>{try{return globalThis.sessionStorage;}catch{return null;}}}={}){
  this.clientId=clientId;this.native=native;this.fetcher=fetcher;this.google=google;this.session=session;this.token=null;this.account=null;
 }
 sessionStore(){try{return typeof this.session==='function'?this.session():this.session;}catch{return null;}}
 saveSession(){
  if(this.native||!this.account||!tokenAlive(this.token))return;
  // Token de corta duración solo durante esta pestaña: NUNCA en localStorage, URL ni GitHub.
  try{this.sessionStore()?.setItem(SESSION_KEY,JSON.stringify({clientId:this.clientId,account:this.account,token:this.token}));}catch{}
 }
 clearSession(){
  try{this.sessionStore()?.removeItem(SESSION_KEY);}catch{}
 }
 authRequired(message='Vuelve a conectar tu cuenta de Google. Los cambios siguen guardados en este dispositivo.'){
  this.token=null;this.account=null;this.clearSession();
  const error=Error(message);error.code='AUTH_REQUIRED';return error;
 }
 get configured(){return !!this.native||CLIENT_ID.test(this.clientId);}
 async restore(){
  if(this.native){const account=await this.native.call('cloud.restore');this.account=account;return account;}
  if(tokenAlive(this.token))return this.account;
  let stored;
  try{stored=JSON.parse(this.sessionStore()?.getItem(SESSION_KEY)||'null');}catch{}
  if(stored?.clientId===this.clientId&&tokenAlive(stored.token)&&
   typeof stored.account?.id==='string'&&typeof stored.account?.email==='string'){
   this.token=stored.token;this.account=stored.account;return this.account;
  }
  this.clearSession();this.token=null;this.account=null;return null;
 }
 connect(){
  if(this.native)return this.native.call('cloud.connect').then(account=>(this.account=account));
  if(!CLIENT_ID.test(this.clientId))return Promise.reject(Error('La conexión con Drive todavía necesita configurarse.'));
  const api=this.google()?.accounts?.oauth2;
  if(!api)return Promise.reject(Error('No se pudo cargar la conexión con Google. Comprueba internet y vuelve a abrir Sincronización.'));
  return new Promise((resolve,reject)=>{
   const client=api.initTokenClient({client_id:this.clientId,scope:SCOPE,
    callback:async response=>{
     try{
      if(response.error||!response.access_token)throw Error('Google no autorizó la conexión.');
      if(response.scope&&!response.scope.split(' ').includes(SYNC_SCOPE))throw Error('Debes autorizar a MIDI HUD a guardar sus datos en Drive.');
      const token={value:response.access_token,expiresAt:Date.now()+Number(response.expires_in||3600)*1000};
      const result=await this.fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token.value},signal:AbortSignal.timeout(15000)});
      if(!result.ok)throw Error('No se pudo identificar la cuenta de Google.');
      const info=await result.json();if(typeof info.sub!=='string'||typeof info.email!=='string')throw Error('Google no devolvió una cuenta válida.');
      this.token=token;this.account={id:info.sub,email:info.email};this.saveSession();resolve(this.account);
     }catch(error){reject(error);}
    },error_callback:error=>reject(Error(error.type==='popup_closed'?'Conexión cancelada.':'No se pudo abrir Google. Usa Chrome en Android/ordenador o la app iOS.'))});
   // Esta llamada permanece dentro del gesto del usuario: no hay await previo.
   client.requestAccessToken({prompt:'select_account'});
  });
 }
 async disconnect(){
  if(this.native)await this.native.call('cloud.disconnect');
  this.token=null;this.account=null;this.clearSession();
 }
 async request(request){
  validateDriveRequest(request);
  if(this.native)return this.native.call('cloud.request',request);
  if(!tokenAlive(this.token))throw this.authRequired();
  const url=new URL(request.path,DRIVE_ORIGIN);
  for(const [key,value] of Object.entries(request.query||{}))url.searchParams.set(key,String(value));
  const response=await this.fetcher(url,{method:request.method,headers:{...request.headers,Authorization:'Bearer '+this.token.value},body:request.body,signal:AbortSignal.timeout(15000)});
  const text=await response.text();if(text.length>3_000_000)throw Error('La respuesta de Drive supera el tamaño permitido.');
  let value;try{value=JSON.parse(text);}catch{throw Error('Drive devolvió una respuesta inválida.');}
  if(!response.ok){if(response.status===401)throw this.authRequired();throw requestError(response.status,value);}return value;
 }
}

export function loadGoogleIdentity(document=globalThis.document){
 if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
 const existing=document.getElementById('hud-google-identity');
 if(existing)return existing.ready;
 const script=document.createElement('script');script.id='hud-google-identity';script.src='https://accounts.google.com/gsi/client';script.async=true;
 script.ready=new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Sin conexión con Google.'));};});
 document.head.append(script);return script.ready;
}
