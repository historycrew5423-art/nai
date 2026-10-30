// 正式游戏 v0.2：第一幕「舞会」。
// 玩法：双摇杆，罗密欧唱情歌射出音符；怪被打动后变成萤火，捡了升级，三选一技能。
// 地图没有边界：地面和障碍物按 40 米一块无缝重复，玩家走到哪铺到哪（docs/场景规格.md 开头）。
// 怪物的 3D 模型还没有，先用参考图做的立牌（assets/sprites/）。
// 网址参数：?auto=1 自动跳过对话、自动选第一张卡（给测试机器人用）；?god=1 不会死；?debug=1 显示帧数；?len=秒数 缩短第一幕。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Input } from './input.js';
import { byId, drawCards, baseStats } from './skills.js';
import { PEOPLE, SCENES, ACT1_LINES, EVENT_LINES, DEATH, LOVE, PAINTINGS } from './dialogue.js';

const VERSION = 'v0.2';
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), GOD = Q.has('god'), DEBUG = Q.has('debug');
const TILE = 40;                 // 地块边长（米）
const ACT1_LEN = +Q.get('len') || 45;   // 第一幕打斗时长（秒）；?len=12 给测试用，缩短这一幕
const MAX_E = 900, MAX_B = 1600, MAX_O = 1600;
const CAM = new THREE.Vector3(0, 11, 9.5);          // 镜头在主角上方 11 米、往镜头那侧 9.5 米（往下约 49 度）
const PITCH = Math.atan2(CAM.y, CAM.z);             // 立牌朝镜头倾斜的角度

// ---------- 画面：固定 16:9 ----------
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14121c);
scene.fog = new THREE.Fog(0x14121c, 17, 33);
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 80);

function layout() {
  const portrait = innerHeight > innerWidth;
  document.body.classList.toggle('portrait', portrait);
  const w = Math.min(innerWidth, innerHeight * 16 / 9), h = w * 9 / 16;
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.setProperty('--u', (h / 100) + 'px');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(w, h, false);
}
addEventListener('resize', layout);
layout();

// ---------- 灯：冷蓝的月光和环境光，主角身上一盏暖光 ----------
scene.add(new THREE.HemisphereLight(0x8a90c8, 0x2a1e2a, 1.25));
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.9); moon.position.set(-6, 12, -4); scene.add(moon);
const heroLight = new THREE.PointLight(0xffb85c, 18, 9, 1.4); scene.add(heroLight);

