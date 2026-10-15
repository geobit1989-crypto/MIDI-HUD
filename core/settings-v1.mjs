/** Ajustes propios de MIDI HUD; no se guardan dentro de las canciones. */
export const SETTINGS_KEY = "midiHudSettingsV1";
export const DEFAULT_SETTINGS = Object.freeze({midiChannel:1});
export function validChannel(value) {
  return Number.isInteger(value) && value>=1 && value<=16;
}
export function readSettings(storage) {
  if (!storage) return {...DEFAULT_SETTINGS};
  try {
    const saved=JSON.parse(storage.getItem(SETTINGS_KEY));
    return {midiChannel:validChannel(saved?.midiChannel)?saved.midiChannel:1};
  } catch {return {...DEFAULT_SETTINGS};}
}
export function saveSettings(storage, settings) {
  if (!validChannel(settings?.midiChannel)) throw Error("Canal MIDI fuera de 1 a 16");
  if (storage) storage.setItem(SETTINGS_KEY,JSON.stringify({midiChannel:settings.midiChannel}));
  return {midiChannel:settings.midiChannel};
}
