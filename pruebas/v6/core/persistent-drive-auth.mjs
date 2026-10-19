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
export class PersistentDriveAuth {
 constructor({
  workerUrl=DEFAULT_WORKER,
  store=()=>globalThis.localStorage,
  transient=()=>globalThis.sessionStorage,
  fetcher=(...args)=>globalThis.fetch(...args),
  location=()=>globalThis.location,
  history=()=>globalThis.history,
  navigate=address=>globalThis.location.assign(address)
 }={}){
  if(workerUrl!==DEFAULT_WORKER)throw Error("La dirección del servidor de MIDI HUD no está permitida.");
  this.workerUrl=workerUrl;this.store=store;this.transient=transient;this.fetcher=fetcher;
  this.location=location;this.history=history;this.navigate=navigate;
  this.session=null;this.account=null;this.clientId="";
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
   const response=await this.fetcher(this.workerUrl+"/health",{cache:"no-store",signal:AbortSignal.timeout(10000)});
   const status=await response.json();
   return response.ok&&status?.service==="midi-hud-auth"&&status.oauthEnabled===true;
  }catch{return false;}
 }
 async call(path,{method="GET",body,token=this.session?.token}={}){
  const response=await this.fetcher(this.workerUrl+path,{
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
  await this.redeem();
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
 async connect(){
  const proof=random(),proofHash=await digest(proof);
  const returnPath=this.location().pathname;
  if(!["/MIDI-HUD/pruebas/v6/editor/v3.html","/MIDI-HUD/pruebas/v6/v03.html"].includes(returnPath))
   throw Error("La ruta de pruebas v6 no está autorizada para Google OAuth.");
  const pending=JSON.stringify({value:proof,created:now()});
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