// ---------- 贴图工具 ----------
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return t;
}
const glowTex = (rgb) => canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(0.35, `rgba(${rgb},.45)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const additive = (map, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

// 舞会地面：深梅子色偏棕的大理石，4 米一块，中间一圈很淡的金色花纹。四方连续（40 米一个循环）。
function ballroomFloor() {
  return canvasTex(1024, (g, S) => {
    const cell = S / 10;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const v = rnd() * 10 - 5;
      g.fillStyle = `rgb(${50 + v | 0},${36 + v * 0.8 | 0},${48 + v | 0})`;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
    // 大理石纹：画在 3×3 的位置上，保证接缝处也连得上
    g.lineWidth = 2;
    for (let k = 0; k < 26; k++) {
      const x0 = rnd() * S, y0 = rnd() * S, dx = (rnd() - 0.5) * 500, dy = (rnd() - 0.5) * 500;
      g.strokeStyle = `rgba(230,200,215,${0.03 + rnd() * 0.04})`;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x0 + ox, y0 + oy);
        g.bezierCurveTo(x0 + ox + dx * 0.3, y0 + oy + dy * 0.6, x0 + ox + dx * 0.7, y0 + oy + dy * 0.2, x0 + ox + dx, y0 + oy + dy); g.stroke();
      }
    }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3;
    for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke(); g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke(); }
    // 中间的圆形花纹（直径约 16 米）
    const c = S / 2, R = S * 8 / 40;
    g.strokeStyle = 'rgba(217,164,65,.16)';
    for (const [r, w] of [[R, 5], [R * 0.92, 2], [R * 0.45, 3], [R * 0.4, 1.5]]) { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.45, c + Math.sin(a) * R * 0.45);
      g.quadraticCurveTo(c + Math.cos(a + 0.2) * R * 0.75, c + Math.sin(a + 0.2) * R * 0.75, c + Math.cos(a) * R * 0.92, c + Math.sin(a) * R * 0.92);
      g.quadraticCurveTo(c + Math.cos(a - 0.2) * R * 0.75, c + Math.sin(a - 0.2) * R * 0.75, c + Math.cos(a) * R * 0.45, c + Math.sin(a) * R * 0.45);
      g.stroke();
    }
  }, true);
}

// ---------- 无限地面 ----------
const floorTex = ballroomFloor(); floorTex.repeat.set(3, 3);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 3, TILE * 3), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

// ---------- 地块里的障碍物（第一幕，坐标见 docs/Unity场景和提示词.md「补充 2」） ----------
const ACT1_OBS = [
  { kind: 'table', x: -11, z: -11, r: 1.3 }, { kind: 'table', x: 11, z: 11, r: 1.3 },
  { kind: 'harp', x: 11, z: -11, r: 1.0 }, { kind: 'harp', x: -11, z: 11, r: 1.0 },
  { kind: 'candle', x: -15, z: 0, r: 0.6 }, { kind: 'candle', x: 15, z: 0, r: 0.6 },
];
const MAT = {
  cloth: new THREE.MeshLambertMaterial({ color: 0x7a2230 }),
  gold: new THREE.MeshLambertMaterial({ color: 0xd9a441, emissive: 0x3a2508 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x5a5262 }),
  iron: new THREE.MeshLambertMaterial({ color: 0x2c2832 }),
  wax: new THREE.MeshLambertMaterial({ color: 0xf2ede4, emissive: 0x332a20 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  glow: additive(glowTex('255,184,92'), 0.9),
  pool: additive(glowTex('255,170,80'), 0.24),
};
function buildTile(obs) {
  const parts = { cloth: [], gold: [], stone: [], iron: [], wax: [], flame: [], glow: [], pool: [] };
  const put = (k, geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => {
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.scale(s, s, s); geo.translate(x, y, z);
    parts[k].push(geo.index ? geo.toNonIndexed() : geo);
  };
  const flame = (x, y, z) => {
    put('flame', new THREE.SphereGeometry(0.07, 6, 4).scale(1, 1.7, 1), x, y, z);
    const gl = new THREE.PlaneGeometry(0.9, 0.9); gl.rotateX(-PITCH); put('glow', gl, x, y, z);
  };
  const pool = (x, z, r) => put('pool', new THREE.PlaneGeometry(r * 2, r * 2), x, 0.02, z, -Math.PI / 2);
  const rose = (x, z) => put('cloth', new THREE.CircleGeometry(0.09, 5), x, 0.015, z, -Math.PI / 2, Math.random() * 6);
  const mask = (x, z) => put('gold', new THREE.SphereGeometry(0.16, 8, 4).scale(1.4, 0.25, 0.9), x, 0.03, z, 0, Math.random() * 6);
  for (const o of obs) {
    const { x, z } = o;
    if (o.kind === 'table') {
      put('cloth', new THREE.CylinderGeometry(1.15, 1.35, 0.8, 18), x, 0.4, z);
      put('wax', new THREE.CylinderGeometry(1.17, 1.17, 0.03, 18), x, 0.81, z);
      put('gold', new THREE.TorusGeometry(1.17, 0.035, 4, 24), x, 0.8, z, Math.PI / 2);
      put('gold', new THREE.CylinderGeometry(0.07, 0.12, 0.34, 8), x, 0.97, z);
      put('wax', new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), x, 1.25, z);
      flame(x, 1.42, z); pool(x, z, 3.2);
    } else if (o.kind === 'harp') {
      put('stone', new THREE.CylinderGeometry(0.9, 1.0, 0.55, 14), x, 0.27, z);
      put('gold', new THREE.TorusGeometry(0.7, 0.08, 6, 14, Math.PI * 1.25), x - 0.05, 1.45, z, 0, 0.4, -0.5);
      put('gold', new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), x + 0.35, 1.4, z, 0, 0, 0.15);
      for (let k = 0; k < 5; k++) put('gold', new THREE.BoxGeometry(0.02, 1.1 - k * 0.12, 0.02), x - 0.35 + k * 0.15, 1.35, z, 0, 0.4, 0);
      pool(x, z, 2.2);
    } else if (o.kind === 'candle') {
      put('iron', new THREE.CylinderGeometry(0.4, 0.45, 0.2, 10), x, 0.1, z);
      put('iron', new THREE.CylinderGeometry(0.05, 0.07, 2.0, 6), x, 1.1, z);
      put('gold', new THREE.BoxGeometry(1.0, 0.06, 0.06), x, 2.05, z);
      for (const dx of [-0.45, 0, 0.45]) { put('wax', new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), x + dx, 2.18, z); flame(x + dx, 2.36, z); }
      pool(x, z, 3.6);
    }
    for (let k = 0; k < 7; k++) { const a = Math.random() * 6.28, d = o.r + 0.6 + Math.random() * 1.6; rose(x + Math.cos(a) * d, z + Math.sin(a) * d); }
    for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, d = o.r + 0.8 + Math.random() * 1.2; mask(x + Math.cos(a) * d, z + Math.sin(a) * d); }
  }
  pool(0, 0, 8.5); pool(20, 20, 4.5); pool(-20, 20, 4.5); pool(20, -20, 4.5); pool(-20, -20, 4.5); // 吊灯照在地上的暖色光斑
  const g = new THREE.Group();
  for (const [k, list] of Object.entries(parts)) if (list.length) {
    const m = new THREE.Mesh(mergeGeometries(list), MAT[k]);
    if (k === 'pool') m.renderOrder = -1;
    g.add(m);
  }
  return g;
}
const tileProto = buildTile(ACT1_OBS);
const tiles = [];
for (let i = 0; i < 9; i++) { const t = tileProto.clone(); scene.add(t); tiles.push(t); }
let tileIX = 1e9, tileIZ = 1e9;
function updateTiles(px, pz) {
  const ix = Math.round(px / TILE), iz = Math.round(pz / TILE);
  if (ix === tileIX && iz === tileIZ) return;
  tileIX = ix; tileIZ = iz;
  let k = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) tiles[k++].position.set((ix + dx) * TILE, 0, (iz + dz) * TILE);
  floor.position.set(ix * TILE, 0, iz * TILE);
}
// 把圆推出障碍物。障碍物离地块边至少 3 米，所以只查自己所在的那一块。
function pushOut(p, r) {
  const ox = Math.round(p.x / TILE) * TILE, oz = Math.round(p.z / TILE) * TILE;
  for (const o of ACT1_OBS) {
    const dx = p.x - (ox + o.x), dz = p.z - (oz + o.z), rr = o.r + r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; p.x = ox + o.x + dx / d * rr; p.z = oz + o.z + dz / d * rr; }
  }
}

// ---------- 怪：参考图做的立牌，同一种怪一次画完 ----------
const texLoader = new THREE.TextureLoader();
const TYPES = [
  { key: 'lute', h: 1.55, r: 0.5, hp: 2, speed: 2.1, dmg: 7, xp: 1, flip: false },
  { key: 'birdhead', h: 1.15, r: 0.36, hp: 1, speed: 3.9, dmg: 4, xp: 1, flip: true },
  { key: 'drum', h: 1.7, r: 0.7, hp: 9, speed: 1.5, dmg: 12, xp: 4, flip: true },
];
const T = Object.fromEntries(TYPES.map((t, i) => [t.key, i]));
function billboardGeo(w, h, centerY) {
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, centerY ? 0 : h / 2, 0); g.rotateX(-PITCH); return g;
}
const enemyMeshes = TYPES.map((t) => {
  const tex = texLoader.load(`assets/sprites/${t.key}.png`); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.InstancedMesh(billboardGeo(1, 1), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide }), MAX_E);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_E * 3).fill(1), 3);
  m.count = 0; m.frustumCulled = false; scene.add(m);
  return m;
});
const shadowTex = canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(0,0,0,.6)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
function flatInst(geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; scene.add(m); return m;
}
const shadowMesh = flatInst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), MAX_E + 4);
shadowMesh.renderOrder = 0;

// 音符：发光的金色 ♪
const noteTex = canvasTex(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,190,90,.55)'); r.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
  g.font = `bold ${s * 0.62}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff1c8'; g.shadowColor = '#ffb85c'; g.shadowBlur = 12; g.fillText('♪', s / 2, s * 0.53);
});
const noteMesh = flatInst(billboardGeo(1, 1, true), additive(noteTex), MAX_B + 8);
const fireflyMesh = flatInst(billboardGeo(1, 1, true), additive(glowTex('127,227,216')), MAX_O);
const ringMat = additive(canvasTex(128, (g, s) => { g.strokeStyle = 'rgba(255,214,140,1)'; g.lineWidth = 7; g.shadowColor = '#ffb85c'; g.shadowBlur = 14; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); g.stroke(); }));
const rings = [];
function ring(x, z, r, life = 0.45) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMat.clone());
  m.position.set(x, 0.1, z); scene.add(m); rings.push({ m, r, t: 0, life });
}

