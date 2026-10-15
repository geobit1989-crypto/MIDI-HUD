import {decodeMidiCC} from "./engine-v1.mjs";

/**
 * Entrada Web MIDI sin envio a hardware. Acepta MIDIInputMap estandar y
 * colecciones no iterables usadas por algunos navegadores iOS con puente MIDI.
 * Solo procesa CC, tal como exige el motor actual.
 */
function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  if (typeof value.next === "function") {
    const items = [];
    for (let i = 0; i < 256; i++) {
      const item = value.next();
      if (!item || item.done) break;
      items.push(item.value);
    }
    return items;
  }
  if (typeof value === "object") return Object.values(value);
  return [];
}

function listInputs(source) {
  if (!source) return [];
  let ports = [];
  if (typeof source.values === "function") {
    try { ports = asList(source.values()); } catch { /* puente no estandar */ }
  }
  if (!ports.length && typeof source.forEach === "function") {
    try { source.forEach(port => ports.push(port)); } catch { /* fallback */ }
  }
  if (!ports.length) ports = asList(source);
  return ports
    .map(item => Array.isArray(item) && item.length === 2 ? item[1] : item)
    .filter(port => port && typeof port === "object" && port.type !== "output");
}

function listen(input, onMessage) {
  if (typeof input.addEventListener === "function") {
    try {
      input.addEventListener("midimessage", onMessage);
      return () => input.removeEventListener?.("midimessage", onMessage);
    } catch { /* Algunos puentes iOS solo implementan onmidimessage. */ }
  }
  const previous = input.onmidimessage;
  input.onmidimessage = onMessage;
  return () => {
    if (input.onmidimessage === onMessage) input.onmidimessage = previous ?? null;
  };
}

export async function openBrowserMidi(onMessage, onPortsChanged) {
  if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
    return {supported:false,reason:"Este navegador no ofrece Web MIDI; usa LAB o un puente/app compatible.",
      inputCount:0,inputNames:[],close(){}};
  }
  const access = await navigator.requestMIDIAccess({sysex:false});
  if (!access || typeof access !== "object") {
    return {supported:false,reason:"El navegador no entrego un objeto MIDI valido.",
      inputCount:0,inputNames:[],close(){}};
  }
  const watched = new Map();
  function sync() {
    const inputs = listInputs(access.inputs);
    for (const [input, stop] of watched) {
      if (!inputs.includes(input)) {stop();watched.delete(input);}
    }
    for (const input of inputs) {
      if (watched.has(input)) continue;
      const handler = message => {
        const event = decodeMidiCC(message?.data ?? message);
        if (event) onMessage(event);
      };
      watched.set(input, listen(input, handler));
    }
    if (typeof onPortsChanged === "function") {
      onPortsChanged([...watched.keys()].map((input,i)=>input.name || input.id || "Entrada "+(i+1)));
    }
  }
  sync();
  const handler = () => sync();
  if (typeof access.addEventListener === "function") access.addEventListener("statechange",handler);
  else if ("onstatechange" in access) access.onstatechange = handler;
  return {
    supported:true,
    get inputCount(){return watched.size;},
    get inputNames(){return [...watched.keys()].map((input,i)=>input.name || input.id || "Entrada "+(i+1));},
    close(){
      if (typeof access.removeEventListener === "function") access.removeEventListener("statechange",handler);
      else if (access.onstatechange === handler) access.onstatechange = null;
      for (const stop of watched.values()) stop();
      watched.clear();
    }
  };
}
