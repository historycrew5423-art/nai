// 像真人一样点一遍正式游戏的界面，每到一个画面截一张图：开始画面、开场对话、升级选卡、幕末对话、名画卡、幕间选回答、结束画面。
// 用法：bash tools/play.sh 用的同一套环境：TOOLS=... node tools/ui-shots.mjs <仓库根目录> <截图文件夹> [第一幕秒数，默认 14]
// 用 ?god=1 不会死；鼠标停在画面外，所以是自动瞄准。
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const tools = process.env.TOOLS || '/projects/sandbox/.tools';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(tools, 'pw-browsers');
process.env.FONTCONFIG_FILE ||= path.join(tools, 'fonts.conf');
const { chromium } = createRequire(path.join(tools, 'pw') + '/')('playwright');
const [root = '.', outDir = '/tmp/ui'] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// VW、VH 改画面大小，比如 iPhone 横屏 844×390；TOUCH=1 模拟触屏
const page = await browser.newPage({ viewport: { width: +process.env.VW || 960, height: +process.env.VH || 540 }, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH, deviceScaleFactor: process.env.TOUCH ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('http://local.test/**', async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
  try { await route.fulfill({ body: await readFile(path.join(root, rel)), contentType: types[path.extname(rel)] || 'application/octet-stream' }); }
  catch { await route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://local.test/index.html?god=1&len=' + (process.argv[4] || 14));
const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.png') });
const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hide'); }, sel);
async function waitFor(sel, ms = 90000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await visible(sel)) return true; await page.waitForTimeout(250); } return false; }
async function clickThrough(sel) { for (let k = 0; k < 40 && ((await visible(sel)) || (await visible('#cast'))); k++) { if (await visible('#cast')) { await page.waitForTimeout(500); await page.click('#cast'); } else await page.click(sel, { position: { x: 300, y: 200 } }); await page.waitForTimeout(250); } }
const done = [];
await page.waitForTimeout(5000); await shot('0-cover'); await page.click('#cover'); await page.waitForTimeout(800); await shot('1-title'); done.push('title');
await page.click('#title .story[data-s=rj] .sb button'); await page.waitForTimeout(2500); await shot('2-prologue'); done.push('prologue');
await page.mouse.move(-10, -10);
await clickThrough('#dlg'); await page.waitForTimeout(3000); await shot('3-fight'); done.push('fight');
if (await waitFor('#cards')) { await page.waitForTimeout(600); await shot('4-levelup'); await page.click('#cards button'); done.push('levelup'); }
// 之后的升级都选第一张，直到幕末对话出现
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  if (await visible('#cards')) { await page.click('#cards button'); }
  if (await visible('#dlg')) break;
  await page.waitForTimeout(300);
}
await page.waitForTimeout(1500); await shot('5-act-end'); done.push('act-end');
await clickThrough('#dlg');
if (await waitFor('#art', 8000)) { await page.waitForTimeout(1500); await shot('6-painting'); await page.click('#art button'); done.push('painting'); }
await page.waitForTimeout(800);
for (let k = 0; k < 10 && !(await visible('#cards')); k++) { if (await visible('#dlg')) await page.click('#dlg', { position: { x: 300, y: 200 } }); await page.waitForTimeout(300); }
if (await visible('#cards')) { await page.waitForTimeout(600); await shot('7-choice'); await page.click('#cards button'); done.push('choice'); }
await page.waitForTimeout(500); await clickThrough('#dlg'); await page.waitForTimeout(800); await shot('8-next-act'); done.push('next-act');
console.log(JSON.stringify({ done, phase: await page.evaluate(() => window.__game.phase), errors }));
await browser.close();