// 主角脚下一圈暖光，让他在暗处跳出来
const heroGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), additive(glowTex('255,184,92'), 0.42));
heroGlow.position.y = 0.03; scene.add(heroGlow);

// ---------- 角色模型 ----------
const loader = new GLTFLoader();
async function loadModel(name, height) {
  const g = await loader.loadAsync(`assets/models/${name}.glb`);
  const obj = g.scene;
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = height / size.y;
  obj.scale.setScalar(s); obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const wrap = new THREE.Group(), inner = new THREE.Group();
  inner.add(obj); wrap.add(inner); wrap.userData.inner = inner;
  return wrap;
}
let hero = null, juliet = null, tybalt = null;

// ---------- 数据 ----------
const E = { n: 0, type: new Uint8Array(MAX_E), x: new Float32Array(MAX_E), z: new Float32Array(MAX_E), hp: new Float32Array(MAX_E),
  flash: new Float32Array(MAX_E), phase: new Float32Array(MAX_E), speed: new Float32Array(MAX_E), id: new Int32Array(MAX_E),
  ocd: new Float32Array(MAX_E), face: new Int8Array(MAX_E) };
const B = { n: 0, x: new Float32Array(MAX_B), z: new Float32Array(MAX_B), dx: new Float32Array(MAX_B), dz: new Float32Array(MAX_B),
  life: new Float32Array(MAX_B), dmg: new Float32Array(MAX_B), pierce: new Int16Array(MAX_B), bounce: new Int16Array(MAX_B),
  size: new Float32Array(MAX_B), last: new Int32Array(MAX_B) };
const O = { n: 0, x: new Float32Array(MAX_O), z: new Float32Array(MAX_O), v: new Float32Array(MAX_O), t: new Float32Array(MAX_O) };
let nextId = 1;

const player = { x: 0, z: 0, r: 0.45, hp: 100, hurtCd: 0, aimX: 0, aimZ: 1, moving: 0 };   // aimZ = 1：开打前面朝镜头
let stats = baseStats(), levels = {}, level = 1, xp = 0, kills = 0, pendingLevels = 0;
let time = 0, actTime = 0, fireCd = 0, drumCd = 0, slowmo = 0, noteIdx = 0;
let phase = 'title';            // title → story → fight → levelup → actEnd → card → over
const maxHp = () => 100 + stats.maxHpBonus;
const xpNeed = (L) => (L === 1 ? 2 : Math.round(3 * Math.pow(L, 1.35)));   // 第一次升级来得快（约第 7 秒）
const input = new Input();

function resetRun() {
  E.n = B.n = O.n = 0;
  player.x = player.z = 0; player.hp = 100; player.hurtCd = 0; player.aimX = 0; player.aimZ = 1;
  stats = baseStats(); levels = {}; level = 1; xp = 0; kills = 0; pendingLevels = 0;
  time = actTime = 0; fireCd = drumCd = slowmo = 0; lineIdx = 0; saidLow = false; firstLevelSaid = false; birdWaves = 0;
  if (tybalt) tybalt.visible = false;
  if (juliet) juliet.visible = false;
  updateTiles(0, 0);
}

// ---------- 怪的生成和数量（第一幕：开局很简单，慢慢变多） ----------
function act1Target(t) { return t < 20 ? Math.round(2 + t * 0.4) : Math.round(10 + (t - 20) * 1.25); }
let spawnAcc = 0, birdWaves = 0;
function spawnEnemy(type, ang, dist) {
  if (E.n >= MAX_E) return;
  const a = ang ?? Math.random() * Math.PI * 2, d = dist ?? (actTime < 10 ? 15 : 17) + Math.random() * 3;
  const ca = Math.cos(a), p = { x: player.x + Math.sin(a) * d, z: player.z + ca * d * (ca < 0 ? 1.1 : 0.75) };   // 生成在屏幕外
  pushOut(p, 0.6);
  const t = TYPES[type], i = E.n++;
  E.type[i] = type; E.x[i] = p.x; E.z[i] = p.z; E.flash[i] = 0; E.phase[i] = Math.random() * 10; E.ocd[i] = 0; E.face[i] = 1;
  E.hp[i] = t.hp + (type === T.lute && actTime > 22 ? 1 : 0);
  E.speed[i] = t.speed * (0.85 + Math.random() * 0.3); E.id[i] = nextId++;
}
function director(dt) {
  if (phase !== 'fight') return;
  const target = act1Target(actTime) * (player.hp < maxHp() * 0.35 ? 0.75 : 1);   // 血少时悄悄少出一点
  spawnAcc += dt * (actTime < 20 ? 2 : 6);
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n < target) spawnEnemy(T.lute); }
  // 鸟嘴面具客人：第 25 秒起，每 6 秒从一个方向冲来一小群
  if (actTime > 25 + birdWaves * 6 && actTime < ACT1_LEN - 3) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, 17 + Math.random() * 3);
  }
  if (actTime > 38 && E.n < target + 3 && Math.random() < dt * 0.6) spawnEnemy(T.drum);
}

