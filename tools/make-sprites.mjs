// 把 assets/ref/ 里白底的怪物参考图做成游戏里用的立牌贴图（去掉白底、裁边、缩小），存到 assets/sprites/。
// 怪物的 3D 模型还没有，先用这些图当"纸片怪"：几百只同时画也很省，画面又和参考图一样。
// 依赖：sharp（见 tools/process-models.mjs 开头）。用法：node tools/make-sprites.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = { lute: 256, birdhead: 256, drum: 256, horn: 256, shade: 256, cerberus: 384 };
await mkdir(path.join(root, 'assets/sprites'), { recursive: true });

for (const [name, size] of Object.entries(NAMES)) {
  const { data, info } = await sharp(path.join(root, `assets/ref/${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  // 接近白色、又不带颜色的像素算背景候选
  const cand = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = px(i), mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    cand[i] = mn > 228 && mx - mn < 20 ? 1 : 0;
  }
  // 从四条边往里灌，连到边上的白色才是背景（角色身上的白色不会被去掉）
  const bg = new Uint8Array(W * H), stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !cand[i]) continue;
    bg[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
  }
  // 边缘柔化：挨着背景的像素按"有多白"给半透明，并去掉混进来的白色
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    if (bg[i]) { data[i * 4 + 3] = 0; continue; }
    const nearBg = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]);
    if (nearBg) {
      const [r, g, b] = px(i), mn = Math.min(r, g, b);
      const a = Math.max(0.15, Math.min(1, (255 - mn) / 60));
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, (data[i * 4 + c] - (1 - a) * 255) / a));
      data[i * 4 + 3] = Math.round(a * 255);
    }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const out = path.join(root, `assets/sprites/${name}.png`);
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize({ width: size, height: size, fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toFile(out);
  console.log(name, `${x1 - x0 + 1}x${y1 - y0 + 1} -> ${size}`);
}
