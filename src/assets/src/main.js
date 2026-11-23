// AssetDesk - 资产与设备管理器
import { createIcons, Laptop, Monitor, Armchair, Headphones, Mouse, Plus, Search, Filter, Trash2, CheckCircle, Clock, AlertTriangle } from 'lucide';

const STORAGE_KEY = 'assetdesk_records_v1';

const INITIAL_ASSETS = [
  { id: 'AST-1001', name: 'MacBook Pro 16" M3 Max', category: '计算设备', serial: 'C02G99AAQ05D', status: '领用中', assignee: '张伟 (研发部)', location: '总公司 4F-A12', value: 24999, date: '2024-01-15' },
  { id: 'AST-1002', name: 'Dell UltraSharp 32" 4K 显示器', category: '办公外设', serial: 'CN-0N889K-74261', status: '领用中', assignee: '李娜 (设计部)', location: '总公司 3F-C08', value: 6899, date: '2023-11-20' },
  { id: 'AST-1003', name: 'Herman Miller Aeron 人体工学椅', category: '办公家具', serial: 'HM-AER-9921', status: '闲置可用', assignee: '无', location: '行政仓储库 B2', value: 10500, date: '2023-08-10' },
  { id: 'AST-1004', name: 'Sony WH-1000XM5 降噪耳机', category: '音视频设备', serial: 'SN-WH5-38829', status: '维修维护', assignee: '王强 (产品部)', location: 'IT 服务台', value: 2299, date: '2024-02-01' },
  { id: 'AST-1005', name: '罗技 MX Master 3S 商务无线鼠标', category: '办公外设', serial: 'LZ-MX3S-1902', status: '闲置可用', assignee: '无', location: '行政仓储库 B2', value: 699, date: '2024-03-12' }
];

function getAssets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_ASSETS;
  } catch {
    return INITIAL_ASSETS;
  }
}

