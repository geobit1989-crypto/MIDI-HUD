/** Controles de recepción del puente nativo. */
export function installNativeMidiControls(host,native=globalThis.MidiHudNative){
 if(!native||!host)return;
 const windows=native.platform==='windows';
 const bluetooth=document.createElement('button');
 bluetooth.type='button';bluetooth.textContent='Conectar Bluetooth MIDI';
 const disconnect=document.createElement('button');
 disconnect.type='button';disconnect.textContent='Desconectar entrada MIDI';disconnect.disabled=true;
 const status=document.createElement('p');status.setAttribute('role','status');
 const select=document.createElement('select');select.setAttribute('aria-label','Entrada MIDI de la aplicación');
 const usb=document.createElement('p');usb.hidden=!windows;
 host.append(bluetooth,' ',disconnect,select,status,usb);
 let busy=false,sequence=0,connected=false;
 function state(result){
  const visible=result.ports.filter(port=>windows||port.transport!=='usb');
  const active=result.ports.filter(port=>port.connected);
  connected=active.length>0;
  select.replaceChildren(new Option('Seleccionar entrada MIDI','',false,false));
  select.options[0].disabled=true;
  for(const port of visible)select.add(new Option(port.name,port.id));
  select.value=visible.some(port=>port.id===result.selected)?result.selected:'';
  const ble=active.find(port=>port.transport==='bluetooth');
  const device=ble||active.find(port=>windows||port.transport!=='usb');
  status.textContent=native.lastError||(device?'Entrada conectada: '+device.name:visible.length?'Selecciona una entrada MIDI.':'Sin entradas disponibles.');
  if(windows)usb.textContent='USB MIDI: '+(active.find(port=>port.transport==='usb')?.name||'Sin conexión');
 }
 function controls(){bluetooth.disabled=busy;disconnect.disabled=busy||!connected;select.disabled=busy;}
 async function update(){
  const request=++sequence;
  try{const result=await native.call('midi.list');if(request===sequence)state(result);}
  catch(error){if(request===sequence)status.textContent=error.message;}
  finally{controls();}
 }
 async function command(name,payload){
  if(busy)return;
  busy=true;controls();
  try{
   await native.call(name,payload);
   await update();
   if(name==='midi.bluetooth'&&windows&&!connected)status.textContent='Empareja el controlador en Windows y selecciona su entrada MIDI.';
  }catch(error){status.textContent=error.message;}
  finally{busy=false;controls();}
 }
 bluetooth.onclick=()=>command('midi.bluetooth');
 select.onchange=()=>command('midi.select',{id:select.value});
 disconnect.onclick=()=>command('midi.select',{id:native.platform==='ios'?'__hud_disconnected__':''});
 window.addEventListener('hud-native-ports',update);
 window.addEventListener('hud-bluetooth-picker-closed',update);
 window.addEventListener('hud-native-error',()=>{status.textContent=native.lastError||'Error de entrada MIDI.';});
 void update();
}
