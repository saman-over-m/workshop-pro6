const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path'), fs = require('fs');
const { create } = require('./storage');

if (!app.requestSingleInstanceLock()) { app.quit(); }
let win, store, cfgFile, holdNote = false;
const curMode = () => win.isFullScreen() ? 'full' : (win.isMaximized() ? 'max' : 'win');
function setMode(mode) {
  if (mode === 'full') { win.setFullScreen(true); return; }
  win.setFullScreen(false);
  setTimeout(() => { if (mode === 'max') win.maximize(); else win.unmaximize(); }, 80);
}
const defRoot = () => path.join(app.getPath('documents'), 'ورکشاپ پرو');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { return {}; } };
const saveCfg = c => { fs.mkdirSync(path.dirname(cfgFile), { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(c)); };

// Desktop shortcuts straight to the two folders you use most (no digging through folders).
function makeShortcuts() {
  if (process.platform !== 'win32') return;
  try {
    const desk = app.getPath('desktop');
    shell.writeShortcutLink(path.join(desk, 'بکاپ ورکشاپ.lnk'), 'create', { target: store.dirs.backups, description: 'بکاپ‌های ورکشاپ پرو' });
    shell.writeShortcutLink(path.join(desk, 'عکس و فیلم کارتکس ها.lnk'), 'create', { target: store.dirs.media, description: 'عکس و فیلم کارتکس‌ها' });
  } catch (e) { console.error('shortcut', e); }
}

function setup() {
  cfgFile = path.join(app.getPath('userData'), 'config.json');
  const cfg = loadCfg();
  store = create(cfg.root || defRoot()); store.ensure();
  if (!cfg.shortcutsFor || cfg.shortcutsFor !== store.dirs.root) { makeShortcuts(); saveCfg({ ...cfg, shortcutsFor: store.dirs.root }); }

  const h = (n, f) => ipcMain.handle('desk:' + n, async (_e, ...a) => f(...a));
  h('info', () => store.info());
  h('getWinMode', () => curMode());
  h('winMin', () => { // leave full screen first (remembering it), then minimise to the taskbar
    if (win.isFullScreen()) { holdNote = true; setMode('max'); setTimeout(() => win.minimize(), 260); setTimeout(() => { holdNote = false; }, 900); } else win.minimize();
    return true;
  });
  h('winClose', () => { win.close(); return true; });
  h('setWinMode', mode => { setMode(mode); return mode; });
  h('openFolder', async (kind, sub) => { const p = store.folder(kind === 'root' ? 'root' : kind, sub); return shell.openPath(p); });
  h('chooseRoot', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'انتخاب پوشه اصلی ورکشاپ پرو', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const root = path.join(r.filePaths[0], 'ورکشاپ پرو');
    store = create(root); store.ensure(); saveCfg({ ...loadCfg(), root, shortcutsFor: root }); makeShortcuts(); return root;
  });
  h('writeState', j => store.writeState(j));
  h('readState', () => store.readState());
  h('backup', (n, j) => store.backup(n, j));
  h('autoBackup', j => store.autoBackup(j));
  h('listBackups', () => store.listBackups());
  h('readBackup', n => store.readBackup(n));
  h('saveMedia', (folder, name, buf) => store.saveMedia(folder, name, buf));
  h('mediaUrl', rel => store.mediaUrl(rel));
  h('deleteMedia', rel => store.deleteMedia(rel));
  h('showMedia', rel => { const p = store.mediaPath(rel); if (p) shell.showItemInFolder(p); return true; });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, backgroundColor: '#0a0f1f', title: 'ورکشاپ پرو',
    icon: path.join(__dirname, '..', 'build', 'icon.png'), show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  // Remember the last window mode (default: full screen) and tell the page when it changes.
  const startMode = loadCfg().winMode || 'full';
  if (startMode === 'full') win.setFullScreen(true); else if (startMode === 'max') win.maximize();
  let noteT;
  const note = () => { clearTimeout(noteT); noteT = setTimeout(() => { if (win.isDestroyed() || holdNote) return; const mode = curMode(); saveCfg({ ...loadCfg(), winMode: mode }); win.webContents.send('desk:winMode', mode); }, 150); };
  ['enter-full-screen', 'leave-full-screen', 'maximize', 'unmaximize'].forEach(ev => win.on(ev, note));
  win.once('ready-to-show', () => win.show());
  // Never lose the last edit: ask the page to flush to disk before the window really closes.
  let closing = false;
  win.on('close', e => {
    if (closing) return; e.preventDefault(); closing = true;
    const timeout = new Promise(r => setTimeout(r, 3000));
    Promise.race([win.webContents.executeJavaScript('window.__flush && window.__flush()'), timeout]).catch(() => {}).finally(() => win.destroy());
  });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (_e, i) => { // F11 fullscreen, Ctrl +/- zoom, F12 devtools
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') setMode(win.isFullScreen() ? 'max' : 'full');
    if (i.control && (i.key === '=' || i.key === '+')) win.webContents.setZoomFactor(Math.min(2, win.webContents.getZoomFactor() + 0.1));
    if (i.control && i.key === '-') win.webContents.setZoomFactor(Math.max(0.6, win.webContents.getZoomFactor() - 0.1));
    if (i.control && i.key === '0') win.webContents.setZoomFactor(1);
    if (i.key === 'F12') win.webContents.toggleDevTools();
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { Menu.setApplicationMenu(null); setup(); createWindow(); });
app.on('window-all-closed', () => app.quit());
