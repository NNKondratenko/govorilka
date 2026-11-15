// Phone-size screenshots of the web UI in demo mode (headless Chrome over CDP): docs/screenshots/web-*.png.
//   node scripts/screenshots.js
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8096;
const CDP = 9335;
const OUT = 'docs/screenshots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
const profile = mkdtempSync(join(tmpdir(), 'gv-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let list = [];
for (let i = 0; i < 80 && !list.length; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
  } catch {
    await sleep(250);
  }
}
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const waits = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && waits.has(m.id)) {
    waits.get(m.id)(m);
    waits.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    waits.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log(`  ${OUT}/${name}.png`);
};
// Waits until the bubble shows text matching re (the demo loop runs on real timers).
const until = async (re, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const txt = await ev(`document.getElementById('bubbleText')?.textContent ?? ''`);
    if (re.test(txt)) return txt;
    await sleep(60);
  }
  throw new Error(`timeout waiting for ${re}`);
};

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?demo` });
  await sleep(1200);
  // Some progress so the home screen looks lived-in.
  await ev(`localStorage.setItem('govorilka.v1', JSON.stringify({ progress: { p01: 3, p02: 3, p03: 2, p04: 3, p05: 1, p07: 3, p08: 2, p13: 3 }, settings: {} })); location.reload(); true`);
  await sleep(1200);
  await shot('web-1-home');

  await ev(`document.querySelector('[data-group=sh]').click(); true`);
  await until(/Теперь ты/);
  await sleep(250);
  await shot('web-2-listening');
  await until(/Почти|Хорошо|Ещё раз/);
  await sleep(150);
  await shot('web-3-retry');
  await until(/Молодец|Отлично|Здорово|Умница|Славно|Точно/);
  await sleep(350);
  await shot('web-4-success');

  await ev(`document.getElementById('back').click(); document.getElementById('gear').dispatchEvent(new PointerEvent('pointerdown')); true`);
  await sleep(1500);
  await ev(`document.getElementById('showStress').checked = true; true`);
  await shot('web-5-settings');
} finally {
  ws.close();
  chrome.kill();
  server.kill();
  await sleep(400);
  rmSync(profile, { recursive: true, force: true });
}
