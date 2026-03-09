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
  discordSelfPresenceUpdate: (payload) => ipcRenderer.send('discord-self-presence:update', payload),
  discordSelfPresenceClear: () => ipcRenderer.send('discord-self-presence:clear'),
  discordSelfPresenceSetEnabled: (enabled) => ipcRenderer.invoke('discord-self-presence:set-enabled', !!enabled),
  discordSelfPresenceSetConfig: (config) => ipcRenderer.invoke('discord-self-presence:set-config', config || {}),
  discordSelfPresenceSaveToken: (token) => ipcRenderer.invoke('discord-self-presence:save-token', token),
  discordSelfPresenceDeleteToken: () => ipcRenderer.invoke('discord-self-presence:delete-token'),
  discordSelfPresenceTest: () => ipcRenderer.invoke('discord-self-presence:test'),
  discordSelfPresenceGetStatus: () => ipcRenderer.invoke('discord-self-presence:get-status'),
  discordSelfPresenceGetConfig: () => ipcRenderer.invoke('discord-self-presence:get-config'),
  onDiscordSelfPresenceStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('discord-self-presence:status', listener);
    return () => ipcRenderer.removeListener('discord-self-presence:status', listener);
  },
});

