// 把 Quaternius「Fantasy Props MegaKit」（CC0）里挑的几十个 glTF 道具合成一个 GLB：每个道具一个以文件名命名的节点，
// 只留颜色贴图（缩到 512 的 JPG），量化 + meshopt 压缩。游戏里按名字取出来摆进维罗纳的四幕（src/game.js 的 VERONA_KIT）。
// 用法：node tools/build-kit.mjs <glTF 文件夹> <输出.glb> 名字1 名字2 ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, quantize, meshopt, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [dir, out, ...names] = process.argv.slice(2);
const target = new (await import('@gltf-transform/core')).Document();
target.createScene('kit');
for (const n of names) {
  const json = JSON.parse(await readFile(path.join(dir, n + '.gltf'), 'utf8'));
  // 只留颜色贴图：法线和 ORM 贴图没下载，也用不上（游戏里是 Lambert 材质）
  const keep = new Set();
  for (const m of json.materials || []) { delete m.normalTexture; delete m.occlusionTexture; if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.metallicRoughnessTexture; if (m.pbrMetallicRoughness?.baseColorTexture) keep.add(m.pbrMetallicRoughness.baseColorTexture.index); }
  const texMap = {}, newTex = [], newImg = [], imgMap = {};
  (json.textures || []).forEach((t, i) => { if (!keep.has(i)) return; if (!(t.source in imgMap)) { imgMap[t.source] = newImg.length; newImg.push(json.images[t.source]); } texMap[i] = newTex.length; newTex.push({ ...t, source: imgMap[t.source] }); });
  for (const m of json.materials || []) { const b = m.pbrMetallicRoughness?.baseColorTexture; if (b) b.index = texMap[b.index]; }
  json.textures = newTex; json.images = newImg;
  const resources = {};
  for (const b of json.buffers) resources[b.uri] = new Uint8Array(await readFile(path.join(dir, b.uri)));
  for (const im of json.images) resources[im.uri] = new Uint8Array(await readFile(path.join(dir, im.uri)));
  const doc = await io.readJSON({ json, resources });
  const src = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const wrap = doc.createNode(n); for (const c of src.listChildren()) { src.removeChild(c); wrap.addChild(c); } src.addChild(wrap);
  mergeDocuments(target, doc);
}
// 把合进来的几个场景里的节点都挂到同一个场景上
const scenes = target.getRoot().listScenes(), main = scenes[0];
for (const sc of scenes.slice(1)) { for (const c of sc.listChildren()) { sc.removeChild(c); main.addChild(c); } sc.dispose(); }
target.getRoot().setDefaultScene(main);
await target.transform(unpartition(), dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], quality: 82 }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const bin = await io.writeBinary(target);
await writeFile(out, bin);
console.log('saved', out, Math.round(bin.byteLength / 1024), 'KB', main.listChildren().map((n) => n.getName()).join(','));
