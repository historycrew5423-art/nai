// 两个新猫模型没有骨骼，而且 Tripo 的贴图展开很碎，直接减面减不下去（卡在 10~20 万面）。
// 这里换个办法：
//   1. 把高模“绕一圈拍下来”：以模型竖直中轴为圆心，把每个三角形按（方位角, 高度）画进一张 1024×1024 的圆柱贴图，
//      同一个位置只留离中轴最远的那层表面（就是从外面看得见的那层），颜色从原贴图里取；
//   2. 只按位置合并顶点（不管原来的 UV 接缝），再减面到几千个三角形；
//   3. 低模的 UV 直接用圆柱坐标，贴上第 1 步拍下来的贴图。
// 用法：node bake_cats.mjs   输出 assets/models/minion-c.glb（香蕉猫）、minion-d.glb（圆滚滚猫）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Document, TextureInfo } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const outDir = path.join(root, '罗密欧与朱丽叶_缝合版', 'assets', 'models');
const inputs = [
  ['minion-c', 'tripo_convert_4cc7c58e-a7c1-40a0-81c5-64675c74e8c2.glb', 8000],
  ['minion-d', 'tripo_convert_bd4887da-c525-46c7-8d63-a4e07144691a.glb', 6500],
];
const W = 1024, H = 1024, S = 4096;
const log = [];
const flush = () => fs.writeFileSync(path.join(here, 'bake_cats.log'), log.join('\n') + '\n');
await MeshoptSimplifier.ready;
const io = new NodeIO();

