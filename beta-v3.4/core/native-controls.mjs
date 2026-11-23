/** Extensión opcional: el adaptador Web MIDI y los navegadores existentes no cambian. */
export function installNativeMidiControls(host,native=globalThis.MidiHudNative){
 if(!native||!host)return;
 const group=document.createElement('div');group.className='hud-config-actions';
 const bluetooth=document.createElement('button');bluetooth.type='button';bluetooth.textContent='Conectar Bluetooth MIDI';
 const status=document.createElement('p');status.setAttribute('role','status');
 const reception=document.createElement('p');
 const select=document.createElement('select');select.setAttribute('aria-label','Entrada MIDI de la aplicación');
 const update=async()=>{
  try{
   const {ports,selected}=await native.call('midi.list');select.replaceChildren(new Option('Todas las entradas MIDI',''));
   for(const port of ports)select.add(new Option(port.name,port.id));
   if(selected&&!ports.some(port=>port.id===selected))select.add(new Option('Entrada seleccionada desconectada',selected));
   select.value=selected||'';
  }catch(error){status.textContent=error.message;}
 };
 bluetooth.onclick=async()=>{try{await native.call('midi.bluetooth');}catch(error){status.textContent=error.message;}};
 select.onchange=async()=>{try{await native.call('midi.select',{id:select.value});status.textContent='Entrada seleccionada.';}catch(error){status.textContent=error.message;}};
 const showReception=()=>{
  const message=native.lastReceived;
  reception.textContent=message
   ?`Última recepción · ${message.source} · canal ${message.channel} · ${message.type} ${message.number}${message.value===undefined?'':` = ${message.value}`} · ${message.count} CC/PC en esta vista`
   :'Aún no se han recibido mensajes CC/PC en esta vista.';
 };
 group.append(bluetooth,select);host.append(group,status,reception);void update();showReception();
 window.addEventListener('hud-native-ports',update);
 window.addEventListener('hud-native-midi-received',showReception);
}
