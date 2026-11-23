import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/panels.css';
import './styles/dialogs.css';
import { App } from './app.js';
import { showAlphaNotice } from './ui/alpha.js';

const root = document.getElementById('app');
const app = new App(root);
if (import.meta.env.DEV) window.cad = app;
app
  .start()
  .catch((err) => {
    console.error(err);
    if (app.shell) app.fatal('启动时出现问题。请刷新页面重试。', err);
  })
  .finally(() => showAlphaNotice());

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Hand the worker this build's files so they work offline.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && u.includes('/assets/'));
        reg.active?.postMessage({ type: 'precache', urls });
      })
      .catch(() => {});
  });
}
