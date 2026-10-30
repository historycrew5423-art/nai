// 用 Fnko 的图片接口（GPT-image-2.5）出一张参考图，存进 assets/ref/，并在 assets/ref/生成记录.md 里记一笔。
// 规矩：只用每张 0.3 积分（0.03 元）的 GPT-image-2.5；提交前先查目录里的价格，不对就不提交。
// 图片下载后缩到最长边 1600 像素以内（用户要求不能超过 2000 像素）。
// 密钥不进仓库：从环境变量 FNKO_API_KEY 或仓库外的 /projects/sandbox/.tools/fnko/.key 读取。
// 依赖：sharp（见 tools/process-models.mjs 开头的安装方法）。
// 用法：node tools/gen-image.mjs <文件名> <比例，如 1:1 或 16:9> <提示词文件> [参考图网址 ...]
// 参考图要是公开网址（比如仓库里图片的 raw.githubusercontent.com 地址），这个模型最多 10 张。
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const MODEL_NAME = 'GPT-image-2.5';
const MODEL_ID = 'ft-image-v1-186289ba9d3263010c69372f8939dd94';
const ALLOWED_YUAN = 0.03; // = 0.3 积分
const SIZE = '1K';
const BASE = 'https://fanke2026.xyz/v1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [name, ratio = '1:1', promptFile, ...refs] = process.argv.slice(2);
if (!name || !promptFile) { console.error('用法：node tools/gen-image.mjs <文件名> <比例> <提示词文件>'); process.exit(1); }
const prompt = (await readFile(promptFile, 'utf8')).trim();
const key = process.env.FNKO_API_KEY || (await readFile('/projects/sandbox/.tools/fnko/.key', 'utf8')).trim();
const auth = { Authorization: 'Bearer ' + key };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 查价格
const cat = await (await fetch(BASE + '/models', { headers: auth })).json();
const m = (cat.data || []).find((x) => x.id === MODEL_ID);
if (!m) throw new Error('目录里找不到 ' + MODEL_NAME);
const price = (m.resolution_prices && m.resolution_prices[SIZE]) || m.price;
if (!price || price.amount !== ALLOWED_YUAN || price.unit !== 'request') {
  throw new Error(`价格不是每张 ${ALLOWED_YUAN} 元，不提交：${JSON.stringify(price)}`);
}
if (refs.length > (m.max_image_refs ?? 0)) throw new Error(`参考图 ${refs.length} 张，超过上限 ${m.max_image_refs}`);

// 2. 提交（同一个请求编号，超时重试不会重复扣费）
// 编号由文件名、比例、提示词和参考图算出来：进程被打断后原样重跑，用的还是同一个编号，不会再扣一次。
// 想对同样的提示词重新出一张，设环境变量 GEN_TRY=2、3……
const reqId = `nai-${name}-` + createHash('sha1').update([ratio, prompt, ...refs, process.env.GEN_TRY || ''].join('\n')).digest('hex').slice(0, 16);
const body = JSON.stringify({ model: MODEL_ID, prompt, ratio, imageSize: SIZE, image_urls: refs });
let res, data;
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    res = await fetch(BASE + '/images/generations', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'X-Client-Request-Id': reqId },
      body, signal: AbortSignal.timeout(15 * 60 * 1000),
    });
  } catch (e) { console.error('网络问题，用同一编号重试：', String(e)); await sleep(20000); continue; }
  if (res.status === 429 || res.status >= 500) { await sleep(Math.max(20, +res.headers.get('Retry-After') || 20) * 1000); continue; }
  data = await res.json();
  break;
}
if (!data) throw new Error('提交失败，请求编号 ' + reqId);
if (res.status === 202 || (!data.data && (data.status_url || data.job_id))) {
  // 3. 超过同步等待时间，按 status_url 查询
  const statusUrl = data.status_url;
  for (let i = 0; i < 40 && !(data.data && data.data.length); i++) {
    await sleep(30000);
    const r = await fetch(statusUrl, { headers: auth });
    if (r.ok) { const d = await r.json(); if (d.data || d.resultUrls) data = d.data ? d : { ...d, data: d.resultUrls.map((u) => ({ url: u })) }; if (d.status === 'failed') throw new Error(JSON.stringify(d)); }
  }
}
if (!res.ok && res.status !== 202) throw new Error(`HTTP ${res.status} ${JSON.stringify(data)}`);
const url = data.data && data.data[0] && data.data[0].url;
if (!url) throw new Error('没有拿到图片地址：' + JSON.stringify(data).slice(0, 300));

// 4. 下载、缩小、保存
const raw = Buffer.from(await (await fetch(url)).arrayBuffer());
const meta = await sharp(raw).metadata();
const outDir = path.join(root, 'assets/ref');
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, `${name}.png`);
await sharp(raw).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(out);
const meta2 = await sharp(out).metadata();
const cost = data.cost_yuan;
const t = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
await appendFile(path.join(outDir, '生成记录.md'),
  `\n## ${name}.png（${t}）\n- 模型：${MODEL_NAME}，${SIZE}，比例 ${ratio}，花费 ${cost ?? '?'} 元（${cost != null ? (cost * 10).toFixed(1) : '?'} 积分）\n- 原图 ${meta.width}×${meta.height}，保存 ${meta2.width}×${meta2.height}\n${refs.length ? `- 参考图：${refs.map((u) => '<' + u + '>').join('、')}\n` : ''}- 提示词：\n\n> ${prompt.replace(/\n/g, '\n> ')}\n`);
console.log(JSON.stringify({ name, saved: path.relative(root, out), original: `${meta.width}x${meta.height}`, saved_size: `${meta2.width}x${meta2.height}`, cost_yuan: cost, job: data.job_id }));
