// 压缩游戏里的模型：量化（顶点用 16 位存）+ meshopt 压缩，文件小一半以上，手机打开更快。
// 游戏里 GLTFLoader 要 setMeshoptDecoder（vendor/three/addons/libs/meshopt_decoder.module.js）。
// 用法：node tools/compress-models.mjs 文件1.glb 文件2.glb ...（原地覆盖；kit-nature.glb 还会去掉两棵最重的树）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  if (f.endsWith('kit-nature.glb')) for (const n of doc.getRoot().listNodes()) if (/^CommonTree_[12]$/.test(n.getName())) n.dispose();
  const before = (await io.writeBinary(doc)).byteLength;
  await doc.transform(prune(), dedup(), resample(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const bin = await io.writeBinary(doc);
  await (await import('node:fs/promises')).writeFile(f, bin);
  console.log(f.split('/').pop(), Math.round(before / 1024), '->', Math.round(bin.byteLength / 1024), 'KB');
}
