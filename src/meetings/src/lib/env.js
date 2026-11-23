/** Access to the puter.js global, with a friendly failure mode. */

export function hasPuter() {
  return typeof window !== 'undefined' && !!window.puter;
}

export function getPuter() {
  if (!hasPuter()) {
    throw new Error(
      'Puter.js 未加载。请检查您与 https://js.puter.com/v2/ 的连接并刷新页面。'
    );
  }
  return window.puter;
}
