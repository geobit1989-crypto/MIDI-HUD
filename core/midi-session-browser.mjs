import {createMidiConnectionSession} from './midi-connection-session.mjs';
import {createMidiParser} from './midi-stream.mjs';
/** One selected input; reconnection never dispatches a musical event. */
export function createBrowserMidiSession({storage,onMessage=()=>{},onStatus=()=>{},onDevices=()=>{}}={}) {
 let access=null,opening=null,active=null,stop=null,closed=false,removeStateListener=null;
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
  if(!active&&session.preferredId&&available.some(p=>id(p)===session.preferredId))void session.retry();
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
   await openAccess();const input=ports().find(p=>id(p)===deviceId);
   if(!input)throw Error('La entrada MIDI preferida no está disponible.');
   await input.open?.();detach();active=input;
   const parse=createMidiParser();
   const handler=event=>{if(active===input&&session.status==='connected')for(const message of parse(event?.data??event,event?.timeStamp??performance.now()))onMessage(message);};
   if(input.addEventListener){input.addEventListener('midimessage',handler);stop=()=>input.removeEventListener?.('midimessage',handler);}
   else {const previous=input.onmidimessage;input.onmidimessage=handler;stop=()=>{if(input.onmidimessage===handler)input.onmidimessage=previous??null;};}
   return {disconnect:async()=>{if(active===input)detach();}};
  }
 };
 const session=createMidiConnectionSession({adapter,storage,onStatus});
 return {start:()=>session.start(),discover:()=>session.discover(),select:deviceId=>session.select(deviceId),retry:()=>session.retry(),
  get status(){return session.status;},get preferredId(){return session.preferredId;},
  async close(){closed=true;removeStateListener?.();await session.disconnect();detach();}};
}
