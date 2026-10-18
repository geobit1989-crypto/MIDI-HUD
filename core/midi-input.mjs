/*
 * MIDI HUD v0.4 — traducción de mensajes MIDI reales al motor.
 * No abre el dispositivo ni transmite MIDI: una capa de entrada para Web MIDI/BLE bridge.
 * Los mensajes System Real-Time F8 no contienen canal.
 */
export function receiveMidiBytes(engine, inputBytes, timestampMs) {
  if (!engine || !inputBytes || !inputBytes.length) return false;
  const bytes = Array.from(inputBytes);
  const status = bytes[0];
  if (status === 0xF8) {
    engine.dispatch({type:"RECEIVE_F8",timestampMs});
    return true;
  }
  if (status < 0x80 || status >= 0xF0) return false;
  const channel = 1 + (status & 0x0F);
  const family = status & 0xF0;
  if (family===0xB0 && bytes.length>=3) {
    engine.dispatch({type:"RECEIVE_CC",channel,controller:bytes[1],value:bytes[2]});
    return true;
  }
  if (family===0xC0 && bytes.length>=2) {
    engine.dispatch({type:"RECEIVE_PC",channel,program:bytes[1]});
    return true;
  }
  return false;
}

export function createMidiInputHandler(engine, now=()=>performance.now()) {
  return event=>receiveMidiBytes(engine,event.data,
    Number.isFinite(event.timeStamp) ? event.timeStamp : now());
}
