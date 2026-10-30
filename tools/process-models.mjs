// 把 Tripo 导出的原始模型（assets/models/raw/）处理成手机能用的版本（assets/models/）：
// 只留颜色贴图（去掉法线、金属度粗糙度等，在游戏镜头距离下看不出差别）、减面、贴图缩到 1024 并转成 JPG。
// 依赖装在仓库外：bash tools/setup.sh 之后，再运行
//   mkdir -p /projects/sandbox/.tools/gt && cd /projects/sandbox/.tools/gt && npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
//   ln -sfn /projects/sandbox/.tools/gt/node_modules tools/node_modules   （在仓库根目录运行；node_modules 已被 .gitignore 排除）
// 用法：node tools/process-models.mjs [名字=目标面数 ...]，比如 node tools/process-models.mjs shade=1500
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = { fantasy: 7000, minotaur: 7000, rabbit: 6000, 'wedding-dress': 7000 };
const args = process.argv.slice(2);
const jobs = args.length ? Object.fromEntries(args.map((a) => { const [n, t] = a.split('='); return [n, +t || 1500]; })) : defaults;

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function countTris(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return Math.round(t);
}

for (const [name, target] of Object.entries(jobs)) {
  const src = path.join(root, 'assets/models/raw', `${name}.glb`);
  const dst = path.join(root, 'assets/models', `${name}.glb`);
  const doc = await io.read(src);
  const before = countTris(doc);
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    mat.setMetallicFactor(0).setRoughnessFactor(0.85);
  }
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName !== 'KHR_texture_transform') ext.dispose(); // 体积、透射等扩展手机上用不着
  }
  const ratio = Math.min(1, target / before);
  await doc.transform(
    prune(), dedup(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 82 }),
    prune(),
  );
  await io.write(dst, doc);
  const s0 = (await stat(src)).size, s1 = (await stat(dst)).size;
  console.log(`${name}: ${before} → ${countTris(doc)} 面，${(s0 / 1e6).toFixed(2)} MB → ${(s1 / 1e6).toFixed(2)} MB`);
}
