// SVG geometry from the approved HOME sketch (Esbozo 06).
const icons = {
  live: '<path d="M9.5 9.33165V14.6683C9.5 15.4595 10.3752 15.9373 11.0408 15.5095L15.1915 12.8412C15.8038 12.4475 15.8038 11.5524 15.1915 11.1588L11.0408 8.49047C10.3752 8.06265 9.5 8.54049 9.5 9.33165Z"/><path fill-rule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12Z"/>',
  editor: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></g>',
  settings: '<path fill-rule="evenodd" d="M11.568 3.5a1 1 0 0 0-.863.494l-.811 1.381A3.001 3.001 0 0 1 7.33 6.856l-1.596.013a1 1 0 0 0-.858.501l-.439.761a1 1 0 0 0-.004.992l.792 1.4a3 3 0 0 1 0 2.954l-.792 1.4a1 1 0 0 0 .004.992l.439.76a1 1 0 0 0 .858.502l1.596.013a3 3 0 0 1 2.564 1.48l.811 1.382a1 1 0 0 0 .863.494h.87a1 1 0 0 0 .862-.494l.812-1.381a3.001 3.001 0 0 1 2.563-1.481l1.596-.013a1 1 0 0 0 .86-.501l.438-.761a1 1 0 0 0 .004-.992l-.793-1.4a3 3 0 0 1 0-2.954l.793-1.4a1 1 0 0 0-.004-.992l-.439-.76a1 1 0 0 0-.858-.502l-1.597-.013a3 3 0 0 1-2.563-1.48L13.3 3.993a1 1 0 0 0-.862-.494h-.87ZM8.98 2.981A3.001 3.001 0 0 1 11.568 1.5h.87c1.064 0 2.049.564 2.588 1.481l.811 1.382a1 1 0 0 0 .855.494l1.596.013a3 3 0 0 1 2.575 1.502l.44.76a3 3 0 0 1 .011 2.975l-.792 1.4a1 1 0 0 0 0 .985l.792 1.401a3 3 0 0 1-.012 2.974l-.439.761a3.001 3.001 0 0 1-2.575 1.503l-1.597.012a1 1 0 0 0-.854.494l-.811 1.382a3.001 3.001 0 0 1-2.588 1.481h-.87a3.001 3.001 0 0 1-2.588-1.481l-.811-1.382a1 1 0 0 0-.855-.494l-1.596-.012a3 3 0 0 1-2.576-1.503l-.438-.76a3 3 0 0 1-.013-2.975l.793-1.4a1 1 0 0 0 0-.985l-.793-1.4a3 3 0 0 1 .013-2.975l.438-.761A3.001 3.001 0 0 1 5.718 4.87l1.596-.013a1 1 0 0 0 .855-.494l.81-1.382Z"/><path fill-rule="evenodd" d="M12.003 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8.502 12a3.5 3.5 0 1 1 7 .001 3.5 3.5 0 0 1-7-.001Z"/>',
  about: '<path d="M13 12a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0v-4Zm-1-2.5A1.25 1.25 0 1 0 12 7a1.25 1.25 0 0 0 0 2.5Z"/><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Z"/>',
  controller: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M21 4H14M10 4H3M21 12H12M8 12H3M21 20H16M12 20H3M14 2V6M8 10V14M16 18V22"/>',
  bluetooth: '<path d="M20 4V44L33 32L7 12M20 4L33 16L7 36" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>',
  usb: '<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 20V3M9 6L12 3L15 6M12 15L5 10V7M12 12L19 8V5"/><circle cx="5" cy="6" r="1.5"/><rect x="17.5" y="2" width="3" height="3"/><circle cx="12" cy="21" r="1.5"/></g>',
  drive: '<g stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"><path d="M16 5L3 28"/><path d="M23 5L36 28"/><path d="M8 34H31"/></g><circle cx="20" cy="23" r="3"/>'
};
const viewBoxes = {bluetooth: '0 0 40 48', drive: '0 0 40 40'};
export const homeIcon = name => '<svg viewBox="'+(viewBoxes[name] ?? '0 0 24 24')+'" aria-hidden="true" fill="currentColor">'+icons[name]+'</svg>';

