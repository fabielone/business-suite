import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { APP_URL, CSP, desktopMode, isTrustedSender, resolveAssetPath } from './security';
import { bridgeError, executeRequest } from './bridge';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'suite',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let window: BrowserWindow | null = null;
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function start(): Promise<void> {
  const mode = desktopMode({
    isPackaged: app.isPackaged,
    args: process.argv,
    metadata: JSON.parse(readFileSync(join(__dirname, 'build-info.json'), 'utf8')) as unknown,
  });
  const defaultProfile = join(app.getPath('appData'), 'Business Suite Desktop', mode);
  const testProfile = !app.isPackaged ? process.env.SUITE_DESKTOP_TEST_PROFILE : undefined;
  if (testProfile && !isAbsolute(testProfile))
    throw new Error('The development test profile must be an absolute path.');
  const profile = testProfile ?? defaultProfile;
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  await app.whenReady();
  const desktopSession = session.fromPartition('persist:suite-' + mode);
  await desktopSession.setProxy({ mode: 'direct' });
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.setDevicePermissionHandler(() => false);
  desktopSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  desktopSession.setSpellCheckerEnabled(false);
  desktopSession.on('will-download', (event) => event.preventDefault());
  desktopSession.protocol.handle('suite', async (request) => {
    const headers = {
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    };
    if (request.method !== 'GET')
      return new Response('Method not allowed', { status: 405, headers });
    const file = resolveAssetPath(request.url, join(__dirname, 'renderer'));
    if (!file || !mime[extname(file)]) return new Response('Not found', { status: 404, headers });
    try {
      const bytes = await readFile(file);
      return new Response(new Uint8Array(bytes), {
        headers: { ...headers, 'Content-Type': mime[extname(file)]! },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('Desktop asset could not be read:', error);
      return new Response('Not found', { status: 404, headers });
    }
  });
  ipcMain.handle('suite:request', async (event, input: unknown) => {
    if (
      !window ||
      window.isDestroyed() ||
      !isTrustedSender({
        senderId: event.sender.id,
        expectedSenderId: window.webContents.id,
        isMainFrame: event.senderFrame === window.webContents.mainFrame,
        url: event.senderFrame?.url ?? '',
      })
    )
      return bridgeError(
        403,
        'DESKTOP_SENDER_DENIED',
        'Only this application’s main window may request business data.',
      );
    return executeRequest(input, { mode, fetcher: desktopSession.fetch.bind(desktopSession) });
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: mode === 'demo' ? 'Business Suite Demo' : 'Business Suite',
              submenu: [{ role: 'quit' as const }],
            },
          ]
        : []),
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ]),
  );
  async function createWindow(): Promise<void> {
    window = new BrowserWindow({
      width: 1280,
      height: 900,
      minWidth: 360,
      minHeight: 600,
      title: mode === 'demo' ? 'Business Suite Demo' : 'Business Suite',
      show: false,
      backgroundColor: '#f6f5f1',
      autoHideMenuBar: true,
      webPreferences: {
        session: desktopSession,
        preload: join(__dirname, 'preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        spellcheck: false,
        additionalArguments: ['--suite-mode=' + mode],
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
    window.webContents.on('will-redirect', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.webContents.on('render-process-gone', (_event, details) =>
      console.error('Desktop renderer exited:', details.reason),
    );
    window.on('closed', () => {
      window = null;
    });
    await window.loadURL(APP_URL);
    window.show();
  }
  app.on('activate', () => {
    if (!window) void createWindow().catch(fail);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  await createWindow();
}

function fail(error: unknown): void {
  console.error('Desktop startup failed:', error);
  dialog.showErrorBox(
    'Business Suite could not start',
    error instanceof Error ? error.message : 'The desktop application could not be opened.',
  );
  app.exit(1);
}
void start().catch(fail);
