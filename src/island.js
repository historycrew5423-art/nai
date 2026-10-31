// 第二部「漂岛」的海岛，照《漂岛奇航 Drift Isles》的画风做（用户 10-31 给的截图：碧蓝的海、白浪、米黄沙滩、
// 鲜绿草地、一层层的灰石头小山、棕榈树、码头和帆船、柔和的影子）。
// 和维罗纳的四幕不一样：这一幕是一座有边的岛，边就是海（玩家走到海边会被挡住），海上还有几座小岛。
// 用到的模型：Quaternius「Stylized Nature MegaKit」（CC0，树、灌木、花、草、石头，assets/models/kit-nature.glb），
// Tripo 生成的棕榈树、叠石山、石拱门（assets/models/props/）。地面、海、码头、帆船是代码画的。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ISLE_R = 23;
// 海岸线：半径随角度起伏（岛不是正圆）。a = Math.atan2(z, x)
export const coastR = (a) => ISLE_R * (1 + 0.08 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2) + 0.03 * Math.sin(9 * a));
// 到海岸线的距离：岛上是负数，海里是正数
export const coastD = (x, z) => Math.hypot(x, z) - coastR(Math.atan2(z, x));
export const SEA_Y = -0.22;
export const START = { x: 0, z: -12 };   // 开场站在岛的北边，画面上方就是海、码头和帆船

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const n2 = (x, z) => 0.5 * Math.sin(x * 0.31 + z * 0.17) + 0.3 * Math.sin(x * 0.13 - z * 0.41 + 1.3) + 0.2 * Math.sin(x * 0.71 + z * 0.53 + 2.1);
const lin = (hex) => new THREE.Color(hex);   // 十六进制颜色转成线性（顶点色要线性的）

// 小岛：[角度, 离海岸多远, 半径]
const ISLETS = [[-1.1, 9, 5.5], [-2.35, 8, 4.2], [0.55, 9, 5], [2.55, 8, 4.6]].map(([a, off, r]) => {
  const d = coastR(a) + off + r; return { x: Math.cos(a) * d, z: Math.sin(a) * d, r };
});
const isletD = (it, x, z) => { const dx = x - it.x, dz = z - it.z, a = Math.atan2(dz, dx); return Math.hypot(dx, dz) - it.r * (1 + 0.1 * Math.sin(3 * a + it.r) + 0.05 * Math.sin(7 * a)); };

// 岛上的沙子小路（折线）
const DOCK_A = -1.95, DOCK = { x: Math.cos(DOCK_A) * coastR(DOCK_A), z: Math.sin(DOCK_A) * coastR(DOCK_A) };   // 码头在北边海岸上的位置
const PATHS = [
  [[DOCK.x, DOCK.z], [DOCK.x * 0.7 + 0.5, DOCK.z * 0.7], [0, -10], [3, -3], [1.5, 5], [-3, 11], [-4, 15]],
  [[0, -10], [-5, -6]],
  [[3, -3], [10, 2]],
];
function pathDist(x, z) {
  let best = 1e9;
  for (const P of PATHS) for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

// 地面的细节贴图：浅色底上的小斑点和短草叶，乘在顶点色上（沙子上看着像沙粒，草地上像草）
function detailTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) { const v = 200 + rnd() * 55 | 0; g.fillStyle = `rgb(${v},${v},${v})`; const x = rnd() * 256, y = rnd() * 256; g.fillRect(x, y, 2, 2 + rnd() * 4); }
  for (let k = 0; k < 400; k++) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

