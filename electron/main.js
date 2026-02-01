const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

let mainWindow;

// Register custom protocol to handle HLS stream proxying
app.whenReady().then(() => {
  // Intercept proxy-hls requests and use Electron's net module
  protocol.handle('proxy-hls', async (request) => {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response('Missing URL parameter', { status: 400 });
    }
    
    try {
      // Use Electron's net.request to bypass CORS
      return new Promise((resolve, reject) => {
        const netRequest = net.request({
          url: decodeURIComponent(targetUrl),
          method: 'GET',
        });
        
        netRequest.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        netRequest.setHeader('Accept', '*/*');
        
        netRequest.on('response', (response) => {
          const chunks = [];
          const headers = {};
          
          // Copy response headers
          Object.keys(response.headers).forEach(key => {
            headers[key] = Array.isArray(response.headers[key]) 
              ? response.headers[key].join(', ') 
              : response.headers[key];
          });
          
          // Add CORS headers
          headers['access-control-allow-origin'] = '*';
          headers['access-control-allow-methods'] = 'GET, OPTIONS';
          
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = headers['content-type'] || 'application/octet-stream';
            
            // Check if this is an m3u8 playlist
            if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
              // Rewrite URLs in the playlist
              let manifestText = buffer.toString('utf8');
              const baseUrl = new URL(targetUrl);
              const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
              
              manifestText = manifestText.split('\n').map(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return line;
                
                let segmentUrl = trimmed;
                if (!segmentUrl.startsWith('http')) {
                  segmentUrl = basePath + segmentUrl;
                }
                
                return `proxy-hls:?url=${encodeURIComponent(segmentUrl)}`;
              }).join('\n');
              
              resolve(new Response(manifestText, {
                status: response.statusCode,
                headers: { ...headers, 'content-type': 'application/vnd.apple.mpegurl' }
              }));
            } else {
              resolve(new Response(buffer, {
                status: response.statusCode,
                headers
              }));
            }
          });
        });
        
        netRequest.on('error', (error) => {
          console.error('Stream proxy error:', error);
          reject(new Response(`Proxy error: ${error.message}`, { status: 500 }));
        });
        
        netRequest.end();
      });
    } catch (error) {
      console.error('Error in proxy-hls protocol:', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });
});

function createWindow() {
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
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      // Allow iframes to work properly
      webviewTag: true,
      allowRunningInsecureContent: false,
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
      const { shell } = require('electron');
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle window controls
  const { ipcMain, shell } = require('electron');
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

  // Send maximized state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-unmaximized');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Server runs in main process, no need to kill separately
    // Process will exit when all windows are closed
  });

  // Handle external links
  // (already handled above via setWindowOpenHandler)
}

app.whenReady().then(() => {
  // Protocol handler is already registered above
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
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
