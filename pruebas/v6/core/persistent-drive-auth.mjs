import {appStorage as localStorage,appSessionStorage as sessionStorage} from "./environment.mjs";
import {validateDriveRequest} from "./google-drive-auth.mjs";
const AUTH_KEY="midiHudTrustedDeviceSessionV1";
const PROOF_KEY="midiHudOAuthHandoffProofV1";
export const DEFAULT_WORKER="https://midihudaut.midihudapp.workers.dev";
const chars=/^[A-Za-z0-9_-]+$/;
const urlSafe=raw=>btoa([...raw].map(n=>String.fromCharCode(n)).join(""))
 .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const now=()=>Date.now();
const random=()=>urlSafe(crypto.getRandomValues(new Uint8Array(32)));
const digest=async value=>urlSafe(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));
const parse=raw=>{try{return JSON.parse(raw);}catch{return null;}};
// UI context is local, short-lived and bound to the existing OAuth handoff.
export function readOAuthSettingsReturn({location=globalThis.location,store=localStorage,transient=sessionStorage,time=now()}={}){
 if(!location?.href)return null;
 const url=new URL(location.href);
 if(!url.searchParams.has("hud_auth_ticket")&&!url.searchParams.has("hud_auth_error"))return null;
 let pending;try{pending=parse(transient?.getItem(PROOF_KEY))||parse(store?.getItem(PROOF_KEY));}catch{return null;}
 if(!/^[A-Za-z0-9_-]{43}$/.test(pending?.value||"")||!Number.isFinite(pending.created)||
  time-pending.created>600000||time<pending.created-60000||pending.returnPath!==url.pathname)return null;
 return ["home","live"].includes(pending.returnView)?pending.returnView:null;
}
export class PersistentDriveAuth {
 constructor({
  workerUrl=DEFAULT_WORKER,
  store=()=>localStorage,
  transient=()=>sessionStorage,
  fetcher=(...args)=>globalThis.fetch(...args),
  location=()=>globalThis.location,
  history=()=>globalThis.history,
  navigate=address=>globalThis.location.assign(address),native=null,getReturnView=()=>null
 }={}){
  if(workerUrl!==DEFAULT_WORKER)throw Error("La dirección del servidor de MIDI HUD no está permitida.");
  this.workerUrl=workerUrl;this.store=store;this.transient=transient;this.fetcher=fetcher;
  this.location=location;this.history=history;this.navigate=navigate;
  this.session=null;this.account=null;this.clientId="";this.native=native;this.getReturnView=getReturnView;
 }
 get configured(){return true;}
 get isPersistent(){return true;}
 get hasSession(){try{return !!this.store()?.getItem(AUTH_KEY);}catch{return false;}}
 load(){
  let result;try{result=parse(this.store()?.getItem(AUTH_KEY));}catch{}
  if(result?.origin!==this.workerUrl||!chars.test(result?.token||"")||result.token.length!==64||
   typeof result?.account?.id!=="string"||typeof result?.account?.email!=="string"||result.expiresAt<=now()){
   this.clear();return null;
  }
  this.session=result;this.account=result.account;return result;
 }
 save(value){
  this.session=value;this.account=value.account;
  this.store()?.setItem(AUTH_KEY,JSON.stringify(value));
 }
 clear(){
  try{this.store()?.removeItem(AUTH_KEY);}catch{}
  this.session=null;this.account=null;
 }
 async ready(){
  try{
   let status;
   if(this.native)status=await this.call("/health");
   else {const response=await this.fetcher(this.workerUrl+"/health",{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!response.ok)return false;status=await response.json();}
   return status?.service==="midi-hud-auth"&&status.oauthEnabled===true;
  }catch{return false;}
 }
 async call(path,{method="GET",body,token=this.session?.token}={}){
  const response=this.native?await this.native.call("broker.request",{path,method,body,token}).then(result=>({ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.data})):await this.fetcher(this.workerUrl+path,{
   method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   cache:"no-store",signal:AbortSignal.timeout(18000)
  });
  let value;try{value=await response.json();}catch{throw Error("El servidor de sincronización devolvió una respuesta inválida.");}
  if(!response.ok){
   const error=Error(value.message||"Error de sincronización con el servidor ("+response.status+").");
   error.code=value.error||"SERVER_ERROR";
   if(response.status===401&&error.code==="AUTH_REQUIRED")this.clear();
   throw error;
  }
  return value;
 }
 async redeem(){
  const current=this.location();if(!current?.href)return false;
  const url=new URL(current.href);
  const ticket=url.searchParams.get("hud_auth_ticket"),error=url.searchParams.get("hud_auth_error");
  if(!ticket&&!error)return false;
  url.searchParams.delete("hud_auth_ticket");
  url.searchParams.delete("hud_auth_error");
  this.history().replaceState(this.history().state,"",url.pathname+url.search+url.hash);
  if(error)throw Error("Google no completó la conexión: "+error);
  // iOS may open the Google consent screen in a separate browser context.
  // Keep the one-time login proof locally for a maximum of ten minutes.
  const proof=parse(this.transient()?.getItem(PROOF_KEY))||
   parse(this.store()?.getItem(PROOF_KEY));
  try{this.transient()?.removeItem(PROOF_KEY);}catch{}
  try{this.store()?.removeItem(PROOF_KEY);}catch{}
  if(!proof?.value||!chars.test(proof.value)||now()-proof.created>600000||now()<proof.created-60000)
   throw Error("La autorización ha caducado. Vuelve a pulsar Conectar con Google.");
  const session=await this.call("/session/exchange",{method:"POST",body:{ticket,proof:proof.value},token:null});
  if(!chars.test(session.token||"")||session.token.length!==64||!session.account?.id||!session.account?.email)
   throw Error("El servidor no devolvió una sesión de dispositivo válida.");
  this.save({origin:this.workerUrl,token:session.token,deviceId:session.deviceId,
   expiresAt:session.expiresAt,account:session.account});
  return true;
 }
 async restore(){
  if(this.native){
   const pending=parse(this.store()?.getItem(PROOF_KEY));
   if(pending?.value&&now()-pending.created<600000){const result=await this.call("/auth/native/poll",{method:"POST",body:{proof:pending.value},token:null});if(!result.pending){this.acceptNative(result);return this.account;}}
  }else await this.redeem();
  const saved=this.load();
  if(!saved)return null;
  try{
   const value=await this.call("/session");
   if(!value.account?.id||value.account.id!==saved.account.id){
    this.clear();return null;
   }
   this.save({...saved,account:value.account,expiresAt:value.device.expiresAt});
   return this.account;
  }catch(error){
   if(error.code==="AUTH_REQUIRED")return null;
   // Without connectivity, preserve the local authorized device for the next retry.
   return this.account;
  }
 }
 acceptNative(session){
  if(!chars.test(session.token||"")||session.token.length!==64||!session.account?.id||!session.account?.email)throw Error("Sesión nativa inválida.");
  this.save({origin:this.workerUrl,token:session.token,deviceId:session.deviceId,expiresAt:session.expiresAt,account:session.account});
  this.store()?.removeItem(PROOF_KEY);
 }
 async connectNative(){
  const platform=this.native.platform;
  const returnTo=platform==="android"?"io.midihud.app.androidqa://oauth/complete":platform==="ios"?"midihud-oauth://complete":platform==="windows"?await this.native.call("broker.prepare"):undefined;
  const next=await this.call("/auth/native/start",{method:"POST",body:returnTo?{returnTo}:{},token:null});
  if(returnTo&&next.returnTo!==returnTo)throw Error("El servidor todavía no admite el retorno automático.");
  if(!/^[A-Za-z0-9_-]{43}$/.test(next.proof||"")||!next.authorizeUrl?.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"))throw Error("Autorización nativa inválida.");
  const created=now();this.store()?.setItem(PROOF_KEY,JSON.stringify({value:next.proof,created}));
  try{
   if(!await this.native.call("broker.open",{url:next.authorizeUrl}))throw Error("Autorización cancelada.");
  }catch(error){this.store()?.removeItem(PROOF_KEY);throw error;}
  while(now()-created<600000){
   if(!returnTo)await new Promise(resolve=>setTimeout(resolve,2500));
   const result=await this.call("/auth/native/poll",{method:"POST",body:{proof:next.proof},token:null});
   if(!result.pending){this.acceptNative(result);return this.account;}
   if(returnTo)await new Promise(resolve=>setTimeout(resolve,2500));
  }
  throw Error("La autorización caducó. Vuelve a conectar Google.");
 }
 async connect(){
  if(this.native)return this.connectNative();
  const proof=random(),proofHash=await digest(proof);
  let returnPath="/MIDI-HUD/editor/v3.html";
  if(this.location().pathname==="/MIDI-HUD/v03.html")returnPath="/MIDI-HUD/v03.html";
  if(this.location().pathname.startsWith('/MIDI-HUD/pruebas/v6/'))returnPath=/\/v03(?:-ble-test)?\.html$/.test(this.location().pathname)?'/MIDI-HUD/pruebas/v6/v03.html':'/MIDI-HUD/pruebas/v6/editor/v3.html';
  const returnView=this.getReturnView();
   const pending=JSON.stringify({value:proof,created:now(),returnPath,...(["home","live"].includes(returnView)?{returnView}:{})});
  try{this.transient()?.setItem(PROOF_KEY,pending);}catch{}
  this.store()?.setItem(PROOF_KEY,pending);
  const next=await this.call("/auth/start",{method:"POST",body:{returnPath,proofHash},token:null});
  if(!next.authorizeUrl?.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"))
   throw Error("El servidor devolvió una dirección de Google no válida.");
  // Same-tab navigation supports Safari without relying on third-party cookies.
  this.navigate(next.authorizeUrl);
  // The browser navigates away; the session is finished by restore() on return.
  return new Promise(()=>{});
 }
 async disconnect(){
  if(this.session){
   await this.call("/session/revoke",{method:"POST",body:{}});
  }
  this.clear();
 }
 async request(request){
  validateDriveRequest(request);
  return this.call("/drive/request",{method:"POST",body:request});
 }
 async listDevices(){return this.call("/session/devices");}
 async revokeDevice(id){
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(id))throw Error("Dispositivo inválido.");
  const result=await this.call("/session/devices/revoke",{method:"POST",body:{deviceId:id}});
  if(this.session?.deviceId===id)this.clear();
  return result;
 }
}
