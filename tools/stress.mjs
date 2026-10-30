// 压力测试：打开本地的游戏，逐档设定怪的数量，记录帧数、击杀、怪离主角的距离分布，并截图。
// 依赖游戏里的 window.__game 接口（src/main.js 末尾）。沙盒没有显卡，帧数只看趋势。
// 用法：TOOLS=/projects/sandbox/.tools node tools/stress.mjs <仓库根目录> [150,300,500] [截图文件夹]
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const tools = process.env.TOOLS || '/projects/sandbox/.tools';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(tools, 'pw-browsers');
process.env.FONTCONFIG_FILE ||= path.join(tools, 'fonts.conf');
const { chromium } = createRequire(path.join(tools, 'pw') + '/')('playwright');

const root = process.argv[2] || '.';
const levels = (process.argv[3] || '150,300,500,800').split(',').map(Number);
const outDir = process.argv[4] || tools;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('http://local.test/**', async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
  try { await route.fulfill({ body: await readFile(path.join(root, rel)), contentType: types[path.extname(rel)] || 'application/octet-stream' }); }
  catch { await route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://local.test/index.html');
await page.waitForTimeout(3000);
const out = [];
for (const target of levels) {
  await page.evaluate((n) => window.__game.setEnemies(n), target);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, `stress_${target}.png`) });
  out.push({ target, ...(await page.evaluate(() => {
    const g = window.__game, h = new Array(8).fill(0);
    for (let i = 0; i < g.E.n; i++) h[Math.min(7, Math.floor(Math.hypot(g.E.x[i] - g.player.x, g.E.z[i] - g.player.z) / 2))]++;
    return { fps: window.__fps, n: g.E.n, kills: g.kills, fired: g.fired, hits: g.hits, distHist2m: h };
  })) });
}
console.log(JSON.stringify({ out, errors }));
await browser.close();
