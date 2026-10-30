// 机器人试玩：打开本地的正式游戏（?auto=1：自动跳过对话、自动选第一张卡），按住方向键乱走，
// 每秒记一次状态（第几秒、阶段、等级、血、怪的数量），记下每次升级的时间，按时截图。
// 用法：bash tools/play.sh <仓库根目录> <截图文件夹> [秒数] [额外的网址参数，比如 god=1]
// 依赖游戏里的 window.__game 接口（src/game.js 末尾）。沙盒没有显卡，帧数只看趋势。
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const tools = process.env.TOOLS || '/projects/sandbox/.tools';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(tools, 'pw-browsers');
process.env.FONTCONFIG_FILE ||= path.join(tools, 'fonts.conf');
const { chromium } = createRequire(path.join(tools, 'pw') + '/')('playwright');

const [root = '.', outDir = '/tmp/play', secs = '70', extra = ''] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
await page.goto('http://local.test/index.html?auto=1' + (extra ? '&' + extra : ''));
const log = [], ups = [];
let lastLevel = 1, keys = ['KeyW'], shots = new Set([3, 12, 25, 40, 50, 60]);
for (let s = 0; s < +secs; s++) {
  // 每 2 秒换一个方向乱走
  if (s % 2 === 0 && !process.env.STILL) {   // STILL=1：站着不动（测第四幕守在石台边）
    for (const k of keys) await page.keyboard.up(k);
    const opts = [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], []];
    keys = opts[Math.floor(Math.random() * opts.length)];
    for (const k of keys) await page.keyboard.down(k);
  }
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => { const g = window.__game; return g && { phase: g.phase, act: g.act, calm: Math.round(g.calm), t: +g.actTime.toFixed(1), lv: g.level, hp: Math.round(g.player.hp), n: g.E.n, kills: g.kills, fps: Math.round(window.__fps || 0), skills: g.levels }; });
  if (!st) continue;
  log.push(st);
  if (st.lv > lastLevel) { ups.push({ t: st.t, lv: st.lv }); lastLevel = st.lv; }
  if (shots.has(s)) { await page.screenshot({ path: path.join(outDir, `play_${String(s).padStart(2, '0')}.png`) }); }
}
console.log(JSON.stringify({ ups, final: log.at(-1), log: log.map((l) => `${l.phase} 第${l.act}幕 安稳${l.calm} t${l.t} lv${l.lv} hp${l.hp} n${l.n} k${l.kills} fps${l.fps}`), errors }, null, 1));
await browser.close();
