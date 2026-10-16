/** Extensión opcional: el adaptador Web MIDI y los navegadores existentes no cambian. */
export function installNativeMidiControls(host,native=globalThis.MidiHudNative){
 if(!native||!host)return;
 const group=document.createElement('div');group.className='hud-config-actions';
 const bluetooth=document.createElement('button');bluetooth.type='button';bluetooth.textContent='Conectar Bluetooth MIDI';
 const status=document.createElement('p');status.setAttribute('role','status');
 const select=document.createElement('select');select.setAttribute('aria-label','Entrada MIDI de la aplicación');
 const update=async()=>{
  try{
   const {ports,selected}=await native.call('midi.list');select.replaceChildren(new Option('Todas las entradas MIDI',''));
   for(const port of ports)select.add(new Option(port.name,port.id));select.value=selected||'';
  }catch(error){status.textContent=error.message;}
 };
 bluetooth.onclick=async()=>{try{await native.call('midi.bluetooth');}catch(error){status.textContent=error.message;}};
 select.onchange=async()=>{try{await native.call('midi.select',{id:select.value});status.textContent='Entrada seleccionada.';}catch(error){status.textContent=error.message;}};
 group.append(bluetooth,select);host.append(group,status);void update();
 window.addEventListener('hud-native-ports',update);
}
