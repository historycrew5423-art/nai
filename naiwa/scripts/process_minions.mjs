// 复制《罗密欧与朱丽叶》到新工程，并把两个 Tripo 小怪模型减面、压缩贴图（保留骨骼和蒙皮）
// 用法：node process_minions.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const src = path.join(root, '_交付_给AI改');
const proj = path.join(root, '罗密欧与朱丽叶_缝合版');
const log = [];
if (!fs.existsSync(proj)) { fs.cpSync(src, proj, { recursive: true }); log.push('已复制工程到 ' + proj); }
const outDir = path.join(proj, 'assets', 'models');
const inputs = [
  ['minion-a', 'tripo_convert_ecac69b1-a9ad-47a0-9a46-60675df5073a.glb'],
  ['minion-b', 'tripo_convert_b0433d32-d5de-4910-8e72-32cf9efa224e.glb'],
];
await MeshoptSimplifier.ready;
const io = new NodeIO();
for (const [name, file] of inputs) {
  const doc = await io.read(path.join(root, file));
  const before = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getCount();
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.006, error: 0.004 }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 86 }),
    dedup(),
    prune(),
  );
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const after = prim.getAttribute('POSITION').getCount();
  const tris = prim.getIndices() ? prim.getIndices().getCount() / 3 : after / 3;
  const out = path.join(outDir, name + '.glb');
  await io.write(out, doc);
  log.push(`${name}: 顶点 ${before} → ${after}，三角面 ${Math.round(tris)}，文件 ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
fs.writeFileSync(path.join(here, 'minions.log'), log.join('\n') + '\n');