function killEnemy(i) {
  const t = TYPES[E.type[i]];
  if (O.n < MAX_O) { const k = O.n++; O.x[k] = E.x[i]; O.z[k] = E.z[i]; O.v[k] = t.xp; O.t[k] = Math.random() * 6; }
  const j = --E.n;
  for (const a of [E.type, E.x, E.z, E.hp, E.flash, E.phase, E.speed, E.id, E.ocd, E.face]) a[i] = a[j];
  kills++;
}
function removeBullet(i) {
  const j = --B.n;
  for (const a of [B.x, B.z, B.dx, B.dz, B.life, B.dmg, B.pierce, B.bounce, B.size, B.last]) a[i] = a[j];
}
function hurtEnemy(i, dmg, kx = 0, kz = 0) {
  E.hp[i] -= dmg; E.flash[i] = 0.09;
  if (kx || kz) { E.x[i] += kx; E.z[i] += kz; }
  if (E.hp[i] <= 0) { killEnemy(i); return true; }
  return false;
}

// ---------- 网格：只和附近的怪比，几百只也算得动。网格跟着主角走 ----------
const CELL = 1.2, GRID = 56, GOFF = GRID * CELL / 2;
const cellCount = new Int32Array(GRID * GRID), cellStart = new Int32Array(GRID * GRID + 1), cellItems = new Int32Array(MAX_E), cellOf = new Int32Array(MAX_E);
let gx0 = 0, gz0 = 0;
const gc = (v, o) => Math.max(0, Math.min(GRID - 1, Math.floor((v - o + GOFF) / CELL)));
function buildGrid() {
  gx0 = player.x; gz0 = player.z;
  cellCount.fill(0);
  for (let i = 0; i < E.n; i++) { const c = gc(E.x[i], gx0) + gc(E.z[i], gz0) * GRID; cellOf[i] = c; cellCount[c]++; }
  cellStart[0] = 0;
  for (let c = 0; c < GRID * GRID; c++) cellStart[c + 1] = cellStart[c] + cellCount[c];
  cellCount.fill(0);
  for (let i = 0; i < E.n; i++) { const c = cellOf[i]; cellItems[cellStart[c] + cellCount[c]++] = i; }
}
function forNear(x, z, rad, fn) {
  const n = Math.ceil(rad / CELL), cx = gc(x, gx0), cz = gc(z, gz0);
  for (let zz = Math.max(0, cz - n); zz <= Math.min(GRID - 1, cz + n); zz++)
    for (let xx = Math.max(0, cx - n); xx <= Math.min(GRID - 1, cx + n); xx++) {
      const c = xx + zz * GRID;
      for (let s = cellStart[c], e = s + cellCount[c]; s < e; s++) { const j = cellItems[s]; if (j < E.n && fn(j) === false) return; }
    }
}
function nearestEnemy(x, z, range, skipId = -1) {
  let best = -1, bd = range * range;
  for (let i = 0; i < E.n; i++) {
    if (E.id[i] === skipId) continue;
    const dx = E.x[i] - x, dz = E.z[i] - z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = i; }
  }
  return best;
}

