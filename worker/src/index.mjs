import {randomToken,sha256,seal,unseal,base64url} from "./crypto.mjs";

const APP_ORIGIN="https://geobit1989-crypto.github.io";
const SERVICE_URL="https://midihudaut.midihudapp.workers.dev";
const GOOGLE_AUTH="https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN="https://oauth2.googleapis.com/token";
const SCOPE="openid email https://www.googleapis.com/auth/drive.appdata";
const ALLOWED_RETURN=new Set(["/MIDI-HUD/editor/v3.html","/MIDI-HUD/v03.html"]);
const ALLOWED_DRIVE=/^\/drive\/v3\/files(?:\/[a-zA-Z0-9_-]+)?$/;
const JSON_HEADERS={
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY",
};
const DAY=86400;
class ApiError extends Error{
 constructor(status,code,message){super(message||code);this.status=status;this.code=code;}
}
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const now=()=>Math.floor(Date.now()/1000);
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...headers}});
const isReady=env=>!!(env.DB&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.TOKEN_ENCRYPTION_KEY);
const assertReady=env=>{if(!isReady(env))fail(503,"service_not_configured","La autenticación persistente está pendiente de configurar.");};
const getOriginHeaders=request=>request.headers.get("Origin")===APP_ORIGIN?{
 "Access-Control-Allow-Origin":APP_ORIGIN,
 "Access-Control-Allow-Headers":"Authorization, Content-Type",
 "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
 "Access-Control-Max-Age":"600",
 "Vary":"Origin",
}:{};
function browserOnly(request){
 if(request.headers.get("Origin")!==APP_ORIGIN)fail(403,"invalid_origin","Origen no autorizado.");
}
async function parseJson(request,max=3072000){
 if(!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
  fail(415,"invalid_content_type","Se requiere application/json.");
 if(Number(request.headers.get("Content-Length")||0)>max)fail(413,"request_too_large");
 const text=await request.text();
 if(text.length>max)fail(413,"request_too_large");
 try{return JSON.parse(text);}catch{fail(400,"invalid_json");}
}
async function googleToken(form,env){
 const result=await fetch(GOOGLE_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({...form,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET}).toString()});
 let data;try{data=await result.json();}catch{fail(502,"google_bad_response");}
 if(!result.ok){
  if(data?.error==="invalid_grant")fail(401,"AUTH_REQUIRED","Google retiró la autorización. Reconecta este dispositivo.");
  fail(502,"google_token_error","Google no pudo completar la autorización.");
 }
 return data;
}
async function accountFromGoogle(accessToken){
 const response=await fetch("https://www.googleapis.com/oauth2/v3/userinfo",{
  headers:{Authorization:"Bearer "+accessToken}
 });
 if(!response.ok)fail(502,"google_userinfo_error");
 const info=await response.json();
 if(!/^[0-9]{5,40}$/.test(info.sub||"")||typeof info.email!=="string"||!info.email.includes("@"))
  fail(502,"invalid_google_identity");
 return {id:info.sub,email:info.email};
}
async function startAuth(request,env){
 const data=await parseJson(request,2048);
 if(!ALLOWED_RETURN.has(data.returnPath))fail(400,"invalid_return_path");
 if(!/^[A-Za-z0-9_-]{43}$/.test(data.proofHash||""))fail(400,"invalid_proof");
 const state=randomToken(32),verifier=randomToken(48);
 const challenge=await sha256(verifier);
 await env.DB.prepare("DELETE FROM oauth_flows WHERE expires_at < ?").bind(now()).run();
 await env.DB.prepare("INSERT INTO oauth_flows(state_hash,proof_hash,verifier_cipher,return_path,expires_at) VALUES(?,?,?,?,?)")
  .bind(await sha256(state),data.proofHash,await seal(verifier,env.TOKEN_ENCRYPTION_KEY),data.returnPath,now()+600).run();
 const url=new URL(GOOGLE_AUTH);
 for(const [key,value] of Object.entries({
  client_id:env.GOOGLE_CLIENT_ID,redirect_uri:SERVICE_URL+"/auth/callback",response_type:"code",
  scope:SCOPE,access_type:"offline",prompt:"consent select_account",
  include_granted_scopes:"true",state,code_challenge:challenge,code_challenge_method:"S256"
 }))url.searchParams.set(key,value);
 return response({authorizeUrl:url.toString(),expiresIn:600});
}
async function googleCallback(request,env){
 const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 if(!/^[A-Za-z0-9_-]{43}$/.test(state))fail(400,"invalid_state");
 const stateHash=await sha256(state);
 const flow=await env.DB.prepare("SELECT * FROM oauth_flows WHERE state_hash = ?").bind(stateHash).first();
 if(!flow||flow.expires_at<now())fail(400,"expired_state");
 const consumed=await env.DB.prepare("DELETE FROM oauth_flows WHERE state_hash = ?").bind(stateHash).run();
 if(consumed.meta?.changes!==1)fail(400,"replayed_state");
 if(!code||url.searchParams.has("error"))fail(400,"google_authorization_cancelled");
 const verifier=await unseal(flow.verifier_cipher,env.TOKEN_ENCRYPTION_KEY);
 const tokens=await googleToken({code,code_verifier:verifier,grant_type:"authorization_code",redirect_uri:SERVICE_URL+"/auth/callback"},env);
 if(!tokens.access_token)fail(502,"missing_google_access_token");
 const user=await accountFromGoogle(tokens.access_token);
 const prior=await env.DB.prepare("SELECT refresh_cipher FROM google_accounts WHERE id = ?").bind(user.id).first();
 if(!tokens.refresh_token&&!prior?.refresh_cipher)
  fail(400,"offline_access_required","Google no facilitó permiso de acceso offline.");
 const refreshCipher=tokens.refresh_token?await seal(tokens.refresh_token,env.TOKEN_ENCRYPTION_KEY):prior.refresh_cipher;
 const accessCipher=await seal(tokens.access_token,env.TOKEN_ENCRYPTION_KEY);
 await env.DB.prepare(`INSERT INTO google_accounts(id,email,refresh_cipher,access_cipher,access_expires_at,updated_at)
 VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
 email=excluded.email,refresh_cipher=excluded.refresh_cipher,access_cipher=excluded.access_cipher,
 access_expires_at=excluded.access_expires_at,updated_at=excluded.updated_at`)
  .bind(user.id,user.email,refreshCipher,accessCipher,now()+Number(tokens.expires_in||3600),now()).run();
 const ticket=randomToken(32);
 await env.DB.prepare("INSERT INTO handoff_tickets(ticket_hash,proof_hash,account_id,expires_at) VALUES(?,?,?,?)")
  .bind(await sha256(ticket),flow.proof_hash,user.id,now()+180).run();
 const dest=new URL(APP_ORIGIN+flow.return_path);
 dest.searchParams.set("hud_auth_ticket",ticket);
 // The ticket by itself is useless: exchanging it also requires the client-held random proof.
 return new Response(null,{status:303,headers:{"Location":dest.toString(),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
async function exchangeTicket(request,env){
 const body=await parseJson(request,2048);
 if(!/^[A-Za-z0-9_-]{43}$/.test(body.ticket||"")||!/^[A-Za-z0-9_-]{43}$/.test(body.proof||""))
  fail(400,"invalid_ticket");
 const hash=await sha256(body.ticket),proofHash=await sha256(body.proof);
 const ticket=await env.DB.prepare("SELECT * FROM handoff_tickets WHERE ticket_hash = ?")
  .bind(hash).first();
 if(!ticket||ticket.used_at||ticket.expires_at<now()||ticket.proof_hash!==proofHash)fail(401,"expired_ticket");
 const consumed=await env.DB.prepare("UPDATE handoff_tickets SET used_at=? WHERE ticket_hash=? AND used_at IS NULL")
  .bind(now(),hash).run();
 if(consumed.meta?.changes!==1)fail(401,"expired_ticket");
 const bearer=randomToken(48),device=randomToken(18);
 const expires=now()+180*DAY;
 await env.DB.prepare("INSERT INTO trusted_devices(id,account_id,token_hash,created_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)")
  .bind(device,ticket.account_id,await sha256(bearer),now(),now(),expires).run();
 const account=await env.DB.prepare("SELECT id,email FROM google_accounts WHERE id=?").bind(ticket.account_id).first();
 return response({token:bearer,deviceId:device,expiresAt:expires*1000,account});
}
async function authenticate(request,env){
 const match=/^Bearer ([A-Za-z0-9_-]{64})$/.exec(request.headers.get("Authorization")||"");
 if(!match)fail(401,"AUTH_REQUIRED","Autoriza este dispositivo para sincronizar.");
 const tokenHash=await sha256(match[1]);
 const device=await env.DB.prepare("SELECT * FROM trusted_devices WHERE token_hash=?").bind(tokenHash).first();
 if(!device||device.revoked_at||device.expires_at<now())fail(401,"AUTH_REQUIRED","La sesión de este dispositivo ha caducado.");
 if(device.last_seen_at<now()-3600){
  await env.DB.prepare("UPDATE trusted_devices SET last_seen_at=?,expires_at=? WHERE id=? AND revoked_at IS NULL")
   .bind(now(),now()+180*DAY,device.id).run();
 }
 return device;
}
async function accessFor(env,accountId){
 const account=await env.DB.prepare("SELECT * FROM google_accounts WHERE id = ?").bind(accountId).first();
 if(!account)fail(401,"AUTH_REQUIRED");
 if(account.access_cipher&&account.access_expires_at>now()+90)
  return unseal(account.access_cipher,env.TOKEN_ENCRYPTION_KEY);
 const refresh=await unseal(account.refresh_cipher,env.TOKEN_ENCRYPTION_KEY);
 const tokens=await googleToken({grant_type:"refresh_token",refresh_token:refresh},env);
 if(!tokens.access_token)fail(502,"missing_google_access_token");
 await env.DB.prepare("UPDATE google_accounts SET refresh_cipher=?,access_cipher=?,access_expires_at=?,updated_at=? WHERE id=?")
  .bind(tokens.refresh_token?await seal(tokens.refresh_token,env.TOKEN_ENCRYPTION_KEY):account.refresh_cipher,
   await seal(tokens.access_token,env.TOKEN_ENCRYPTION_KEY),now()+Number(tokens.expires_in||3600),now(),accountId).run();
 return tokens.access_token;
}
function validateDriveRequest(body){
 if(!body||!["GET","POST"].includes(body.method))fail(400,"drive_method_not_allowed");
 if(typeof body.path!=="string"||!(ALLOWED_DRIVE.test(body.path)||body.path==="/upload/drive/v3/files"))
  fail(400,"drive_path_not_allowed");
 if(body.method==="POST"&&body.path!=="/upload/drive/v3/files")fail(400,"drive_write_not_allowed");
 if(body.method==="GET"&&body.path==="/upload/drive/v3/files")fail(400,"drive_method_not_allowed");
 if(body.body!=null&&(typeof body.body!=="string"||body.body.length>3000000))fail(413,"drive_body_too_large");
 if(body.headers&&
  (typeof body.headers!=="object"||Array.isArray(body.headers)||Object.keys(body.headers).some(k=>k.toLowerCase()!=="content-type")))
  fail(400,"drive_headers_not_allowed");
 if(body.query&&(typeof body.query!=="object"||Array.isArray(body.query)||
   Object.keys(body.query).some(key=>!["spaces","q","pageSize","fields","pageToken","alt","uploadType"].includes(key))))
  fail(400,"drive_query_not_allowed");
}
async function driveRequest(request,env,device){
 const data=await parseJson(request,3200000);
 validateDriveRequest(data);
 const endpoint=new URL(data.path,"https://www.googleapis.com");
 for(const [key,val] of Object.entries(data.query||{}))endpoint.searchParams.set(key,String(val));
 const token=await accessFor(env,device.account_id);
 const upstream=await fetch(endpoint.toString(),{
  method:data.method,headers:{...data.headers,Authorization:"Bearer "+token},
  body:data.body||undefined,
 });
 const text=await upstream.text();
 if(text.length>3000000)fail(502,"drive_response_too_large");
 if(upstream.status===401)fail(401,"AUTH_REQUIRED","Google exige una nueva autorización.");
 let result;try{result=JSON.parse(text);}catch{fail(502,"drive_response_invalid");}
 return response(result,upstream.status===403?403:upstream.ok?200:502);
}
async function api(request,env,path){
 if(path==="/auth/start"&&request.method==="POST")return startAuth(request,env);
 if(path==="/session/exchange"&&request.method==="POST")return exchangeTicket(request,env);
 const device=await authenticate(request,env);
 if(path==="/session"&&request.method==="GET"){
  const account=await env.DB.prepare("SELECT id,email FROM google_accounts WHERE id=?").bind(device.account_id).first();
  return response({account,device:{id:device.id,expiresAt:device.expires_at*1000}});
 }
 if(path==="/session/revoke"&&request.method==="POST"){
  await env.DB.prepare("UPDATE trusted_devices SET revoked_at=? WHERE id=?").bind(now(),device.id).run();
  return response({revoked:true});
 }
 if(path==="/session/devices"&&request.method==="GET"){
  const rows=await env.DB.prepare("SELECT id,created_at,last_seen_at,expires_at FROM trusted_devices WHERE account_id=? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 50")
   .bind(device.account_id).all();
  return response({devices:rows.results||[],current:device.id});
 }
 if(path==="/session/devices/revoke"&&request.method==="POST"){
  const body=await parseJson(request,2048);
  if(typeof body.deviceId!=="string"||!body.deviceId)fail(400,"invalid_device");
  await env.DB.prepare("UPDATE trusted_devices SET revoked_at=? WHERE id=? AND account_id=?")
   .bind(now(),body.deviceId,device.account_id).run();
  return response({revoked:true});
 }
 if(path==="/drive/request"&&request.method==="POST")return driveRequest(request,env,device);
 return response({error:"not_found"},404);
}
export default {
 async fetch(request,env={}){
  const path=new URL(request.url).pathname;
  if(request.method==="GET"&&(path==="/"||path==="/health"))
   return response({service:"midi-hud-auth",status:isReady(env)?"ok":"pending_configuration",
    stage:"persistent-oauth",oauthEnabled:isReady(env)},200,getOriginHeaders(request));
  if(path==="/auth/callback"&&request.method==="GET"){
   try{assertReady(env);return await googleCallback(request,env);}
   catch(error){return response({error:"oauth_callback_failed",message:"No se completó Google OAuth. Regresa a MIDI HUD e inténtalo de nuevo."},
    error instanceof ApiError?error.status:500);}
  }
  if(request.method==="OPTIONS"){
   if(request.headers.get("Origin")!==APP_ORIGIN)return response({error:"invalid_origin"},403);
   return new Response(null,{status:204,headers:{...getOriginHeaders(request),"Cache-Control":"no-store"}});
  }
  let result;
  try{
   browserOnly(request);
   assertReady(env);
   result=await api(request,env,path);
  }catch(error){
   result=response({error:error instanceof ApiError?error.code:"internal_error",
    message:error instanceof ApiError?error.message:"Error interno del servidor."},
    error instanceof ApiError?error.status:500);
  }
  const headers=new Headers(result.headers);
  for(const [key,value] of Object.entries(getOriginHeaders(request)))headers.set(key,value);
  return new Response(result.body,{status:result.status,headers});
 }
};
