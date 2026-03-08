import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'resources', 'icon.ico');

  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    console.warn('[tray] Failed to load icon, using empty');
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Fulcrum');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Launcher',
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  console.log('[tray] System tray created');
  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
    console.log('[tray] System tray destroyed');
  }
}
