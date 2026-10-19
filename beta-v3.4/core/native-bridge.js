/* Inyectado solo en la app iOS, antes de cargar los módulos del sitio. */
(()=>{
 'use strict';
 const handler=globalThis.webkit?.messageHandlers?.hud;
 if(!handler||globalThis.MidiHudNative)return;
 let hostOffset=null;
 const inputs=new Map(),accessListeners=new Set();
 const access={inputs,outputs:new Map(),onstatechange:null,addEventListener(type,callback){if(type==='statechange')accessListeners.add(callback);},removeEventListener(type,callback){if(type==='statechange')accessListeners.delete(callback);}};
 const call=(command,payload={})=>handler.postMessage({command,payload});
 function portsChanged(ports,selected=''){
  const allowed=ports.filter(port=>!selected||port.id===selected),ids=new Set(allowed.map(port=>port.id));
  for(const [id,port] of inputs)if(!ids.has(id)){port.state='disconnected';inputs.delete(id);}
  for(const item of allowed){
   if(inputs.has(item.id)){inputs.get(item.id).name=item.name;continue;}
   const listeners=new Set();
   inputs.set(item.id,{id:item.id,name:item.name,type:'input',manufacturer:'Core MIDI',state:'connected',connection:'open',onmidimessage:null,
    addEventListener(type,callback){if(type==='midimessage')listeners.add(callback);},removeEventListener(type,callback){if(type==='midimessage')listeners.delete(callback);},
    open(){return Promise.resolve(this);},close(){return Promise.resolve(this);},
    receive(data,timestampMs){const event={data:new Uint8Array(data),target:this,timeStamp:Number.isFinite(timestampMs)?timestampMs:performance.now()};for(const callback of listeners)callback(event);this.onmidimessage?.(event);}});
  }
  const event={target:access};for(const callback of accessListeners)callback(event);access.onstatechange?.(event);
  window.dispatchEvent(new Event('hud-native-ports'));
 }
 const receive=event=>{
  if(event.type==='midi.ports')portsChanged(event.ports,event.selected);
  if(event.type==='midi.message'){if(Number.isFinite(event.timestampMs)&&hostOffset===null)hostOffset=performance.now()-event.timestampMs;inputs.get(event.portId)?.receive(event.data,Number.isFinite(event.timestampMs)?event.timestampMs+hostOffset:undefined);}
 };
 Object.defineProperty(globalThis,'MidiHudNative',{value:Object.freeze({call,receive}),writable:false,configurable:false});
 if(typeof navigator.requestMIDIAccess!=='function'){
  Object.defineProperty(navigator,'requestMIDIAccess',{value:async options=>{
   if(options?.sysex)throw new DOMException('La aplicación solo recibe CC MIDI.','NotSupportedError');
   const result=await call('midi.open');portsChanged(result.ports,result.selected);return access;
  },configurable:true});
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
