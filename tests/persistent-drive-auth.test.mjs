import test from "node:test";
import assert from "node:assert/strict";
import {PersistentDriveAuth,DEFAULT_WORKER} from "../core/persistent-drive-auth.mjs";
const SESSION_KEY="midiHudTrustedDeviceSessionV1";
function storage(){
 const data=new Map();
 return {data,getItem:key=>data.get(key)||null,setItem:(key,val)=>data.set(key,val),removeItem:key=>data.delete(key)};
}
function reply(value,status=200){
 return {ok:status>=200&&status<300,status,async json(){return value;}};
}
test("fallback remains possible when Worker configuration is incomplete",async()=>{
 const auth=new PersistentDriveAuth({fetcher:async()=>reply({service:"midi-hud-auth",oauthEnabled:false})});
 assert.equal(await auth.ready(),false);
 assert.equal(auth.hasSession,false);
 assert.equal(await auth.restore(),null);
});
test("persistent device token survives closing the tab without sharing Google refresh tokens",async()=>{
 const cache=storage(),transient=storage(),calls=[];
 const bearer="K".repeat(64);
 const account={id:"12345678901234567890",email:"test@example.com"};
 const provider=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith("/health"))return reply({service:"midi-hud-auth",oauthEnabled:true});
  if(url.endsWith("/session"))return reply({account,device:{id:"deviceABC123",expiresAt:Date.now()+86400000}});
  if(url.endsWith("/drive/request"))return reply({files:[]});
  if(url.endsWith("/session/devices"))return reply({devices:[{id:"deviceABC123"}],current:"deviceABC123"});
  if(url.endsWith("/session/revoke"))return reply({revoked:true});
  throw Error("Unexpected API path "+url);
 };
 cache.setItem(SESSION_KEY,JSON.stringify({origin:DEFAULT_WORKER,token:bearer,
  deviceId:"deviceABC123",account,expiresAt:Date.now()+86400000}));
 const make=()=>new PersistentDriveAuth({store:()=>cache,transient:()=>transient,fetcher:provider});
 const first=make();
 assert.equal(await first.ready(),true);
 assert.deepEqual(await first.restore(),account);
 const second=make();
 assert.deepEqual(await second.restore(),account);
 assert.deepEqual(await second.request({method:"GET",path:"/drive/v3/files"}),{files:[]});
 assert.equal((await second.listDevices()).current,"deviceABC123");
 assert.equal(calls.find(x=>x.url.endsWith("/drive/request")).options.headers.Authorization,"Bearer "+bearer);
 await second.disconnect();
 assert.equal(cache.getItem(SESSION_KEY),null);
 assert.equal(await make().restore(),null);
});
test("OAuth return ticket is exchanged once with a secret proof, never stored in URL",async()=>{
 const cache=storage(),transient=storage(),ticket="T".repeat(43),proof="P".repeat(43),
  account={id:"12345678901234567890",email:"me@example.com"};
 transient.setItem("midiHudOAuthHandoffProofV1",JSON.stringify({value:proof,created:Date.now()}));
 const mockUrl=new URL("https://geobit1989-crypto.github.io/MIDI-HUD/editor/v3.html?hud_auth_ticket="+ticket);
 let newUrl="",seenBody;
 const auth=new PersistentDriveAuth({
  store:()=>cache,transient:()=>transient,
  location:()=>mockUrl,
  history:()=>({state:null,replaceState:(_a,_b,value)=>{newUrl=value;}}),
  fetcher:async(url,opts)=>{
   if(url.endsWith("/session/exchange")){
    seenBody=JSON.parse(opts.body);
    return reply({account,deviceId:"deviceABC123",token:"B".repeat(64),expiresAt:Date.now()+86400000});
   }
   if(url.endsWith("/session"))return reply({account,device:{id:"deviceABC123",expiresAt:Date.now()+86400000}});
   throw Error("Bad request");
  }
 });
 assert.deepEqual(await auth.restore(),account);
 assert.deepEqual(seenBody,{ticket,proof});
 assert(!newUrl.includes(ticket));
 assert.equal(transient.getItem("midiHudOAuthHandoffProofV1"),null);
 assert.equal(cache.getItem(SESSION_KEY).includes("refresh_token"),false);
});
test("an expired trusted-device session is not silently reused",async()=>{
 const cache=storage(),account={id:"12345",email:"a@example.test"};
 cache.setItem(SESSION_KEY,JSON.stringify({origin:DEFAULT_WORKER,token:"K".repeat(64),account,expiresAt:Date.now()-5000}));
 const auth=new PersistentDriveAuth({store:()=>cache});
 assert.equal(await auth.restore(),null);
 assert.equal(cache.getItem(SESSION_KEY),null);
});

test("native return completes before proof redemption on iOS and Windows",async()=>{
 for(const platform of ["ios","windows"]){
  const cache=storage(),calls=[],account={id:"12345",email:"me@example.com"};
  const returnTo=platform==="ios"?"midihud-oauth://complete":"http://127.0.0.1:49152/oauth/"+"a".repeat(64);
  const native={platform,async call(command,payload){
   calls.push({command,payload});
   if(command==="broker.prepare")return returnTo;
   if(command==="broker.open")return true;
   if(payload.path==="/auth/native/start"){assert.deepEqual(payload.body,{returnTo});return {status:200,data:{returnTo,proof:"P".repeat(43),authorizeUrl:"https://accounts.google.com/o/oauth2/v2/auth?state=example"}};}
   if(payload.path==="/auth/native/poll"){assert.equal(payload.body.proof,"P".repeat(43));return {status:200,data:{token:"K".repeat(64),deviceId:"device",expiresAt:Date.now()+10000,account}};}
   throw Error("Unexpected call");
  }};
  const auth=new PersistentDriveAuth({native,store:()=>cache});
  assert.deepEqual(await auth.connect(),account);
  assert(calls.findIndex(x=>x.command==="broker.open")<calls.findIndex(x=>x.payload?.path==="/auth/native/poll"));
  assert.equal(cache.getItem("midiHudOAuthHandoffProofV1"),null);
 }
});
test("cancelled native authorization removes pending proof without polling",async()=>{
 const cache=storage(),returnTo="midihud-oauth://complete";
 const native={platform:"ios",async call(command,payload){
  if(command==="broker.open")return false;
  assert.equal(payload.path,"/auth/native/start");
  return {status:200,data:{returnTo,proof:"P".repeat(43),authorizeUrl:"https://accounts.google.com/o/oauth2/v2/auth?state=example"}};
 }};
 await assert.rejects(new PersistentDriveAuth({native,store:()=>cache}).connect(),/cancelada/);
 assert.equal(cache.getItem("midiHudOAuthHandoffProofV1"),null);
});
