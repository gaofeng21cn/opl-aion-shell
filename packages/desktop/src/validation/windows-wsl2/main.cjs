'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { collectValidationStatus, requireValidationGate } = require('./probe.cjs');

const STATUS_CHANNEL = 'windows-wsl2-validation:read-status';
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  void mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

let validationGateOpen = true;
try {
  requireValidationGate();
} catch (error) {
  validationGateOpen = false;
  console.error(error instanceof Error ? error.message : error);
  app.exit(1);
}

if (validationGateOpen) {
  app.whenReady().then(() => {
    ipcMain.handle(STATUS_CHANNEL, async () => await collectValidationStatus());
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