function saveAssets(assets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

let assets = getAssets();
let filterCategory = 'all';
let filterStatus = 'all';
let searchQuery = '';

function renderApp() {
  const root = document.getElementById('app');
  if (!root) return;

  const totalCount = assets.length;
  const inUseCount = assets.filter(a => a.status === '领用中').length;
  const maintCount = assets.filter(a => a.status === '维修维护').length;
  const totalValue = assets.reduce((sum, a) => sum + (Number(a.value) || 0), 0);

  const filtered = assets.filter(a => {
    const matchCat = filterCategory === 'all' || a.category === filterCategory;
    const matchStatus = filterStatus === 'all' || a.status === filterStatus;
    const q = searchQuery.toLowerCase().trim();
    const matchQuery = !q || a.name.toLowerCase().includes(q) || a.serial.toLowerCase().includes(q) || a.assignee.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
    return matchCat && matchStatus && matchQuery;
  });

  root.innerHTML = `
    <style>
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --text: #0f172a;
        --subtext: #64748b;
        --primary: #0284c7;
        --border: #e2e8f0;
      }
      [data-theme="dark"] {
        --bg: #090d16;
        --card-bg: #131c2e;
        --text: #f8fafc;
        --subtext: #94a3b8;
        --primary: #38bdf8;
        --border: #1e293b;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .navbar {
        height: 64px;
        border-bottom: 1px solid var(--border);
        background: var(--card-bg);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 18px;
        font-weight: 700;
        color: var(--primary);
      }
      .container {
        max-width: 1200px;
        margin: 24px auto;
        padding: 0 20px;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .stat-card {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 20px;
      }
      .stat-title {
        font-size: 13px;
        color: var(--subtext);
        margin-bottom: 6px;
      }
      .stat-num {
        font-size: 24px;
        font-weight: 700;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 16px;
        align-items: center;
        justify-content: space-between;
      }
      .filters {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .input, .select {
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--card-bg);
        color: var(--text);
        font-size: 14px;
        outline: none;
      }
      .btn {
        padding: 8px 16px;
        border-radius: 8px;
        background: var(--primary);
        color: #fff;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: opacity 0.2s;
      }
      .btn:hover { opacity: 0.9; }
      .table-card {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
        text-align: left;
      }
      th {
        padding: 12px 16px;
        background: rgba(0,0,0,0.02);
        border-bottom: 1px solid var(--border);
        color: var(--subtext);
        font-weight: 600;
      }
      td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
      }
      tr:last-child td { border-bottom: none; }
      .badge {
        padding: 3px 8px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 500;
      }
      .badge-inuse { background: #dbeafe; color: #1e40af; }
      .badge-available { background: #dcfce7; color: #166534; }
      .badge-maint { background: #fee2e2; color: #991b1b; }
      .action-btn {
        background: none;
        border: none;
        color: #ef4444;
        cursor: pointer;
        padding: 4px;
      }
      /* Modal */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .modal {
        background: var(--card-bg);
        border-radius: 14px;
        width: 90%;
        max-width: 500px;
        padding: 24px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
      }
      .modal h2 { margin: 0 0 16px; font-size: 18px; }
      .form-group { margin-bottom: 12px; }
      .form-group label { display: block; font-size: 13px; color: var(--subtext); margin-bottom: 4px; }
      .form-group input, .form-group select { width: 100%; box-sizing: border-box; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    </style>

    <nav class="navbar">
      <div class="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        <span>AssetDesk 资产与设备管理器</span>
      </div>
      <button class="btn" id="openAddModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        登记新资产
      </button>
    </nav>

    <div class="container">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-title">资产总数</div>
          <div class="stat-num">${totalCount} 件</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">已领用在用</div>
          <div class="stat-num" style="color: #0284c7;">${inUseCount} 件</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">送修/维护中</div>
          <div class="stat-num" style="color: #ef4444;">${maintCount} 件</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">设备总资产估值</div>
          <div class="stat-num" style="color: #10b981;">¥ ${totalValue.toLocaleString()}</div>
        </div>
      </div>

      <div class="toolbar">
        <div class="filters">
          <input type="text" id="searchInput" class="input" placeholder="搜索设备、SN码、领用人..." value="${searchQuery}" style="width: 220px;" />
          <select id="categorySelect" class="select">
            <option value="all" ${filterCategory === 'all' ? 'selected' : ''}>所有类别</option>
            <option value="计算设备" ${filterCategory === '计算设备' ? 'selected' : ''}>计算设备</option>
            <option value="办公外设" ${filterCategory === '办公外设' ? 'selected' : ''}>办公外设</option>
            <option value="办公家具" ${filterCategory === '办公家具' ? 'selected' : ''}>办公家具</option>
            <option value="音视频设备" ${filterCategory === '音视频设备' ? 'selected' : ''}>音视频设备</option>
          </select>
          <select id="statusSelect" class="select">
            <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>所有状态</option>
            <option value="闲置可用" ${filterStatus === '闲置可用' ? 'selected' : ''}>闲置可用</option>
            <option value="领用中" ${filterStatus === '领用中' ? 'selected' : ''}>领用中</option>
            <option value="维修维护" ${filterStatus === '维修维护' ? 'selected' : ''}>维修维护</option>
          </select>
        </div>
      </div>

      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>资产编号</th>
              <th>设备名称</th>
              <th>分类</th>
              <th>序列号 (SN)</th>
              <th>状态</th>
              <th>当前领用人</th>
              <th>存放位置</th>
              <th>估值</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--subtext);padding:30px;">暂无匹配的设备资产记录</td></tr>' : ''}
            ${filtered.map(a => `
              <tr>
                <td style="font-family:monospace;font-weight:600;">${a.id}</td>
                <td style="font-weight:600;">${a.name}</td>
                <td>${a.category}</td>
                <td style="font-family:monospace;font-size:13px;color:var(--subtext);">${a.serial}</td>
                <td>
                  <span class="badge ${a.status === '领用中' ? 'badge-inuse' : a.status === '闲置可用' ? 'badge-available' : 'badge-maint'}">
                    ${a.status}
                  </span>
                </td>
                <td>${a.assignee}</td>
                <td>${a.location}</td>
                <td>¥ ${Number(a.value).toLocaleString()}</td>
                <td style="text-align: right;">
                  <button class="action-btn" data-del="${a.id}" title="删除记录">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // 事件绑定
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderApp();
  });
  document.getElementById('categorySelect')?.addEventListener('change', (e) => {
    filterCategory = e.target.value;
    renderApp();
  });
  document.getElementById('statusSelect')?.addEventListener('change', (e) => {
    filterStatus = e.target.value;
    renderApp();
  });

  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del');
      if (confirm(`确定要移除资产记录 ${id} 吗？`)) {
        assets = assets.filter(a => a.id !== id);
        saveAssets(assets);
        renderApp();
      }
    });
  });

  document.getElementById('openAddModal')?.addEventListener('click', openModal);
}

