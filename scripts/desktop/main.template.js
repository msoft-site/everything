const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let server;
let serverUrl = '';

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
    console.error('Local server error:', e);
  });

  // 使用端口 0 让系统动态分配可用端口，杜绝端口冲突
  server.listen(0, '127.0.0.1', () => {
    const assignedPort = server.address().port;
    serverUrl = `http://127.0.0.1:${assignedPort}`;
    callback(serverUrl);
  });
}

function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${app.name}` },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${app.name}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.name}` }
      ]
    }] : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front', label: '前置全部窗口' }
        ] : [
          { role: 'close', label: '关闭' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Everything',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadURL(url);

  // 正常准备就绪时显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 兜底超时显示，避免白屏或不弹出
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1000);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载异常:', errorCode, errorDescription);
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
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
  setupMenu();
  startLocalServer((url) => {
    createWindow(url);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (serverUrl) {
        createWindow(serverUrl);
      } else {
        startLocalServer((url) => createWindow(url));
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
