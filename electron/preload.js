const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke('desk:' + c, ...a);
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  winMin: () => inv('winMin'), winClose: () => inv('winClose'),
  getWinMode: () => inv('getWinMode'), setWinMode: m => inv('setWinMode', m),
  onWinMode: cb => ipcRenderer.on('desk:winMode', (_e, m) => cb(m)),
  info: () => inv('info'), openFolder: (kind, sub) => inv('openFolder', kind, sub), chooseRoot: () => inv('chooseRoot'),
  writeState: s => inv('writeState', s), readState: () => inv('readState'),
  backup: (name, s) => inv('backup', name, s), autoBackup: s => inv('autoBackup', s),
  listBackups: () => inv('listBackups'), readBackup: n => inv('readBackup', n),
  saveMedia: (folder, name, buf) => inv('saveMedia', folder, name, buf),
  mediaUrl: rel => inv('mediaUrl', rel), deleteMedia: rel => inv('deleteMedia', rel), showMedia: rel => inv('showMedia', rel),
});
