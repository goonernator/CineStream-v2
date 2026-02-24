const { app, BrowserWindow, protocol, net, session } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

let mainWindow;
let isCreatingWindow = false;

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
      // IMPORTANT: Do not decode valid URLs here.
      // Some providers include nested percent-encoded query params (e.g. Valhalla `url=`).
      // Decoding the full outer URL corrupts signatures and nested params.
      let decodedTargetUrl = targetUrl;
      try {
        new URL(decodedTargetUrl);
      } catch {
        decodedTargetUrl = decodeURIComponent(targetUrl);
      }
      
      // Check if this is a vidlink URL that needs special headers
      const isVidlink = decodedTargetUrl.includes('storm.vodvidl.site') || 
                       decodedTargetUrl.includes('vodvidl.site') ||
                       targetUrl.includes('storm.vodvidl.site') || 
                       targetUrl.includes('vodvidl.site');
      
      // Extract headers from URL if present (for vidlink)
      let refererUrl = 'https://vidlink.pro/';
      let cleanUrl = decodedTargetUrl;
      let hintedHeaders = {};
      
      if (isVidlink) {
        try {
          const urlObj = new URL(decodedTargetUrl);
          const headersParam = urlObj.searchParams.get('headers');
          if (headersParam) {
            try {
              const parsedHeaders = JSON.parse(headersParam);
              if (parsedHeaders.referer) {
                refererUrl = parsedHeaders.referer;
              }
            } catch {
              try {
                const decoded = decodeURIComponent(headersParam);
                const parsedHeaders = JSON.parse(decoded);
                if (parsedHeaders.referer) {
                  refererUrl = parsedHeaders.referer;
                }
              } catch {
                // Use default if parsing fails
              }
            }
          }
          
          // Remove headers param from URL before fetching
          urlObj.searchParams.delete('headers');
          cleanUrl = urlObj.toString();
        } catch (e) {
          // If URL parsing fails, use original URL
        }
      }

      // Generic upstream header hints (used by Rivestream/Valhalla proxy URLs)
      try {
        const hintedUrlObj = new URL(decodedTargetUrl);
        const headersParam = hintedUrlObj.searchParams.get('headers');
        if (headersParam) {
          try {
            hintedHeaders = JSON.parse(headersParam);
          } catch {
            try {
              hintedHeaders = JSON.parse(decodeURIComponent(headersParam));
            } catch {
              hintedHeaders = {};
            }
          }
        }
      } catch {}

      let isValhallaProxy = false;
      try {
        isValhallaProxy = new URL(cleanUrl).hostname.includes('valhallastream');
      } catch {}
      
      // Use Electron's net.request to bypass CORS
      return new Promise((resolve, reject) => {
        const netRequest = net.request({
          url: cleanUrl,
          method: 'GET',
        });
        
        netRequest.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        netRequest.setHeader('Accept', '*/*');
        netRequest.setHeader('Accept-Encoding', 'identity');
        netRequest.setHeader('Accept-Language', 'en-US,en;q=0.9');

        // Forward range requests for MP4/segment playback.
        // Valhalla proxy often rejects non-range GETs, so default to bytes=0-.
        if (request.headers && (request.headers.Range || request.headers.range)) {
          netRequest.setHeader('Range', request.headers.Range || request.headers.range);
        } else if (isValhallaProxy) {
          netRequest.setHeader('Range', 'bytes=0-');
        }

        // Valhalla expects the outer request to look like Rivestream.
        // Any nested `headers=` query param is for Valhalla to forward to the inner target.
        if (isValhallaProxy) {
          netRequest.setHeader('Referer', 'https://rivestream.org/');
          netRequest.setHeader('Origin', 'https://rivestream.org');
        } else if (hintedHeaders && typeof hintedHeaders === 'object') {
          const hintedReferer = hintedHeaders.Referer || hintedHeaders.referer;
          const hintedOrigin = hintedHeaders.Origin || hintedHeaders.origin;
          if (hintedReferer) netRequest.setHeader('Referer', hintedReferer);
          if (hintedOrigin) netRequest.setHeader('Origin', hintedOrigin);
        }
        
        // Add vidlink headers if needed
        // Electron's net.request blocks Referer headers for cross-origin requests
        // We'll set Origin but skip Referer to avoid ERR_BLOCKED_BY_CLIENT
        // The vidlink server might work with just Origin, or we may need a different approach
        if (isVidlink) {
          netRequest.setHeader('Origin', 'https://vidlink.pro');
          // Don't set Referer - Electron blocks it and causes ERR_BLOCKED_BY_CLIENT
          // The server might accept requests with just Origin header
        }
        
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
            if (cleanUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
              // Rewrite URLs in the playlist
              let manifestText = buffer.toString('utf8');
              
              // Validate that this is actually an m3u8 file
              if (!manifestText.trim().startsWith('#EXTM3U') && !manifestText.includes('#EXT')) {
                console.error('Invalid m3u8 response - does not start with #EXTM3U:', {
                  url: cleanUrl.substring(0, 200),
                  contentType,
                  firstChars: manifestText.substring(0, 200),
                  status: response.statusCode
                });
                reject(new Response(`Invalid m3u8 file: The response does not appear to be a valid HLS playlist. First 500 chars: ${manifestText.substring(0, 500)}`, { status: 500 }));
                return;
              }
              
              const baseUrl = new URL(cleanUrl);
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
    isCreatingWindow = false;
    // Server runs in main process, no need to kill separately
    // Process will exit when all windows are closed
  });

  isCreatingWindow = false;

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
