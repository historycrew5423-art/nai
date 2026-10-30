// 用无界面浏览器打开本地网页并截图。不用起服务器：页面的每个请求都直接从本地文件夹读文件。
// 沙盒没有显卡，WebGL 由 CPU 模拟（SwiftShader），帧数比手机低。
// 一般通过 tools/shot.sh 运行。
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const tools = process.env.TOOLS || '/projects/sandbox/.tools';
const { chromium } = createRequire(path.join(tools, 'pw') + '/')('playwright');

const [root, out, waitMs = '4000', w = '960', h = '540', pagePath = 'index.html'] = process.argv.slice(2);
if (!root || !out) {
  console.error('用法：bash tools/shot.sh <网页文件夹> <输出图片> [等待毫秒] [宽] [高]');
  process.exit(1);
}
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('http://local.test/**', async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(path.resolve(root))) return route.fulfill({ status: 403, body: 'forbidden' });
  try {
    await route.fulfill({ body: await readFile(file), contentType: types[path.extname(rel)] || 'application/octet-stream' });
  } catch {
    await route.fulfill({ status: 404, body: 'not found' });
  }
});
await page.goto('http://local.test/' + pagePath);
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
const fps = await page.evaluate(() => window.__fps ?? null);
console.log(JSON.stringify({ fps, errors }));
await browser.close();