// ---------- 鼠标瞄准 ----------
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3(), ndc = new THREE.Vector2();
function mouseAim() {
  const r = canvas.getBoundingClientRect();
  ndc.set((input.mouse.x - r.left) / r.width * 2 - 1, -((input.mouse.y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(groundPlane, hitV)) return null;
  const dx = hitV.x - player.x, dz = hitV.z - player.z, d = Math.hypot(dx, dz);
  return d > 0.3 ? { x: dx / d, z: dz / d } : null;
}

// ---------- 声音：每发一个音符弹一声，连起来是一段旋律 ----------
let actx = null;
const MELODY = [0, 4, 7, 9, 7, 4, 2, 4, 0, 4, 7, 12, 9, 7, 4, 2];
function initAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { actx = null; } }
function pluck(semi, vol = 0.05, dur = 0.35, type = 'triangle') {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = 392 * Math.pow(2, semi / 12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
}

// ---------- 界面 ----------
const ui = document.createElement('div'); ui.id = 'ui'; stage.appendChild(ui);
ui.innerHTML = `
<div id="vignette"></div>
<div id="bars" class="hide"><div class="hpbar"><i></i></div><div class="xpbar"><i></i></div><span class="lv">1 级</span></div>
<div id="actinfo" class="hide"><b>第一幕 · 舞会</b><span></span></div>
<div id="bark" class="hide"><img alt=""><div><b></b><span></span></div></div>
<div id="dlg" class="hide" data-ui><div class="por"><img alt=""></div><div class="box"><b class="who"></b><div class="txt"></div><i class="more">▼</i></div><button class="skip">跳过 ›</button></div>
<div id="cards" class="hide" data-ui><h2></h2><div class="row"></div></div>
<div id="art" class="hide" data-ui><div class="frame"><img alt=""></div><div class="info"><h2></h2><p class="by"></p><p class="where"></p><ul></ul><div class="btns"></div></div></div>
<div id="title" data-ui><h1>罗密欧与朱丽叶</h1><p class="sub">用情歌打怪，改写莎士比亚的结局</p><p class="go">加载中……</p><p class="tip">横屏 · 左手拖着走 · 右手拖着瞄（不碰会自动唱）</p><p class="ver">${VERSION} 开发中：先做好了第一幕</p></div>
<div id="fps" class="${DEBUG ? '' : 'hide'}"></div>`;
const $ = (s) => ui.querySelector(s);
const show = (el, on = true) => el.classList.toggle('hide', !on);

// 打斗中的喊话：屏幕上方一条，不暂停
let barkT = 0;
function bark(who, text) {
  const p = PEOPLE[who], el = $('#bark');
  el.querySelector('img').src = p.img || ''; el.querySelector('img').style.display = p.img ? '' : 'none';
  el.querySelector('b').textContent = p.name; el.querySelector('span').textContent = text;
  show(el); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  barkT = 2.2 + text.length * 0.06;
}

// 幕间对话：点一下出下一句
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function playScene(lines) {
  const el = $('#dlg'); let skip = false;
  el.querySelector('.skip').onclick = (e) => { e.stopPropagation(); skip = true; advance && advance(); };
  let advance = null;
  el.onclick = () => advance && advance();
  show(el);
  for (const line of lines) {
    if (line.choice) { show(el, false); await chooseCards(line.choice, true); show(el); continue; }
    if (skip) continue;
    const [who, text] = line, p = PEOPLE[who];
    el.className = 'side-' + p.side;
    el.querySelector('.por img').src = p.img || '';
    el.querySelector('.who').textContent = p.name;
    const txt = el.querySelector('.txt');
    let shown = 0, done = false;
    await new Promise((resolve) => {
      const tick = setInterval(() => { shown += 1; txt.textContent = text.slice(0, shown); if (shown >= text.length) { done = true; clearInterval(tick); } }, AUTO ? 1 : 33);
      advance = () => { if (!done && !skip) { shown = text.length; txt.textContent = text; done = true; clearInterval(tick); return; } clearInterval(tick); advance = null; resolve(); };
      if (AUTO) setTimeout(() => { done = true; advance && advance(); }, 30);
    });
  }
  show(el, false);
}

// 三选一：升级时，或者幕间"对话里选回答"
function chooseCards(title, isChoice) {
  return new Promise((resolve) => {
    const cards = drawCards(levels, level), el = $('#cards'), row = el.querySelector('.row');
    if (!cards.length) { resolve(); return; }
    el.querySelector('h2').textContent = title;
    el.classList.toggle('choice', !!isChoice);
    row.innerHTML = '';
    cards.forEach((k, idx) => {
      const lv = levels[k.id] || 0;
      const b = document.createElement('button');
      b.innerHTML = isChoice
        ? `<q>${LOVE[k.id]}</q><b>${k.name}</b><small>${k.desc[lv]}</small>`
        : `<b>${k.name}</b><em>${lv ? `${lv} 级 → ${lv + 1} 级` : '新技能'}</em><small>${k.desc[lv]}</small><q>${LOVE[k.id]}</q>`;
      b.onclick = () => { show(el, false); takeSkill(k.id); resolve(k.id); };
      row.appendChild(b);
      if (AUTO && idx === 0) setTimeout(() => b.click(), 60);
    });
    show(el);
  });
}
function takeSkill(id) {
  levels[id] = (levels[id] || 0) + 1;
  byId[id].apply(stats, levels[id]);
  if (stats.healNow) { player.hp = Math.min(maxHp(), player.hp + maxHp() * stats.healNow); stats.healNow = 0; }
  pluck(12, 0.07, 0.6, 'sine'); pluck(16, 0.05, 0.7, 'sine');
}

// 名画卡
function paintingCard(act, opts) {
  return new Promise((resolve) => {
    const p = PAINTINGS[act], el = $('#art');
    el.querySelector('img').src = p.img;
    el.querySelector('h2').textContent = p.title;
    el.querySelector('.by').textContent = p.by;
    el.querySelector('.where').textContent = p.where;
    el.querySelector('ul').innerHTML = (opts.lead ? `<li class="lead">${opts.lead}</li>` : '') + p.facts.map((f) => `<li>${f}</li>`).join('');
    const btns = el.querySelector('.btns'); btns.innerHTML = '';
    for (const [label, val] of opts.buttons) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => { show(el, false); resolve(val); };
      btns.appendChild(b);
    }
    show(el);
    if (AUTO) setTimeout(() => btns.firstChild.click(), 80);
  });
}

// ---------- 流程 ----------
let lineIdx = 0, saidLow = false, firstLevelSaid = false;
async function startRun(again) {
  resetRun();
  show($('#title'), false);
  phase = 'story';
  if (!again) await playScene(SCENES.prologue);
  show($('#bars')); show($('#actinfo'));
  phase = 'fight';
}
async function endAct1() {
  phase = 'actEnd';
  // 怪都安静下来，变成萤火
  for (let i = E.n - 1; i >= 0; i--) killEnemy(i);
  B.n = 0;
  if (juliet) { juliet.visible = true; juliet.position.set(player.x + 1.6, 0, player.z - 3.2); juliet.rotation.y = Math.atan2(-1.6, 3.2); }
  if (hero) { player.aimX = 0.45; player.aimZ = -0.9; }
  await sleep(AUTO ? 50 : 1400);
  show($('#bars'), false); show($('#actinfo'), false); show($('#bark'), false);
  await playScene(SCENES.act1End);
  phase = 'card';
  stage.classList.add('freeze');
  await sleep(AUTO ? 50 : 900);
  await paintingCard(1, { buttons: [['继续', 'go']] });
  stage.classList.remove('freeze');
  await playScene(SCENES.act1To2);
  await paintingCardEnd();
}
function paintingCardEnd() {
  phase = 'over';
  const el = $('#title');
  el.querySelector('h1').textContent = '第一幕 完';
  el.querySelector('.sub').textContent = '第二幕「阳台」正在制作，先玩到这里。';
  el.querySelector('.go').textContent = '点一下，再玩一次';
  el.querySelector('.tip').textContent = `这一局：${level} 级，打动了 ${kills} 只怪`;
  show(el); titleReady = true;
}
async function die() {
  phase = 'dead';
  show($('#bark'), false);
  await sleep(AUTO ? 50 : 1200);
  show($('#bars'), false); show($('#actinfo'), false);
  await playScene([['narrator', DEATH[1]]]);
  await paintingCard(1, { lead: '你在第一幕倒下了。先看看这一幕的名画：', buttons: [['再来一次', 'again']] });
  startRun(true);
}

// ---------- 每一帧 ----------
const tmp = { x: 0, z: 0 };
function step(dt) {
  time += dt;
  if (phase === 'fight') actTime += dt;
  const fighting = phase === 'fight';

  // 主角移动
  const mv = input.getMove();
  const canMove = fighting || phase === 'title';
  if (canMove && phase !== 'title') {
    const sp = 6.4 * stats.speedMul;
    player.x += mv.x * sp * dt; player.z += mv.y * sp * dt;
    pushOut(player, player.r);
  }
  player.moving = canMove && phase !== 'title' ? Math.hypot(mv.x, mv.y) : 0;
  updateTiles(player.x, player.z);

  if (fighting) {
    // 剧情喊话
    while (lineIdx < ACT1_LINES.length && actTime >= ACT1_LINES[lineIdx].t) {
      const L = ACT1_LINES[lineIdx++];
      bark(L.who, L.text);
      if (L.tag === 'tybalt' && tybalt) { tybalt.visible = true; tybalt.position.set(player.x - 7.5, 0, player.z - 5); tybalt.userData.t = 0; }
    }
    if (!saidLow && player.hp < maxHp() * 0.4) { saidLow = true; bark(EVENT_LINES.lowHp.who, EVENT_LINES.lowHp.text); }
    if (actTime >= ACT1_LEN) { endAct1(); return; }
  }
  if (tybalt && tybalt.visible) {
    tybalt.userData.t += dt;
    tybalt.rotation.y = Math.atan2(player.x - tybalt.position.x, player.z - tybalt.position.z);
    if (tybalt.userData.t > 5) { tybalt.position.x -= dt * 4; tybalt.rotation.y = -Math.PI / 2; }
    if (tybalt.userData.t > 8) tybalt.visible = false;
  }

  director(dt);

  // 怪：朝主角走，互相推开，绕开障碍物
  const early = actTime < 20 ? 0.35 : 1;
  for (let i = 0; i < E.n; i++) {
    const t = TYPES[E.type[i]];
    const dx = player.x - E.x[i], dz = player.z - E.z[i], d = Math.hypot(dx, dz) || 1;
    if (d > 34) { const a = Math.random() * 6.28; E.x[i] = player.x + Math.sin(a) * 20; E.z[i] = player.z + Math.cos(a) * 16; continue; }
    const touch = player.r + t.r;
    const st = Math.min(E.speed[i] * dt, Math.max(0, d - touch));
    E.x[i] += dx / d * st; E.z[i] += dz / d * st;
    if (Math.abs(dx) > 0.2) E.face[i] = dx > 0 ? 1 : -1;
    if (E.flash[i] > 0) E.flash[i] -= dt;
    if (E.ocd[i] > 0) E.ocd[i] -= dt;
    if (fighting && d < touch + 0.12 && player.hurtCd <= 0 && !GOD) {
      player.hp -= t.dmg * early; player.hurtCd = 0.45;
      if (player.hp <= 0) { player.hp = 0; die(); return; }
    }
  }
  if (player.hurtCd > 0) player.hurtCd -= dt;
  buildGrid();
  for (let i = 0; i < E.n; i++) {
    const ri = TYPES[E.type[i]].r;
    forNear(E.x[i], E.z[i], 1.5, (j) => {
      if (j <= i) return;
      const R = ri + TYPES[E.type[j]].r;
      let ex = E.x[i] - E.x[j], ez = E.z[i] - E.z[j], q = ex * ex + ez * ez;
      if (q >= R * R) return;
      if (q < 1e-8) { ex = Math.random() - 0.5; ez = Math.random() - 0.5; q = ex * ex + ez * ez; }
      const dd = Math.sqrt(q), push = (R - dd) * 0.5 / dd;
      E.x[i] += ex * push; E.z[i] += ez * push; E.x[j] -= ex * push; E.z[j] -= ez * push;
    });
  }
  for (let i = 0; i < E.n; i++) {
    const r = TYPES[E.type[i]].r, touch = player.r + r;
    const dx = E.x[i] - player.x, dz = E.z[i] - player.z, q = dx * dx + dz * dz;
    if (q < touch * touch && q > 1e-8) { const dd = Math.sqrt(q); E.x[i] = player.x + dx / dd * touch; E.z[i] = player.z + dz / dd * touch; }
    tmp.x = E.x[i]; tmp.z = E.z[i]; pushOut(tmp, r); E.x[i] = tmp.x; E.z[i] = tmp.z;
  }
  buildGrid();

  if (!fighting) { stepFx(dt); return; }

  // 瞄准：右摇杆 > 鼠标 > 自动打最近的怪
  let aim = null;
  if (input.aim.active) { const d = Math.hypot(input.aim.x, input.aim.y); aim = { x: input.aim.x / d, z: input.aim.y / d }; }
  else if (input.mouse.active) aim = mouseAim();
  if (!aim) { const t = nearestEnemy(player.x, player.z, 15); if (t >= 0) { const dx = E.x[t] - player.x, dz = E.z[t] - player.z, d = Math.hypot(dx, dz) || 1; aim = { x: dx / d, z: dz / d }; } }
  if (aim) { player.aimX = aim.x; player.aimZ = aim.z; }

  // 开火
  fireCd -= dt;
  if (aim && fireCd <= 0) {
    fireCd = 1 / (3.4 * stats.rateMul);
    const base = Math.atan2(player.aimX, player.aimZ), spread = 0.17;
    const fan = (ang, n) => { for (let k = 0; k < n; k++) shoot(ang + (k - (n - 1) / 2) * spread); };
    fan(base, stats.projectiles);
    const en = stats.echo >= 3 ? Math.min(3, stats.projectiles) : 1;
    if (stats.echo >= 1) fan(base + Math.PI, en);
    if (stats.echo >= 2) { fan(base + Math.PI / 2, en); fan(base - Math.PI / 2, en); }
    pluck(MELODY[noteIdx++ % MELODY.length], 0.035, 0.3);
  }

  // 音符飞行、打中怪
  for (let i = B.n - 1; i >= 0; i--) {
    B.x[i] += B.dx[i] * dt; B.z[i] += B.dz[i] * dt; B.life[i] -= dt;
    if (B.life[i] <= 0) { removeBullet(i); continue; }
    const hr = 0.35 * B.size[i];
    let hit = -1;
    forNear(B.x[i], B.z[i], 1.2 + hr, (j) => {
      if (E.id[j] === B.last[i]) return;
      const R = TYPES[E.type[j]].r + hr, ex = E.x[j] - B.x[i], ez = E.z[j] - B.z[i];
      if (ex * ex + ez * ez < R * R) { hit = j; return false; }
    });
    if (hit < 0) continue;
    const hid = E.id[hit], hx = E.x[hit], hz = E.z[hit];
    const v = Math.hypot(B.dx[i], B.dz[i]) || 1, kn = stats.knock * 0.12;
    hurtEnemy(hit, B.dmg[i], B.dx[i] / v * kn, B.dz[i] / v * kn);
    B.last[i] = hid;
    if (B.bounce[i] > 0) {
      B.bounce[i]--;
      const nx = nearestEnemy(hx, hz, 7, hid);
      if (nx >= 0) { const dx = E.x[nx] - hx, dz = E.z[nx] - hz, d = Math.hypot(dx, dz) || 1; B.dx[i] = dx / d * v; B.dz[i] = dz / d * v; B.x[i] = hx; B.z[i] = hz; B.life[i] = Math.max(B.life[i], 0.5); continue; }
    }
    if (B.pierce[i] > 0) { B.pierce[i]--; continue; }
    removeBullet(i);
  }

  // 低音鼓：每隔几秒震开一圈
  if (stats.drum) {
    drumCd -= dt;
    if (drumCd <= 0) { drumCd = [0, 4, 3.3, 2.6][stats.drum]; shockwave([0, 4, 5, 6][stats.drum], 2); }
  }
  // 环绕声：音符绕着主角转
  const on = [0, 2, 3, 4][stats.orbit] || 0;
  for (let k = 0; k < on; k++) {
    const a = time * (stats.orbit >= 3 ? 3.6 : 2.6) + k / on * Math.PI * 2, ox = player.x + Math.sin(a) * 2.3, oz = player.z + Math.cos(a) * 2.3;
    forNear(ox, oz, 1.4, (j) => {
      if (E.ocd[j] > 0) return;
      const R = TYPES[E.type[j]].r + 0.4, ex = E.x[j] - ox, ez = E.z[j] - oz;
      if (ex * ex + ez * ez < R * R) { E.ocd[j] = 0.4; hurtEnemy(j, stats.dmgMul, ex * 0.3, ez * 0.3); return false; }
    });
  }

  // 萤火（经验）：靠近就被吸过来
  let crowd = 0;
  forNear(player.x, player.z, 4, (j) => { const dx = E.x[j] - player.x, dz = E.z[j] - player.z; if (dx * dx + dz * dz < 16) crowd++; });
  const boost = player.hp < maxHp() * 0.35 || crowd >= 25 ? 2 : 1;   // 绝境加速
  stepOrbs(dt, 7, boost);   // 萤火 7 米内就会飞向罗密欧
  stepFx(dt);
  if (pendingLevels > 0 && phase === 'fight') openLevelUp();
}
function shoot(ang) {
  if (B.n >= MAX_B) return;
  const i = B.n++, sp = 15;
  B.x[i] = player.x + Math.sin(ang) * 0.5; B.z[i] = player.z + Math.cos(ang) * 0.5;
  B.dx[i] = Math.sin(ang) * sp; B.dz[i] = Math.cos(ang) * sp; B.life[i] = 1.05;
  B.dmg[i] = stats.dmgMul; B.pierce[i] = stats.pierce; B.bounce[i] = stats.bounce; B.size[i] = stats.size; B.last[i] = -1;
}
function shockwave(R, dmg) {
  ring(player.x, player.z, R);
  for (let i = E.n - 1; i >= 0; i--) {
    const dx = E.x[i] - player.x, dz = E.z[i] - player.z, d = Math.hypot(dx, dz);
    if (d < R) {
      const k = (R + 0.8 - d) / (d || 1);
      if (!hurtEnemy(i, dmg, dx * k, dz * k)) {}
    }
  }
  pluck(-12, 0.08, 0.4, 'sine');
}
function stepOrbs(dt, magnet, boost) {
  for (let i = O.n - 1; i >= 0; i--) {
    O.t[i] += dt;
    const dx = player.x - O.x[i], dz = player.z - O.z[i], d = Math.hypot(dx, dz);
    const pull = phase === 'actEnd' ? 99 : magnet * (1 + Math.min(1, (levels.stride || 0) * 0.15));
    if (d < 0.6) {
      xp += O.v[i] * boost; O.n--;
      for (const a of [O.x, O.z, O.v, O.t]) a[i] = a[O.n];
      while (xp >= xpNeed(level)) { xp -= xpNeed(level); level++; pendingLevels++; }
    } else if (d < pull) { const s = (phase === 'actEnd' ? 18 : 6 + 9 * (1 - d / pull)) * dt; O.x[i] += dx / d * s; O.z[i] += dz / d * s; }
  }
}
function stepFx(dt) {
  if (phase === 'actEnd') stepOrbs(dt, 99, 1);
  for (let k = rings.length - 1; k >= 0; k--) {
    const r = rings[k]; r.t += dt;
    const f = r.t / r.life, s = r.r * 2 * (0.3 + f * 0.8);
    r.m.scale.set(s, 1, s); r.m.material.opacity = 1 - f;
    if (f >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(k, 1); }
  }
  if (barkT > 0) { barkT -= dt; if (barkT <= 0) show($('#bark'), false); }
}
async function openLevelUp() {
  phase = 'levelup';
  slowmo = 0.35;
  pluck(7, 0.06, 0.5, 'sine'); pluck(12, 0.05, 0.6, 'sine');
  await sleep(AUTO ? 10 : 380);
  slowmo = 0;
  if (!firstLevelSaid) { firstLevelSaid = true; bark(EVENT_LINES.firstLevel.who, EVENT_LINES.firstLevel.text); }
  else if (Math.random() < 0.4) { const L = EVENT_LINES.levelUp[Math.random() * EVENT_LINES.levelUp.length | 0]; bark(L.who, L.text); }
  while (pendingLevels > 0) {
    pendingLevels--;
    await chooseCards(`升到 ${level - pendingLevels} 级！选一首新歌`, false);
    shockwave(5.5, 3);
  }
  if (phase === 'levelup') phase = 'fight';
}

// ---------- 画 ----------
function writeMatrix(arr, i, x, y, z, sx, sy, sz) {
  const o = i * 16;
  arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
const counts = new Int32Array(TYPES.length);
const camTarget = new THREE.Vector3();
let camDist = 1;
function draw(dt) {
  counts.fill(0);
  const sm = shadowMesh.instanceMatrix.array;
  for (let i = 0; i < E.n; i++) {
    const ty = E.type[i], t = TYPES[ty], m = enemyMeshes[ty], k = counts[ty]++;
    const b = Math.abs(Math.sin(time * (ty === T.birdhead ? 13 : 8) + E.phase[i]));
    const s = t.h, flip = t.flip ? E.face[i] : 1;
    writeMatrix(m.instanceMatrix.array, k, E.x[i], b * 0.12, E.z[i], s * flip * (1 + (1 - b) * 0.06), s * (0.94 + b * 0.08), s * (0.94 + b * 0.08));
    const f = E.flash[i] > 0 ? 2.6 : 0.92, col = m.instanceColor.array;
    col[k * 3] = f; col[k * 3 + 1] = f; col[k * 3 + 2] = E.flash[i] > 0 ? 2.6 : 0.98;
    const ss = t.r * 3;
    writeMatrix(sm, i, E.x[i], 0.012, E.z[i], ss, 1, ss * 0.7);
  }
  enemyMeshes.forEach((m, ty) => { m.count = counts[ty]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
  shadowMesh.count = E.n; shadowMesh.instanceMatrix.needsUpdate = true;

  const nm = noteMesh.instanceMatrix.array;
  for (let i = 0; i < B.n; i++) { const s = 0.8 * B.size[i]; writeMatrix(nm, i, B.x[i], 0.95, B.z[i], s, s, s); }
  let nn = B.n;
  const on = phase === 'fight' || phase === 'levelup' ? ([0, 2, 3, 4][stats.orbit] || 0) : 0;
  for (let k = 0; k < on; k++) {
    const a = time * (stats.orbit >= 3 ? 3.6 : 2.6) + k / on * Math.PI * 2;
    writeMatrix(nm, nn++, player.x + Math.sin(a) * 2.3, 1.0, player.z + Math.cos(a) * 2.3, 0.8, 0.8, 0.8);
  }
  noteMesh.count = nn; noteMesh.instanceMatrix.needsUpdate = true;

  const fm = fireflyMesh.instanceMatrix.array;
  for (let i = 0; i < O.n; i++) { const s = 0.5 + Math.sin(O.t[i] * 5) * 0.1; writeMatrix(fm, i, O.x[i], 0.45 + Math.sin(O.t[i] * 3) * 0.12, O.z[i], s, s, s); }
  fireflyMesh.count = O.n; fireflyMesh.instanceMatrix.needsUpdate = true;

  // 主角：用代码做的动作。走路一蹦一蹦、左右摇，站着时轻轻呼吸
  if (hero) {
    const inner = hero.userData.inner, mv = player.moving;
    const hop = Math.abs(Math.sin(time * 11));
    hero.position.set(player.x, mv > 0.1 ? hop * 0.14 : 0, player.z);
    const want = Math.atan2(player.aimX, player.aimZ);
    let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    hero.rotation.y += dr * Math.min(1, dt * 14);
    inner.rotation.z = mv > 0.1 ? Math.sin(time * 11) * 0.07 : 0;
    inner.rotation.x = mv > 0.1 ? 0.08 : 0;
    const breathe = 1 + Math.sin(time * 2.4) * 0.015;
    inner.scale.set(1 + (mv > 0.1 ? (1 - hop) * 0.04 : 0), breathe - (mv > 0.1 ? (1 - hop) * 0.05 : 0), 1);
    hero.visible = !(player.hurtCd > 0.25 && Math.floor(time * 20) % 2);
  }
  if (juliet && juliet.visible) { juliet.userData.inner.position.y = 0.06 + Math.sin(time * 1.8) * 0.04; }
  heroLight.position.set(player.x, 2.6, player.z + 1.2);
  heroGlow.position.x = player.x; heroGlow.position.z = player.z;

  // 镜头：打的时候跟着主角；幕结束时拉近；名画定格时拉起
  const want = phase === 'actEnd' ? 0.62 : phase === 'card' ? 1.5 : phase === 'title' || phase === 'over' ? 0.8 : 1;
  camDist += (want - camDist) * Math.min(1, dt * 2.2);
  camTarget.set(player.x + CAM.x * camDist, CAM.y * camDist, player.z + CAM.z * camDist);
  camera.position.lerp(camTarget, Math.min(1, dt * 7));
  camera.lookAt(camera.position.x - CAM.x * camDist, phase === 'actEnd' ? 0.9 : 0, camera.position.z - CAM.z * camDist);
  renderer.render(scene, camera);

  // 界面数字
  if (phase === 'fight' || phase === 'levelup') {
    $('#bars .hpbar i').style.width = (player.hp / maxHp() * 100) + '%';
    $('#bars .xpbar i').style.width = (xp / xpNeed(level) * 100) + '%';
    $('#bars .lv').textContent = `${level} 级`;
    $('#actinfo span').textContent = `${Math.max(0, Math.ceil(ACT1_LEN - actTime))} 秒`;
  }
}

// ---------- 开始画面 ----------
let titleReady = false;
$('#title').onclick = () => { if (!titleReady) return; titleReady = false; initAudio(); startRun(); };

Promise.all([loadModel('fantasy', 1.9), loadModel('wedding-dress', 1.95), loadModel('minotaur', 2.3)]).then(([h, j, t]) => {
  hero = h; juliet = j; tybalt = t;
  scene.add(hero, juliet, tybalt);
  juliet.visible = tybalt.visible = false;
  titleReady = true;
  $('#title .go').textContent = '点一下开始';
  if (AUTO) $('#title').click();
}).catch((e) => { $('#title .go').textContent = '加载失败，请刷新：' + e.message; console.error(e); });

// 给自动测试用的接口
window.__game = {
  E, B, O, player,
  get phase() { return phase; }, get level() { return level; }, get kills() { return kills; },
  get actTime() { return actTime; }, get time() { return time; }, get levels() { return levels; },
};

// ---------- 主循环 ----------
updateTiles(0, 0);
let last = performance.now(), frames = 0, fpsT = last;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (document.body.classList.contains('portrait')) return;
  if (slowmo > 0) dt *= 0.25;
  if (phase !== 'levelup' && phase !== 'story' && phase !== 'card' && phase !== 'dead') step(dt);
  else if (phase === 'levelup' && slowmo > 0) step(dt);
  else stepFx(dt);
  draw(dt);
  frames++;
  if (now - fpsT >= 1000) {
    window.__fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    if (DEBUG) { const info = renderer.info.render; $('#fps').textContent = `${window.__fps.toFixed(0)} 帧 · 怪 ${E.n} · 音符 ${B.n} · ${(info.triangles / 1000).toFixed(0)}k 面 · ${info.calls} 次绘制`; }
  }
}
requestAnimationFrame(loop);
