import {createMidiConnectionSession} from './midi-connection-session.mjs';
import {createMidiParser} from './midi-stream.mjs';
/** One selected input; reconnection never dispatches a musical event. */
export function createBrowserMidiSession({storage,onMessage=()=>{},onStatus=()=>{},onDevices=()=>{}}={}) {
 let access=null,opening=null,active=null,stop=null,closed=false,removeStateListener=null,connectionAttempt=0,suspended=false;
 const ports=()=>{
  const source=access?.inputs;
  let items=[];
  if(source?.values)try{items=Array.from(source.values());}catch{}
  if(!items.length&&source?.forEach)source.forEach(p=>items.push(p));
  return items.filter(p=>p&&p.type!=='output'&&p.state!=='disconnected');
 };
 const id=p=>p.id||p.name;
 function detach(){stop?.();stop=null;active=null;}
 function changed(){
  const available=ports();
  if(active&&!available.includes(active)){detach();session.lost();}
  onDevices(available.map(p=>({id:id(p),name:p.name||id(p)})));
  if(suspended||active||session.status==='connecting')return;
  if(session.preferredId&&available.some(p=>id(p)===session.preferredId))void session.retry();
  else if(globalThis.MidiHudNative&&available.length===1)void session.select(id(available[0]));
 }
 async function openAccess(){
  if(access)return access;
  if(opening)return opening;
  if(typeof globalThis.navigator?.requestMIDIAccess!=='function')throw Error('Este navegador no ofrece Web MIDI. En iPhone utiliza la aplicación nativa compatible.');
  opening=(async()=>{
   const result=await navigator.requestMIDIAccess({sysex:false});
   if(closed)throw Error('La sesión MIDI está cerrada.');
   if(!result?.inputs)throw Error('No se pudo enumerar la entrada MIDI.');
   access=result;
   if(access.addEventListener){access.addEventListener('statechange',changed);removeStateListener=()=>access.removeEventListener?.('statechange',changed);}
   else {const previous=access.onstatechange;access.onstatechange=changed;removeStateListener=()=>{if(access.onstatechange===changed)access.onstatechange=previous;};}
   return access;
  })().finally(()=>{opening=null;});
  return opening;
 }
 const adapter={
  async discover(){await openAccess();const devices=ports().map(p=>({id:id(p),name:p.name||id(p)}));onDevices(devices);return devices;},
  async connect(deviceId){
   const attempt=++connectionAttempt;
   await openAccess();const input=ports().find(p=>id(p)===deviceId);
   if(!input)throw Error('La entrada MIDI preferida no está disponible.');
   await input.open?.();
   if(attempt!==connectionAttempt||closed||!ports().includes(input))throw Error('La conexión MIDI fue sustituida o desconectada.');
   detach();active=input;
   const parse=createMidiParser();
   const handler=event=>{if(active===input&&session.status==='connected')for(const message of parse(event?.data??event,event?.timeStamp??performance.now()))onMessage(message);};
   if(input.addEventListener){input.addEventListener('midimessage',handler);stop=()=>input.removeEventListener?.('midimessage',handler);}
   else {const previous=input.onmidimessage;input.onmidimessage=handler;stop=()=>{if(input.onmidimessage===handler)input.onmidimessage=previous??null;};}
   return {disconnect:async()=>{if(active===input)detach();}};
  }
 };
 const session=createMidiConnectionSession({adapter,storage,onStatus});
 async function start(){
  if(!globalThis.MidiHudNative)return session.start();
  await openAccess();
  if(await session.start())return true;
  const available=ports();
  if(available.length===1)return session.select(id(available[0]));
  onDevices(available.map(p=>({id:id(p),name:p.name||id(p)})));
  return false;
 }
 return {start,discover:()=>session.discover(),select:deviceId=>{suspended=false;return session.select(deviceId);},retry:()=>session.retry(),
  async disconnect(){suspended=true;++connectionAttempt;await session.disconnect();detach();},
  get status(){return session.status;},get preferredId(){return session.preferredId;},
  async close(){closed=true;++connectionAttempt;removeStateListener?.();await session.disconnect();detach();}};
}
