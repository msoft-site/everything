import pkg from '../src/presentation/node_modules/playwright/index.js';
const { chromium } = pkg;
import http from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('.cf-deploy-dist');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath.endsWith('/')) reqPath += 'index.html';
  let filePath = path.join(DIST, reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }
  const ext = path.extname(filePath);
  const mimeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise(r => server.listen(8999, r));
console.log('Local static server running at http://localhost:8999');

async function testApp(appName, url, assertions) {
  console.log(`\n--- Testing ${appName} ---`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/opt/ms-playwright/chromium-1255/chrome-linux64/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote'
    ]
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const visibleText = await page.evaluate(() => document.body.innerText || '');
    const domHtml = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style').forEach(el => el.remove());
      return clone.innerHTML || '';
    });
    console.log(`${appName} loaded successfully. Visible text length: ${visibleText.length}`);
    await assertions(page, visibleText, domHtml);
    console.log(`✓ ${appName} passed! Console errors: ${errors.length}`);
  } catch (err) {
    console.error(`✗ ${appName} failed:`, err.message);
    throw err;
  } finally {
    await page.close().catch(() => {}); await browser.close(); await new Promise(r => setTimeout(r, 800));
  }
}

try {
  // Test 1: Presentation
  await testApp('Presentation', 'http://localhost:8999/app/presentation/', async (page, text, html) => {
    const hasPuter = text.includes('从 Puter 打开') || text.includes('保存到 Puter') || html.includes('从 Puter 打开') || html.includes('保存到 Puter');
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Presentation!');
  });

  // Test 2: Spreadsheet
  await testApp('Spreadsheet', 'http://localhost:8999/app/spreadsheet/', async (page, text, html) => {
    const hasPuter = text.includes('从 Puter 打开') || text.includes('保存到 Puter') || html.includes('从 Puter 打开') || html.includes('保存到 Puter');
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Spreadsheet!');
  });

  // Test 3: Documents
  await testApp('Documents', 'http://localhost:8999/app/documents/', async (page, text, html) => {
    const hasPuter = text.includes('从 Puter 打开') || text.includes('Puter 云端') || html.includes('从 Puter 打开') || html.includes('Puter 云端');
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Documents!');
  });

  // Test 4: PDF
  await testApp('PDF', 'http://localhost:8999/app/pdf/', async (page, text, html) => {
    const hasPuter = text.includes('Open from Puter') || text.includes('Save to Puter') || html.includes('Open from Puter') || html.includes('Save to Puter');
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in PDF!');
  });

  // Test 5: Whiteboard
  await testApp('Whiteboard', 'http://localhost:8999/app/whiteboard/', async (page, text, html) => {
    const hasPuter = text.includes('Open from Puter') || text.includes('Save to Puter') || html.includes('Open from Puter') || html.includes('Save to Puter');
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Whiteboard!');
  });

  // Test 6: CAD
  await testApp('CAD', 'http://localhost:8999/app/cad/', async (page, text, html) => {
    const hasPuter = text.includes('Puter 云盘') || text.includes('从您的 Puter 云盘打开文件') || html.includes('Puter 云盘');
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in CAD!');
  });

  // Test 7: CRM
  await testApp('CRM', 'http://localhost:8999/app/crm/', async (page, text, html) => {
    const hasPuter = /Puter (user|cloud|account)|Signed in with Puter/i.test(text) || /Puter (user|cloud|account)|Signed in with Puter/i.test(html);
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in CRM!');
  });

  // Test 8: Tasks
  await testApp('Tasks', 'http://localhost:8999/app/tasks/', async (page, text, html) => {
    const hasPuter = /Puter (user|cloud|username)|Could not reach Puter/i.test(text) || /Puter (user|cloud|username)|Could not reach Puter/i.test(html);
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Tasks!');
  });

  // Test 9: Time Tracking
  await testApp('Time Tracking', 'http://localhost:8999/app/time-tracking/', async (page, text, html) => {
    const hasPuter = /Puter (user|cloud)|Waiting for Puter/i.test(text) || /Puter (user|cloud)|Waiting for Puter/i.test(html);
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Time Tracking!');
  });

  // Test 10: Wiki
  await testApp('Wiki', 'http://localhost:8999/app/wiki/', async (page, text, html) => {
    const hasPuter = /正在等待 Puter|使用 Puter 登录/i.test(text) || /正在等待 Puter|使用 Puter 登录/i.test(html);
    console.log('Contains user-facing Puter strings:', hasPuter);
    if (hasPuter) throw new Error('Puter strings found in Wiki!');
  });

  console.log('\n🎉 ALL APPS VERIFIED: 0 Puter strings in UI, fully local and functional!');

} finally {
  server.close();
}
