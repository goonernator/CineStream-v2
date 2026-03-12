const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const { DiscordSelfPresenceService } = require('./discordSelfPresence');
const isDev = !app.isPackaged;

let mainWindow;
let isCreatingWindow = false;
let discordSelfPresenceTestVariantIndex = 0;
const discordSelfPresence = new DiscordSelfPresenceService({
  onStatusChange: (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('discord-self-presence:status', status);
    }
  },
});

function createWindow() {
  // Prevent multiple window creations
  if (isCreatingWindow || mainWindow) {
    if (mainWindow) {
      mainWindow.focus();
    }
    return;
  }

  isCreatingWindow = true;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#141414',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Set CINESTREAM_DISABLE_WEB_SECURITY=1 to try fixing stream load (e.g. Valhalla); weakens security
      webSecurity: process.env.CINESTREAM_DISABLE_WEB_SECURITY !== '1',
      preload: path.join(__dirname, 'preload.js'),
      // Allow iframes to work properly
      webviewTag: true,
      allowRunningInsecureContent: process.env.CINESTREAM_DISABLE_WEB_SECURITY === '1',
    },
    icon: path.join(__dirname, 'icon.png'),
    frame: false,
    autoHideMenuBar: true,
    show: false,
  });

  // Load the app
  if (isDev) {
    // Development: connect to Next.js dev server
    mainWindow.loadURL('http://localhost:42069');
    mainWindow.webContents.on('did-fail-load', () => {
      // Retry after a short delay if Next.js isn't ready
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:42069');
      }, 1000);
    });
  } else {
    // Production: run Next.js server in a child process
    const fs = require('fs');
    const { spawn } = require('child_process');
    
    // Try multiple possible paths for the standalone server
    const possiblePaths = [
      path.join(process.resourcesPath, 'app', '.next', 'standalone'),
      path.join(__dirname, '..', '.next', 'standalone'),
      path.join(process.resourcesPath, '.next', 'standalone'),
    ];
    
    let serverPath = null;
    let serverJsPath = null;
    
    for (const possiblePath of possiblePaths) {
      const testPath = path.join(possiblePath, 'server.js');
      if (fs.existsSync(testPath)) {
        serverPath = possiblePath;
        serverJsPath = testPath;
        console.log('Found standalone server at:', serverJsPath);
        break;
      }
    }
    
    if (!serverJsPath || !fs.existsSync(serverJsPath)) {
      console.error('Standalone server not found. Tried paths:');
      possiblePaths.forEach(p => console.error('  -', path.join(p, 'server.js')));
      console.error('Resources path:', process.resourcesPath);
      console.error('__dirname:', __dirname);
      mainWindow.loadURL('about:blank');
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;color:#fff;font-family:sans-serif;background:#141414;"><h1>Error: Server Not Found</h1><p>The Next.js server files could not be located.</p><p>Please rebuild the application.</p></div>';
      `);
      return;
    }
    
    // Set environment variables
    process.env.PORT = '42069';
    process.env.NODE_ENV = 'production';
    process.env.HOSTNAME = '127.0.0.1';
    
    // Spawn the Next.js server as a child process
    try {
      console.log('Starting Next.js server from:', serverJsPath);
      const serverProcess = spawn(process.execPath, [serverJsPath], {
        cwd: serverPath,
        env: {
          ...process.env,
          PORT: '42069',
          NODE_ENV: 'production',
          HOSTNAME: '127.0.0.1',
        },
        stdio: 'ignore', // Suppress server output
      });
      
      serverProcess.on('error', (error) => {
        console.error('Failed to spawn Next.js server:', error);
        mainWindow.webContents.executeJavaScript(`
          document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;color:#fff;font-family:sans-serif;background:#141414;"><h1>Error: Server Failed to Start</h1><p>${error.message}</p></div>';
        `);
      });
      
      // Wait for server to start, then load
      let retries = 0;
      const maxRetries = 10;
      const checkServer = () => {
        const http = require('http');
        const req = http.get('http://localhost:42069', (res) => {
          console.log('Server is ready!');
          mainWindow.loadURL('http://localhost:42069');
        });
        
        req.on('error', () => {
          retries++;
          if (retries < maxRetries) {
            setTimeout(checkServer, 500);
          } else {
            console.error('Server failed to start after', maxRetries, 'retries');
            mainWindow.webContents.executeJavaScript(`
              document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;color:#fff;font-family:sans-serif;background:#141414;"><h1>Error: Server Timeout</h1><p>The server took too long to start.</p></div>';
            `);
          }
        });
      };
      
      // Start checking after a short delay
      setTimeout(checkServer, 1000);
      
      // Clean up server process when app quits
      app.on('before-quit', () => {
        discordSelfPresence.shutdown().catch(() => {});
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill();
        }
      });
    } catch (error) {
      console.error('Failed to start Next.js server:', error);
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;color:#fff;font-family:sans-serif;background:#141414;"><h1>Error: Server Exception</h1><p>${error.message}</p></div>';
      `);
    }
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Only open DevTools in development mode
    if (isDev) {
      mainWindow.webContents.openDevTools();
    } else {
      // In production, disable DevTools completely
      mainWindow.webContents.on('devtools-opened', () => {
        mainWindow.webContents.closeDevTools();
      });
    }
  });

  // Remove React DevTools extension if present (runs after page loads)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          try {
            delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
          } catch (e) {}
        }
        // Prevent React DevTools from attaching
        Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
          value: undefined,
          writable: false,
          configurable: false,
        });
      })();
    `).catch(() => {
      // Ignore errors
    });
  });

  // Prevent navigation away from the app (iframe frame-busting protection)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    const currentUrl = new URL(mainWindow.webContents.getURL());
    
    // Only allow navigation within our app (localhost)
    if (parsedUrl.hostname !== currentUrl.hostname && parsedUrl.hostname !== 'localhost') {
      console.log('Blocked navigation to:', url);
      event.preventDefault();
    }
  });

  // Handle new window requests (popups from iframes)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in the default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle window controls
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  // Handle open external URL from renderer
  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  if (!global.__sanctiontvDiscordPresenceHandlersRegistered) {
    global.__sanctiontvDiscordPresenceHandlersRegistered = true;

    ipcMain.on('discord-self-presence:update', (_event, payload) => {
      discordSelfPresence.updatePresence(payload).catch((error) => {
        console.error('[discord-self] update failed:', error);
      });
    });

    ipcMain.on('discord-self-presence:clear', () => {
      discordSelfPresence.clearPresence().catch((error) => {
        console.error('[discord-self] clear failed:', error);
      });
    });

    ipcMain.handle('discord-self-presence:set-enabled', async (_event, enabled) => {
      await discordSelfPresence.setEnabled(!!enabled);
      return { ok: true };
    });

    ipcMain.handle('discord-self-presence:set-config', async (_event, config) => {
      await discordSelfPresence.setConfig(config || {});
      return { ok: true };
    });

    ipcMain.handle('discord-self-presence:save-token', async (_event, token) => {
      return discordSelfPresence.saveToken(token);
    });

    ipcMain.handle('discord-self-presence:delete-token', async () => {
      return discordSelfPresence.deleteToken();
    });

    ipcMain.handle('discord-self-presence:test', async () => {
      const now = Date.now();
      const durationSec = 43 * 60 + 8;
      const currentTimeSec = 8;
      const startTimestampMs = now - currentTimeSec * 1000;
      const endTimestampMs = startTimestampMs + durationSec * 1000;
      const testImageUrl =
        process.env.CINESTREAM_DISCORD_TEST_IMAGE_URL ||
        'https://pbs.twimg.com/media/HCCKSAIWkAA4FNv?format=jpg&name=medium';
      const variants = [
        {
          label: 'watching-paused',
          rawActivityType: 'watching',
          playbackState: 'paused',
          stateTextSmall: 'Paused',
          episodeName: 'Variant 1: watching-paused',
          includeButtons: false,
          timestampMode: 'both',
        },
        {
          label: 'watching-playing',
          rawActivityType: 'watching',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 2: watching-playing',
          includeButtons: false,
          timestampMode: 'both',
        },
        {
          label: 'watching-endonly',
          rawActivityType: 'watching',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 3: watching-endonly',
          includeButtons: false,
          timestampMode: 'endOnly',
        },
        {
          label: 'listening-endonly',
          rawActivityType: 'listening',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 4: listening-endonly',
          includeButtons: false,
          timestampMode: 'endOnly',
        },
        {
          label: 'playing-progress',
          rawActivityType: 'playing',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 5: playing-progress',
          includeButtons: false,
          timestampMode: 'both',
        },
        {
          label: 'playing-buttons',
          rawActivityType: 'playing',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 6: playing-buttons',
          includeButtons: true,
          timestampMode: 'both',
        },
        {
          label: 'url-image-direct',
          rawActivityType: 'watching',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 7: url-image-direct',
          includeButtons: false,
          timestampMode: 'endOnly',
          imageMode: 'direct',
        },
        {
          label: 'url-image-mp',
          rawActivityType: 'watching',
          playbackState: 'playing',
          stateTextSmall: 'Playing',
          episodeName: 'Variant 8: url-image-mp',
          includeButtons: false,
          timestampMode: 'endOnly',
          imageMode: 'mp',
        },
      ];
      const variant = variants[discordSelfPresenceTestVariantIndex % variants.length];
      discordSelfPresenceTestVariantIndex += 1;
      const largeImageValue =
        variant.imageMode === 'direct'
          ? testImageUrl
          : variant.imageMode === 'mp'
            ? `mp:${testImageUrl}`
            : (process.env.CINESTREAM_DISCORD_TEST_LARGE_IMAGE || undefined);
      const useUrlImageMode = variant.imageMode === 'direct' || variant.imageMode === 'mp';

      await discordSelfPresence.updatePresence({
        mediaType: 'tv',
        tmdbId: 0,
        title: 'Youtube',
        discordTitle: 'Youtube',
        episodeName: variant.episodeName,
        season: 4,
        episode: 5,
        playbackState: variant.playbackState,
        currentTimeSec,
        durationSec,
        provider: 'flowcast',
        quality: '720p',
        startTimestampMs: variant.timestampMode === 'endOnly' ? undefined : startTimestampMs,
        endTimestampMs,
        buttons: variant.includeButtons ? [
          { label: 'watch youtube', url: 'https://youtube.com' },
          { label: 'watch youtube shorts', url: 'https://youtube.com/shorts' },
        ] : undefined,
        forceRawRich: true,
        forceImmediate: true,
        rawActivityType: variant.rawActivityType,
        applicationId: useUrlImageMode ? undefined : (process.env.CINESTREAM_DISCORD_TEST_APP_ID || undefined),
        largeImage: largeImageValue,
        largeText: process.env.CINESTREAM_DISCORD_TEST_LARGE_TEXT || 'SanctionTV',
        smallImage: useUrlImageMode ? undefined : (process.env.CINESTREAM_DISCORD_TEST_SMALL_IMAGE || undefined),
        smallText: process.env.CINESTREAM_DISCORD_TEST_SMALL_TEXT || variant.stateTextSmall,
        updatedAtMs: Date.now(),
      });
      return { ok: true, variant: variant.label };
    });

    ipcMain.handle('discord-self-presence:get-status', async () => {
      return discordSelfPresence.getStatus();
    });

    ipcMain.handle('discord-self-presence:get-config', async () => {
      return discordSelfPresence.getConfig();
    });
  }

  // Send maximized state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-unmaximized');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    isCreatingWindow = false;
    // Server runs in main process, no need to kill separately
    // Process will exit when all windows are closed
  });

  isCreatingWindow = false;

  // Handle external links
  // (already handled above via setWindowOpenHandler)
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  discordSelfPresence.shutdown().catch(() => {});
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle navigation for Next.js routes
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.origin !== 'http://localhost:42069' && parsedUrl.origin !== 'file://') {
      navigationEvent.preventDefault();
    }
  });
});
