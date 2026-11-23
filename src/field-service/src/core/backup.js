/** Checks a backup file before a restore replaces anything. */
import { COLLECTIONS } from './store.js';
import { defaultSettings } from './settings.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const NAMED = { team: '团队成员', products: '产品或服务' };
// The ids the app makes, and the only ones a team server stores: a record
// with any other id would be refused when saved, after the restore had
// already replaced everything.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Returns a message describing the first problem, or null if the backup can be restored. */
export function validateBackup(data) {
  if (!isObj(data) || data.format !== 'field-service-backup' || !isObj(data.collections)) return '该文件不是有效的现场服务备份文件。';
  for (const c of COLLECTIONS) {
    const list = data.collections[c];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return `备份中的 ${c} 不是列表格式。`;
    for (const r of list) {
      if (!isObj(r) || (r.id !== undefined && (typeof r.id !== 'string' || !ID_RE.test(r.id)))) return `备份中的 ${c} 包含损坏的记录。`;
      if (NAMED[c] && typeof r.name !== 'string') return `备份中存在缺少名称的${NAMED[c]}。`;
    }
  }
  if (data.settings !== undefined && data.settings !== null) {
    if (!isObj(data.settings)) return '备份中的设置数据已损坏。';
    const defaults = defaultSettings();
    for (const [k, v] of Object.entries(defaults)) {
      const got = data.settings[k];
      if (got === undefined) continue;
      if ((isObj(v) && !isObj(got)) || (Array.isArray(v) && !Array.isArray(got))) return '备份中的设置数据已损坏。';
    }
  }
  return null;
}
