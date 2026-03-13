const { app, BrowserWindow, desktopCapturer, ipcMain, powerMonitor, shell } = require('electron');
const path = require('path');
let activeWin = null;

try {
  activeWin = require('active-win');
} catch {
  activeWin = null;
}

const DEFAULT_APP_URL = 'http://localhost:5173';
const APP_URL = process.env.APP_URL || DEFAULT_APP_URL;
const APP_ICON = path.join(__dirname, 'assets', 'icon.png');

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

ipcMain.handle('desktop:capture-screenshot', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  if (!sources.length) return null;
  return sources[0].thumbnail.toDataURL();
});

ipcMain.handle('desktop:get-system-idle-seconds', async () => {
  return powerMonitor.getSystemIdleTime();
});

ipcMain.handle('desktop:get-active-window-context', async () => {
  if (!activeWin) {
    return null;
  }

  try {
    const context = await activeWin();
    if (!context) return null;

    return {
      app: context.owner?.name || null,
      title: context.title || null,
      url: context.url || null,
    };
  } catch {
    return null;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
