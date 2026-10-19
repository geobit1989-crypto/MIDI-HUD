import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.mjs";
import {randomToken,base64url,sha256,seal,unseal} from "../src/crypto.mjs";

const SERVER="https://midihudaut.midihudapp.workers.dev";
const ORIGIN="https://geobit1989-crypto.github.io";
const headers={"Origin":ORIGIN,"Content-Type":"application/json"};

const api=(path,method="GET",data,extra={})=>
 new Request(SERVER+path,{method,headers:{...headers,...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});

function fakeDB(){
 const flows=new Map(),tickets=new Map(),accounts=new Map(),devices=new Map();
 const snapshots={flows,tickets,accounts,devices};
 const DB={prepare(sql){
  let args=[];
  return {
   bind(...values){args=values;return this;},
   async first(){
    if(sql.includes("FROM oauth_flows"))return flows.get(args[0])||null;
    if(sql.includes("FROM handoff_tickets"))return tickets.get(args[0])||null;
    if(sql.includes("SELECT refresh_cipher FROM google_accounts"))return accounts.get(args[0])||null;
    if(sql.includes("FROM google_accounts"))return accounts.get(args[0])||null;
    if(sql.includes("FROM trusted_devices")){
     if(sql.includes("token_hash"))return [...devices.values()].find(v=>v.token_hash===args[0])||null;
    }
    throw Error("Unknown SQL FIRST: "+sql);
   },
   async all(){
    if(sql.includes("FROM trusted_devices")){
     const results=[...devices.values()].filter(v=>v.account_id===args[0]&&!v.revoked_at)
      .map(v=>({id:v.id,created_at:v.created_at,last_seen_at:v.last_seen_at,expires_at:v.expires_at}));
     return {results};
    }
    throw Error("Unknown SQL ALL: "+sql);
   },
   async run(){
    let changes=1;
    if(sql.startsWith("DELETE FROM oauth_flows WHERE expires_at")){
     for(const [k,v] of flows)if(v.expires_at<args[0])flows.delete(k);
    }else if(sql.startsWith("INSERT INTO oauth_flows")){
     flows.set(args[0],{state_hash:args[0],proof_hash:args[1],verifier_cipher:args[2],return_path:args[3],expires_at:args[4]});
    }else if(sql.startsWith("DELETE FROM oauth_flows WHERE state_hash")){
     changes=flows.delete(args[0])?1:0;
    }else if(sql.startsWith("INSERT INTO google_accounts")){
     accounts.set(args[0],{id:args[0],email:args[1],refresh_cipher:args[2],access_cipher:args[3],access_expires_at:args[4],updated_at:args[5]});
    }else if(sql.startsWith("INSERT INTO handoff_tickets")){
     tickets.set(args[0],{ticket_hash:args[0],proof_hash:args[1],account_id:args[2],expires_at:args[3],used_at:null});
    }else if(sql.startsWith("UPDATE handoff_tickets")){
     const value=tickets.get(args[1]);
     if(!value||value.used_at!==null)changes=0;
     else value.used_at=args[0];
    }else if(sql.startsWith("INSERT INTO trusted_devices")){
     devices.set(args[0],{id:args[0],account_id:args[1],token_hash:args[2],created_at:args[3],
      last_seen_at:args[4],expires_at:args[5],revoked_at:null});
    }else if(sql.startsWith("UPDATE trusted_devices SET last_seen_at")){
     const value=devices.get(args[2]);
     if(value){value.last_seen_at=args[0];value.expires_at=args[1];}
    }else if(sql.startsWith("UPDATE trusted_devices SET revoked_at")){
     const id=args[1];const value=devices.get(id);
     if(value&&(args.length<3||value.account_id===args[2]))value.revoked_at=args[0];
    }else if(sql.startsWith("UPDATE google_accounts")){
     const value=accounts.get(args[4]);
     Object.assign(value,{refresh_cipher:args[0],access_cipher:args[1],access_expires_at:args[2],updated_at:args[3]});
    }else throw Error("Unknown SQL RUN: "+sql);
    return {meta:{changes}};
   }
  };
 }};
 return {DB,snapshots};
}
const testEnv=db=>({
 DB:db,GOOGLE_CLIENT_ID:"123456789-test.apps.googleusercontent.com",
 GOOGLE_CLIENT_SECRET:"example-server-secret",TOKEN_ENCRYPTION_KEY:base64url(crypto.getRandomValues(new Uint8Array(32)))
});

test("health is public but OAuth is disabled until all server secrets and D1 are present",async()=>{
 const response=await worker.fetch(new Request(SERVER+"/health"));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{service:"midi-hud-auth",status:"pending_configuration",stage:"persistent-oauth",oauthEnabled:false});
 const fail=await worker.fetch(api("/auth/start","POST",{returnPath:"/MIDI-HUD/editor/v3.html",proofHash:"A".repeat(43)}));
 assert.equal(fail.status,503);
 assert.equal((await fail.json()).error,"service_not_configured");
});

