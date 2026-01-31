// Preload script for Electron
// This runs in a limited context before the page loads
// Can expose safe APIs to the renderer process if needed

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the APIs in a safe way
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});

