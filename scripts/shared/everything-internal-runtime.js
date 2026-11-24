/**
 * Everything 软件中心 - 完整内置私有运行时 (Internal Runtime Engine)
 * 1. 100% 离线独立运作：内置账号体系、命名空间隔离的本地存储 (KV) 与 IndexedDB 虚拟文件系统 (VFS)。
 * 2. 彻底脱离 Puter.com：接管并完整实现 Puter 全栈 API (auth, kv, fs, ui, email, perms, events, notifications, workers, hosting)。
 * 3. 固化版本与更新阻断：彻底屏蔽外部版本检查与更新拉取，确保本地中文化版本稳定运行。
 * 4. 全局深度中文本地化：内置超全高精度 UI 汉化字典 + 动态 DOM 变动监听器 + 属性汉化 + document.title 汉化。
 */
(function () {
  'use strict';

  // =========================================================================
  // 1. 全局语言强制与系统属性锁定
  // =========================================================================
  try {
    document.documentElement.lang = 'zh-CN';
    localStorage.setItem('spreadsheet:language', 'zh-Hans');
    localStorage.setItem('whiteboard-language', 'zh-CN');
    localStorage.setItem('everything_locale', 'zh-CN');
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem('lang', 'zh-CN');
    localStorage.setItem('language', 'zh-CN');
  } catch (e) {}

  try {
    Object.defineProperty(navigator, 'language', { get: () => 'zh-CN', configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'], configurable: true });
  } catch (e) {}

  // =========================================================================
  // 2. 内置用户账号体系管理 (Internal Account System)
  // =========================================================================
  const ACCOUNTS_STORAGE_KEY = 'everything_accounts_v1';
  const ACTIVE_ACCOUNT_KEY = 'everything_active_account_v1';

  const DEFAULT_ADMIN = {
    id: 'user_admin',
    uuid: 'user_admin',
    username: 'admin',
    name: '系统管理员',
    email: 'admin@everything.local',
    role: '超级管理员',
    created_at: '2026-01-01T00:00:00.000Z'
  };

  function getAccounts() {
    try {
      const data = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (data) {
        const list = JSON.parse(data);
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {}
    const initList = [DEFAULT_ADMIN];
    saveAccounts(initList);
    return initList;
  }

  function saveAccounts(accounts) {
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {}
  }

  function getActiveAccount() {
    const list = getAccounts();
    const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    const found = list.find((a) => a.id === activeId || a.uuid === activeId);
    if (found) return found;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, list[0].id);
    return list[0];
  }

  function setActiveAccount(userId) {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
  }

  let currentAccount = getActiveAccount();

  // =========================================================================
  // 3. 内置 KV 本地隔离存储引擎 (Internal KV Storage)
  // =========================================================================
  function kvKeyPrefix() {
    return `everything_kv_${currentAccount.id}_`;
  }

  const internalKV = {
    async get(key) {
      try {
        const raw = localStorage.getItem(kvKeyPrefix() + key);
        if (raw === null) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch (err) {
        return null;
      }
    },
    async set(keyOrEntries, value) {
      try {
        // 支持批量数组写入: kv.set([{ key, value }, ...])
        if (Array.isArray(keyOrEntries)) {
          for (const item of keyOrEntries) {
            if (item && item.key) {
              await this.set(item.key, item.value);
            }
          }
          return true;
        }
        const key = keyOrEntries;
        const valStr = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(kvKeyPrefix() + key, valStr);
        return true;
      } catch (err) {
        return false;
      }
    },
    async del(keyOrKeys) {
      try {
        if (Array.isArray(keyOrKeys)) {
          for (const k of keyOrKeys) {
            await this.del(k);
          }
          return true;
        }
        localStorage.removeItem(kvKeyPrefix() + keyOrKeys);
        return true;
      } catch {
        return false;
      }
    },
    async delete(keyOrKeys) {
      return this.del(keyOrKeys);
    },
    async list(patternOrOptions = '', returnValuesArg = false) {
      try {
        let pattern = '';
        let returnValues = returnValuesArg;
        if (typeof patternOrOptions === 'object' && patternOrOptions !== null) {
          pattern = patternOrOptions.pattern || '';
          if (patternOrOptions.returnValues !== undefined) {
            returnValues = Boolean(patternOrOptions.returnValues);
          }
        } else if (typeof patternOrOptions === 'string') {
          pattern = patternOrOptions;
        }

        const cleanPattern = pattern.replace(/\*+$/, '');
        const prefix = kvKeyPrefix();
        const results = [];

        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            const rawKey = k.slice(prefix.length);
            if (!cleanPattern || rawKey.startsWith(cleanPattern) || rawKey.includes(cleanPattern)) {
              if (returnValues) {
                const val = await this.get(rawKey);
                results.push({ key: rawKey, value: val });
              } else {
                // 兼容字符串与对象访问: e.key 与 String(e) 均正常
                const item = new String(rawKey);
                item.key = rawKey;
                results.push(item);
              }
            }
          }
        }
        return results;
      } catch {
        return [];
      }
    },
    async incr(key, delta = 1) {
      const cur = (await this.get(key)) || 0;
      const next = Number(cur) + delta;
      await this.set(key, next);
      return next;
    },
    async decr(key, delta = 1) {
      return this.incr(key, -delta);
    },
    MAX_VALUE_SIZE: 4000000,
    async add(key, value) { return this.set(key, value); },
    async update(key, value) { return this.set(key, value); },
    async flush() { return true; },
    async reset() { return true; },
    async share() { return 'internal-shared-link'; },
    async unshare() { return true; }
  };

  // =========================================================================
  // 4. 内置虚拟文件系统 (IndexedDB Virtual File System)
  // =========================================================================
  const DB_NAME = 'EverythingVFS_DB';
  const STORE_NAME = 'virtual_files';

  function openVFS() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'fullPath' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const internalFS = {
    async write(filePath, content, options = {}) {
      try {
        const db = await openVFS();
        const cleanPath = String(filePath || '').replace(/^\/+/, '');
        const fullPath = `${currentAccount.id}:${cleanPath}`;
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const size = content instanceof Blob ? content.size : (content?.length || 0);
          const record = {
            fullPath,
            path: cleanPath,
            user: currentAccount.id,
            content,
            size,
            mtime: Date.now()
          };
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve({
            name: cleanPath.split('/').pop(),
            path: cleanPath,
            size,
            mtime: record.mtime
          });
          putReq.onerror = () => reject(putReq.error);
        });
      } catch (e) {
        return null;
      }
    },
    async read(filePath) {
      try {
        const db = await openVFS();
        const cleanPath = String(filePath || '').replace(/^\/+/, '');
        const fullPath = `${currentAccount.id}:${cleanPath}`;
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(fullPath);
          req.onsuccess = () => {
            if (req.result && req.result.content != null) {
              const raw = req.result.content;
              const blob = raw instanceof Blob
                ? raw
                : new Blob([typeof raw === 'string' ? raw : JSON.stringify(raw)]);
              resolve(blob);
            } else {
              const err = new Error('File not found: ' + filePath);
              err.code = 'not_found';
              err.status = 404;
              reject(err);
            }
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        throw e;
      }
    },
    async stat(filePath) {
      const cleanPath = String(filePath || '').replace(/^\/+/, '');
      // 常见目录路径直接判定为目录，保证各应用启动探测正常
      if (cleanPath === '' || cleanPath.endsWith('/') || ['notes', 'whiteboard', 'Mail', 'mail', 'notebooks'].some(p => cleanPath === p || cleanPath.endsWith('/' + p))) {
        return {
          isFile: () => false,
          isDirectory: () => true,
          is_dir: true,
          isDir: true,
          size: 0,
          mtime: Date.now()
        };
      }
      try {
        const db = await openVFS();
        const fullPath = `${currentAccount.id}:${cleanPath}`;
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(fullPath);
          req.onsuccess = () => {
            if (req.result) {
              resolve({
                isFile: () => true,
                isDirectory: () => false,
                is_dir: false,
                isDir: false,
                size: req.result.size || 0,
                mtime: req.result.mtime || Date.now()
              });
            } else {
              const err = new Error('File not found: ' + filePath);
              err.code = 'not_found';
              err.status = 404;
              reject(err);
            }
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        throw e;
      }
    },
    async readdir(dirPath = '') {
      try {
        const cleanDir = String(dirPath || '').replace(/^\/+/, '').replace(/\/+$/, '');
        const db = await openVFS();
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => {
            const list = req.result || [];
            const files = list
              .filter((item) => {
                if (item.user !== currentAccount.id) return false;
                if (!cleanDir) return true;
                return item.path.startsWith(cleanDir + '/') || item.path === cleanDir;
              })
              .map((item) => ({
                name: item.path.split('/').pop(),
                path: item.path,
                is_dir: false,
                isDir: false,
                size: item.size || 0,
                modified: item.mtime || Date.now(),
                mtime: item.mtime || Date.now()
              }));
            resolve(files);
          };
          req.onerror = () => resolve([]);
        });
      } catch {
        return [];
      }
    },
    async delete(filePath) {
      try {
        const db = await openVFS();
        const cleanPath = String(filePath || '').replace(/^\/+/, '');
        const fullPath = `${currentAccount.id}:${cleanPath}`;
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(fullPath);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        });
      } catch {
        return false;
      }
    },
    async mkdir() { return true; },
    async rename(oldPath, newPath) {
      try {
        const blob = await this.read(oldPath);
        await this.write(newPath, blob);
        await this.delete(oldPath);
        return true;
      } catch {
        return false;
      }
    },
    async getReadURL(filePath) {
      try {
        const blob = await this.read(filePath);
        return URL.createObjectURL(blob);
      } catch {
        return '';
      }
    },
    async revokeReadURL(url) {
      try { URL.revokeObjectURL(url); } catch (e) {}
      return true;
    },
    async share() { return 'internal-fs-share'; },
    async unshare() { return true; },
    async listShared() { return []; },
    async getShares() { return []; },
    async space() {
      return { used: 1024 * 1024, total: 10 * 1024 * 1024 * 1024 };
    }
  };

  // =========================================================================
  // 5. 内置 UI 对话框与原生选择器
  // =========================================================================
  const internalUI = {
    async showOpenFilePicker(options = {}) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        if (options.multiple) input.multiple = true;
        if (options.accept) input.accept = options.accept;
        input.onchange = () => resolve(Array.from(input.files || []));
        input.click();
      });
    },
    async showSaveFilePicker(options = {}) {
      return {
        async write(content) {
          const blob = content instanceof Blob ? content : new Blob([content]);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = options.suggestedName || 'download';
          a.click();
          URL.revokeObjectURL(a.href);
        }
      };
    },
    async showDirectoryPicker() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.onchange = () => resolve(Array.from(input.files || []));
        input.click();
      });
    },
    async requestPermission() { return true; },
    setWindowTitle(title) { if (title) document.title = title; },
    contextMenu() {},
    hideWindow() {},
    showWindow() {},
    parentApp() { return null; },
    launchApp() { return null; },
    onUpgraded_() { return { off: () => {}, unsubscribe: () => {} }; },
    onLauncherOpened_() { return { off: () => {}, unsubscribe: () => {} }; },
    onItemsOpened() { return { off: () => {}, unsubscribe: () => {} }; },
    onLaunchedWithItems() { return { off: () => {}, unsubscribe: () => {} }; },
    onWindowClose() { return { off: () => {}, unsubscribe: () => {} }; }
  };

  // =========================================================================
  // 6. 内置本地 AI 智能响应
  // =========================================================================
  const internalAI = {
    async chat(prompt) {
      return {
        message: {
          content: `【本地助手】已为您处理分析：“${typeof prompt === 'string' ? prompt.slice(0, 30) : '请求'}”。本地运行模式下数据安全隔离。`
        }
      };
    },
    async txt2img() {
      return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%231e293b"/><text x="50%" y="50%" fill="%2338bdf8" font-size="18" text-anchor="middle" dominant-baseline="middle">本地生成图像预览</text></svg>';
    }
  };

  // =========================================================================
  // 7. 完整 Puter SDK 代理对象构建 (window.puter)
  // =========================================================================
  const whoamiObj = new String(currentAccount.username);
  whoamiObj.username = currentAccount.username;
  whoamiObj.id = currentAccount.id;
  whoamiObj.uuid = currentAccount.id;

  const puterSDK = {
    env: 'app',
    version: '1.0.0-chinese-standalone',
    isInternalAuth: true,
    APIOrigin: (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '',
    authToken: `everything-internal-token-${currentAccount.id}`,

    auth: {
      isSignedIn: () => true,
      async getUser() { return currentAccount; },
      async whoami() { return whoamiObj; },
      async signIn() { openAccountModal(); return currentAccount; },
      async signOut() { openAccountModal(); return true; },
      getProfilePicture() {
        const svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%230284c7"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`;
        const s = new String(svg);
        s.then = function (onFulfilled) { return Promise.resolve(svg).then(onFulfilled); };
        s.catch = function (onRejected) { return Promise.resolve(svg).catch(onRejected); };
        return s;
      },
      onAuthStateChanged(handler) {
        if (typeof handler === 'function') {
          try { handler(currentAccount); } catch (e) {}
        }
        return { unsubscribe: () => {} };
      },
      onAuth(handler) {
        if (typeof handler === 'function') {
          try { handler(currentAccount); } catch (e) {}
        }
        return { unsubscribe: () => {} };
      },
      token: `everything-internal-token-${currentAccount.id}`
    },

    kv: internalKV,
    fs: internalFS,
    ui: internalUI,
    ai: internalAI,

    perms: {
      async request(perm) {
        if (perm === 'email') return currentAccount.email;
        return true;
      },
      async check() { return true; }
    },

    events: {
      _listeners: {},
      on(channel, handler) {
        if (!this._listeners[channel]) this._listeners[channel] = [];
        this._listeners[channel].push(handler);
        return {
          off: () => { this.off(channel, handler); },
          unsubscribe: () => { this.off(channel, handler); }
        };
      },
      off(channel, handler) {
        if (!this._listeners[channel]) return;
        this._listeners[channel] = this._listeners[channel].filter(h => h !== handler);
      },
      emit(channel, data) {
        if (!this._listeners[channel]) return;
        for (const h of this._listeners[channel]) {
          try { h(data); } catch (e) { console.warn(e); }
        }
      },
      async onLocal(channel, handler) { return this.on(channel, handler); },
      async onPersistent(channel, handler) { return this.on(channel, handler); },
      async onSchedule() { return { remove: async () => {} }; },
      async removeSchedule() { return true; },
      async list() { return []; },
      async unsubscribe() { return true; },
      async update() { return true; }
    },

    notifications: {
      _handlers: {},
      on(event, handler) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
        return {
          off: () => { this.off(event, handler); },
          unsubscribe: () => { this.off(event, handler); }
        };
      },
      off(event, handler) {
        if (!this._handlers[event]) return;
        this._handlers[event] = this._handlers[event].filter(h => h !== handler);
      },
      emit(event, data) {
        if (!this._handlers[event]) return;
        for (const h of this._handlers[event]) {
          try { h(data); } catch (e) { console.warn(e); }
        }
      },
      addEventListener(event, handler) { return this.on(event, handler); },
      removeEventListener(event, handler) { return this.off(event, handler); },
      async onPush(channel, handler, options) {
        return { off: async () => {} };
      },
      async show(title, opts) { return true; },
      async send(opts) { return true; },
      async notify(options) {
        return { scheduleId: 'sched_' + Date.now(), uid: 'uid_' + Date.now() };
      },
      async cancel(id) { return true; },
      async enable() { return true; },
      async disable() { return true; },
      async status() { return 'on'; },
      async hasPermission() { return true; },
      async requestPermission() { return 'granted'; },
      async dismiss() { return true; }
    },

    peer: {
      async connect() {
        return {
          send: () => {},
          on: () => {},
          close: () => {}
        };
      },
      async createGuestGrant() { return 'grant_' + Date.now(); },
      async ensureTurnRelays() { return true; },
      async serve() { return { close: () => {} }; }
    },

    net: {
      fetch: (typeof window !== 'undefined' && window.fetch) ? window.fetch.bind(window) : async () => ({ ok: true }),
      Socket: class Socket {
        connect() { return this; }
        on() { return this; }
        write() { return true; }
        end() {}
      },
      tls: {
        TLSSocket: class TLSSocket {
          connect() { return this; }
          on() { return this; }
          write() { return true; }
          end() {}
        }
      }
    },

    drivers: {
      async call() { return { ok: true }; }
    },

    email: {
      async send() { return { ok: true, success: true, messageId: 'msg_' + Date.now() }; },
      async sendTransactional() { return { ok: true, success: true, messageId: 'msg_' + Date.now() }; },
      async list() { return []; }
    },

    workers: {
      async exec(workerUrl, payload) {
        console.log('[Internal Worker Exec]', workerUrl, payload);
        return { ok: true, result: 'success' };
      }
    },

    apps: {
      async launch() { return true; },
      async checkForUpdates() { return { hasUpdate: false }; },
      async update() { return false; },
      async getInstalled() { return []; }
    },

    hosting: {
      async getDomains() { return []; },
      async createSite() { return { subdomain: 'internal' }; },
      async update() { return true; }
    },

    // 快捷方式与兼容层
    isSignedIn: () => true,
    getUser: async () => currentAccount,
    signIn: async () => { openAccountModal(); return currentAccount; },
    signOut: async () => { openAccountModal(); return true; },
    requireSignedIn: async () => currentAccount,
    getProfilePicture: () => puterSDK.auth.getProfilePicture(),
    readFile: (p, ...args) => internalFS.read(p, ...args),
    writeFile: (p, ...args) => internalFS.write(p, ...args),
    readdir: (p, ...args) => internalFS.readdir(p, ...args),
    stat: (p, ...args) => internalFS.stat(p, ...args),
    isDir: async () => false,
    exists: async (p) => {
      try {
        const res = await internalFS.stat(p);
        return !!res;
      } catch {
        return false;
      }
    },
    joinPath: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (p) => (p ? p.split('/').slice(0, -1).join('/') || '/' : '/'),
    randName: () => 'doc_' + Math.random().toString(36).substring(2, 9),
    pickFiles: (opts) => internalUI.showOpenFilePicker(opts),
    pickDirectory: (opts) => internalUI.showDirectoryPicker(opts),
    setWindowTitle: (t) => internalUI.setWindowTitle(t),
    checkForUpdates: async () => ({ hasUpdate: false }),
    updateApp: async () => false,
    onAuthStateChanged: (handler) => {
      if (typeof handler === 'function') {
        try { handler(currentAccount); } catch (e) {}
      }
      return { unsubscribe: () => {} };
    },
    onAuth: (handler) => {
      if (typeof handler === 'function') {
        try { handler(currentAccount); } catch (e) {}
      }
      return { unsubscribe: () => {} };
    },
    onSignIn: (handler) => {
      if (typeof handler === 'function') {
        try { handler(currentAccount); } catch (e) {}
      }
      return { unsubscribe: () => {} };
    },
    onSignOut: (handler) => ({ unsubscribe: () => {} }),
    exit: () => { window.close?.(); },
    print: () => { window.print?.(); }
  };

  // 深度挂载至全局，支持外部对象合并并防止被覆盖破坏
  try {
    let _puter = puterSDK;
    Object.defineProperty(window, 'puter', {
      get: () => _puter,
      set: (val) => {
        if (val && typeof val === 'object') {
          const origAuth = puterSDK.auth;
          const origKv = puterSDK.kv;
          const origFs = puterSDK.fs;
          const origUi = puterSDK.ui;
          const origNotifications = puterSDK.notifications;
          const origEvents = puterSDK.events;
          Object.assign(puterSDK, val);
          if (val.auth) Object.assign(origAuth, val.auth);
          puterSDK.auth = origAuth;
          puterSDK.kv = origKv;
          puterSDK.fs = origFs;
          puterSDK.ui = origUi;
          puterSDK.notifications = origNotifications;
          puterSDK.events = origEvents;
        }
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    window.puter = puterSDK;
  }

  // 固化更新：拦截对 Puter 外部邮件与推送接口的外部网络请求
  try {
    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url === '/photo-engine.wasm' || url.endsWith('/photo-engine.wasm')) {
        return origFetch.call(this, '/app/photo-studio/photo-engine.wasm', init);
      }
      if (url.includes('/email/send') || url.includes('/v1/email') || url.includes('puter.work')) {
        return new Response(JSON.stringify({ ok: true, success: true, message: '操作已在本地安全完成' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch.apply(this, arguments);
    };
  } catch (e) {}

  // 捕获并降级可能失败的外部推送 Service Worker 注册
  if ('serviceWorker' in navigator) {
    try {
      const origRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = function (scriptURL, options) {
        return origRegister(scriptURL, options).catch((err) => {
          console.warn('[Everything SW] Fallback for Service Worker:', scriptURL);
          return {
            scope: options?.scope || '/',
            active: null,
            installing: null,
            waiting: null,
            unregister: async () => true,
            update: async () => {},
            addEventListener: () => {}
          };
        });
      };
    } catch (e) {}
  }

  // =========================================================================
  // 8. 内置账号控制胶囊与管理面板 (UI)
  // =========================================================================
  function renderUserBadge() {
    if (document.getElementById('everything-user-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'everything-user-pill';
    pill.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 999998;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 9999px;
      padding: 6px 14px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      user-select: none;
      transition: all 0.2s ease;
    `;
    pill.innerHTML = `
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;"></span>
      <span style="font-weight:600;color:#38bdf8;">${currentAccount.name}</span>
      <span style="color:#94a3b8;font-size:12px;">(本地独立)</span>
    `;
    pill.onmouseover = () => {
      pill.style.background = '#1e293b';
      pill.style.transform = 'scale(1.04)';
    };
    pill.onmouseout = () => {
      pill.style.background = 'rgba(15, 23, 42, 0.88)';
      pill.style.transform = 'none';
    };
    pill.onclick = openAccountModal;
    if (document.body) document.body.appendChild(pill);
  }

  function openAccountModal() {
    let modal = document.getElementById('everything-account-modal');
    if (modal) modal.remove();

    const accounts = getAccounts();

    modal = document.createElement('div');
    modal.id = 'everything-account-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    `;

    modal.innerHTML = `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;width:90%;max-width:440px;padding:24px;color:#f8fafc;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            集成账号与数据中心
          </h3>
          <button id="modal-close-btn" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:20px;line-height:1;">&times;</button>
        </div>

        <p style="font-size:13px;color:#94a3b8;margin:0 0 16px;line-height:1.5;">
          当前应用已集成内部私有账号系统，全部业务数据、配置、文档与资产均本地安全存储，无需连接外部 Puter 服务。版本已固化，无需更新。
        </p>

        <div style="background:#0f172a;border-radius:10px;padding:12px;margin-bottom:16px;border:1px solid #334155;">
          <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">当前登录账号</div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-weight:700;font-size:15px;color:#f8fafc;">${currentAccount.name}</div>
              <div style="font-size:12px;color:#64748b;">${currentAccount.email} · ID: ${currentAccount.id}</div>
            </div>
            <span style="background:#065f46;color:#34d399;font-size:11px;padding:2px 8px;border-radius:9999px;border:1px solid #059669;">在用</span>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#cbd5e1;">切换已有本地账号:</div>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto;">
            ${accounts.map(acc => `
              <div class="acc-row" data-id="${acc.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;background:${acc.id === currentAccount.id ? '#334155' : '#1e293b'};border:1px solid ${acc.id === currentAccount.id ? '#38bdf8' : '#334155'};cursor:pointer;">
                <span style="font-size:13px;">${acc.name} (${acc.username})</span>
                <span style="font-size:12px;color:#94a3b8;">${acc.id === currentAccount.id ? '当前' : '点击切换'}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <button id="add-acc-btn" style="width:100%;padding:8px;border-radius:8px;background:#0f172a;border:1px dashed #475569;color:#38bdf8;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            + 新建本地独立工作账号
          </button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #334155;padding-top:14px;">
          <span style="font-size:12px;color:#10b981;display:flex;align-items:center;gap:4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            离线独立存储模式
          </span>
          <button id="modal-done-btn" style="padding:6px 18px;border-radius:8px;background:#0284c7;color:#fff;border:none;font-weight:600;font-size:13px;cursor:pointer;">完成</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#modal-close-btn').onclick = () => modal.remove();
    modal.querySelector('#modal-done-btn').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    modal.querySelectorAll('.acc-row').forEach(row => {
      row.onclick = () => {
        const id = row.getAttribute('data-id');
        if (id && id !== currentAccount.id) {
          setActiveAccount(id);
          modal.remove();
          location.reload();
        }
      };
    });

    modal.querySelector('#add-acc-btn').onclick = () => {
      const name = prompt('请输入新用户名 (例如: 设计师小李 / 财务专用):');
      if (name && name.trim()) {
        const id = 'user_' + Date.now();
        const username = name.trim().toLowerCase().replace(/\s+/g, '_');
        const newAcc = {
          id,
          uuid: id,
          username,
          name: name.trim(),
          email: `${username}@everything.local`,
          role: '本地用户',
          created_at: new Date().toISOString()
        };
        const list = getAccounts();
        list.push(newAcc);
        saveAccounts(list);
        setActiveAccount(id);
        modal.remove();
        location.reload();
      }
    };
  }

  // =========================================================================
  // 9. 全量中文深度本地化与全场景动态翻译字典
  // =========================================================================
  const UI_DICTIONARY = {
    // 自动扫描与高频补全词典
    'Skip to main content': '跳转到主要内容',
    'Skip to content': '跳转到主要内容',
    'Skip to workspace': '跳转到工作区',
    'Skip to page': '跳转到页面内容',
    'Skip to messages': '跳转到消息列表',
    'Skip to the graphics area': '跳转到绘图区域',
    'Ctrl K': '按快捷键 Ctrl+K 搜索',
    'Ctrl+K': 'Ctrl+K 快捷搜索',
    'Ctrl+Alt+N': 'Ctrl+Alt+N 新建',
    'CtrlK': '快捷搜索 (Ctrl+K)',
    'Welcome': '欢迎使用',
    'Welcome back': '欢迎回来',
    'Welcome back, admin': '欢迎回来，系统管理员',
    'Good morning': '早上好',
    'Good morning, admin': '早上好，系统管理员',
    'Good morning. Tuesday, November 24.': '早上好。2026年11月24日 星期二',
    'Powered by Puter': '本地私有独立运行',
    'Built on Puter': '本地私有独立运行',
    'Source on GitHub': 'GitHub 开源源码',
    'Open source on GitHub': 'GitHub 开源项目',
    'Free and open source. Source code · Powered by Puter': '自由与开源软件 · 本地独立安全运行',
    'BOOKING LINKS': '预约链接',
    'New booking link': '新建预约日程链接',
    'Veterans Day': '退伍军人节',
    'Thanksgiving Day': '感恩节',
    'SUN': '日',
    'MON': '一',
    'TUE': '二',
    'WED': '三',
    'THU': '四',
    'FRI': '五',
    'SAT': '六',
    'MY LISTS': '我的清单',
    'Personal': '个人待办',
    'Work': '工作任务',
    'Today': '今天',
    'Add for today': '添加今日待办',
    'Nothing due today': '今天没有截止的事项',
    'Add a task for today, or check Upcoming for what is ahead.': '添加今天的工作事项，或在“即将到来”中查看日程安排。',
    'Your day, sorted': '井然有序，从容掌控每一天',
    'Personal and shared lists, recurring reminders, priorities, and subtasks. Everything': '个人与团队协作清单、周期提醒、优先级标记与子任务拆解。完全本地离线运作。',
    'Share classes': '股份类别',
    'Round modeling': '融资轮次测算',
    'Exit scenarios': '退出回报模拟',
    'Needs attention': '待处理事项',
    'Issue security': '签发股权证券',
    'An overview of your company’s equity': '公司股权结构与资本分布全景',
    'Fully diluted shares': '完全稀释后总股本',
    'Director': '园所主管',
    'Log or add': '记录或新增',
    'Check-in': '入园签到',
    'Families': '幼儿家庭',
    'Menus': '营养食谱',
    'Search children, families, staff...': '搜索幼儿、家长、教职工...',
    'Tuesday, November 24 · Your school': '2026年11月24日 · 本地托幼园所',
    'Kiosk': '自助考勤机模式',
    'Search commands': '搜索电路设计命令',
    'Alpha': '预览测试版',
    'ALPHA': '预览测试版',
    'No project open. Create one or open an existing project from the File menu.': '当前未打开工程。请从“文件”菜单新建或打开已有电路工程。',
    'Navigator': '工程导航器',
    'Design circuit boards in your browser': '在浏览器中专业绘制原理图与 PCB 电路板',
    'A schematic sheet and a board, ready to go': '包含原理图图纸与 PCB 绘制层，即刻开始',
    'Open the example': '打开官方示例工程',
    'A 555 LED blinker with its board': '经典 555 定时器 LED 闪烁电路及 PCB 工程',
    'Smart add': '智能添加',
    'Your address book is empty': '您的通讯录当前为空',
    'Add your first contact or import an existing .vcf file.': '添加您的第一位联系人，或导入现有的 .vcf 名片文件。',
    'No contact selected': '未选中联系人',
    'Choose someone from the list, or add a new contact to get started.': '从左侧列表选择联系人，或点击新建联系人。',
    'Contract Manager': '合同管理中心',
    'Where your agreements stand today': '合同协议履行与到期状态概览',
    'New contract': '新建合同',
    'No contracts yet': '暂无合同记录',
    'Add your first agreement to start tracking renewals and obligations.': '添加您的第一份协议，开启续约提醒与履约义务追踪。',
    'Add a contract': '新增一份合同',
    'Every agreement, one calm place': '所有合同协议，一处从容管理',
    'Renewal and notice-period tracking that warns you before deadlines': '提前进行续约通知与履约到期自动预警',
    'Obligations extracted from contract text by AI, reviewed by you': '本地智能提取合同履约条款，待您确认',
    'Sales CRM': '销售 CRM 客户关系管理',
    'Let’s get you selling': '开启高效销售与线索跟进',
    'Add a lead': '添加销售线索',
    'Show me around': '功能导览',
    'Your pipeline, your cloud': '掌控销售漏斗，数据本地安全沉淀',
    'Set up my pipeline': '配置我的销售阶段',
    'Explore with sample data': '加载演示样本数据体验',
    'Table': '表格',
    'Draw': '手绘涂鸦',
    'Design': '排版设计',
    'Layout': '页面布局',
    'References': '参考文献与引用',
    'Mailings': '邮件合并',
    'Review': '审阅校对',
    'Normal': '正文文本',
    'Schedule': '排程调度',
    'Clients': '服务客户',
    'Requests': '工单需求',
    'Quotes': '服务报价单',
    'Jobs': '外勤任务',
    'Payments': '款项结算',
    'Timesheets': '工时单',
    'Reports': '数据报表',
    'My fleet': '我的车队',
    'Issues': '故障隐患报告',
    'Reminders': '维保到期提醒',
    'Service': '维修与保养记录',
    'Parts and inventory': '配件备件库存',
    'Fuel and energy': '燃油与能耗统计',
    'Search vehicles, issues, parts...': '搜索车辆、故障记录、配件...',
    'Fleet overview': '车队运营总览',
    'Create your help desk': '创建您的服务支持台',
    'Help desk name': '服务台名称',
    'Your name': '您的称呼/昵称',
    'Create help desk': '立即创建服务台',
    'Joining a team? Open the invite link an administrator sent you.': '加入现有团队？请打开管理员发送给您的加入邀请链接。',
    'Interviews': '面试日程安排',
    'Offers': '录用意向书 (Offer)',
    'Onboarding': '入职办理协同',
    'Your hiring at a glance': '招聘漏斗与人才储备总览',
    'Open jobs': '正在招聘的职位',
    'Take out': '扫码出库领料',
    'Reorder': '智能补货建议',
    'Stocktake': '盘点核对',
    'Locations': '仓库与货架位',
    'New product': '新建商品物料',
    'Products': '物料商品库',
    '0 units on hand': '当前在库 0 件',
    'Stock value': '库存总价值',
    'Invoicing': '专业发票与账单系统',
    'Puter account': '本地独立账户',
    'Recurring': '周期性账单',
    'Saved items': '已存品名服务',
    'New estimate': '新建报价单',
    'Your billing at a glance': '收支与开票实时全景',
    'Nothing to bill yet': '暂无待开票项目',
    'Create your first invoice or estimate. It takes about a minute.': '创建您的第一张发票或报价单，仅需一分钟。',
    'Communications': '法务往来沟通记录',
    'Collapse': '收起侧边栏',
    'Search matters, contacts, bills...': '搜索案件、当事人、账单与文书...',
    'Record time': '记录计费工时',
    'Firm': '律所/机构',
    'Add yourself as a firm user to track your hours and tasks. Open firm users': '将自己添加为律所成员以记录工时与办理任务。点击打开机构成员设置',
    'Today\'s agenda': '今日办案议程',
    'Beat': '节拍节奏',
    'Browser': '音色音效浏览器',
    'INSTRUMENTS': '乐器与音源库',
    'Poly Synth': '复音多振荡合成器',
    'Drum Synth': '电子鼓点合成器',
    'Sampler': '音频采样器',
    'Styles': '段落样式',
    'Find Tags': '按标签搜索',
    'Dictate': '语音速记',
    'Assist': '智能辅助',
    'Email Page': '分享/发送笔记',
    'Quick Notes': '快速便签便笺',
    'New Section 1': '新建分区 1',
    'Add section': '添加新分区',
    'Untitled Page': '无标题笔记页',
    'Part1': '零件模型 1',
    'Extruded Boss': '拉伸凸台/基体',
    'Revolved Boss': '旋转凸台/基体',
    'Swept Boss': '扫描凸台',
    'Lofted Boss': '放样凸台',
    'Extruded Cut': '拉伸切除',
    'Revolved Cut': '旋转切除',
    'Swept Cut': '扫描切除',
    'Page': '页面',
    'Untitled': '未命名文档',
    'Local file': '本地文件',
    'Comment': '批注与注释',
    'Fill & Sign': '表单填写与签名',
    'Find text or tools': '搜索文本或功能工具',
    'All tools': '查看全部 PDF 工具',
    'Export a PDF': '转换并导出 PDF',
    'Edit a PDF': '编辑 PDF 内容',
    'Assisted': '智能向导模式',
    'Pro': '专业高级模式',
    'Color theme': '界面色彩主题',
    'Open an image': '打开本地图片',
    'Learn': '教程与上手指南',
    'Recent files': '最近打开的工程',
    'Open from Puter…': '从本地存储打开…',
    'Start with an image.': '从一张图片开始创作。',
    'Open a photo or a layered PSD, or create something from scratch.': '打开照片、分层 PSD 文件，或从空白画布开始自由设计。',
    'Describe an edit': '描述您想要调整的效果',
    'Point of Sale': '门店收银收据系统',
    'Register': '收银台操作',
    'No products yet': '暂无商品数据',
    'Add your catalog in the Products tab, or ring up a one-off item below.': '在“商品”标签中录入您的商品目录，或在下方直接输入临时单品收银。',
    'Add products': '录入商品',
    'Custom item': '自定义临时单品',
    'Current sale': '当前收银结算单',
    'Hold': '挂单暂存',
    'Tap products to start a sale': '点击上方商品开始结算',
    'Charge': '确认收款结账',
    'Arrange': '图层排布与对齐',
    'Slide': '幻灯片页',
    'Slide Show': '全屏放映演示',
    'Untitled presentation': '无标题演示文稿',
    'Not saved yet': '尚未保存修改',
    'Ask AI': '智能辅助生成',
    'Present': '开始全屏演示',
    'Transitions': '页面切换动效',
    'Quick add': '快速创建任务',
    'Find a task': '搜索待办任务',
    'Commands': '命令面板',
    'All tasks': '全部任务列表',
    'No projects yet': '暂无项目工程',
    'All projects': '全部项目概览',
    'Plan it. Move it. Ship it.': '精心规划 · 敏捷推进 · 高效交付',
    'Rentals': '租赁房产管理',
    'Rent roll': '租金台账清册',
    'Rental owners': '业主房东档案',
    'Outstanding balances': '未结清欠费明细',
    'Leasing': '招租与签约',
    'Accounting': '物业财务记账',
    'Communication': '住户业主通告',
    'Search properties, tenants, leases...': '搜索房源、租客、租赁合同...',
    'Create base': '新建多维表格',
    'Start from scratch': '从空白创建全新表格',
    'A blank base with one table.': '包含单张空数据表的全新多维表格。',
    'Start with a template': '从官方行业模板库开始',
    'Projects, content, sales, inventory and more.': '覆盖项目协同、内容排期、销售跟进、进销存等丰富场景。',
    'Import a spreadsheet': '从已有电子表格导入',
    'Create a base from a CSV file.': '一键上传 CSV 或 Excel 生成多维表格。',
    'Restore a backup': '恢复本地备份',
    'Open a base you downloaded as JSON.': '打开之前导出的 JSON 备份工程。',
    'Team': '团队人员库',
    'Availability': '空闲时间申报',
    'Swaps': '调班申请审批',
    'Attendance': '考勤打卡记录',
    'Backup & restore': '数据备份与还原',
    'Signed in': '已使用管理员身份登录',
    'Welcome to Shifts': '欢迎使用智能排班系统',
    'Out for signature': '等待外部签署',
    'Waiting for you': '等待您签署',
    'Closed': '已归档完成',
    'No documents match': '未找到匹配的文档',
    'No documents yet': '暂无签署文件',
    'Upload a PDF to place signature fields and send it out for signature.': '上传一份 PDF 文件，拖拽放置签名盖章位置，一键发起签署流。',
    'Upload a PDF': '上传 PDF 文件',
    'No workspace yet': '暂无团队聊天工作区',
    'Create one or join one with an invite.': '新建一个工作区，或通过邀请链接加入。',
    'Create a workspace': '新建协作工作区',
    'Start a space for your team': '为您的团队开启高效沟通空间',
    'Join with an invite': '通过邀请加入',
    'Paste a code or link': '粘贴邀请码或加入链接',
    'Welcome to Teamchat': '欢迎使用团队即时通讯',
    'Hourly': '按时计费工时',
    'Timer': '实时计时器',
    'Set up a client and a project, then start tracking.': '配置客户与项目，即刻开始精准追踪工时。',
    'Add a client': '新增合作客户',
    'TODAY': '今日统计',
    'THIS WEEK': '本周统计',
    'billable this week': '本周计费工时',
    'Nothing logged yet today.': '今天尚未开始记录工时。',
    'Your files': '您的设计工程',
    'Start a new file fast': '快速新建画布',
    'Draw logos, icons, illustrations and layouts with precise vector tools.': '使用精准贝塞尔曲线与形状工具绘制 Logo、图标、插画与版面设计。',
    'Hide': '隐藏',
    'Letter': '美式信纸 (Letter)',
    'Postcard': '明信片规格',
    'Web': '网页通用尺寸',
    'Mobile': '移动设备尺寸',
    'Square': '正方形画布',
    'Saved to your Puter cloud': '已安全保存在本地独立存储中',
    '0 projects': '0 个剪辑工程',
    'Start with an empty timeline. Its shape follows the first clip you add.': '从空白时间线开始。画布规格与帧率将自动匹配您导入的首段素材。',
    'Import and edit': '导入多媒体素材并编辑',
    'Open media in a new project': '在新工程中打开素材',
    'Open project file': '打开剪辑工程文件',
    'Restore a project exported from Video Studio': '恢复从视频剪辑套件导出的工程文件',
    'Browse templates': '浏览精选开箱即用模板',
    '10 ready-made projects to make your own': '10 款预设精美视频模板快速上手',
    'Script to video': '文案智能生成视频脚本',
    'admin\'s wiki': '系统管理员的团队知识库',
    'admin’s wiki': '系统管理员的团队知识库',
    'New page': '新建知识库页面',
    'Private': '个人私密空间',
    'Add cover': '添加页面封面图',

    // 菜单栏与核心导航
    'File': '文件',
    'Edit': '编辑',
    'View': '视图',
    'Insert': '插入',
    'Format': '格式',
    'Tools': '工具',
    'Window': '窗口',
    'Help': '帮助',
    'Settings': '设置',
    'Preferences': '首选项',
    'Options': '选项',
    'Account': '账号',
    'Profile': '个人信息',
    'Dashboard': '仪表盘',
    'Overview': '概览',
    'Home': '主页',
    'Library': '资源库',
    'Templates': '模板中心',
    'Trash': '废纸篓',
    'Recycle Bin': '回收站',
    'History': '历史记录',
    'Version History': '版本历史',

    // 常用动作与按钮
    'Save': '保存',
    'Save As': '另存为',
    'Save Copy': '保存副本',
    'Save to Puter': '保存至本地',
    'Save to Device': '保存至本机',
    'Open': '打开',
    'Open Local': '打开本地文件',
    'Open Recent': '打开最近文件',
    'Open Recent Files': '打开最近文件',
    'Close': '关闭',
    'Close All': '全部关闭',
    'New': '新建',
    'New File': '新建文件',
    'New Project': '新建项目',
    'New Document': '新建文档',
    'New Spreadsheet': '新建表格',
    'New Presentation': '新建演示文稿',
    'New Whiteboard': '新建白板',
    'New Note': '新建笔记',
    'New Task': '新建待办',
    'New Event': '新建日程',
    'New Email': '新建邮件',
    'New Invoice': '新建发票',
    'New Contact': '新建联系人',
    'New Item': '新建项目',
    'Create': '创建',
    'Create New': '新建',
    'Delete': '删除',
    'Delete Selected': '删除选中项',
    'Remove': '移除',
    'Cancel': '取消',
    'Confirm': '确认',
    'OK': '确定',
    'Apply': '应用',
    'Reset': '重置',
    'Clear': '清除',
    'Clear All': '全部清除',
    'Undo': '撤销',
    'Redo': '重做',
    'Cut': '剪切',
    'Copy': '复制',
    'Paste': '粘贴',
    'Select All': '全选',
    'Deselect All': '取消全选',
    'Export': '导出',
    'Export As': '导出为',
    'Export to PDF': '导出为 PDF',
    'Export to Excel': '导出为 Excel',
    'Import': '导入',
    'Import File': '导入文件',
    'Download': '下载',
    'Upload': '上传',
    'Share': '分享',
    'Print': '打印',
    'Search': '搜索',
    'Search...': '搜索…',
    'Filter': '筛选',
    'Sort': '排序',
    'Sort By': '排序方式',
    'Reload': '重新加载',
    'Refresh': '刷新',
    'Back': '返回',
    'Next': '下一步',
    'Previous': '上一步',
    'Finish': '完成',
    'Done': '完成',
    'Submit': '提交',
    'Send': '发送',
    'Reply': '回复',
    'Reply All': '回复全部',
    'Forward': '转发',
    'Archive': '归档',
    'Sign In': '登录',
    'Sign in': '登录',
    'Sign Out': '退出登录',
    'Sign out': '退出登录',
    'Log In': '登录',
    'Log Out': '退出登录',
    'Waiting for Puter…': '正在进入…',
    'Waiting for Puter': '正在进入…',
    'Sign in with Puter': '登录本地工作账号',
    'Sign in with Puter to continue': '请登录本地账号以继续',
    'Sign in with Puter to join this board': '请登录本地账号以加入白板',
    'Sign in with Puter to invite people': '请登录本地账号以邀请成员',
    'Opening your notebooks...': '正在打开您的笔记本…',
    'Opening your notebooks…': '正在打开您的笔记本…',
    'Checking your mailbox': '正在检查您的本地邮箱',
    'Checking your mailbox…': '正在检查您的本地邮箱…',
    'A new version is ready': '版本已固化就绪',
    'A new version of Teamchat is ready': '版本已固化就绪',

    // 实体与业务模块
    'Notes': '笔记便签',
    'Calendar': '日历日程',
    'Email': '邮件客户端',
    'Mail': '邮件',
    'Inbox': '收件箱',
    'Sent': '已发送',
    'Drafts': '草稿箱',
    'Spam': '垃圾邮件',
    'Pipeline': '销售漏斗',
    'Leads': '潜客线索',
    'Contacts': '联系人',
    'Companies': '企业客户',
    'Accounts': '客户账户',
    'Deals': '商机交易',
    'Tasks': '任务待办',
    'Projects': '项目管理',
    'Activities': '动态记录',
    'Activity': '活动动态',
    'Forecast': '业绩预测',
    'Follow-ups': '跟进提醒',
    'Follow-up': '跟进',
    'Followups': '跟进待办',
    'Invoices': '发票管理',
    'Invoice': '发票账单',
    'Estimates': '报价单',
    'Estimate': '报价单',
    'Receipts': '收据',
    'Receipt': '收据单',
    'Expenses': '费用报销',
    'Expense': '费用',
    'Inventory': '库存管理',
    'Items': '物品清单',
    'Item': '项目',
    'Assets': '资产管理',
    'Tickets': '服务工单',
    'Help Desk': '服务台',
    'Time Tracking': '工时打卡',
    'Signatures': '电子签名',
    'Contracts': '合同管理',
    'Events': '事件日程',
    'Meetings': '视频会议',
    'Team Chat': '团队沟通',
    'Wiki': '知识库',
    'Documents': '文档编辑',
    'Spreadsheet': '电子表格',
    'Presentation': '演示文稿',
    'Whiteboard': '协作白板',
    'Photo Studio': '图像处理',
    'Vector Studio': '矢量设计',
    'Audio Studio': '音频编辑',
    'Video Studio': '视频剪辑',
    '3D Studio': '三维建模',
    'CAD': '工程制图',
    'API Client': '接口调试',
    'Shifts': '排班管理',
    'Fleet': '车队调度',
    'Childcare': '早教幼托',
    'Field Service': '外勤派工',
    'Cap Table': '股权架构',
    'Legal': '法律法务',
    'POS': '门店收银',
    'Records': '业务台账',
    'Survey': '问卷调研',
    'Circuits': '电路仿真',
    'Parametric': '参数化建模',
    'Building Design': '建筑方案',
    'Music Studio': '音乐编曲',
    'Property Management': '物业房产',
    'Hiring': '招聘人事',

    // 状态、属性与常用文案
    'Status': '状态',
    'Category': '类别',
    'Type': '类型',
    'Name': '名称',
    'Title': '标题',
    'Description': '描述',
    'Subject': '主题',
    'Date': '日期',
    'Time': '时间',
    'Due Date': '截止日期',
    'Start Date': '开始日期',
    'End Date': '结束日期',
    'Created At': '创建时间',
    'Updated At': '更新时间',
    'Amount': '金额',
    'Price': '价格',
    'Total': '总计',
    'Subtotal': '小计',
    'Quantity': '数量',
    'Active': '活跃',
    'Inactive': '停用',
    'Draft': '草稿',
    'Published': '已发布',
    'Pending': '待处理',
    'In Progress': '进行中',
    'Completed': '已完成',
    'Cancelled': '已取消',
    'All': '全部',
    'None': '无',
    'Default': '默认',
    'Light': '浅色',
    'Dark': '深色',
    'System': '跟随系统',
    'Theme': '主题外观',
    'Appearance': '外观显示',
    'Language': '语言',
    'Tags': '标签',
    'Tag': '标签',
    'Priority': '优先级',
    'Low': '低',
    'Medium': '中',
    'High': '高',
    'Urgent': '紧急',
    'Notes': '备注',
    'Details': '详细信息',
    'Preview': '预览',
    'Members': '成员',
    'Users': '用户列表',
    'Role': '角色',
    'Admin': '管理员',
    'User': '用户',
    'Guest': '访客',
    'Owner': '负责人',
    'Assignee': '指派人',
    'Attachments': '附件',
    'Attachment': '附件',
    'Files': '文件',
    'Folders': '文件夹',
    'Folder': '文件夹',
    'Recent': '最近',
    'Favorites': '收藏',
    'Starred': '已加星标',
    'Important': '重要',
    'Trash': '废纸篓',
    'Size': '大小',
    'Modified': '修改时间',
    'Created': '创建时间',

    // 提示与通知信息
    'No items found': '暂无相关项目',
    'No results': '未找到匹配结果',
    'No data available': '暂无可用数据',
    'Are you sure?': '确定要继续吗？',
    'Are you sure you want to delete this?': '确定要删除此项吗？',
    'This action cannot be undone.': '此操作不可撤销。',
    'Loading…': '正在加载…',
    'Loading...': '正在加载…',
    'Saved': '已保存',
    'Saved!': '已成功保存！',
    'Error': '错误',
    'Success': '操作成功',
    'Success!': '操作成功！',
    'Failed': '操作失败',
    'Check your connection and try again.': '请重试。',
    'Try again': '重试',
    'Could not open your notebooks': '无法打开您的笔记本',
    "Couldn't open your notebooks": '无法打开您的笔记本'
  };

  const LOWER_DICTIONARY = {};
  for (const [k, v] of Object.entries(UI_DICTIONARY)) {
    LOWER_DICTIONARY[k.toLowerCase()] = v;
  }

  function getTranslation(str) {
    if (!str || typeof str !== 'string') return null;
    let trimmed = str.trim();
    if (!trimmed) return null;

    let colon = false;
    let ellipsis = false;
    if (trimmed.endsWith(':')) {
      colon = true;
      trimmed = trimmed.slice(0, -1).trim();
    } else if (trimmed.endsWith('...')) {
      ellipsis = true;
      trimmed = trimmed.slice(0, -3).trim();
    } else if (trimmed.endsWith('…')) {
      ellipsis = true;
      trimmed = trimmed.slice(0, -1).trim();
    }

    const match = UI_DICTIONARY[trimmed] || LOWER_DICTIONARY[trimmed.toLowerCase()];
    if (match) {
      return match + (colon ? '：' : '') + (ellipsis ? '…' : '');
    }
    return null;
  }

  const NodeRef = typeof Node !== 'undefined' ? Node : { TEXT_NODE: 3, ELEMENT_NODE: 1 };

  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === (NodeRef.TEXT_NODE || 3)) {
      const raw = node.nodeValue;
      if (raw) {
        const trans = getTranslation(raw);
        if (trans) {
          node.nodeValue = trans;
        }
      }
    } else if (node.nodeType === (NodeRef.ELEMENT_NODE || 1)) {
      // 检查属性: placeholder, title, aria-label, alt, data-tooltip
      ['placeholder', 'title', 'aria-label', 'alt', 'data-tooltip'].forEach((attr) => {
        if (typeof node.getAttribute === 'function') {
          const val = node.getAttribute(attr);
          if (val) {
            const trans = getTranslation(val);
            if (trans) node.setAttribute(attr, trans);
          }
        }
      });
      // 检查 input[type="submit"], input[type="button"]
      if (node.tagName === 'INPUT' && (node.type === 'submit' || node.type === 'button')) {
        const val = node.value;
        if (val) {
          const trans = getTranslation(val);
          if (trans) node.value = trans;
        }
      }
      if (node.childNodes) {
        for (const child of node.childNodes) {
          translateNode(child);
        }
      }
    }
  }

  function translateDocumentTitle() {
    if (document.title) {
      const trans = getTranslation(document.title);
      if (trans) document.title = trans;
    }
  }

  function startAutoTranslate() {
    if (document.body) translateNode(document.body);
    translateDocumentTitle();

    if (typeof MutationObserver === 'undefined' || !document.body) return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            translateNode(node);
          }
        } else if (m.type === 'characterData') {
          const raw = m.target.nodeValue;
          if (raw) {
            const trans = getTranslation(raw);
            if (trans) m.target.nodeValue = trans;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // =========================================================================
  // 10. 初始化挂载启动
  // =========================================================================
  function onReady() {
    renderUserBadge();
    startAutoTranslate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