test("cross-origin requests and unknown paths cannot access private API",async()=>{
 const env=testEnv(fakeDB().DB);
 let result=await worker.fetch(api("/session","GET",undefined,{"Origin":"https://attacker.example"}),env);
 assert.equal(result.status,403);
 result=await worker.fetch(api("/session"),env);
 assert.equal(result.status,401);
 assert.equal((await result.json()).error,"AUTH_REQUIRED");
 result=await worker.fetch(api("/auth/start","POST",{returnPath:"https://attacker.example",proofHash:"A".repeat(43)}),env);
 assert.equal(result.status,400);
 result=await worker.fetch(api("/auth/start","POST",{returnPath:"/MIDI-HUD/editor/v3.html",proofHash:"A".repeat(43)}),env);
 assert.equal(result.status,200);
 assert.equal(result.headers.get("Access-Control-Allow-Origin"),ORIGIN);
 result=await worker.fetch(new Request(SERVER+"/session",{method:"OPTIONS",headers:{Origin:ORIGIN}}),env);
 assert.equal(result.status,204);
 assert.equal(result.headers.get("Access-Control-Allow-Headers"),"Authorization, Content-Type");
});

test("v6 staging OAuth redirects are allowlisted without opening external redirects",async()=>{
 const env=testEnv(fakeDB().DB);
 for(const returnPath of ["/MIDI-HUD/editor/v3.html","/MIDI-HUD/v03.html",
   "/MIDI-HUD/pruebas/v6/editor/v3.html","/MIDI-HUD/pruebas/v6/v03.html"]){
  const result=await worker.fetch(api("/auth/start","POST",{returnPath,proofHash:"A".repeat(43)}),env);
  assert.equal(result.status,200,returnPath);
 }
 for(const returnPath of ["/MIDI-HUD/pruebas/v7/editor/v3.html",
   "/MIDI-HUD/pruebas/v6/../../../elsewhere","https://attacker.example","/MIDI-HUD/pruebas/v6/"]){
  const result=await worker.fetch(api("/auth/start","POST",{returnPath,proofHash:"A".repeat(43)}),env);
  assert.equal(result.status,400,returnPath);
 }
});

test("crypto seals secrets without exposing them as plaintext",async()=>{
 const key=base64url(crypto.getRandomValues(new Uint8Array(32)));
 const cipher=await seal("offline-refresh-secret",key);
 assert(!cipher.includes("offline-refresh-secret"));
 assert.equal(await unseal(cipher,key),"offline-refresh-secret");
 assert.notEqual(await sha256(randomToken()),await sha256(randomToken()));
});