export function isDesktopMidiHud(native = globalThis.MidiHudNative) {
  return native?.platform === 'windows' || (!native && !navigator.userAgentData?.mobile && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

export function installHome({settings, editor, syncRoot}) {
  const liveTitle = document.title;
  const native = globalThis.MidiHudNative;
  const windows = native?.platform === 'windows';
  const desktop = isDesktopMidiHud();
  const home = document.createElement('dialog');
  home.className = 'hud-home';
  home.setAttribute('aria-labelledby', 'hud-home-title');
  home.toggleAttribute('data-windows', windows);
  home.toggleAttribute('data-desktop', desktop);
  home.innerHTML = '<h1 id="hud-home-title" tabindex="-1" autofocus>MIDI HUD</h1><nav class="hud-home-matrix" aria-label="Módulos"></nav><footer class="hud-home-status"><div class="hud-home-midi"></div></footer>';
  const matrix = home.querySelector('nav');
  const status = home.querySelector('footer');
  const midiStatus = status.querySelector('.hud-home-midi');
  const about = document.createElement('dialog');
  about.className = 'hud-about';
  about.setAttribute('aria-label', 'Acerca de MIDI HUD');
  about.innerHTML = '<h2>MIDI HUD</h2><p>Entorno de pruebas</p><p><a href="./privacy.html">Privacidad</a> · <a href="./terms.html">Condiciones</a> · <a href="./privacy-en.html">Privacy</a> · <a href="./terms-en.html">Terms</a></p><form method="dialog"><button>Cerrar</button></form>';
  function tile(name, label, color, action) {
    const node = document.createElement(name === 'editor' ? 'a' : 'button');
    if (name === 'editor') {
      node.href = editor.href;
      node.addEventListener('click', () => { node.href = editor.href; });
    } else {
      node.type = 'button';
      node.addEventListener('click', action);
    }
    node.className = 'hud-tile';
    node.style.setProperty('--tile', color);
    node.innerHTML = homeIcon(name) + '<span>'+label+'</span>';
    matrix.append(node);
  }
  tile('live', 'LIVE', '#305FF3', () => home.close());
  tile('editor', 'EDITOR', '#9D8B25');
  if (windows) tile('controller', 'CONTROLLER', '#168B8E', () => native.call('controller.open').catch(error => alert(error.message)));
  tile('settings', 'AJUSTES', '#B56829', () => { home.close(); settings(); });
  tile('about', 'ACERCA DE', '#52657C', () => about.showModal());

  const indicators = new Map();
  function indicator(name, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.link = name;
    button.innerHTML = homeIcon(name) + '<span>'+label+'</span>';
    button.addEventListener('click', action);
    indicators.set(name, {button, label});
    (name === 'drive' ? status : midiStatus).append(button);
    setState(name, 'idle');
  }
  function setState(name, state, deviceName) {
    const entry = indicators.get(name);
    if (!entry) return;
    const descriptions = {idle: 'Inactivo', connected: 'Conectado', busy: name === 'drive' ? 'Sincronizando' : 'Conectando', error: 'Error'};
    entry.button.dataset.state = state;
    const label = deviceName ? entry.label + ' · ' + deviceName : entry.label;
    entry.button.querySelector('span').textContent = deviceName || entry.label;
    entry.button.title = label + ' · ' + descriptions[state];
    entry.button.setAttribute('aria-label', entry.button.title);
  }
  let ports = [], bluetoothPending = false, webBluetooth = 'idle', readSequence = 0;
  function showConnections() {
    for (const name of ['bluetooth', 'usb']) {
      const connected = ports.find(port => port.transport === name && port.connected === true);
      const pending = ports.some(port => port.transport === name && port.connecting === true);
      const state = connected ? 'connected' : pending || (name === 'bluetooth' && bluetoothPending) ? 'busy' : name === 'bluetooth' ? webBluetooth : 'idle';
      const webDevice = !native && name === 'bluetooth' && state === 'connected' ? globalThis.__sigBleConnection?.name : '';
      setState(name, state, connected?.name || webDevice);
    }
  }
  async function readPorts() {
    if (!native) return;
    const sequence = ++readSequence;
    try {
      const result = await native.call('midi.list');
      if (sequence === readSequence) ports = result.ports ?? [];
    } catch {
      if (sequence === readSequence) ports = [];
    }
    showConnections();
  }
  function openSettings() { home.close(); settings(); }
  indicator('bluetooth', 'Bluetooth', async () => {
    if (!native) { openSettings(); return; }
    if (bluetoothPending) return;
    bluetoothPending = native.platform !== 'windows';
    showConnections();
    try {
      await native.call('midi.bluetooth');
      if (native.platform === 'ios') return;
    } catch (error) { alert(error.message); }
    bluetoothPending = false;
    void readPorts();
  });
  if (desktop) indicator('usb', 'USB', openSettings);
  indicator('drive', 'Drive', () => {
    openSettings();
    syncRoot.querySelector('button')?.click();
  });
  function updateDrive() {
    const state = syncRoot.querySelector('[data-sync-state]')?.dataset.syncState;
    setState('drive', ['connected', 'synced'].includes(state) ? 'connected' : state === 'syncing' ? 'busy' :
      ['error', 'offline'].includes(state) ? 'error' : 'idle');
  }
  new MutationObserver(updateDrive).observe(syncRoot, {subtree:true, childList:true, attributes:true, attributeFilter:['data-sync-state']});
  updateDrive();
  window.addEventListener('hud-native-ports', event => {
    if (Array.isArray(event.detail)) {
      ++readSequence;
      ports = event.detail;
      showConnections();
    } else void readPorts();
  });
  window.addEventListener('hud-foreground', readPorts);
  window.addEventListener('hud-bluetooth-picker-closed', () => { bluetoothPending = false; void readPorts(); });
  window.addEventListener('hud-web-bluetooth', event => { webBluetooth = event.detail; showConnections(); });
  home.addEventListener('close', () => { if (!home.open) document.title = liveTitle; });
  document.body.append(home, about);
  return () => {
    if (!home.open) {
      matrix.querySelector('a').href = editor.href;
      home.showModal();
      document.title = 'MIDI HUD';
      void readPorts();
    }
  };
}