function openModal() {
  const modalDiv = document.createElement('div');
  modalDiv.className = 'modal-backdrop';
  modalDiv.id = 'addModal';
  modalDiv.innerHTML = `
    <div class="modal">
      <h2>登记新资产设备</h2>
      <div class="form-group">
        <label>设备名称</label>
        <input type="text" id="mName" class="input" placeholder="例如: ThinkPad X1 Carbon" required />
      </div>
      <div class="form-group">
        <label>设备分类</label>
        <select id="mCat" class="select">
          <option value="计算设备">计算设备</option>
          <option value="办公外设">办公外设</option>
          <option value="办公家具">办公家具</option>
          <option value="音视频设备">音视频设备</option>
        </select>
      </div>
      <div class="form-group">
        <label>序列号 (SN 码)</label>
        <input type="text" id="mSerial" class="input" placeholder="设备背面唯一硬件编号" required />
      </div>
      <div class="form-group">
        <label>资产状态</label>
        <select id="mStatus" class="select">
          <option value="闲置可用">闲置可用</option>
          <option value="领用中">领用中</option>
          <option value="维修维护">维修维护</option>
        </select>
      </div>
      <div class="form-group">
        <label>领用人 / 责任人</label>
        <input type="text" id="mAssignee" class="input" placeholder="如无领用人可填 '无'" value="无" />
      </div>
      <div class="form-group">
        <label>存放位置 / 工位</label>
        <input type="text" id="mLoc" class="input" placeholder="例如: 仓储部 B1 / 5F 研发区" value="行政仓储库 B2" />
      </div>
      <div class="form-group">
        <label>采购金额 / 估值 (元)</label>
        <input type="number" id="mVal" class="input" placeholder="0" value="5000" />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" style="background:#64748b;" id="mCancel">取消</button>
        <button type="button" class="btn" id="mSave">保存登记</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);

  document.getElementById('mCancel').onclick = () => modalDiv.remove();
  document.getElementById('mSave').onclick = () => {
    const name = document.getElementById('mName').value.trim();
    const serial = document.getElementById('mSerial').value.trim();
    if (!name || !serial) {
      alert('请完整填写设备名称与序列号！');
      return;
    }
    const newAsset = {
      id: `AST-${1000 + assets.length + 1}`,
      name,
      category: document.getElementById('mCat').value,
      serial,
      status: document.getElementById('mStatus').value,
      assignee: document.getElementById('mAssignee').value.trim() || '无',
      location: document.getElementById('mLoc').value.trim() || '行政仓储库',
      value: Number(document.getElementById('mVal').value) || 0,
      date: new Date().toISOString().slice(0, 10)
    };
    assets.unshift(newAsset);
    saveAssets(assets);
    modalDiv.remove();
    renderApp();
  };
}

renderApp();
