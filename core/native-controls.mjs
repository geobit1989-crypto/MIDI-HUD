/** Controles de recepción exclusivos del puente nativo iOS. */
export function installNativeMidiControls(host,native=globalThis.MidiHudNative){
 if(!native||!host)return;
 const group=document.createElement('div');group.className='hud-config-actions';
 const bluetooth=document.createElement('button');bluetooth.type='button';bluetooth.textContent='Conectar Bluetooth MIDI';
 const status=document.createElement('p');status.setAttribute('role','status');
 const select=document.createElement('select');select.setAttribute('aria-label','Entrada MIDI de la aplicación');
 const update=async()=>{
  try{
   const {ports,selected}=await native.call('midi.list');
   select.replaceChildren(new Option('Todas las entradas MIDI',''));
   for(const port of ports)select.add(new Option(port.name,port.id));
   if(selected&&!ports.some(port=>port.id===selected))select.add(new Option('Entrada seleccionada desconectada',selected));
   select.value=selected||'';
   const connected=ports.filter(port=>port.connected);
   status.textContent=native.lastError||(connected.length
    ?'Core MIDI activo: '+connected.map(port=>port.name).join(', ')
    :(ports.length?'Entradas detectadas, pero aún no conectadas a Core MIDI.':'Sin entradas MIDI disponibles. Conecta FootCtrlPlus desde Bluetooth MIDI.'));
  }catch(error){status.textContent=error.message;}
 };
 bluetooth.onclick=async()=>{
  try{await native.call('midi.bluetooth');status.textContent='Conecta FootCtrlPlus y pulsa Listo.';}
  catch(error){status.textContent='Error Core MIDI: '+error.message;}
 };
 select.onchange=async()=>{
  try{
   const result=await native.call('midi.select',{id:select.value});
   const active=result.ports.filter(port=>port.connected);
   status.textContent=active.length?'Core MIDI activo: '+active.map(port=>port.name).join(', '):'Entrada seleccionada, sin conexión Core MIDI.';
  }catch(error){status.textContent='Error Core MIDI: '+error.message;}
 };
 group.append(bluetooth,select);host.append(group,status);void update();
 window.addEventListener('hud-native-ports',update);
 window.addEventListener('hud-native-error',()=>{status.textContent=native.lastError||'Error desconocido de Core MIDI.';});
}
