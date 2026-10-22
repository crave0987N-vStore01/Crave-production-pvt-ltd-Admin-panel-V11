'use strict';
const { app, BrowserWindow, Menu, shell, protocol, net, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SCHEME = 'app';
const HOST = 'crave-admin';
const START_URL = `${SCHEME}://${HOST}/index.html`;
const ICON = path.join(__dirname, 'assets', 'icon.png');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({
      ...b, maximized: win.isMaximized(), zoom: win.webContents.getZoomFactor()
    }));
  } catch { /* ignore */ }
}

function isHttp(u) { return /^https?:\/\//i.test(u) || /^mailto:/i.test(u) || /^tel:/i.test(u); }

function registerProtocol() {
  const root = path.resolve(__dirname);
  const assets = path.join(root, 'assets') + path.sep;
  protocol.handle(SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const target = path.resolve(root, '.' + rel);
      const allowed = target === path.join(root, 'index.html') || target.startsWith(assets);
      if (!allowed || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(target).toString());
    } catch (e) {
      return new Response('Error', { status: 500 });
    }
  });
}

function setupPermissions() {
  const ses = session.defaultSession;
  const ok = new Set(['media', 'mediaKeySystem', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen', 'display-capture']);
  const fromApp = (origin) => typeof origin === 'string' && origin.startsWith(`${SCHEME}://${HOST}`);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(ok.has(permission) && fromApp(details && details.requestingUrl ? details.requestingUrl : wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => ok.has(permission) && fromApp(origin || (wc && wc.getURL())));
}

function buildMenu() {
  const tpl = [
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
        { label: 'Hard Reload (clear cache)', accelerator: 'CmdOrCtrl+Shift+R', click: () => win && win.webContents.reloadIgnoringCache() },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen', accelerator: 'F11' },
        { type: 'separator' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus', visible: false },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'F12' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open Live Store Website', click: () => shell.openExternal('https://crave-production-cake-store-v10.vercel.app/') },
        { label: `Version ${app.getVersion()}`, enabled: false }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1440,
    height: st.height || 900,
    x: st.x, y: st.y,
    minWidth: 1024, minHeight: 680,
    show: false,
    backgroundColor: '#0f0f0f',
    title: 'Crave Productions | Admin Dashboard',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  if (st.maximized !== false) win.maximize();
  win.once('ready-to-show', () => {
    win.show();
    if (st.zoom && st.zoom > 0.3 && st.zoom < 3) win.webContents.setZoomFactor(st.zoom);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}`)) {
      e.preventDefault();
      if (isHttp(url)) shell.openExternal(url);
    }
  });
  win.webContents.on('page-title-updated', (e) => e.preventDefault());

  win.webContents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    } else if (p.selectionText) {
      items.push({ role: 'copy' });
    }
    if (p.linkURL && isHttp(p.linkURL)) {
      items.push({ type: 'separator' }, { label: 'Open Link in Browser', click: () => shell.openExternal(p.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.webContents.on('render-process-gone', () => { if (win && !win.isDestroyed()) win.webContents.reload(); });
  win.on('close', saveState);
  win.on('closed', () => { win = null; });

  win.loadURL(START_URL);
}

async function checkOnline() {
  if (net.isOnline()) return true;
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'No Internet',
    message: 'Internet connection not found.',
    detail: 'The admin panel needs internet to reach the database.',
    buttons: ['Retry', 'Continue Anyway', 'Exit'],
    defaultId: 0, cancelId: 2
  });
  if (r.response === 0) return checkOnline();
  if (r.response === 2) { app.quit(); return false; }
  return true;
}

function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', async (info) => {
      const r = await dialog.showMessageBox(win || undefined, {
        type: 'info', title: 'Update ready',
        message: `Version ${info.version} downloaded.`,
        detail: 'Restart now to install the update?',
        buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1
      });
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', () => { /* no releases yet / offline: ignore silently */ });
    autoUpdater.checkForUpdates().catch(() => {});
  } catch { /* ignore */ }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('lk.nimah.crave.adminpanel');
    registerProtocol();
    setupPermissions();
    buildMenu();
    if (!(await checkOnline())) return;
    createWindow();
    setupUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