const C = {
  grass1: lin(0x88d254), grass2: lin(0x66b844), grass3: lin(0xb2e272), sand: lin(0xf2dea4), sand2: lin(0xe8d08e), wet: lin(0xd3b97f), under: lin(0xc9cfa0),
};
// 一块地：网格，按"到海岸的距离"决定高低和颜色（草地 → 沙滩 → 湿沙 → 水下）
function land(cx, cz, half, seg, dist, paths, mat) {
  const g = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz, d = dist(x, z);
    const y = d < -1.6 ? 0 : -0.55 * sstep(-1.6, 1.8, d) - 0.45 * sstep(4, 9, d);   // 远处的海底更深，免得和小岛的地面叠在一起闪
    pos.setXYZ(i, x, y, z); uv.setXY(i, x / 3, z / 3);
    const nz = n2(x * 1.3, z * 1.3), nz2 = n2(x * 0.45 + 7, z * 0.45 - 3);
    c.copy(C.grass1).lerp(C.grass2, sstep(-0.4, 0.6, nz2)).lerp(C.grass3, sstep(0.35, 0.8, nz) * 0.6);
    let sandK = sstep(-5.2 + nz * 1.4 - 0.5, -5.2 + nz * 1.4 + 0.5, d);
    if (paths) { const pd = pathDist(x, z); sandK = Math.max(sandK, 1 - sstep(0.9 + nz * 0.35, 1.5 + nz * 0.35, pd)); }
    const sc = C.sand.clone().lerp(C.sand2, sstep(-0.5, 0.9, n2(x * 2.1, z * 2.1)) * 0.5);
    c.lerp(sc, sandK);
    c.lerp(C.wet, sstep(-1.6, -0.3, d) * 0.85);
    c.lerp(C.under, sstep(-0.1, 1.2, d));
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  return m;
}

