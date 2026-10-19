const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'أرشيف اتفاقات المصالحة الفلسطينية',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // الروابط الخارجية (المصادر) تُفتح في المتصفح الافتراضي
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

Menu.setApplicationMenu(null);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
