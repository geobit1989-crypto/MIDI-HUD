import {createMidiConnectionSession} from './midi-connection-session.mjs';
import {createMidiParser} from './midi-stream.mjs';
/** One selected input; reconnection never dispatches a musical event. */
export function createBrowserMidiSession({storage,onMessage=()=>{},onStatus=()=>{},onDevices=()=>{}}={}) {
 let access=null,opening=null,active=null,stop=null,closed=false,removeStateListener=null,connectionAttempt=0,suspended=readPause();
 const pauseKey='hudMidiManuallyDisconnected';
 function readPause(){try{return storage?.getItem('hudMidiManuallyDisconnected')==='1';}catch{return false;}}
 function pause(value){suspended=value;try{storage?.setItem(pauseKey,value?'1':'0');}catch{}}
 const native=globalThis.MidiHudNative;
 function automatic(available){
  const connected=available.find(port=>port.connected);
  if(connected)return connected;
  const wired=available.filter(port=>port.transport==='usb');
  if(wired.length===1)return wired[0];
  if(!native&&!session.preferredId&&available.length===1&&available[0].transport!=='bluetooth')return available[0];
 }
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
  if(active&&(!available.includes(active)||(native&&!active.connected))){detach();session.lost();}
  onDevices(available.map(p=>({id:id(p),name:p.name||id(p),transport:p.transport,connected:p.connected})));
  if(suspended||session.status==='connecting')return;
  const selected=native&&available.find(port=>port.connected);
  if(selected&&selected!==active){void session.select(id(selected));return;}
  if(active)return;
  if(session.preferredId&&available.some(p=>id(p)===session.preferredId))void session.retry();
  else {const candidate=automatic(available);if(candidate)void session.select(id(candidate));}
 }
 async function openAccess(){
  if(access)return access;
  if(opening)return opening;
  if(!native?.openMidi&&typeof globalThis.navigator?.requestMIDIAccess!=='function')throw Error('Este navegador no ofrece Web MIDI. En iPhone utiliza la aplicación nativa compatible.');
  opening=(async()=>{
   const result=await (native?.openMidi ? native.openMidi({sysex:false}) : navigator.requestMIDIAccess({sysex:false}));
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
  async discover(){await openAccess();const devices=ports().map(p=>({id:id(p),name:p.name||id(p),transport:p.transport,connected:p.connected}));onDevices(devices);return devices;},
  async connect(deviceId){
   const attempt=++connectionAttempt;
   await openAccess();const input=ports().find(p=>id(p)===deviceId);
   if(!input)throw Error('La entrada MIDI preferida no está disponible.');
   await input.open?.();
   if(attempt!==connectionAttempt||closed||!ports().includes(input)){
    if(!native&&(closed||suspended))await input.close?.();
    throw Error('La conexión MIDI fue sustituida o desconectada.');
   }
   detach();active=input;
   const parse=createMidiParser();
   const handler=event=>{if(active===input&&session.status==='connected')for(const message of parse(event?.data??event,event?.timeStamp??performance.now()))onMessage(message);};
   if(input.addEventListener){input.addEventListener('midimessage',handler);stop=()=>input.removeEventListener?.('midimessage',handler);}
   else {const previous=input.onmidimessage;input.onmidimessage=handler;stop=()=>{if(input.onmidimessage===handler)input.onmidimessage=previous??null;};}
   return {disconnect:async()=>{if(active===input){detach();if(!native)await input.close?.();}}};
  }
 };
 const session=createMidiConnectionSession({adapter,storage,onStatus});
 async function start(){
  await openAccess();
  if(suspended)return false;
  const available=ports();
  const connected=native&&available.find(port=>port.connected);
  if(connected)return session.select(id(connected));
  if(session.preferredId&&available.some(port=>id(port)===session.preferredId))return session.start();
  const candidate=automatic(available);
  if(candidate)return session.select(id(candidate));
  return false;
 }
 return {start,discover:()=>session.discover(),select:deviceId=>{pause(false);++connectionAttempt;return session.select(deviceId);},
  resume(){pause(false);return start();},
  async disconnect({manual=true}={}){
   if(manual)pause(true);else suspended=true;
   ++connectionAttempt;await session.disconnect();detach();
   if(native)await native.call('midi.select',{id:native.platform==='ios'?'__hud_disconnected__':''});
  },
  get status(){return session.status;},get preferredId(){return session.preferredId;},
  async close(){closed=true;++connectionAttempt;removeStateListener?.();await session.disconnect();detach();}};
}