// 海：一整块平面，颜色和白浪在着色器里按"到海岸的距离"算（近岸浅碧、远处深蓝），浪花一圈圈往岸上推
function seaMaterial() {
  const uIs = ISLETS.map((it) => new THREE.Vector3(it.x, it.z, it.r));
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uR: { value: ISLE_R }, uIs: { value: uIs } },
    vertexShader: 'varying vec2 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uT, uR; uniform vec3 uIs[4]; varying vec2 vP;
      void main() {
        float a = atan(vP.y, vP.x);
        float d = length(vP) - uR * (1.0 + 0.08 * sin(3.0 * a + 1.0) + 0.05 * sin(5.0 * a + 2.0) + 0.03 * sin(9.0 * a));
        float ang = a;
        for (int i = 0; i < 4; i++) {
          vec2 q = vP - uIs[i].xy; float b = atan(q.y, q.x);
          float di = length(q) - uIs[i].z * (1.0 + 0.1 * sin(3.0 * b + uIs[i].z) + 0.05 * sin(7.0 * b));
          if (di < d) { d = di; ang = b; }
        }
        vec3 shallow = vec3(0.47, 0.90, 0.85), mid = vec3(0.16, 0.74, 0.82), deep = vec3(0.10, 0.50, 0.75);
        vec3 c = mix(shallow, mid, smoothstep(0.0, 5.0, d));
        c = mix(c, deep, smoothstep(4.0, 22.0, d));
        float s = sin(vP.x * 0.9 + uT * 1.1) * sin(vP.y * 1.1 - uT * 0.9) + 0.5 * sin(vP.x * 2.3 - uT * 1.7 + vP.y * 0.7);
        c += vec3(0.07, 0.09, 0.09) * smoothstep(0.95, 1.45, s) * (1.0 - smoothstep(6.0, 20.0, d));
        float wob = 0.22 * sin(uT * 1.5 + ang * 9.0) + 0.12 * sin(uT * 0.9 - ang * 17.0);
        float edge = 1.0 - smoothstep(0.12, 0.5, abs(d - 0.3 - wob));
        float band = fract(d * 0.33 - uT * 0.23 + 0.06 * sin(vP.x * 0.5) + 0.06 * sin(vP.y * 0.6));
        float lines = smoothstep(0.0, 0.05, band) * (1.0 - smoothstep(0.05, 0.16, band)) * (1.0 - smoothstep(1.0, 7.5, d)) * step(0.6, d);
        float foam = max(edge, lines * 0.75);
        c = mix(c, vec3(1.0), foam * 0.92);
        float alpha = mix(0.5, 1.0, smoothstep(0.0, 3.0, d));
        gl_FragColor = vec4(c, max(alpha, foam));
      }`,
  });
}

// 把一个模型摆很多份（每个部件一个实例化网格）。list：[x, y, z, 朝向, 高度, 横向放大]
const M4 = () => new THREE.Matrix4();
// 按 24 米一格分块，每块一个实例化网格：画面和影子都只画看得到的那几块（整岛一起画的话手机要画 60 万个三角形）
function placeKit(group, item, list, { cast = true, recv = false } = {}) {
  if (!item || !list.length) return;
  const { parts, box } = item, h0 = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const base = M4().makeTranslation(-cx, -box.min.y, -cz), m = M4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const cells = {};
  for (const it of list) { const k = `${Math.floor((it[0] + 60) / 24)},${Math.floor((it[2] + 60) / 24)}`; (cells[k] = cells[k] || []).push(it); }
  for (const chunk of Object.values(cells)) for (const p of parts) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, chunk.length);
    chunk.forEach(([x, y, z, yaw, h, wide = 1], i) => {
      const s = h / h0;
      q.setFromAxisAngle(up, yaw);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * wide, s, s * wide)).multiply(base).multiply(p.rel);
      im.setMatrixAt(i, m);
    });
    im.castShadow = cast; im.receiveShadow = recv;
    im.computeBoundingSphere();
    group.add(im);
  }
}

// 码头、帆船、沉船：几何体拼起来
function woodMat(hex) { return new THREE.MeshLambertMaterial({ color: hex }); }
function hullGeo(w, h, l) { return new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(w, h, l); }
function makeBoat() {
  const b = new THREE.Group();
  const hull = new THREE.Mesh(hullGeo(1.0, 0.75, 2.6), woodMat(0x9a5a32)); hull.position.y = 0.45;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 5, 24).scale(1.0, 2.6, 1).rotateX(Math.PI / 2), woodMat(0xe8dcc0)); rim.position.y = 0.46;
  const deck = new THREE.Mesh(new THREE.CircleGeometry(1, 20).scale(0.95, 2.5, 1).rotateX(-Math.PI / 2), woodMat(0xc89a62)); deck.position.y = 0.4;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 6), woodMat(0x6b4426)); mast.position.set(0, 2.5, 0.2);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, 0.3, 0, 4.5, 0.25, 0, 0.9, -2.0], 3)); sg.computeVertexNormals();
  const sail = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0xfaf4e6, side: THREE.DoubleSide }));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.32).translate(0.3, 0, 0).rotateY(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc8343c, side: THREE.DoubleSide })); flag.position.set(0, 4.55, 0.2);
  for (const o of [hull, rim, deck, mast, sail, flag]) { o.castShadow = true; b.add(o); }
  return b;
}

// kit：{ 名字: { parts: [{ geometry, material, rel }], box } }，在 game.js 里从 glb 读出来；缺了哪样就不摆那样
export function makeIsland(kit = {}) {
  const group = new THREE.Group(), obs = [];
  let seed = 97; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const R = (a, b) => a + rnd() * (b - a);
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex() });
  group.add(land(0, 0, 34, 104, coastD, true, groundMat));
  for (const it of ISLETS) group.add(land(it.x, it.z, it.r + 5, 28, (x, z) => isletD(it, x, z), false, groundMat));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), seaMaterial());
  sea.position.y = SEA_Y; sea.renderOrder = -1; group.add(sea);   // 透明的东西里最先画，音符、萤火叠在上面

  // 碰撞：[x, z, 半径]
  const block = (x, z, r) => obs.push({ x, z, r });
  const free = (x, z, r) => {   // 这里能不能摆东西：不在开场的位置、小路、别的障碍物上
    if (Math.hypot(x - START.x, z - START.z) < 4.5 + r) return false;
    for (const o of obs) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 0.3) return false;
    return true;
  };
  const L = {};   // 名字 -> 摆放列表
  const put = (k, x, y, z, yaw, h, wide) => (L[k] = L[k] || []).push([x, y, z, yaw, h, wide]);

  // 一层层的石头小山（Tripo 叠石），山顶种树
  const HILLS = [[-13, 1, 6.2, 1.75, 'CommonTree_3'], [11, 7, 5.0, 1.6, 'palm'], [8.5, -16, 3.6, 1.5, null], [-5, 13.5, 4.2, 1.6, 'CommonTree_4']];
  const hillW = kit.pillar ? (kit.pillar.box.max.x - kit.pillar.box.min.x) / (kit.pillar.box.max.y - kit.pillar.box.min.y) : 0.55;
  for (const [x, z, h, wide, top] of HILLS) {
    put('pillar', x, 0, z, R(0, 6), h, wide);
    block(x, z, h * hillW * wide * 0.5);
    if (top) put(top, x + 0.1, h * 0.94, z, R(0, 6), top === 'palm' ? 3.2 : 3.4);
    for (let k = 0; k < 4; k++) { const a = R(0, 6.28), r = h * hillW * wide * 0.5 + R(0.3, 1.4); put('Fern_1', x + Math.cos(a) * r, 0, z + Math.sin(a) * r, R(0, 6), R(0.7, 1.1)); }
  }
  // 石拱门（普洛斯彼罗住处的废墟），旁边几块小叠石
  put('arch', -6.5, 0, -4.5, 0.5, 4.0); block(-6.5, -4.5, 2.0);
  put('pillar', -9.4, 0, -2.6, 1, 1.4, 1.2); put('pillar', -3.6, 0, -6.6, 2, 1.1, 1.3);
  // 沉船：被暴风雨打上东边沙滩的船
  const wa = 0.2, wr = coastR(wa) - 3.2, wx = Math.cos(wa) * wr, wz = Math.sin(wa) * wr;
  block(wx, wz, 2.3);
  // 码头和帆船（北边）
  const ux = Math.cos(DOCK_A), uz = Math.sin(DOCK_A), px = -uz, pz = ux, dx0 = DOCK.x, dz0 = DOCK.z;
  // 海边一圈棕榈树
  for (let k = 0; k < 20; k++) {
    const a = k / 20 * Math.PI * 2 + R(-0.12, 0.12), r = coastR(a) - R(3, 4.6), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - dx0, z - dz0) < 4 || Math.hypot(x - wx, z - wz) < 4 || !free(x, z, 0.5)) continue;
    put('palm', x, 0, z, R(0, 6.28), R(3.6, 4.8)); block(x, z, 0.45);
  }
  // 岛中间的树
  for (let k = 0, n = 0; k < 200 && n < 8; k++) {
    const x = R(-19, 19), z = R(-19, 19);
    if (coastD(x, z) > -8 || pathDist(x, z) < 2.2 || !free(x, z, 1.4)) continue;
    put(rnd() < 0.5 ? 'CommonTree_3' : 'CommonTree_4', x, 0, z, R(0, 6.28), R(3.3, 4.2)); block(x, z, 0.55); n++;
  }
  // 石头：沙滩上、草地上，还有几块在浅水里
  for (let k = 0, n = 0; k < 200 && n < 9; k++) {
    const a = R(0, 6.28), r = coastR(a) + R(-9, -2.5), x = Math.cos(a) * r, z = Math.sin(a) * r, h = R(0.7, 1.3);
    if (pathDist(x, z) < 1.8 || !free(x, z, h)) continue;
    put(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'][n % 3], x, -0.05, z, R(0, 6.28), h); block(x, z, h * 0.75); n++;
  }
  for (let k = 0; k < 10; k++) { const a = R(0, 6.28), r = coastR(a) + R(1.2, 6), h = R(0.9, 1.8); put(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'][k % 3], Math.cos(a) * r, SEA_Y - h * 0.35, Math.sin(a) * r, R(0, 6.28), h); }
  // 灌木、花、蕨、草、小石子（不挡路）
  const scatter = (n, test, fn) => { for (let k = 0, m = 0; k < n * 20 && m < n; k++) { const x = R(-26, 26), z = R(-26, 26); if (!test(x, z)) continue; fn(x, z); m++; } };
  const onGrass = (x, z) => coastD(x, z) < -6.5 && pathDist(x, z) > 1.6 && Math.hypot(x - START.x, z - START.z) > 2.5;
  const clear = (x, z, r) => { for (const o of obs) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false; return true; };
  scatter(16, (x, z) => onGrass(x, z) && clear(x, z, 0.4), (x, z) => put('Fern_1', x, 0, z, R(0, 6.28), R(0.6, 0.95)));
  scatter(36, (x, z) => onGrass(x, z) && clear(x, z, 0.2), (x, z) => put(rnd() < 0.75 ? 'Flower_3_Group' : 'Flower_4_Group', x, 0, z, R(0, 6.28), R(0.45, 0.7)));
  scatter(22, (x, z) => onGrass(x, z) && clear(x, z, 0.3), (x, z) => put('Fern_1', x, 0, z, R(0, 6.28), R(0.4, 0.6)));
  scatter(16, (x, z) => onGrass(x, z) && clear(x, z, 0.3), (x, z) => put('Plant_1', x, 0, z, R(0, 6.28), R(0.45, 0.65)));
  scatter(170, (x, z) => coastD(x, z) < -5.5 && pathDist(x, z) > 1.2 && clear(x, z, 0.1), (x, z) => put('Grass_Common_Short', x, 0, z, R(0, 6.28), R(0.32, 0.55)));
  scatter(34, (x, z) => { const d = coastD(x, z); return d > -5 && d < -1.2; }, (x, z) => put(rnd() < 0.5 ? 'Pebble_Round_1' : 'Pebble_Round_3', x, -0.03, z, R(0, 6.28), R(0.08, 0.16)));
  // 小岛上：一座叠石、两棵棕榈、几丛灌木
  ISLETS.forEach((it, i) => {
    put('pillar', it.x + it.r * 0.15, 0, it.z - it.r * 0.1, i, it.r * 0.75, 1.5);
    for (let k = 0; k < 2; k++) { const a = i * 2 + k * 2.6, r = it.r * 0.55; put('palm', it.x + Math.cos(a) * r, 0, it.z + Math.sin(a) * r, R(0, 6.28), R(3.2, 4.2)); }
    for (let k = 0; k < 2; k++) { const a = R(0, 6.28), r = it.r * R(0.2, 0.6); put('Fern_1', it.x + Math.cos(a) * r, 0, it.z + Math.sin(a) * r, R(0, 6.28), R(0.6, 0.9)); }
  });
  const NO_CAST = new Set(['Bush_Common', 'Bush_Common_Flowers', 'Grass_Common_Short', 'Flower_3_Group', 'Flower_4_Group', 'Pebble_Round_1', 'Pebble_Round_3', 'Fern_1', 'Plant_1']);
  for (const [k, list] of Object.entries(L)) placeKit(group, kit[k], list, { cast: !NO_CAST.has(k), recv: k === 'pillar' || k === 'arch' });

  // 码头：从沙滩伸进海里的木板路
  const planks = [], posts = [];
  for (let s = -2.5; s < 10; s += 0.45) {
    const g = new THREE.BoxGeometry(2.3, 0.1, 0.36); g.rotateY(Math.atan2(-ux, -uz));
    g.translate(dx0 + ux * s + (rnd() - 0.5) * 0.04, 0.16, dz0 + uz * s); planks.push(g);
  }
  for (let s = -1; s < 10.5; s += 2.2) for (const side of [-1.2, 1.2]) {
    const g = new THREE.CylinderGeometry(0.11, 0.13, 1.6, 7); g.translate(dx0 + ux * s + px * side, -0.5, dz0 + uz * s + pz * side); posts.push(g);
  }
  const dock = new THREE.Mesh(mergeGeometries(planks), woodMat(0xc08a58)); dock.castShadow = dock.receiveShadow = true; group.add(dock);
  const dockPosts = new THREE.Mesh(mergeGeometries(posts), woodMat(0x7a5232)); dockPosts.castShadow = true; group.add(dockPosts);
  const boat = makeBoat();
  boat.position.set(dx0 + ux * 10 + px * 2.7, SEA_Y - 0.25, dz0 + uz * 10 + pz * 2.7); boat.rotation.y = Math.atan2(ux, uz);
  group.add(boat);
  // 沉船：歪在沙滩上、半埋着，桅杆断了躺在旁边
  const wreck = new THREE.Group();
  const wh = new THREE.Mesh(hullGeo(1.4, 1.0, 3.3), woodMat(0x7b5233)); wh.position.y = 0.55; wh.rotation.z = 0.55;
  const wm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 6), woodMat(0x5e3d22)); wm.position.set(2.1, 0.18, 0.6); wm.rotation.set(0.2, 0, Math.PI / 2);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), new THREE.MeshLambertMaterial({ color: 0xe9e0c8, side: THREE.DoubleSide })); ws.position.set(1.6, 0.08, 1.5); ws.rotation.set(-Math.PI / 2 + 0.15, 0, 0.4);
  for (const o of [wh, wm, ws]) { o.castShadow = true; o.receiveShadow = true; wreck.add(o); }
  wreck.position.set(wx, -0.15, wz); wreck.rotation.y = -wa + 0.4; group.add(wreck);

  const tick = (t) => {
    sea.material.uniforms.uT.value = t;
    boat.position.y = SEA_Y - 0.25 + Math.sin(t * 1.3) * 0.06; boat.rotation.z = Math.sin(t * 1.1) * 0.05; boat.rotation.x = Math.sin(t * 0.8) * 0.03;
  };
  return { group, obs, tick };
}
