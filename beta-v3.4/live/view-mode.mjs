const modes = [
  ['full', 'Completo'],
  ['states', 'Estados'],
  ['sheet', 'Lead sheet']
];
const preference = 'hudLiveViewMode';

export function installLiveViewMode(screen, storage, refitSheet) {
  const button = screen.querySelector('#hud-view-mode');
  const sheet = screen.querySelector('.lead-sheet');
  const modules = screen.querySelector('.switch-grid');
  let index = 0;
  try {
    index = Math.max(0, modes.findIndex(([mode]) => mode === storage.getItem(preference)));
  } catch {
    // LIVE also works when browser storage is unavailable.
  }

  function render() {
    const [mode, label] = modes[index];
    const next = modes[(index + 1) % modes.length][1];
    screen.dataset.viewMode = mode;
    sheet.hidden = mode === 'states';
    modules.hidden = mode === 'sheet';
    button.title = 'Cambiar a ' + next;
    button.setAttribute('aria-label', 'Vista: ' + label + '. Cambiar a ' + next);
    if (!sheet.hidden) refitSheet();
  }

  button.addEventListener('click', () => {
    index = (index + 1) % modes.length;
    render();
    try {
      storage.setItem(preference, modes[index][0]);
    } catch {
      // Retain this session's selection.
    }
  });
  render();
}
