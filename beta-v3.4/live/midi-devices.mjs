import {createBrowserMidiSession} from '../core/midi-session-browser.mjs';
import {connectBleMidi} from '../core/midi-ble-android.mjs';

export function installMidiDevices({root,storage,onMessage,native=globalThis.MidiHudNative}){
 const find=id=>root.querySelector('#hud-midi-'+id);
 const search=find('btn'), disconnect=find('disconnect'), choice=find('choice');
 const input=find('input'), connect=find('connect'), status=find('status');
 const webBle=!native&&typeof navigator.bluetooth?.requestDevice==='function';
 const preferBle=webBle&&(!/Windows|Macintosh|Linux x86/i.test(navigator.userAgent)||/Android/i.test(navigator.userAgent));
 const webMidi=!native&&typeof navigator.requestMIDIAccess==='function';
 let devices=[], showing=false, busy=false, ble=null, reconnectTimer, generation=0;
 const signal=state=>window.dispatchEvent(new CustomEvent('hud-web-bluetooth',{detail:state}));
 function render(){
  const ports=devices.filter(port=>!native||port.transport!=='usb');
  const previous=input.value;
  input.replaceChildren(new Option('Selecciona un dispositivo',''),...ports.map(port=>new Option(port.name,port.id)));
  input.value=ports.some(port=>port.id===previous)?previous:'';
  choice.hidden=connect.hidden=!showing||!ports.length;
  connect.disabled=busy||!input.value;
  search.disabled=busy;
  disconnect.hidden=!ble&&session.status==='disconnected'&&!reconnectTimer;
 }
 const session=createBrowserMidiSession({storage,onMessage,
  onDevices:ports=>{devices=ports;render();},
  onStatus:({status:state,deviceId})=>{
   status.dataset.connection=state;
   const name=devices.find(port=>port.id===deviceId)?.name;
   status.textContent=state==='connected'?'Conectado'+(name?' · '+name:''):
    state==='connecting'?'Conectando…':'Sin conexión MIDI';
   render();
  }});
 function rememberBle(id){try{storage.setItem('hudMidiBleDevice',id);}catch{}}
 function preferredBle(){try{return storage.getItem('hudMidiBleDevice');}catch{return null;}}
 function stopBle(){
  ++generation;clearTimeout(reconnectTimer);reconnectTimer=null;
  ble?.disconnect();ble=null;signal('idle');
 }
 function retryBle(){
  reconnectTimer=setTimeout(async()=>{
   reconnectTimer=null;
   const token=generation;
   try{
    const known=await navigator.bluetooth.getDevices();
    if(token!==generation)return;
    const device=known.find(item=>item.id===preferredBle());
    if(!device)return;
    await openBle(device);
   }catch{if(token===generation)retryBle();}
   render();
  },4000);
 }
 async function openBle(device){
  const token=++generation;
  const connection=await connectBleMidi(onMessage,{device,onDisconnected:()=>{
   if(token!==generation)return;
   ble?.disconnect();ble=null;signal('idle');
   status.textContent='Bluetooth desconectado';
   if(navigator.bluetooth.getDevices)retryBle();
   render();
  }});
  if(token!==generation){connection.disconnect();return;}
  ble=connection;rememberBle(connection.id);signal('connected');
  status.textContent='Conectado · '+connection.name;
 }
 async function run(action){
  if(busy)return;
  busy=true;render();
  try{await action();}
  catch(error){status.textContent=error.message;}
  finally{busy=false;render();}
 }
 input.onchange=render;
 connect.onclick=()=>run(async()=>{
  stopBle();rememberBle('');
  if(!await session.select(input.value))throw Error('No se pudo conectar el dispositivo.');
  showing=false;
 });
 disconnect.onclick=()=>run(async()=>{
  stopBle();rememberBle('');await session.disconnect();
  status.textContent='Sin conexión MIDI';
 });
 search.onclick=()=>run(async()=>{
  if(native){
   showing=false;
   await native.call('midi.bluetooth');
   if(native.platform==='windows')status.textContent='Después de emparejar en Windows, selecciona la entrada y pulsa Conectar.';
   else if(native.platform==='android')await session.resume();
   showing=true;await session.discover();
   return;
  }
  if(webBle&&(!webMidi||preferBle)){
   stopBle();await openBle();
   if(webMidi)await session.disconnect({manual:false});
   status.textContent='Conectado · '+ble.name;
   return;
  }
  if(webMidi){
   showing=true;
   if(!(await session.discover()).length)status.textContent='No hay dispositivos MIDI disponibles.';
  }
 });
 if(native?.platform==='ios')window.addEventListener('hud-bluetooth-picker-closed',event=>run(async()=>{
  if(event.detail?.id)await session.select(event.detail.id);
  else {showing=true;await session.discover();}
 }));
 if(native?.platform==='windows')window.addEventListener('hud-foreground',()=>{void session.discover().catch(()=>{});});
 search.hidden=!native&&!webBle&&!webMidi;
 return {async start(){
  if(webBle&&navigator.bluetooth.getDevices&&preferredBle()){retryBle();render();return;}
  if(!native&&!webMidi){status.textContent='Este navegador no ofrece una conexión MIDI compatible.';return;}
  try{if(!await session.start())status.textContent='Sin conexión MIDI';}
  catch{status.textContent='No se pudo abrir MIDI. Revisa los permisos del navegador o la conexión.';}
 }};
}
