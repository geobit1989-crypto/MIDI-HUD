import {LIBRARY_ICONS} from '../core/library-icons.mjs';
import {homeIcon} from './home-qa.mjs';

const icons = {
  account: '<circle cx="32" cy="17" r="12"/><path d="M10 54V43Q10 34 23 34H41Q54 34 54 43V54Q54 57 51 57H13Q10 57 10 54Z"/>',
  devices: '<rect x="5" y="12" width="54" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="19" cy="32" r="7"/><path d="M43 20V44M36 29H50" stroke="currentColor" stroke-width="7"/>'
};

const sections=Object.freeze({account:'CUENTA',devices:'DISPOSITIVOS',library:'LISTAS'});
function sectionIcon(icon){return icon==='library'?LIBRARY_ICONS.lists:'<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">'+icons[icon]+'</svg>';}
function sectionPanel(icon,content){return '<section class="hud-settings-section" data-settings-panel="'+icon+'" hidden aria-label="'+sections[icon]+'">'+content+'</section>';}
export function createSettings() {
  const dialog = document.createElement('dialog');
  dialog.id = 'hud-settings-overlay';
  dialog.setAttribute('aria-labelledby', 'hud-settings-title');
  dialog.innerHTML = '<header><button id="hud-settings-back" type="button" hidden aria-label="Volver a Ajustes">‹</button><h2 id="hud-settings-title">AJUSTES</h2><button id="hud-close-btn" autofocus aria-label="Cerrar ajustes">×</button></header><main>'+
 '<nav class="hud-settings-menu" aria-label="Secciones de Ajustes">'+Object.entries(sections).map(([id,title])=>'<button type="button" class="hud-settings-tile" data-settings-section="'+id+'">'+sectionIcon(id)+'<span>'+title+'</span></button>').join('')+'</nav>'+
    sectionPanel('account','<div class="hud-settings-drive">'+homeIcon('drive')+'<div id="hud-sync-root"></div></div>')+
    sectionPanel('devices','<div id="hud-midi-devices"><button id="hud-midi-btn" type="button">Buscar dispositivos</button> <button id="hud-midi-disconnect" type="button" hidden>Desconectar</button><label id="hud-midi-choice" hidden>Dispositivo <select id="hud-midi-input"></select></label> <button id="hud-midi-connect" type="button" hidden>Conectar</button><p id="hud-midi-status" role="status"></p></div><fieldset id="hud-channel"><legend>Canal de recepción MIDI</legend></fieldset>')+
    sectionPanel('library','<fieldset id="hud-repertoire-list"><legend>Selección activa</legend></fieldset><p id="hud-library-status" role="status"></p>')+
    '</main><a id="hud-editor-link" href="./editor/v3.html?v=20261128-library2" hidden></a>';
  const menu=dialog.querySelector('.hud-settings-menu'),back=dialog.querySelector('#hud-settings-back'),title=dialog.querySelector('#hud-settings-title');
  dialog.showSection=(id='menu',{focus=false}={})=>{
    const section=Object.prototype.hasOwnProperty.call(sections,id)?id:'menu';
    dialog.dataset.settingsSection=section;menu.hidden=section!=='menu';back.hidden=section==='menu';title.textContent=sections[section]||'AJUSTES';
    for(const panel of dialog.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==section;
    dialog.scrollTop=0;
    if(focus)(section==='menu'?menu.querySelector('button'):back)?.focus();
  };
  for(const tile of menu.querySelectorAll('[data-settings-section]'))tile.onclick=()=>dialog.showSection(tile.dataset.settingsSection,{focus:true});
  back.onclick=()=>dialog.showSection('menu',{focus:true});dialog.showSection();
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