for (const [name, file, targetTris] of inputs) {
  try {
    const t0 = Date.now();
    const doc = await io.read(path.join(root, file));
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const P = prim.getAttribute('POSITION').getArray(), UV = prim.getAttribute('TEXCOORD_0').getArray(), I = prim.getIndices().getArray();
    const nV = P.length / 3, nT = I.length / 3;
    const img = doc.getRoot().listTextures()[0].getImage();
    const { data: tex, info } = await sharp(img).resize(S, S).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < nV; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hy = y1 - y0;
    log.push(`${name}: 读入 ${nV} 顶点 ${nT} 三角形，贴图 ${info.width}x${info.height}x${ch}，包围盒 x ${x0.toFixed(3)}~${x1.toFixed(3)} y ${y0.toFixed(3)}~${y1.toFixed(3)} z ${z0.toFixed(3)}~${z1.toFixed(3)}（${Date.now() - t0} ms）`); flush();

    // ---- 1. 圆柱贴图 ----
    const depth = new Float32Array(W * H).fill(-1), col = new Uint8Array(W * H * 3);
    const cu = new Float64Array(3), cv = new Float64Array(3), cr = new Float64Array(3), tu = new Float64Array(3), tv = new Float64Array(3);
    const put = (px, py, r, su, sv) => {
      px = ((px % W) + W) % W; if (py < 0 || py >= H) return;
      const k = px + py * W; if (r <= depth[k]) return;
      depth[k] = r;
      const ix = Math.min(S - 1, Math.max(0, Math.floor(su * S))), iy = Math.min(S - 1, Math.max(0, Math.floor(sv * S))), o = (ix + iy * S) * ch;
      col[k * 3] = tex[o]; col[k * 3 + 1] = tex[o + 1]; col[k * 3 + 2] = tex[o + 2];
    };
    for (let t = 0; t < nT; t++) {
      for (let j = 0; j < 3; j++) {
        const i = I[t * 3 + j], x = P[i * 3] - cx, y = P[i * 3 + 1], z = P[i * 3 + 2] - cz;
        cu[j] = (Math.atan2(x, z) / (Math.PI * 2) + 0.5) * W; cv[j] = (y1 - y) / hy * (H - 1); cr[j] = Math.hypot(x, z);
        tu[j] = UV[i * 2]; tv[j] = UV[i * 2 + 1];
      }
      const mn = Math.min(cu[0], cu[1], cu[2]), mx = Math.max(cu[0], cu[1], cu[2]);
      if (mx - mn > W / 2) for (let j = 0; j < 3; j++) if (cu[j] < W / 2) cu[j] += W;
      const ux0 = Math.floor(Math.min(cu[0], cu[1], cu[2])), ux1 = Math.ceil(Math.max(cu[0], cu[1], cu[2]));
      const vy0 = Math.floor(Math.min(cv[0], cv[1], cv[2])), vy1 = Math.ceil(Math.max(cv[0], cv[1], cv[2]));
      const den = (cv[1] - cv[2]) * (cu[0] - cu[2]) + (cu[2] - cu[1]) * (cv[0] - cv[2]);
      let any = false;
      if (Math.abs(den) > 1e-9 && (ux1 - ux0) * (vy1 - vy0) < 4000) {
        for (let py = vy0; py <= vy1; py++) for (let px = ux0; px <= ux1; px++) {
          const qx = px + 0.5, qy = py + 0.5;
          const a = ((cv[1] - cv[2]) * (qx - cu[2]) + (cu[2] - cu[1]) * (qy - cv[2])) / den;
          const b = ((cv[2] - cv[0]) * (qx - cu[2]) + (cu[0] - cu[2]) * (qy - cv[2])) / den;
          const c = 1 - a - b;
          if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
          any = true;
          put(px, py, a * cr[0] + b * cr[1] + c * cr[2], a * tu[0] + b * tu[1] + c * tu[2], a * tv[0] + b * tv[1] + c * tv[2]);
        }
      }
      if (!any) put(Math.floor((cu[0] + cu[1] + cu[2]) / 3), Math.floor((cv[0] + cv[1] + cv[2]) / 3), (cr[0] + cr[1] + cr[2]) / 3, (tu[0] + tu[1] + tu[2]) / 3, (tv[0] + tv[1] + tv[2]) / 3);
    }
    // 没拍到的像素（模型顶上、缝隙）用旁边的颜色补上
    let empty = 0;
    for (let k = 0; k < W * H; k++) if (depth[k] < 0) empty++;
    for (let pass = 0; pass < 24 && empty > 0; pass++) {
      const fill = [];
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const k = px + py * W; if (depth[k] >= 0) continue;
        let r = 0, g = 0, bl = 0, n = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const qx = (px + ox + W) % W, qy = py + oy; if (qy < 0 || qy >= H) continue;
          const q = qx + qy * W; if (depth[q] < 0) continue;
          r += col[q * 3]; g += col[q * 3 + 1]; bl += col[q * 3 + 2]; n++;
        }
        if (n) fill.push([k, r / n, g / n, bl / n]);
      }
      for (const [k, r, g, bl] of fill) { depth[k] = 0; col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = bl; }
      empty -= fill.length;
    }
    const jpg = await sharp(Buffer.from(col), { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
    await sharp(Buffer.from(col), { raw: { width: W, height: H, channels: 3 } }).resize(512, 512).png().toFile(path.join(here, 'shots', `${name}-cyl.png`));
    log.push(`  圆柱贴图完成，剩余空像素 ${empty}，JPEG ${(jpg.length / 1024).toFixed(0)} KB（${Date.now() - t0} ms）`); flush();

    // ---- 2. 只按位置合并顶点，再减面 ----
    const key = new Map(), remap = new Uint32Array(nV), pw = [];
    const q = 1e5;
    for (let i = 0; i < nV; i++) {
      const k = Math.round(P[i * 3] * q) + ',' + Math.round(P[i * 3 + 1] * q) + ',' + Math.round(P[i * 3 + 2] * q);
      let id = key.get(k);
      if (id === undefined) { id = pw.length / 3; key.set(k, id); pw.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
      remap[i] = id;
    }
    const Pw = new Float32Array(pw), iw = [];
    for (let t = 0; t < nT; t++) {
      const a = remap[I[t * 3]], b = remap[I[t * 3 + 1]], c = remap[I[t * 3 + 2]];
      if (a !== b && b !== c && a !== c) iw.push(a, b, c);
    }
    const Iw = new Uint32Array(iw);
    log.push(`  按位置合并后 ${Pw.length / 3} 顶点 ${Iw.length / 3} 三角形`); flush();
    let [Is, err] = MeshoptSimplifier.simplify(Iw, Pw, 3, targetTris * 3, 0.02, ['Prune']);
    log.push(`  减面（拓扑）→ ${Is.length / 3} 三角形，误差 ${err.toFixed(4)}`); flush();
    if (Is.length / 3 > targetTris * 1.6) {
      [Is, err] = MeshoptSimplifier.simplifySloppy(Iw, Pw, 3, null, targetTris * 3, 0.02);
      log.push(`  改用粗略减面 → ${Is.length / 3} 三角形，误差 ${err.toFixed(4)}`); flush();
    }

    // ---- 3. 压实顶点、算圆柱 UV（背后接缝处复制顶点）、算法线 ----
    const map = new Int32Array(Pw.length / 3).fill(-1), pos = [], uvs = [], idx = [];
    const vert = (i) => {
      if (map[i] >= 0) return map[i];
      const x = Pw[i * 3], y = Pw[i * 3 + 1], z = Pw[i * 3 + 2];
      map[i] = pos.length / 3; pos.push(x, y, z);
      uvs.push(Math.atan2(x - cx, z - cz) / (Math.PI * 2) + 0.5, (y1 - y) / hy * (H - 1) / H + 0.5 / H);
      return map[i];
    };
    const dup = new Map();
    for (let t = 0; t < Is.length; t += 3) {
      const tri = [vert(Is[t]), vert(Is[t + 1]), vert(Is[t + 2])];
      const us = tri.map(v => uvs[v * 2]);
      if (Math.max(...us) - Math.min(...us) > 0.5) {
        for (let j = 0; j < 3; j++) if (us[j] < 0.5) {
          const v = tri[j];
          if (!dup.has(v)) { dup.set(v, pos.length / 3); pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); uvs.push(uvs[v * 2] + 1, uvs[v * 2 + 1]); }
          tri[j] = dup.get(v);
        }
      }
      idx.push(tri[0], tri[1], tri[2]);
    }
    const nOut = pos.length / 3, nor = new Float32Array(nOut * 3);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
      const bx = pos[c * 3] - pos[a * 3], by = pos[c * 3 + 1] - pos[a * 3 + 1], bz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
    }
    for (let v = 0; v < nOut; v++) { const l = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1; nor[v * 3] /= l; nor[v * 3 + 1] /= l; nor[v * 3 + 2] /= l; }

    const out = new Document(), buf = out.createBuffer();
    const acc = (type, arr) => out.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const texture = out.createTexture(name).setImage(new Uint8Array(jpg)).setMimeType('image/jpeg');
    const mat = out.createMaterial(name).setBaseColorTexture(texture).setRoughnessFactor(0.9).setMetallicFactor(0);
    mat.getBaseColorTextureInfo().setWrapS(TextureInfo.WrapMode.REPEAT).setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE);
    const p = out.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
      .setAttribute('NORMAL', acc('VEC3', nor))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uvs)))
      .setIndices(acc('SCALAR', nOut < 65536 ? new Uint16Array(idx) : new Uint32Array(idx)));
    const node = out.createNode(name).setMesh(out.createMesh(name).addPrimitive(p));
    out.createScene(name).addChild(node);
    const file2 = path.join(outDir, name + '.glb');
    await io.write(file2, out);
    log.push(`  输出 ${name}.glb：${nOut} 顶点（接缝复制 ${dup.size}）、${idx.length / 3} 三角形、${(fs.statSync(file2).size / 1024).toFixed(0)} KB（共 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  } catch (e) { log.push(`fail ${name} ${e.stack}`); }
  flush();
}
log.push('DONE'); flush();
