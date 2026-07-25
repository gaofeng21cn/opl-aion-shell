'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oplWindowsWsl2Validation', {
  refresh: async () => await ipcRenderer.invoke('windows-wsl2-validation:read-status'),
});
