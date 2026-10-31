// 把模型里的贴图缩小（角色 1024、怪和道具 512），手机下载更快。屏幕上角色只有一两百像素高，看不出差别。
// 用法：node tools/shrink-textures.mjs 边长 文件1.glb 文件2.glb ...（原地覆盖，保持 meshopt 压缩）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [size, ...files] = process.argv.slice(2);
for (const f of files) {
  const doc = await io.read(f);
  const before = doc.getRoot().listTextures().map((t) => `${t.getSize()?.join('x')}`).join(',');
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [+size, +size], quality: 82 }));
  const bin = await io.writeBinary(doc);
  await writeFile(f, bin);
  console.log(f.split('/').pop(), before, '->', doc.getRoot().listTextures().map((t) => `${t.getSize()?.join('x')}`).join(','), Math.round(bin.byteLength / 1024), 'KB');
}
