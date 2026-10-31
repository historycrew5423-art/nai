// 处理 Tripo 绑骨加动作后的 GLB（tripo anim retarget 的输出）：只留颜色贴图并缩到 1024 JPG，去掉多余关键帧，删掉没用的数据。骨骼和动作保留。
// 用法：node tools/process-anim.mjs <输入.glb> <输出.glb>   依赖见 tools/process-models.mjs 开头。
// 游戏里还会把走路、跑步动作里髋部的整体偏移挪回原位（src/game.js 的 fixHip）。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('用法：node tools/process-anim.mjs <输入.glb> <输出.glb>'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const m of doc.getRoot().listMaterials()) {
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
  m.setMetallicFactor(0); m.setRoughnessFactor(0.85);
}
await doc.transform(dedup(), resample({ tolerance: 0.0008 }), prune(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 82 }));
await io.write(dst, doc);
console.log('saved', dst);
