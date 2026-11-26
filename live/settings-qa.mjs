import {homeIcon, isDesktopMidiHud} from './home-qa.mjs';

const icons = {
  account: '<circle cx="32" cy="17" r="12"/><path d="M10 54V43Q10 34 23 34H41Q54 34 54 43V54Q54 57 51 57H13Q10 57 10 54Z"/>',
  devices: '<rect x="5" y="12" width="54" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="19" cy="32" r="7"/><path d="M43 20V44M36 29H50" stroke="currentColor" stroke-width="7"/>',
  library: '<path d="M22 13L53 6V41H48V14L27 19V48H22Z"/><ellipse cx="17.5" cy="48" rx="10" ry="7" transform="rotate(-18 17.5 48)"/><ellipse cx="43.5" cy="41" rx="10" ry="7" transform="rotate(-18 43.5 41)"/>'
};

function accordion(icon, title, content) {
  return '<details><summary><svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">'+icons[icon]+'</svg>'+
    title+'<span class="hud-settings-chevron" aria-hidden="true"></span></summary><div class="hud-settings-section">'+content+'</div></details>';
}

export function createSettings() {
  const dialog = document.createElement('dialog');
  dialog.id = 'hud-settings-overlay';
  dialog.setAttribute('aria-labelledby', 'hud-settings-title');
  dialog.innerHTML = '<header><h2 id="hud-settings-title">AJUSTES</h2><button id="hud-close-btn" autofocus aria-label="Cerrar ajustes">×</button></header><main>'+
    accordion('account','CUENTA','<div class="hud-settings-drive">'+homeIcon('drive')+'<div id="hud-sync-root"></div></div>')+
    accordion('devices','DISPOSITIVOS','<div id="hud-native-midi"></div><div id="hud-browser-midi"><button id="hud-midi-btn" type="button">Autorizar entrada MIDI</button> <button id="hud-midi-disconnect" type="button" disabled>Desconectar entrada MIDI</button><label>Entrada MIDI <select id="hud-midi-input"><option value="">Sin entradas autorizadas</option></select></label><p id="hud-midi-status" role="status"></p></div><p id="hud-usb-row">USB MIDI</p><fieldset id="hud-channel"><legend>Canal de recepción MIDI</legend></fieldset>')+
    accordion('library','REPERTORIOS','<fieldset id="hud-repertoire-list"><legend>Setlist activa</legend></fieldset><p id="hud-library-status" role="status"></p>')+
    '</main><a id="hud-editor-link" href="./editor/v3.html?v=20261016-repertoires1" hidden></a>';
  dialog.querySelector('#hud-usb-row').hidden = !isDesktopMidiHud() || Boolean(globalThis.MidiHudNative);
  dialog.querySelector('#hud-browser-midi').hidden = Boolean(globalThis.MidiHudNative);
  const drive = dialog.querySelector('#hud-sync-root');
  new MutationObserver(() => {
    drive.parentElement.dataset.state = drive.querySelector('[data-sync-state]')?.dataset.syncState || '';
  }).observe(drive,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sync-state']});
  document.body.append(dialog);
  return dialog;
}

export function installChannelPicker(fieldset, channel, onChange) {
  const grid = document.createElement('div');
  grid.className = 'hud-channel-grid';
  for (let value = 1; value <= 16; value++) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'hud-midi-channel';
    input.value = value;
    input.checked = value === channel;
    input.addEventListener('change', () => onChange(value));
    const number = document.createElement('span');
    number.textContent = value;
    label.append(input,number);
    grid.append(label);
  }
  fieldset.append(grid);
}
