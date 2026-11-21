import {createMidiParser} from "./midi-stream.mjs";

export const BLE_MIDI_SERVICE = "03b80e5a-ede8-4b33-a751-6ce34ec4c700";
export const BLE_MIDI_CHARACTERISTIC = "7772e5db-3868-4112-a1a9-f2669d106bf3";

/**
 * Decode BLE-MIDI GATT notifications into MIDI 1.0 bytes.
 * The first byte is the BLE timestamp header; a timestamp-low byte precedes
 * the first MIDI event. Later timestamp bytes can appear at event boundaries.
 * Supports common CC/PC messages, running status and realtime clock.
 * Does not transmit, configure the pedal, or change HUD musical state.
 */
export function createBleMidiDecoder() {
  const parse = createMidiParser();
  let runningStatus = null;
  let pending = 0;
  return (packet, timestampMs = 0) => {
    const bytes = Array.from(packet || []);
    if (bytes.length < 3 || (bytes[0] & 0xc0) !== 0x80 || (bytes[1] & 0x80) === 0)
      return [];
    const midi = [];
    let atBoundary = true;
    for (let i = 2; i < bytes.length; i++) {
      const b = bytes[i];
      // A timestamp-low byte is only valid at an event boundary. The first
      // timestamp was already consumed above.
      if (atBoundary && (b & 0x80) && i + 1 < bytes.length &&
          (bytes[i + 1] & 0x80) && b < 0xf8) {
        continue;
      }
      midi.push(b);
      if (b >= 0xf8) continue;
      if (b & 0x80) {
        if (b >= 0xf0) {
          runningStatus = null;
          pending = 0;
          atBoundary = true;
        } else {
          runningStatus = b;
          pending = ((b & 0xf0) === 0xc0 || (b & 0xf0) === 0xd0) ? 1 : 2;
          atBoundary = false;
        }
      } else if (runningStatus !== null) {
        pending--;
        if (pending <= 0) {
          pending = ((runningStatus & 0xf0) === 0xc0 || (runningStatus & 0xf0) === 0xd0) ? 1 : 2;
          atBoundary = true;
        } else atBoundary = false;
      }
    }
    return parse(midi, timestampMs);
  };
}

/**
 * Explicit user-gesture BLE connection for Chrome/Android where Web Bluetooth
 * and BLE-MIDI GATT notifications are available. Never auto-pairs on load.
 * A Bluetooth connection is not proof that the controller sends MIDI data.
 */
export async function connectBleMidi(onMessage, options = {}) {
  const bluetooth = options.bluetooth ?? globalThis.navigator?.bluetooth;
  if (!bluetooth?.requestDevice) throw new Error("Web Bluetooth no disponible en este navegador");
  if (typeof onMessage !== "function") throw new TypeError("onMessage debe ser una función");
  const device = await bluetooth.requestDevice({
    filters: [{name: "FOOTCTRLPLUS"}],
    optionalServices: [BLE_MIDI_SERVICE]
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
  const characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
  const decode = createBleMidiDecoder();
  let closed = false;
  const onValue = event => {
    if (closed) return;
    const value = event.target?.value;
    if (!value) return;
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    for (const message of decode(bytes, options.now?.() ?? Date.now())) onMessage(message);
  };
  const onDisconnect = () => { if (!closed) options.onDisconnected?.(); };
  characteristic.addEventListener("characteristicvaluechanged", onValue);
  device.addEventListener?.("gattserverdisconnected", onDisconnect);
  try {
    await characteristic.startNotifications();
  } catch (error) {
    characteristic.removeEventListener?.("characteristicvaluechanged", onValue);
    device.removeEventListener?.("gattserverdisconnected", onDisconnect);
    if (device.gatt?.connected) device.gatt.disconnect();
    throw error;
  }
  return {
    name: device.name || "BLE MIDI",
    disconnect() {
      if (closed) return;
      closed = true;
      characteristic.removeEventListener?.("characteristicvaluechanged", onValue);
      device.removeEventListener?.("gattserverdisconnected", onDisconnect);
      if (device.gatt?.connected) device.gatt.disconnect();
    }
  };
}
