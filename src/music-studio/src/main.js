import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/panels.css';
import { App } from './app.js';
import { FEATURES } from './features.js';
import { showAlphaNotice } from './ui/alpha.js';

const app = new App(document.getElementById('app'));
if (import.meta.env.DEV) window.ms = app;
try {
  app.start(FEATURES);
  app.emit('ready');
} catch (err) {
  console.error(err);
  document.getElementById('app').textContent = '音乐工作室无法启动，请刷新页面重试。';
}
showAlphaNotice();
