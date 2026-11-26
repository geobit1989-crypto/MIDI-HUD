const icons = {
  live: '<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  editor: '<path d="M13 5H4v15h15v-9M10 14l1-4 8-8 3 3-8 8z"/>',
  settings: '<path d="M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4M9 17v4"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  controller: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10v4m4-4v4m4-4v4"/>',
  bluetooth: '<path d="m6 6 12 12-6 4V2l6 4L6 18"/>',
  usb: '<path d="M12 21V3m-3 3 3-3 3 3M12 16 6 11V8m6 6 6-5V7"/><circle cx="12" cy="21" r="1"/><path d="M17 6h2v2h-2z"/>',
  drive: '<path d="M10 3 2 17m12-14 8 14M5 21h14"/><circle cx="12" cy="14" r="2" stroke="none"/>'
};
const svg = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';

export function installHome({settings, editor, syncRoot}) {
  const native = globalThis.MidiHudNative;
  const windows = native?.platform === 'windows';
  const desktop = windows || (!native && !navigator.userAgentData?.mobile && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const home = document.createElement('dialog');
  home.className = 'hud-home';
  home.setAttribute('aria-labelledby', 'hud-home-title');
  home.toggleAttribute('data-windows', windows);
  home.innerHTML = '<h1 id="hud-home-title">MIDI HUD</h1><nav class="hud-home-matrix" aria-label="Módulos"></nav><footer class="hud-home-status"></footer>';
  const matrix = home.querySelector('nav');
  const status = home.querySelector('footer');
  const about = document.createElement('dialog');
  about.className = 'hud-about';
  about.setAttribute('aria-label', 'Acerca de MIDI HUD');
  about.innerHTML = '<h2>MIDI HUD</h2><p>Entorno de pruebas</p><p><a href="./privacy.html">Privacidad</a> · <a href="./terms.html">Condiciones</a></p><form method="dialog"><button>Cerrar</button></form>';
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
    node.innerHTML = svg(name) + '<span>'+label+'</span>';
    matrix.append(node);
  }
  tile('live', 'LIVE', '#305FF3', () => home.close());
  tile('editor', 'EDITOR', '#9D8B25');
  tile('settings', 'AJUSTES', '#B56829', () => { home.close(); settings(); });
  tile('about', 'ACERCA DE', '#52657C', () => about.showModal());
  if (windows) tile('controller', 'CONTROLLER', '#168B8E', () => native.call('controller.open').catch(error => alert(error.message)));

  const indicators = new Map();
  function indicator(name, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.link = name;
    button.innerHTML = svg(name) + '<span>'+label+'</span>';
    button.addEventListener('click', action);
    indicators.set(name, {button, label});
    status.append(button);
    setState(name, 'idle');
  }
  function setState(name, state) {
    const entry = indicators.get(name);
    if (!entry) return;
    const descriptions = {idle: 'Inactivo', connected: 'Conectado', busy: name === 'drive' ? 'Sincronizando' : 'Conectando', error: 'Error'};
    entry.button.dataset.state = state;
    entry.button.title = entry.label + ' · ' + descriptions[state];
    entry.button.setAttribute('aria-label', entry.button.title);
  }
  let ports = [], bluetoothPending = false, webBluetooth = 'idle', readSequence = 0;
  function showConnections() {
    for (const name of ['bluetooth', 'usb']) {
      const connected = ports.some(port => port.transport === name && port.connected === true);
      const pending = ports.some(port => port.transport === name && port.connecting === true);
      setState(name, connected ? 'connected' : pending || (name === 'bluetooth' && bluetoothPending) ? 'busy' : name === 'bluetooth' ? webBluetooth : 'idle');
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
  document.body.append(home, about);
  return () => {
    if (!home.open) {
      matrix.querySelector('a').href = editor.href;
      home.showModal();
      void readPorts();
    }
  };
}
