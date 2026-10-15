import {decodeMidiCC} from "./engine-v1.mjs";
/**
 * Adaptador opcional para navegadores con Web MIDI.
 * No realiza busquedas periodicas, reconexiones agresivas ni genera alarmas.
 * El MIDI BLE solo aparecera si navegador + sistema operativo exponen ese puerto.
 */
export async function openBrowserMidi(onMessage) {
  if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
    return {supported:false,reason:"Este navegador no ofrece Web MIDI; usa LAB o un puente/app compatible.",
      close(){}};
  }
  const access = await navigator.requestMIDIAccess({sysex:false});
  const watched = new Map();
  function sync() {
    for (const input of watched.keys()) {
      if (![...access.inputs.values()].includes(input)) {
        input.removeEventListener("midimessage",watched.get(input));
        watched.delete(input);
      }
    }
    for (const input of access.inputs.values()) {
      if (watched.has(input)) continue;
      const fn=e=>{const event=decodeMidiCC(e.data);if(event) onMessage(event);};
      input.addEventListener("midimessage",fn);
      watched.set(input,fn);
    }
  }
  sync();
  access.addEventListener?.("statechange",sync);
  return {supported:true,close(){
    access.removeEventListener?.("statechange",sync);
    for(const [input,fn] of watched) input.removeEventListener("midimessage",fn);
    watched.clear();
  }};
}
