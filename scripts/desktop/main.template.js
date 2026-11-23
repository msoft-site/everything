const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let server;
const PORT = 38241;

// 启动极简内嵌 HTTP 本地服务器，用于提供静态资源，确保 WASM、Web Worker 及 ESM 模块正常加载
function startLocalServer(callback) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };

  const appDistDir = path.join(__dirname, 'dist');

  server = http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    let targetPath = path.join(appDistDir, reqPath);

    fs.stat(targetPath, (err, stats) => {
      let finalFile = targetPath;
      if (!err && stats.isDirectory()) {
        finalFile = path.join(targetPath, 'index.html');
      }

      fs.stat(finalFile, (statErr, finalStats) => {
        if (statErr || !finalStats.isFile()) {
          finalFile = path.join(appDistDir, 'index.html');
        }

        const ext = path.extname(finalFile).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(finalFile, (readErr, content) => {
          if (readErr) {
            res.writeHead(500);
            res.end('Error reading file: ' + readErr.code);
          } else {
            res.writeHead(200, {
              'Content-Type': contentType,
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Embedder-Policy': 'require-corp'
            });
            res.end(content);
          }
        });
      });
    });
  });

  server.on('error', (e) => {
    console.error('Server error:', e);
  });

  // 使用端口 0 让系统动态分配可用端口，杜绝端口占用冲突
  server.listen(0, '127.0.0.1', () => {
    const assignedPort = server.address().port;
    callback(`http://127.0.0.1:${assignedPort}`);
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 外部链接在默认系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startLocalServer((url) => {
    createWindow(url);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(`http://127.0.0.1:${PORT}`);
    }
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
