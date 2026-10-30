// 打开线上网址（GitHub Pages），记录加载时间、帧数、报错和加载的文件，并截图。
// 用法：TOOLS=/projects/sandbox/.tools node tools/live.mjs "https://historycrew5423-art.github.io/nai/?t=时间戳" 输出.png
import { createRequire } from 'node:module';
import path from 'node:path';

const tools = process.env.TOOLS || '/projects/sandbox/.tools';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(tools, 'pw-browsers');
process.env.FONTCONFIG_FILE ||= path.join(tools, 'fonts.conf');
const { chromium } = createRequire(path.join(tools, 'pw') + '/')('playwright');

const [url, out = 'live.png'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } }); // 和 iPhone 横屏差不多大
const errors = [], files = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => files.push([r.url().split('/nai/')[1] || r.url(), r.status()]));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
const loadMs = Date.now() - t0;
await page.waitForTimeout(6000);
await page.screenshot({ path: out });
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent);
console.log(JSON.stringify({ loadMs, fps: await page.evaluate(() => window.__fps), hud, errors, files }));
await browser.close();