test("one-time PKCE OAuth tickets create an individually revocable device; Drive refresh remains private",async()=>{
 const oldFetch=globalThis.fetch,store=fakeDB(),env=testEnv(store.DB);
 const requests=[];
 globalThis.fetch=async (url,init={})=>{
  const address=String(url);requests.push({address,init});
  if(address==="https://oauth2.googleapis.com/token"){
   const data=new URLSearchParams(init.body),refreshing=data.get("grant_type")==="refresh_token";
   assert.equal(data.get("client_secret"),env.GOOGLE_CLIENT_SECRET);
   return new Response(JSON.stringify(refreshing?
    {access_token:"refreshed-google-token",expires_in:3600}:
    {access_token:"initial-google-token",refresh_token:"offline-refresh-secret",expires_in:3600}),
    {status:200,headers:{"Content-Type":"application/json"}});
  }
  if(address.includes("/oauth2/v3/userinfo"))
   return new Response(JSON.stringify({sub:"12345678901234567890",email:"test@example.com"}),{status:200});
  if(address.includes("/drive/v3/files"))
   return new Response(JSON.stringify({files:[]}),{status:200});
  throw Error("Unexpected outbound request "+address);
 };
 try{
  const proof=randomToken(32),proofHash=await sha256(proof);
  const authStart=await worker.fetch(api("/auth/start","POST",{returnPath:"/MIDI-HUD/editor/v3.html",proofHash}),env);
  assert.equal(authStart.status,200);
  const {authorizeUrl}=await authStart.json(),google=new URL(authorizeUrl);
  assert.equal(google.searchParams.get("access_type"),"offline");
  assert.equal(google.searchParams.get("code_challenge_method"),"S256");
  assert.equal(google.searchParams.get("redirect_uri"),SERVER+"/auth/callback");
  assert(google.searchParams.get("scope").includes("drive.appdata"));
  const state=google.searchParams.get("state");
  const callback=await worker.fetch(new Request(SERVER+"/auth/callback?code=google-code&state="+encodeURIComponent(state)),env);
  assert.equal(callback.status,303);
  const redir=new URL(callback.headers.get("Location"));
  assert.equal(redir.origin,ORIGIN);
  assert.equal(redir.pathname,"/MIDI-HUD/editor/v3.html");
  const ticket=redir.searchParams.get("hud_auth_ticket");
  assert(ticket&&ticket.length===43);
  const repeat=await worker.fetch(new Request(SERVER+"/auth/callback?code=google-code&state="+encodeURIComponent(state)),env);
  assert.equal(repeat.status,400);
  const wrong=await worker.fetch(api("/session/exchange","POST",{ticket,proof:randomToken(32)}),env);
  assert.equal(wrong.status,401);
  const exchange=await worker.fetch(api("/session/exchange","POST",{ticket,proof}),env);
  assert.equal(exchange.status,200);
  const {token,account,deviceId}=await exchange.json();
  assert.equal(account.id,"12345678901234567890");
  assert.equal(token.length,64);
  const replay=await worker.fetch(api("/session/exchange","POST",{ticket,proof}),env);
  assert.equal(replay.status,401);
  const stored=store.snapshots.accounts.get(account.id);
  assert(!stored.refresh_cipher.includes("offline-refresh-secret"));
  assert(!JSON.stringify([...store.snapshots.devices]).includes(token));
  const authHeader={Authorization:"Bearer "+token};
  const status=await worker.fetch(api("/session","GET",undefined,authHeader),env);
  assert.equal(status.status,200);
  assert.equal((await status.json()).device.id,deviceId);
  stored.access_expires_at=0;
  const drive=await worker.fetch(api("/drive/request","POST",
   {method:"GET",path:"/drive/v3/files",query:{spaces:"appDataFolder"}},authHeader),env);
  assert.equal(drive.status,200);
  assert.deepEqual(await drive.json(),{files:[]});
  assert(requests.some(r=>r.init.body?.includes?.("grant_type=refresh_token")));
  const blocked=await worker.fetch(api("/drive/request","POST",
   {method:"DELETE",path:"/drive/v3/files/test"},authHeader),env);
  assert.equal(blocked.status,400);
  const devices=await worker.fetch(api("/session/devices","GET",undefined,authHeader),env);
  assert.equal((await devices.json()).devices.length,1);
  const logout=await worker.fetch(api("/session/revoke","POST",{},authHeader),env);
  assert.equal(logout.status,200);
  assert.equal((await worker.fetch(api("/session","GET",undefined,authHeader),env)).status,401);
 }finally{globalThis.fetch=oldFetch;}
});
