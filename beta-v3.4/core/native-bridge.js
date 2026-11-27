/* Shared native transport. Inject only into trusted bundled app pages, before site modules. */
(()=>{
 'use strict';
 const ios=globalThis.webkit?.messageHandlers?.hud;
 const android=globalThis.MidiHudAndroidHost;
 const windows=globalThis.chrome?.webview;
 const platform=typeof ios?.postMessage==='function'?'ios':typeof android?.postMessage==='function'?'android':
  typeof windows?.postMessage==='function'&&globalThis.location?.origin==='https://midihud.local'&&globalThis.location?.pathname?.startsWith('/windows-qa/')?'windows':null;
 const host=platform==='windows'?windows:android;
 if(!platform||globalThis.MidiHudNative)return;
 const midiName=platform==='ios'?'Core MIDI':platform==='windows'?'Windows MIDI':'Android MIDI';
 const pending=new Map();
 let sequence=0;
 const allowedCommands=new Set(['midi.open','midi.list','midi.select','midi.bluetooth','cloud.config','cloud.restore','cloud.connect','cloud.disconnect','cloud.request','broker.request','broker.open','share.text','controller.open']);
 function call(command,payload={}){
  if(!allowedCommands.has(command))return Promise.reject(new Error('Acción no disponible.'));
  if(platform==='ios')return Promise.resolve().then(()=>ios.postMessage({command,payload}));
  return new Promise((resolve,reject)=>{
   const id=String(++sequence);
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Tiempo de espera del servicio nativo agotado.'));},command==='cloud.connect'||command==='midi.bluetooth'||command==='share.text'?120000:30000);
   pending.set(id,{resolve,reject,timer});
   try{host.postMessage(JSON.stringify({id,command,payload}));}
   catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
 }
 function receiveAndroid(message){
  let data;try{data=JSON.parse(message?.data);}catch{return;}
  if(!data||typeof data!=='object')return;
  if(data.kind==='event'){receive(data.event);return;}
  if(data.kind!=='reply'||typeof data.id!=='string')return;
  const item=pending.get(data.id);if(!item)return;
  clearTimeout(item.timer);pending.delete(data.id);
  if(typeof data.error==='string')item.reject(new Error(data.error));
  else if(Object.prototype.hasOwnProperty.call(data,'result'))item.resolve(data.result);
  else item.reject(new Error('Respuesta nativa inválida.'));
 }
 let hostOffset=null;
 const inputs=new Map(),accessListeners=new Set();
 const access={inputs,outputs:new Map(),onstatechange:null,addEventListener(type,callback){if(type==='statechange')accessListeners.add(callback);},removeEventListener(type,callback){if(type==='statechange')accessListeners.delete(callback);}};
 function portsChanged(ports){
  const allowed=ports,ids=new Set(allowed.map(port=>port.id));
  for(const [id,port] of inputs)if(!ids.has(id)){port.state='disconnected';inputs.delete(id);}
  for(const item of allowed){
   if(inputs.has(item.id)){Object.assign(inputs.get(item.id),{name:item.name,transport:item.transport,connected:item.connected});continue;}
   const listeners=new Set();
   inputs.set(item.id,{id:item.id,name:item.name,transport:item.transport,connected:item.connected,type:'input',manufacturer:midiName,state:'connected',connection:'open',onmidimessage:null,
    addEventListener(type,callback){if(type==='midimessage')listeners.add(callback);},removeEventListener(type,callback){if(type==='midimessage')listeners.delete(callback);},
    async open(){if(!this.connected){const result=await call('midi.select',{id:item.id});if(!result?.ports?.some(p=>p.id===item.id&&p.connected))throw Error('No se pudo abrir la entrada MIDI.');}return this;},close(){return Promise.resolve(this);},
    receive(data,timestampMs){const event={data:new Uint8Array(data),target:this,timeStamp:Number.isFinite(timestampMs)?timestampMs:performance.now()};for(const callback of listeners)callback(event);this.onmidimessage?.(event);}});
  }
  const event={target:access};for(const callback of accessListeners)callback(event);access.onstatechange?.(event);
  window.dispatchEvent(Object.assign(new Event('hud-native-ports'),{detail:ports}));
 }
 let lastReceived=null, receivedCount=0, lastError=null;
 const receive=event=>{
  if(!event||typeof event!=='object')return;
  if(event.type==='midi.error'){
   lastError=event.message||'No se pudo conectar '+midiName+'.';
   window.dispatchEvent(new Event('hud-native-error'));
   return;
  }
  if(event.type==='midi.ports'){
   if(!Array.isArray(event.ports))return;
   portsChanged(event.ports);
   if(event.ports?.some(port=>port.connected))lastError=null;
  }
  if(event.type==='midi.message'){
   const port=inputs.get(event.portId);
   if(!port||!Array.isArray(event.data)||!event.data.length||!event.data.every(b=>Number.isInteger(b)&&b>=0&&b<=255))return;
   if(Number.isFinite(event.timestampMs)&&hostOffset===null)hostOffset=performance.now()-event.timestampMs;
   const type=event.data[0]&0xf0;
   if(type===0xb0||type===0xc0){
    lastReceived=Object.freeze({count:++receivedCount,source:port.name,type:type===0xb0?'CC':'PC',channel:(event.data[0]&15)+1,number:event.data[1],value:event.data[2]});
    window.dispatchEvent(new Event('hud-native-midi-received'));
   }
   port.receive(event.data,Number.isFinite(event.timestampMs)?event.timestampMs+hostOffset:undefined);
  }
 };
 async function openMidi(options){
  if(options?.sysex)throw new DOMException('La aplicación solo recibe MIDI.','NotSupportedError');
  const result=await call('midi.open');portsChanged(result.ports);return access;
 }
 Object.defineProperty(globalThis,'MidiHudNative',{value:Object.freeze({platform,midiName,call,receive,openMidi,get lastReceived(){return lastReceived;},get lastError(){return lastError;}}),writable:false,configurable:false});
 if(platform==='android')android.onmessage=receiveAndroid;
 if(platform==='windows')windows.addEventListener('message',receiveAndroid);
 if(platform==='windows'||typeof navigator.requestMIDIAccess!=='function'){
  Object.defineProperty(navigator,'requestMIDIAccess',{value:openMidi,configurable:true});
 }
 document.addEventListener('DOMContentLoaded',()=>{const link=document.getElementById('midiLinkBtn');if(link)link.hidden=true;});
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('a');if(!link)return;
  if(link.download&&link.href.startsWith('blob:')){
   event.preventDefault();fetch(link.href).then(response=>response.text()).then(text=>call('share.text',{text,name:link.download})).catch(()=>{});return;
  }
  if(globalThis.MIDIHUD_EDITOR?.hasDraft()&&!window.confirm('Hay cambios sin guardar. ¿Salir del editor y descartarlos?'))event.preventDefault();
 },true);
})();
