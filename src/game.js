// 正式游戏 v0.2：四幕。舞会 → 阳台（花园）→ 决斗（广场）→ 墓室（守住沉睡的朱丽叶，两种结局）。
// 玩法：双摇杆，罗密欧唱情歌射出音符；怪被打动后变成萤火，捡了升级，三选一技能。
// 地图没有边界：地面和障碍物按 40 米一块无缝重复，玩家走到哪铺到哪（docs/场景规格.md 开头）。
// 怪物的 3D 模型还没有，先用参考图做的立牌（assets/sprites/）。
// 网址参数：?auto=1 自动跳过对话、自动选第一张卡（给测试机器人用）；?god=1 不会死；?debug=1 显示帧数；?len=秒数 缩短第一幕。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Input } from './input.js';
import { byId, drawCards, baseStats } from './skills.js';
import { PEOPLE, SCENES, ACT1_LINES, ACT2_LINES, ACT3_LINES, ACT4_LINES, BOSS_LINES, EVENT_LINES, DEATH, LOVE, PAINTINGS } from './dialogue.js';

const VERSION = 'v0.2';
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), GOD = Q.has('god'), DEBUG = Q.has('debug');
const TILE = 40;                 // 地块边长（米）
const ACT_LEN = +Q.get('len') || 45;    // 每一幕打斗时长（秒）；?len=12 给测试用，缩短每一幕
const START_ACT = +Q.get('act') || 1;   // ?act=2 直接从第二幕开始（测试用）
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

let pixelCap = 1.75;   // 清晰度上限；帧数低时自动往下调（见主循环）
// 画面铺满整个浏览器窗口（10-31 用户说手机上不是全屏：原来固定 16:9，两边留黑边）。
// 微信里横屏，上下有两条栏，剩下的地方大约 3:1，也要铺满；比 3.3:1 还宽才在两边留边。镜头的竖直视角不变，屏幕越宽，左右看得越远。
function layout() {
  const W = innerWidth, H = innerHeight;
  const portrait = H > W;
  document.body.classList.toggle('portrait', portrait);
  const h = H, w = Math.min(W, H * 3.3);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.setProperty('--u', (Math.min(h, w * 9 / 16) / 100) + 'px');
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, pixelCap));
  renderer.setSize(w, h, false);
}
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 350));   // iOS 转屏后过一会儿才报新的大小
if (window.visualViewport) visualViewport.addEventListener('resize', layout);
layout();

// ---------- 灯：冷蓝的月光和环境光，主角身上一盏暖光 ----------
const hemi = new THREE.HemisphereLight(0x8a90c8, 0x2a1e2a, 1.25); scene.add(hemi);
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

// 花园地面：深蓝绿色的草地，中间一圈浅色碎石小路（半径 8 米）。四方连续。
function gardenFloor() {
  return canvasTex(1024, (g, S) => {
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#1e3833'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 46; k++) {
      const x = rnd() * S, y = rnd() * S, r = 40 + rnd() * 110, dark = rnd() < 0.5;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, dark ? 'rgba(10,26,24,.35)' : 'rgba(52,86,70,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    for (let k = 0; k < 12000; k++) {
      const x = rnd() * S, y = rnd() * S, v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(62,104,82,.45)' : 'rgba(14,34,30,.45)';
      g.fillRect(x, y, 2, 5); if (y > S - 5) g.fillRect(x, y - S, 2, 5);
    }
    const c = S / 2, R = S * 8 / 40, w = S * 1.5 / 40;
    g.strokeStyle = '#5d5c55'; g.lineWidth = w; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 2600; k++) {
      const a = rnd() * Math.PI * 2, r = R + (rnd() - 0.5) * w * 0.95, v = 70 + rnd() * 50 | 0;
      g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2.5, 2.5);
    }
    g.strokeStyle = 'rgba(10,20,18,.5)'; g.lineWidth = 3;
    for (const rr of [R - w / 2, R + w / 2]) { g.beginPath(); g.arc(c, c, rr, 0, Math.PI * 2); g.stroke(); }
  }, true);
}

// 广场地面：粉色和赭色的旧石板，2 米一块（40 米正好 20 块），压暗、低对比
function piazzaFloor() {
  return canvasTex(1024, (g, S) => {
    let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 20, cell = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = rnd() * 14 - 7, warm = rnd() < 0.5;
      g.fillStyle = warm ? `rgb(${104 + v | 0},${74 + v | 0},${66 + v | 0})` : `rgb(${96 + v | 0},${76 + v | 0},${58 + v | 0})`;
      g.fillRect(x * cell, y * cell, cell, cell);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(x * cell + rnd() * cell, y * cell + rnd() * cell, 3, 3); }
    }
    g.strokeStyle = 'rgba(30,18,20,.55)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke(); g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke(); }
  }, true);
}
// 墓室地面：灰紫色的大石板，素一点，有磨损
function tombFloor() {
  return canvasTex(1024, (g, S) => {
    let seed = 31; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 10, cell = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = rnd() * 10 - 5;
      g.fillStyle = `rgb(${46 + v | 0},${42 + v | 0},${54 + v | 0})`;
      g.fillRect(x * cell, y * cell, cell, cell);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,110,140'},${rnd() * 0.08})`; g.fillRect(x * cell + rnd() * cell, y * cell + rnd() * cell, 2 + rnd() * 6, 2 + rnd() * 6); }
    }
    g.strokeStyle = 'rgba(8,6,12,.7)'; g.lineWidth = 4;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke(); g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke(); }
  }, true);
}

// ---------- 无限地面 ----------
const floors = { 1: ballroomFloor() };
const FLOOR_FN = { 2: gardenFloor, 3: piazzaFloor, 4: tombFloor };
const floorTex = floors[1]; floorTex.repeat.set(3, 3);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 3, TILE * 3), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

// ---------- 地块里的障碍物（第一幕，坐标见 docs/Unity场景和提示词.md「补充 2」） ----------
const ACT1_OBS = [
  { kind: 'table', x: -11, z: -11, r: 1.3 }, { kind: 'table', x: 11, z: 11, r: 1.3 },
  { kind: 'harp', x: 11, z: -11, r: 1.0 }, { kind: 'harp', x: -11, z: 11, r: 1.0 },
  { kind: 'candle', x: -15, z: 0, r: 0.6 }, { kind: 'candle', x: 15, z: 0, r: 0.6 },
];
const ACT2_OBS = [
  { kind: 'fountain', x: -11, z: -11, r: 2.0 }, { kind: 'statue', x: 11, z: -11, r: 1.0 }, { kind: 'hedge', x: 11, z: 11, r: 2.0 },
  { kind: 'tree', x: -11, z: 11, r: 0.8 }, { kind: 'tree', x: -15, z: 0, r: 0.8 }, { kind: 'tree', x: 15, z: 0, r: 0.8 },
];
const ACT3_OBS = [
  { kind: 'well', x: -11, z: -11, r: 1.3 }, { kind: 'cart', x: 11, z: -11, r: 1.6 }, { kind: 'column', x: 11, z: 11, r: 0.9 },
  { kind: 'crates', x: -11, z: 11, r: 1.4 }, { kind: 'stall', x: -15, z: 0, r: 1.6 }, { kind: 'barrels', x: 15, z: 0, r: 0.9 },
];
const ACT4_OBS = [
  { kind: 'coffin', x: -11, z: -11, r: 1.5 }, { kind: 'coffin', x: 11, z: 11, r: 1.5 },
  { kind: 'pillar', x: 11, z: -11, r: 0.8 }, { kind: 'pillar', x: -11, z: 11, r: 0.8 }, { kind: 'pillar', x: -15, z: 0, r: 0.8 }, { kind: 'pillar', x: 15, z: 0, r: 0.8 },
];
const OBS = { 1: ACT1_OBS, 2: ACT2_OBS, 3: ACT3_OBS, 4: ACT4_OBS };
const MAT = {
  hedge: new THREE.MeshLambertMaterial({ color: 0x2b5236 }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x2f5c34 }),
  orange: new THREE.MeshLambertMaterial({ color: 0xe38a2c, emissive: 0x3a1a04 }),
  pot: new THREE.MeshLambertMaterial({ color: 0x8e4a2c }),
  marble: new THREE.MeshLambertMaterial({ color: 0xd9d3c8, emissive: 0x1a1a22 }),
  water: new THREE.MeshLambertMaterial({ color: 0x3d6f8e, emissive: 0x0b2236 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x4a3222 }),
  rose: new THREE.MeshLambertMaterial({ color: 0xb0263a, emissive: 0x200408 }),
  coolPool: additive(glowTex('127,227,216'), 0.18),
  canvas: new THREE.MeshLambertMaterial({ color: 0xd8ccb0 }),
  redBanner: new THREE.MeshLambertMaterial({ color: 0xa3283a, emissive: 0x200408, side: THREE.DoubleSide }),
  blueBanner: new THREE.MeshLambertMaterial({ color: 0x2a4a8a, emissive: 0x060a20, side: THREE.DoubleSide }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x3a3646 }),
  cloth: new THREE.MeshLambertMaterial({ color: 0x7a2230 }),
  gold: new THREE.MeshLambertMaterial({ color: 0xd9a441, emissive: 0x3a2508 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x5a5262 }),
  iron: new THREE.MeshLambertMaterial({ color: 0x2c2832 }),
  wax: new THREE.MeshLambertMaterial({ color: 0xf2ede4, emissive: 0x332a20 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  glow: additive(glowTex('255,184,92'), 0.9),
  pool: additive(glowTex('255,170,80'), 0.24),
};
function buildTile(act) {
  const obs = OBS[act];
  const parts = Object.fromEntries(Object.keys(MAT).map((k) => [k, []]));
  const put = (k, geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => {
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.scale(s, s, s); geo.translate(x, y, z);
    parts[k].push(geo.index ? geo.toNonIndexed() : geo);
  };
  const flame = (x, y, z) => {
    put('flame', new THREE.SphereGeometry(0.07, 6, 4).scale(1, 1.7, 1), x, y, z);
    const gl = new THREE.PlaneGeometry(0.9, 0.9); gl.rotateX(-PITCH); put('glow', gl, x, y, z);
  };
  const pool = (x, z, r, k = 'pool') => put(k, new THREE.PlaneGeometry(r * 2, r * 2), x, 0.02, z, -Math.PI / 2);
  const lantern = (x, z) => { put('iron', new THREE.CylinderGeometry(0.04, 0.06, 0.45, 6), x, 0.22, z); put('gold', new THREE.BoxGeometry(0.16, 0.18, 0.16), x, 0.52, z); flame(x, 0.52, z); pool(x, z, 2.4); };
  const bush = (x, z) => { put('hedge', new THREE.SphereGeometry(0.3, 7, 5).scale(1, 0.7, 1), x, 0.18, z); for (let k = 0; k < 3; k++) put('rose', new THREE.SphereGeometry(0.07, 5, 4), x + (Math.random() - 0.5) * 0.4, 0.33, z + (Math.random() - 0.5) * 0.4); };
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
    } else if (o.kind === 'fountain') {
      put('stone', new THREE.CylinderGeometry(2.0, 2.1, 0.6, 20), x, 0.3, z);
      put('water', new THREE.CylinderGeometry(1.8, 1.8, 0.04, 20), x, 0.58, z);
      put('stone', new THREE.CylinderGeometry(0.22, 0.3, 1.2, 8), x, 1.0, z);
      put('stone', new THREE.CylinderGeometry(0.75, 0.4, 0.18, 14), x, 1.62, z);
      put('water', new THREE.CylinderGeometry(0.66, 0.66, 0.03, 14), x, 1.72, z);
      pool(x, z, 3.4, 'coolPool');
    } else if (o.kind === 'statue') {
      put('stone', new THREE.BoxGeometry(1.3, 0.8, 1.3), x, 0.4, z);
      put('marble', new THREE.CylinderGeometry(0.22, 0.42, 1.25, 10), x, 1.42, z);
      put('marble', new THREE.SphereGeometry(0.2, 10, 8), x, 2.22, z);
      put('marble', new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), x + 0.32, 1.7, z, 0, 0, 0.9);
      pool(x, z, 2.4, 'coolPool');
    } else if (o.kind === 'hedge') {
      put('hedge', new THREE.SphereGeometry(2.0, 16, 10).scale(1, 0.72, 1), x, 0.95, z);
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; put('rose', new THREE.SphereGeometry(0.1, 5, 4), x + Math.cos(a) * 1.75, 1.0 + Math.sin(k * 2.3) * 0.4, z + Math.sin(a) * 1.75); }
    } else if (o.kind === 'tree') {
      put('pot', new THREE.CylinderGeometry(0.55, 0.42, 0.6, 12), x, 0.3, z);
      put('wood', new THREE.CylinderGeometry(0.08, 0.11, 0.9, 6), x, 1.0, z);
      put('leaf', new THREE.SphereGeometry(0.85, 12, 8), x, 1.75, z);
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; put('orange', new THREE.SphereGeometry(0.1, 6, 4), x + Math.cos(a) * 0.72, 1.6 + Math.sin(k * 1.7) * 0.35, z + Math.sin(a) * 0.72); }
    }
    else if (o.kind === 'well') {
      put('stone', new THREE.CylinderGeometry(1.25, 1.3, 0.9, 16, 1, true), x, 0.45, z);
      put('stone', new THREE.TorusGeometry(1.25, 0.12, 5, 18), x, 0.9, z, Math.PI / 2);
      put('iron', new THREE.CylinderGeometry(1.15, 1.15, 0.05, 16), x, 0.5, z);
      for (const dx of [-1.05, 1.05]) put('wood', new THREE.BoxGeometry(0.12, 1.6, 0.12), x + dx, 1.5, z);
      put('wood', new THREE.BoxGeometry(2.3, 0.12, 0.12), x, 2.3, z);
    } else if (o.kind === 'cart') {
      const ry = 0.35;
      put('wood', new THREE.BoxGeometry(2.8, 0.5, 1.5), x, 0.9, z, 0, ry);
      for (const [dx, dz] of [[-0.9, 0.8], [0.9, 0.8], [-0.9, -0.8], [0.9, -0.8]]) put('wood', new THREE.TorusGeometry(0.45, 0.07, 4, 12), x + dx * Math.cos(ry) + dz * Math.sin(ry), 0.45, z - dx * Math.sin(ry) + dz * Math.cos(ry), 0, ry);
      put('canvas', new THREE.CylinderGeometry(0.75, 0.75, 2.6, 10, 1, true, 0, Math.PI), x, 1.15, z, 0, 0, Math.PI / 2, 1);
      put('wood', new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), x + 1.2, 1.9, z);
      put('blueBanner', new THREE.PlaneGeometry(0.7, 0.45), x + 1.55, 2.45, z);
    } else if (o.kind === 'column') {
      put('stone', new THREE.BoxGeometry(1.4, 0.4, 1.4), x, 0.2, z);
      put('marble', new THREE.CylinderGeometry(0.42, 0.48, 1.6, 12), x, 1.2, z);
      put('marble', new THREE.CylinderGeometry(0.2, 0.32, 0.55, 8), x, 2.2, z);
      put('marble', new THREE.SphereGeometry(0.16, 8, 6), x, 2.55, z);
    } else if (o.kind === 'crates') {
      put('wood', new THREE.BoxGeometry(1.2, 1.0, 1.2), x - 0.5, 0.5, z - 0.3, 0, 0.2);
      put('wood', new THREE.BoxGeometry(1.1, 0.9, 1.1), x + 0.6, 0.45, z + 0.4, 0, -0.3);
      put('wood', new THREE.BoxGeometry(0.9, 0.7, 0.9), x, 1.35, z, 0, 0.6);
      put('orange', new THREE.SphereGeometry(0.12, 6, 4), x + 0.6, 0.98, z + 0.4);
    } else if (o.kind === 'stall') {
      put('wood', new THREE.BoxGeometry(2.0, 0.9, 1.2), x, 0.45, z);
      for (const [dx, dz] of [[-0.9, -0.55], [0.9, -0.55], [-0.9, 0.55], [0.9, 0.55]]) put('wood', new THREE.BoxGeometry(0.08, 2.3, 0.08), x + dx, 1.15, z + dz);
      for (let k = 0; k < 6; k++) put(k % 2 ? 'canvas' : 'redBanner', new THREE.BoxGeometry(2.2 / 6, 0.06, 1.5), x - 1.1 + (k + 0.5) * 2.2 / 6, 2.3, z);
      put('redBanner', new THREE.PlaneGeometry(0.6, 0.9), x, 1.6, z + 0.62);
      for (let k = 0; k < 5; k++) put('orange', new THREE.SphereGeometry(0.1, 6, 4), x - 0.6 + k * 0.3, 0.98, z);
    } else if (o.kind === 'barrels') {
      for (const [dx, dz] of [[-0.4, 0], [0.4, 0.1], [0, -0.55]]) put('wood', new THREE.CylinderGeometry(0.36, 0.36, 0.95, 10), x + dx, 0.48, z + dz);
    } else if (o.kind === 'coffin') {
      put('darkStone', new THREE.BoxGeometry(2.8, 0.85, 1.4), x, 0.42, z);
      put('stone', new THREE.BoxGeometry(2.95, 0.15, 1.55), x, 0.92, z);
      put('marble', new THREE.SphereGeometry(0.22, 8, 6).scale(3.2, 0.6, 1.4), x, 1.05, z);
      flame(x + 1.6, 0.5, z + 0.9); pool(x, z, 2.6);
    } else if (o.kind === 'pillar') {
      put('darkStone', new THREE.BoxGeometry(1.4, 0.4, 1.4), x, 0.2, z);
      put('stone', new THREE.CylinderGeometry(0.55, 0.6, 2.1, 12), x, 1.45, z);
      put('darkStone', new THREE.BoxGeometry(1.3, 0.25, 1.3), x, 2.5, z);
    }
    if (act === 1) {
      for (let k = 0; k < 7; k++) { const a = Math.random() * 6.28, d = o.r + 0.6 + Math.random() * 1.6; rose(x + Math.cos(a) * d, z + Math.sin(a) * d); }
      for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, d = o.r + 0.8 + Math.random() * 1.2; mask(x + Math.cos(a) * d, z + Math.sin(a) * d); }
    } else if (act === 2) {
      for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, d = o.r + 0.7 + Math.random() * 1.2; bush(x + Math.cos(a) * d, z + Math.sin(a) * d); }
    } else if (act === 3) {
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.28, d = o.r + 0.6 + Math.random() * 1.4; put(k % 2 ? 'orange' : 'rose', new THREE.SphereGeometry(0.09, 5, 4), x + Math.cos(a) * d, 0.09, z + Math.sin(a) * d); }
    } else {
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.28, d = o.r + 0.6 + Math.random() * 1.2; rose(x + Math.cos(a) * d, z + Math.sin(a) * d); }
    }
  }
  if (act === 1) { pool(0, 0, 8.5); pool(20, 20, 4.5); pool(-20, 20, 4.5); pool(20, -20, 4.5); pool(-20, -20, 4.5); } // 吊灯照在地上的暖色光斑
  else if (act === 2) { for (const [x, z] of [[-6.6, -6.6], [6.6, 6.6], [6.6, -6.6], [-6.6, 6.6]]) lantern(x, z); }   // 花园：小路边四盏矮灯笼
  else if (act === 4) { for (const [x, z] of [[-17, -17], [17, 17], [-17, 6], [17, -6]]) { put('iron', new THREE.CylinderGeometry(0.05, 0.08, 0.45, 6), x, 0.22, z); flame(x, 0.55, z); pool(x, z, 2.2); } }
  const g = new THREE.Group();
  for (const [k, list] of Object.entries(parts)) if (list.length) {
    const m = new THREE.Mesh(mergeGeometries(list), MAT[k]);
    if (k === 'pool') m.renderOrder = -1;
    g.add(m);
  }
  return g;
}
// 第四幕：场地正中间的石台，朱丽叶躺在上面，周围一圈蜡烛（只放一个，不重复）
const bier = new THREE.Group();
{
  const parts = { darkStone: [], stone: [], wax: [], flame: [], glow: [], pool: [] };
  const add = (k, geo, x, y, z) => { geo.translate(x, y, z); parts[k].push(geo.index ? geo.toNonIndexed() : geo); };
  add('darkStone', new THREE.BoxGeometry(2.6, 0.8, 1.4), 0, 0.4, 0);
  add('stone', new THREE.BoxGeometry(2.8, 0.12, 1.6), 0, 0.86, 0);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.1, h = 0.18 + (k % 3) * 0.08;
    add('wax', new THREE.CylinderGeometry(0.06, 0.06, h, 6), x, h / 2, z);
    add('flame', new THREE.SphereGeometry(0.06, 6, 4).scale(1, 1.7, 1), x, h + 0.08, z);
    const gl = new THREE.PlaneGeometry(0.8, 0.8); gl.rotateX(-PITCH); add('glow', gl, x, h + 0.08, z);
  }
  const pl = new THREE.PlaneGeometry(9, 9); pl.rotateX(-Math.PI / 2); add('pool', pl, 0, 0.025, 0);
  for (const [k, list] of Object.entries(parts)) bier.add(new THREE.Mesh(mergeGeometries(list), MAT[k]));
  bier.visible = false; scene.add(bier);
}
const bierLight = new THREE.PointLight(0xffb85c, 22, 11, 1.4); bierLight.position.set(0, 2.2, 0.5); bierLight.visible = false; scene.add(bierLight);
const BIER_R = 1.45;

let tiles = [], curObs = ACT1_OBS, tileAct = 0;
let tileIX = 1e9, tileIZ = 1e9;
// 换一幕：换地面、地块、灯光
const LOOKS = {
  1: { bg: 0x14121c, hemi: [0x8a90c8, 0x2a1e2a, 1.25], moon: [0x9fb4ff, 0.9] },
  2: { bg: 0x0e1420, hemi: [0x7a92c8, 0x16241f, 1.15], moon: [0xa8c0ff, 1.5] },
  3: { bg: 0x2a1c26, hemi: [0xffc890, 0x3a2a40, 1.05], moon: [0xffa860, 1.9], sun: [-14, 7, 2] },
  4: { bg: 0x09090f, hemi: [0x5a6aa0, 0x10101a, 0.8], moon: [0x7fa0ff, 0.5] },
};
function setAct(n) {
  if (tileAct !== n) {
    for (const t of tiles) scene.remove(t);
    if (tiles[0]) tiles[0].traverse((o) => o.geometry && o.geometry.dispose());
    const proto = buildTile(n);
    tiles = []; for (let i = 0; i < 9; i++) { const t = proto.clone(); scene.add(t); tiles.push(t); }
    if (!floors[n]) { floors[n] = FLOOR_FN[n](); floors[n].repeat.set(3, 3); }
    floor.material.map = floors[n]; floor.material.needsUpdate = true;
    tileAct = n;
  }
  curObs = OBS[n];
  const L = LOOKS[n];
  scene.background.setHex(L.bg); scene.fog.color.setHex(L.bg);
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  moon.color.setHex(L.moon[0]); moon.intensity = L.moon[1]; moon.position.set(...(L.sun || [-6, 12, -4]));
  bier.visible = n === 4; bierLight.visible = n === 4;
  tileIX = 1e9; updateTiles(player.x, player.z);
}
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
  if (act === 4) { const d = Math.hypot(p.x, p.z), rr = BIER_R + r; if (d < rr) { const k = rr / (d || 1e-3); p.x *= k; p.z *= k; } }
  const ox = Math.round(p.x / TILE) * TILE, oz = Math.round(p.z / TILE) * TILE;
  for (const o of curObs) {
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
  { key: 'cerberus', h: 3.0, r: 1.4, hp: 110, speed: 2.1, dmg: 16, xp: 0, flip: true, boss: true, label: '看门的三头犬' },
  { key: 'horn', h: 1.5, r: 0.45, hp: 3, speed: 2.3, dmg: 6, xp: 2, flip: true, ranged: true },
  { key: 'shade', h: 1.5, r: 0.42, hp: 3, speed: 1.9, dmg: 6, xp: 1, flip: false, ghost: true },
  { key: 'tybalt', model: true, h: 2.3, r: 0.8, hp: 200, speed: 2.5, dmg: 18, xp: 0, boss: true, label: '提伯尔特' },
];
const HP_ADD = [1, 0, 3, 0, 1, 0, 0];   // 每往后一幕，怪多几点血
const T = Object.fromEntries(TYPES.map((t, i) => [t.key, i]));
function billboardGeo(w, h, centerY) {
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, centerY ? 0 : h / 2, 0); g.rotateX(-PITCH); return g;
}
const enemyMeshes = TYPES.map((t) => {
  if (t.model) return null;   // 提伯尔特用 3D 模型画
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
const ebMesh = flatInst(billboardGeo(1, 1, true), additive(glowTex('255,96,72')), 240);   // 号角怪的酸音：红色的光团
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
let hero = null, juliet = null, tybalt = null, mercutio = null;

// ---------- 数据 ----------
const E = { n: 0, type: new Uint8Array(MAX_E), x: new Float32Array(MAX_E), z: new Float32Array(MAX_E), hp: new Float32Array(MAX_E),
  flash: new Float32Array(MAX_E), phase: new Float32Array(MAX_E), speed: new Float32Array(MAX_E), id: new Int32Array(MAX_E),
  ocd: new Float32Array(MAX_E), face: new Int8Array(MAX_E), atk: new Float32Array(MAX_E) };
// 怪射来的酸音（号角怪）
const MAX_EB = 240;
const EB = { n: 0, x: new Float32Array(MAX_EB), z: new Float32Array(MAX_EB), dx: new Float32Array(MAX_EB), dz: new Float32Array(MAX_EB), life: new Float32Array(MAX_EB) };
const B = { n: 0, x: new Float32Array(MAX_B), z: new Float32Array(MAX_B), dx: new Float32Array(MAX_B), dz: new Float32Array(MAX_B),
  life: new Float32Array(MAX_B), dmg: new Float32Array(MAX_B), pierce: new Int16Array(MAX_B), bounce: new Int16Array(MAX_B),
  size: new Float32Array(MAX_B), last: new Int32Array(MAX_B) };
const O = { n: 0, x: new Float32Array(MAX_O), z: new Float32Array(MAX_O), v: new Float32Array(MAX_O), t: new Float32Array(MAX_O) };
let nextId = 1;

const player = { x: 0, z: 0, r: 0.45, hp: 100, hurtCd: 0, aimX: 0, aimZ: 1, moving: 0 };   // aimZ = 1：开打前面朝镜头
let stats = baseStats(), levels = {}, level = 1, xp = 0, kills = 0, pendingLevels = 0;
let time = 0, actTime = 0, fireCd = 0, drumCd = 0, slowmo = 0, noteIdx = 0, act = 1, snapshot = null;
let calmHit = 0, dogSpawned = false, dogDown = false, bossCharge = 0, bossChargeCd = 4, calm = 100, mercFell = false, tybaltHalfSaid = false;
let phase = 'title';            // title → story → fight → levelup → actEnd → card → over
const maxHp = () => 100 + stats.maxHpBonus;
const xpNeed = (L) => (L === 1 ? 2 : Math.round(3 * Math.pow(L, 1.35)));   // 第一次升级来得快（约第 7 秒）
const input = new Input();

function resetRun() {
  E.n = B.n = O.n = 0;
  player.x = player.z = 0; player.hp = 100; player.hurtCd = 0; player.aimX = 0; player.aimZ = 1;
  stats = baseStats(); levels = {}; level = 1; xp = 0; kills = 0; pendingLevels = 0;
  time = actTime = 0; fireCd = drumCd = slowmo = 0; lineIdx = 0; saidLow = false; firstLevelSaid = false; birdWaves = 0;
  act = 1; snapshot = null;
  if (tybalt) tybalt.visible = false;
  if (juliet) juliet.visible = false;
}

// ---------- 怪的生成和数量（第一幕：开局很简单，慢慢变多） ----------
function act1Target(t) { return t < 20 ? Math.round(2 + t * 0.4) : Math.round(10 + (t - 20) * 1.25); }
let spawnAcc = 0, birdWaves = 0;
function spawnEnemy(type, ang, dist, cx = player.x, cz = player.z) {
  if (E.n >= MAX_E) return;
  const wide = Math.max(1, camera.aspect / (16 / 9));   // 屏幕更宽时，左右两边生成得更远，保证在画面外
  const a = ang ?? Math.random() * Math.PI * 2, d = dist ?? (actTime < 10 ? 15 : 17) + Math.random() * 3;
  const ca = Math.cos(a), p = { x: cx + Math.sin(a) * d * wide, z: cz + ca * d * (ca < 0 ? 1.1 : 0.75) };   // 生成在屏幕外
  pushOut(p, 0.6);
  const t = TYPES[type], i = E.n++;
  E.type[i] = type; E.x[i] = p.x; E.z[i] = p.z; E.flash[i] = 0; E.phase[i] = Math.random() * 10; E.ocd[i] = 0; E.face[i] = 1; E.atk[i] = 1 + Math.random() * 2;
  E.hp[i] = t.hp + HP_ADD[type] * (act - 1) + (type === T.lute && act === 1 && actTime > 22 ? 1 : 0);
  E.speed[i] = t.speed * (0.85 + Math.random() * 0.3); E.id[i] = nextId++;
}
const lowHp = () => player.hp < maxHp() * 0.35;
function director(dt) {
  if (phase !== 'fight') return;
  if (act === 2) { director2(dt); return; }
  if (act === 3) { director3(dt); return; }
  if (act === 4) { director4(dt); return; }
  const target = act1Target(actTime) * (lowHp() ? 0.75 : 1);   // 血少时悄悄少出一点
  spawnAcc += dt * (actTime < 20 ? 2 : 6);
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n < target) spawnEnemy(T.lute); }
  // 鸟嘴面具客人：第 25 秒起，每 6 秒从一个方向冲来一小群
  if (actTime > 25 + birdWaves * 6 && actTime < ACT_LEN - 3) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, 17 + Math.random() * 3);
  }
  if (actTime > 38 && E.n < target + 3 && Math.random() < dt * 0.6) spawnEnemy(T.drum);
}
// 第二幕：家丁和鼓怪更多更厚，鸟嘴面具一群群来，第 22 秒左右三头犬从远处冲来（打它时小怪变少）
const DOG_AT = Math.min(22, ACT_LEN * 0.5);
function director2(dt) {
  const boss = dogSpawned && !dogDown;
  const target = (22 + actTime * 0.8) * (boss ? 0.45 : 1) * (lowHp() ? 0.75 : 1);
  spawnAcc += dt * 7;
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n < target) spawnEnemy(Math.random() < 0.28 ? T.drum : T.lute); }
  if (!boss && actTime > 5 + birdWaves * 7) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 8 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, 17 + Math.random() * 3);
  }
  if (!dogSpawned && actTime >= DOG_AT) {
    dogSpawned = true; bossChargeCd = 4;
    spawnEnemy(T.cerberus, Math.PI, 15);
    bark(BOSS_LINES.dogIn.who, BOSS_LINES.dogIn.text);
  }
}
function bossIndex() { for (let i = 0; i < E.n; i++) if (TYPES[E.type[i]].boss) return i; return -1; }
const count = (ty) => { let c = 0; for (let i = 0; i < E.n; i++) if (E.type[i] === ty) c++; return c; };
// 第三幕：两家的人潮最多最厚，号角怪站在远处吹酸音；第 18 秒茂丘西奥倒下，第 22 秒提伯尔特出场
function director3(dt) {
  const boss = dogSpawned && !dogDown;
  const target = (30 + actTime * 0.9) * (boss ? 0.5 : 1) * (lowHp() ? 0.75 : 1);
  spawnAcc += dt * 8;
  while (spawnAcc >= 1) {
    spawnAcc -= 1; if (E.n >= target) continue;
    const r = Math.random();
    spawnEnemy(r < 0.22 && count(T.horn) < 8 ? T.horn : r < 0.42 ? T.drum : T.lute);
  }
  if (!boss && actTime > 6 + birdWaves * 8) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 10 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, 17 + Math.random() * 3);
  }
  const fallAt = Math.min(18, ACT_LEN * 0.4), bossAt = Math.min(22, ACT_LEN * 0.5);
  if (!mercFell && actTime >= fallAt) {
    mercFell = true; slowmo = 1.2;
    bark(BOSS_LINES.mercutioFall.who, BOSS_LINES.mercutioFall.text);
    setTimeout(() => { if (act === 3 && phase === 'fight') bark(BOSS_LINES.mercutioFall2.who, BOSS_LINES.mercutioFall2.text); }, 2600);
  }
  if (!dogSpawned && actTime >= bossAt) {
    dogSpawned = true; bossChargeCd = 3; tybaltHalfSaid = false;
    spawnEnemy(T.tybalt, Math.PI, 14);
    bark(BOSS_LINES.tybaltIn.who, BOSS_LINES.tybaltIn.text);
    setTimeout(() => { if (act === 3 && phase === 'fight') bark(BOSS_LINES.tybaltIn2.who, BOSS_LINES.tybaltIn2.text); }, 2400);
  }
}
// 第四幕：亡魂从四面八方涌向石台上的朱丽叶，也有一些家丁冲着罗密欧来
function director4(dt) {
  const target = (16 + actTime * 0.9) * (lowHp() ? 0.8 : 1);
  spawnAcc += dt * 6;
  while (spawnAcc >= 1) {
    spawnAcc -= 1; if (E.n >= target) continue;
    if (Math.random() < 0.85) spawnEnemy(T.shade, undefined, 17 + Math.random() * 4, 0, 0);
    else spawnEnemy(Math.random() < 0.5 ? T.drum : T.lute);
  }
}

function killEnemy(i) {
  const t = TYPES[E.type[i]];
  if (t.boss) {   // Boss 被打动：散出一大圈萤火
    dogDown = true;
    for (let k = 0; k < 26 && O.n < MAX_O; k++) { const a = k / 26 * 6.28, d = 1 + Math.random() * 2, j = O.n++; O.x[j] = E.x[i] + Math.cos(a) * d; O.z[j] = E.z[i] + Math.sin(a) * d; O.v[j] = 1; O.t[j] = Math.random() * 6; }
    if (phase === 'fight' || phase === 'levelup') { const L = t.key === 'tybalt' ? BOSS_LINES.tybaltDown : BOSS_LINES.dogDown; bark(L.who, L.text); }
    ring(E.x[i], E.z[i], 6, 0.8);
  } else if (O.n < MAX_O) { const k = O.n++; O.x[k] = E.x[i]; O.z[k] = E.z[i]; O.v[k] = t.xp * [1, 1, 1.2, 1.5, 1.5][act]; O.t[k] = Math.random() * 6; }   // 后面几幕每只怪给的经验多一点
  const j = --E.n;
  for (const a of [E.type, E.x, E.z, E.hp, E.flash, E.phase, E.speed, E.id, E.ocd, E.face, E.atk]) a[i] = a[j];
  kills++;
}
function removeBullet(i) {
  const j = --B.n;
  for (const a of [B.x, B.z, B.dx, B.dz, B.life, B.dmg, B.pierce, B.bounce, B.size, B.last]) a[i] = a[j];
}
function hurtEnemy(i, dmg, kx = 0, kz = 0) {
  E.hp[i] -= dmg; E.flash[i] = 0.09;
  if (TYPES[E.type[i]].boss) { kx *= 0.08; kz *= 0.08; }   // 三头犬推不太动
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
let muted = false;
function pluck(semi, vol = 0.05, dur = 0.35, type = 'triangle') {
  if (!actx || muted) return;
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
<div id="boss" class="hide"><b>看门的三头犬</b><div class="bossbar"><i></i></div></div>
<div id="acttitle" class="hide"><b></b></div>
<div id="calm" class="hide"><b>朱丽叶的安稳</b><div class="bossbar"><i></i></div></div>
<div id="bark" class="hide"><img alt=""><div><b></b><span></span></div></div>
<div id="dlg" class="hide" data-ui><div class="por"><img alt=""></div><div class="box"><b class="who"></b><div class="txt"></div><i class="more">▼</i></div><button class="skip">跳过 ›</button></div>
<div id="cards" class="hide" data-ui><h2></h2><div class="row"></div></div>
<div id="art" class="hide" data-ui><div class="frame"><img alt=""></div><div class="info"><h2></h2><p class="by"></p><p class="where"></p><ul></ul><div class="btns"></div></div></div>
<div id="title" data-ui><h1>罗密欧与朱丽叶</h1><p class="sub">用情歌打怪，改写莎士比亚的结局</p><p class="go">加载中……</p><p class="tip">横屏 · 左手拖着走 · 右手拖着瞄（不碰会自动唱）</p><p class="ver">${VERSION} 开发中：四幕都能玩了</p><p class="fshint hide"></p></div>
<div id="tools" class="hide"><button class="b-pause">暂停</button><button class="b-mute">声音 开</button></div>
<div id="pause" class="hide" data-ui><h2>暂停</h2><button class="b-resume">继续</button><button class="b-restart">从头开始</button></div>
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
let lineIdx = 0, saidLow = false, firstLevelSaid = false, saidCalmHalf = false, saidCalmLow = false;
const ACTS = {
  1: { name: '第一幕 · 舞会', lines: ACT1_LINES },
  2: { name: '第二幕 · 阳台', lines: ACT2_LINES },
  3: { name: '第三幕 · 决斗', lines: ACT3_LINES },
  4: { name: '第四幕 · 墓室', lines: ACT4_LINES },
};
const ACT_NO = ['', '第一', '第二', '第三', '第四'];
async function startRun(again) {
  resetRun();
  show($('#title'), false);
  phase = 'story';
  if (START_ACT > 1 && !again) {   // 测试用：直接从后面的幕开始，先送几级
    for (const id of ['chord', 'presto', 'sustain', 'chord']) { takeSkill(id); level++; }
  } else if (!again) await playScene(SCENES.prologue);
  beginAct(again ? 1 : START_ACT);
}
function beginAct(n, retry) {
  act = n;
  if (retry && snapshot) { ({ stats, levels, level, xp } = structuredClone(snapshot)); player.hp = maxHp(); }
  else snapshot = structuredClone({ stats, levels, level, xp });
  E.n = B.n = O.n = 0; if (retry) pendingLevels = 0;   // 上一幕结束时攒下的升级，这一幕一开打就选
  player.x = player.z = 0; player.aimX = 0; player.aimZ = 1; player.hurtCd = 0;
  if (n > 1 && !retry) player.hp = Math.min(maxHp(), player.hp + maxHp() * 0.35);   // 每一幕开头回一点血
  actTime = 0; lineIdx = 0; birdWaves = 0; spawnAcc = 0; saidLow = false;
  dogSpawned = dogDown = false; bossCharge = 0; calm = 100; saidCalmHalf = saidCalmLow = false; mercFell = false; EB.n = 0;
  if (juliet) { juliet.visible = false; layJuliet(false); }
  if (tybalt) tybalt.visible = false;
  if (mercutio) { mercutio.visible = n === 3; mercutio.position.set(-1.6, 0, 1.2); mercutio.userData.inner.rotation.set(0, 0, 0); }
  if (n === 4) { player.z = 3.2; if (juliet) { juliet.visible = true; layJuliet(true); } }
  setAct(n);
  $('#actinfo b').textContent = ACTS[n].name;
  show($('#bars')); show($('#actinfo')); show($('#tools'));
  const at = $('#acttitle'); at.querySelector('b').textContent = ACTS[n].name; show(at); at.classList.remove('pop'); void at.offsetWidth; at.classList.add('pop');
  setTimeout(() => show(at, false), 2600);
  phase = 'fight';
}
// 幕结束时还没飞到的萤火，经验直接算给罗密欧
function flushOrbs() {
  for (let i = 0; i < O.n; i++) xp += O.v[i];
  O.n = 0;
  while (xp >= xpNeed(level)) { xp -= xpNeed(level); level++; pendingLevels++; }
}
function layJuliet(lying) {
  const j = juliet, inner = j.userData.inner;
  j.userData.lying = lying;
  if (lying) { j.position.set(0, 0.92, 0); j.rotation.set(0, Math.PI / 2, 0); inner.rotation.set(-Math.PI / 2, 0, 0); inner.position.set(0, 0.15, 0.95); inner.scale.set(1, 1, 0.55); }
  else { j.rotation.set(0, 0, 0); inner.rotation.set(0, 0, 0); inner.position.set(0, 0, 0); inner.scale.set(1, 1, 1); }
}
async function endAct(good) {
  phase = 'actEnd';
  // 怪都安静下来，变成萤火
  for (let i = E.n - 1; i >= 0; i--) killEnemy(i);
  B.n = 0; EB.n = 0; show($('#boss'), false); show($('#calm'), false);
  if (mercutio) mercutio.visible = false;
  if (act === 4) { await tombEnding(good); return; }
  if (juliet) { juliet.visible = true; layJuliet(false); juliet.position.set(player.x + 1.6, 0, player.z - 3.2); juliet.rotation.y = Math.atan2(-1.6, 3.2); }
  if (hero) { player.aimX = 0.45; player.aimZ = -0.9; }
  await sleep(AUTO ? 50 : 1400);
  flushOrbs();
  show($('#bars'), false); show($('#actinfo'), false); show($('#bark'), false); show($('#tools'), false);
  await playScene(SCENES[`act${act}End`]);
  phase = 'card';
  stage.classList.add('freeze');
  await sleep(AUTO ? 50 : 900);
  await paintingCard(act, { buttons: [['继续', 'go']] });
  stage.classList.remove('freeze');
  await playScene(SCENES[`act${act}To${act + 1}`]);
  if (ACTS[act + 1]) beginAct(act + 1);
  else paintingCardEnd();
}
// 第四幕的两种结局
async function tombEnding(good) {
  if (good) {   // 守住了：朱丽叶醒来，站到罗密欧面前
    layJuliet(false); juliet.position.set(1.9, 0, 1.0); juliet.rotation.y = Math.atan2(player.x - 1.9, player.z - 1.0);
    player.aimX = 0.8; player.aimZ = -0.6;
    bierLight.intensity = 40;
  } else {
    stage.classList.add('freeze');
  }
  await sleep(AUTO ? 50 : 1400);
  show($('#bars'), false); show($('#actinfo'), false); show($('#bark'), false); show($('#tools'), false);
  await playScene(SCENES[good ? 'goodEnd' : 'badEnd']);
  phase = 'card'; stage.classList.add('freeze');
  await sleep(AUTO ? 50 : 900);
  if (good) {
    await paintingCard('good', { lead: '你守住了朱丽叶，改写了莎士比亚的结局。', buttons: [['看结尾', 'go']] });
    stage.classList.remove('freeze'); bierLight.intensity = 22;
    theEnd(true);
  } else {
    const v = await paintingCard('bad', { lead: '莎士比亚写下的结局就是这样。再来一次，改写它？', buttons: [['从这一幕重来', 'act'], ['从头开始', 'all']] });
    stage.classList.remove('freeze');
    if (v === 'act') beginAct(4, true); else startRun(true);
  }
}
function theEnd() {
  phase = 'over';
  const el = $('#title');
  el.querySelector('h1').textContent = '全剧终';
  el.querySelector('.sub').textContent = '这一次，罗密欧和朱丽叶都活了下来。';
  el.querySelector('.go').textContent = '点一下，再玩一次';
  el.querySelector('.tip').textContent = `这一局：${level} 级，打动了 ${kills} 只怪`;
  show(el); titleReady = true;
}
function paintingCardEnd() {
  phase = 'over';
  const el = $('#title');
  el.querySelector('h1').textContent = `${ACT_NO[act]}幕 完`;
  el.querySelector('.sub').textContent = ['', '', '第三幕「决斗」正在制作，先玩到这里。'][act] || '后面的几幕正在制作，先玩到这里。';
  el.querySelector('.go').textContent = '点一下，再玩一次';
  el.querySelector('.tip').textContent = `这一局：${level} 级，打动了 ${kills} 只怪`;
  show(el); titleReady = true;
}
async function die() {
  phase = 'dead';
  show($('#bark'), false); show($('#boss'), false);
  await sleep(AUTO ? 50 : 1200);
  show($('#bars'), false); show($('#actinfo'), false); show($('#tools'), false);
  await playScene([['narrator', DEATH[act]]]);
  const btns = act > 1 ? [['从这一幕重来', 'act'], ['从头开始', 'all']] : [['再来一次', 'all']];
  const v = await paintingCard(act === 4 ? 'bad' : act, { lead: `你在${ACT_NO[act]}幕倒下了。先看看这一幕的名画：`, buttons: btns });   // 第四幕没有单独的画，用原版结局那幅
  if (v === 'act') beginAct(act, true); else startRun(true);
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
    const LINES = ACTS[act].lines;
    while (lineIdx < LINES.length && actTime >= LINES[lineIdx].t) {
      const L = LINES[lineIdx++];
      bark(L.who, L.text);
      if (L.tag === 'tybalt' && tybalt) { tybalt.visible = true; tybalt.position.set(player.x - 7.5, 0, player.z - 5); tybalt.userData.t = 0; }
    }
    if (!saidLow && player.hp < maxHp() * 0.4) { saidLow = true; bark(EVENT_LINES.lowHp.who, EVENT_LINES.lowHp.text); }
    if (act === 4) {
      if (calm <= 0) { endAct(false); return; }
      if (actTime >= ACT_LEN) { endAct(true); return; }
      if (!saidCalmHalf && calm < 50) { saidCalmHalf = true; bark(BOSS_LINES.calmHalf.who, BOSS_LINES.calmHalf.text); }
      if (!saidCalmLow && calm < 20) { saidCalmLow = true; bark(BOSS_LINES.calmLow.who, BOSS_LINES.calmLow.text); }
    } else if (actTime >= ACT_LEN && (act === 1 || dogDown)) { endAct(); return; }
    if (act === 3 && dogSpawned && !dogDown && !tybaltHalfSaid) {
      const bi = bossIndex(); if (bi >= 0 && E.hp[bi] < TYPES[T.tybalt].hp / 2) { tybaltHalfSaid = true; bark(BOSS_LINES.tybaltHalf.who, BOSS_LINES.tybaltHalf.text); }
    }
    if (dogSpawned && !dogDown) {   // 三头犬每隔几秒猛冲一下
      bossChargeCd -= dt; bossCharge -= dt;
      if (bossChargeCd <= 0) { bossChargeCd = 5; bossCharge = 0.8; }
    }
  }
  if (act === 1 && tybalt && tybalt.visible) {   // 第一幕：提伯尔特在场边露面
    tybalt.userData.t += dt;
    tybalt.rotation.y = Math.atan2(player.x - tybalt.position.x, player.z - tybalt.position.z);
    if (tybalt.userData.t > 5) { tybalt.position.x -= dt * 4; tybalt.rotation.y = -Math.PI / 2; }
    if (tybalt.userData.t > 8) tybalt.visible = false;
  }

  director(dt);

  // 怪：朝主角走，互相推开，绕开障碍物
  const early = act === 1 && actTime < 20 ? 0.35 : 1;   // 第一幕前 20 秒怪几乎打不疼人
  for (let i = 0; i < E.n; i++) {
    const t = TYPES[E.type[i]];
    const dx = player.x - E.x[i], dz = player.z - E.z[i], d = Math.hypot(dx, dz) || 1;
    if (d > 34 && !t.ghost) { const a = Math.random() * 6.28; E.x[i] = player.x + Math.sin(a) * 20; E.z[i] = player.z + Math.cos(a) * 16; continue; }
    const touch = player.r + t.r;
    if (E.flash[i] > 0) E.flash[i] -= dt;
    if (E.ocd[i] > 0) E.ocd[i] -= dt;
    if (E.atk[i] > 0) E.atk[i] -= dt;
    if (t.ghost && d > 2.2) {   // 亡魂飘向石台上的朱丽叶；罗密欧挡在身边时改去缠他
      const gx = -E.x[i], gz = -E.z[i], gd = Math.hypot(gx, gz) || 1, reach = BIER_R + t.r + 0.05;
      const st = Math.min(E.speed[i] * dt, Math.max(0, gd - reach));
      E.x[i] += gx / gd * st; E.z[i] += gz / gd * st;
      if (Math.abs(gx) > 0.2) E.face[i] = gx > 0 ? 1 : -1;
      if (fighting && gd < reach + 0.15 && E.atk[i] <= 0) { E.atk[i] = 1.0; calm -= 2.4; E.flash[i] = 0.05; calmHit = 0.25; }
      continue;
    }
    let sp = E.speed[i] * (t.boss && bossCharge > 0 ? 3.2 : 1);
    if (t.ranged) {   // 号角怪：站在 7 到 9 米外，每隔两三秒吹一发酸音
      if (d < 7) sp = -sp * 0.6; else if (d < 9) sp = 0;
      if (fighting && d < 13 && E.atk[i] <= 0 && EB.n < MAX_EB) {
        E.atk[i] = 2.4 + Math.random() * 1.2;
        const k = EB.n++; EB.x[k] = E.x[i]; EB.z[k] = E.z[i]; EB.dx[k] = dx / d * 7; EB.dz[k] = dz / d * 7; EB.life[k] = 2.4;
      }
    }
    const st = sp >= 0 ? Math.min(sp * dt, Math.max(0, d - touch)) : sp * dt;
    E.x[i] += dx / d * st; E.z[i] += dz / d * st;
    if (Math.abs(dx) > 0.2) E.face[i] = dx > 0 ? 1 : -1;
    if (fighting && d < touch + 0.12 && player.hurtCd <= 0 && !GOD) {
      player.hp -= t.dmg * early; player.hurtCd = 0.45;
      if (player.hp <= 0) { player.hp = 0; die(); return; }
    }
  }
  if (player.hurtCd > 0) player.hurtCd -= dt;
  for (let k = EB.n - 1; k >= 0; k--) {
    EB.x[k] += EB.dx[k] * dt; EB.z[k] += EB.dz[k] * dt; EB.life[k] -= dt;
    const hx = EB.x[k] - player.x, hz = EB.z[k] - player.z;
    const hitP = fighting && hx * hx + hz * hz < 0.55 * 0.55;
    if (hitP && player.hurtCd <= 0 && !GOD) { player.hp -= 7; player.hurtCd = 0.45; if (player.hp <= 0) { player.hp = 0; die(); return; } }
    if (hitP || EB.life[k] <= 0) { EB.n--; for (const a of [EB.x, EB.z, EB.dx, EB.dz, EB.life]) a[k] = a[EB.n]; }
  }
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
  if (!aim) { let t = nearestEnemy(player.x, player.z, 15);
    const bi = dogSpawned && !dogDown ? bossIndex() : -1;   // Boss 在 11 米内时，自动瞄准先打 Boss
    if (act === 4) { let bd = 1e9; for (let i = 0; i < E.n; i++) if (TYPES[E.type[i]].ghost) { const q = E.x[i] * E.x[i] + E.z[i] * E.z[i]; const pd = Math.hypot(E.x[i] - player.x, E.z[i] - player.z); if (q < 36 && pd < 12 && q < bd) { bd = q; t = i; } } }   // 第四幕：先打离朱丽叶最近的亡魂
    if (bi >= 0 && Math.hypot(E.x[bi] - player.x, E.z[bi] - player.z) < 11) t = bi;
    if (t >= 0) { const dx = E.x[t] - player.x, dz = E.z[t] - player.z, d = Math.hypot(dx, dz) || 1; aim = { x: dx / d, z: dz / d }; } }
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
    if (!m) {   // 提伯尔特：3D 模型
      if (tybalt) {
        tybalt.visible = true; tybalt.position.set(E.x[i], 0, E.z[i]);
        tybalt.rotation.y = Math.atan2(player.x - E.x[i], player.z - E.z[i]);
        const inner = tybalt.userData.inner; inner.position.y = Math.abs(Math.sin(time * 7)) * 0.12; inner.rotation.z = Math.sin(time * 7) * 0.05;
        inner.scale.setScalar(E.flash[i] > 0 ? 1.06 : 1);
      }
      writeMatrix(sm, i, E.x[i], 0.012, E.z[i], t.r * 3, 1, t.r * 2.1);
      continue;
    }
    const b = Math.abs(Math.sin(time * (ty === T.birdhead ? 13 : 8) + E.phase[i]));
    const s = t.h, flip = t.flip ? E.face[i] : 1;
    writeMatrix(m.instanceMatrix.array, k, E.x[i], b * 0.12, E.z[i], s * flip * (1 + (1 - b) * 0.06), s * (0.94 + b * 0.08), s * (0.94 + b * 0.08));
    const f = E.flash[i] > 0 ? 2.6 : 0.92, col = m.instanceColor.array;
    col[k * 3] = f; col[k * 3 + 1] = f; col[k * 3 + 2] = E.flash[i] > 0 ? 2.6 : 0.98;
    const ss = t.r * 3;
    writeMatrix(sm, i, E.x[i], 0.012, E.z[i], ss, 1, ss * 0.7);
  }
  if (tybalt && act === 3 && !(dogSpawned && !dogDown) && tybalt.visible) tybalt.visible = false;
  enemyMeshes.forEach((m, ty) => { if (!m) return; m.count = counts[ty]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
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

  const em = ebMesh.instanceMatrix.array;
  for (let k = 0; k < EB.n; k++) { const s = 0.75 + Math.sin(time * 20 + k) * 0.1; writeMatrix(em, k, EB.x[k], 0.9, EB.z[k], s, s, s); }
  ebMesh.count = EB.n; ebMesh.instanceMatrix.needsUpdate = true;

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
  if (juliet && juliet.visible && !juliet.userData.lying) { juliet.userData.inner.position.y = 0.06 + Math.sin(time * 1.8) * 0.04; }
  if (mercutio && mercutio.visible) {   // 第三幕：茂丘西奥跟在身边，倒下后留在原地
    const inner = mercutio.userData.inner;
    if (!mercFell) {
      const tx = player.x - 1.7, tz = player.z + 1.1;
      mercutio.position.x += (tx - mercutio.position.x) * Math.min(1, dt * 4); mercutio.position.z += (tz - mercutio.position.z) * Math.min(1, dt * 4);
      mercutio.rotation.y = Math.atan2(player.aimX, player.aimZ);
      inner.position.y = player.moving > 0.1 ? Math.abs(Math.sin(time * 11 + 1)) * 0.12 : 0;
    } else { inner.rotation.z += (Math.PI / 2 - inner.rotation.z) * Math.min(1, dt * 3); inner.position.y = 0.2; }
  }
  heroLight.position.set(player.x, 2.6, player.z + 1.2);
  heroGlow.position.x = player.x; heroGlow.position.z = player.z;

  // 镜头：打的时候跟着主角；幕结束时拉近；名画定格时拉起
  const want = phase === 'actEnd' ? 0.62 : phase === 'card' ? 1.5 : phase === 'title' || phase === 'over' ? 0.8 : 1;
  camDist += (want - camDist) * Math.min(1, dt * 2.2);
  const panX = phase === 'title' || phase === 'over' ? 5.5 : 0;   // 开始和结束画面：镜头往右平移，主角站到画面左边，别挡住标题
  camTarget.set(player.x + panX + CAM.x * camDist, CAM.y * camDist, player.z + CAM.z * camDist);
  camera.position.lerp(camTarget, Math.min(1, dt * 7));
  camera.lookAt(camera.position.x - CAM.x * camDist, phase === 'actEnd' ? 0.9 : 0, camera.position.z - CAM.z * camDist);
  renderer.render(scene, camera);

  // 界面数字
  if (phase === 'fight' || phase === 'levelup') {
    $('#bars .hpbar i').style.width = (player.hp / maxHp() * 100) + '%';
    $('#bars .xpbar i').style.width = (xp / xpNeed(level) * 100) + '%';
    $('#bars .lv').textContent = `${level} 级`;
    const left = Math.max(0, Math.ceil(ACT_LEN - actTime));
    $('#actinfo span').textContent = act === 4 ? `醒来还有 ${left} 秒` : actTime >= ACT_LEN && !dogDown ? (act === 2 ? '让三头犬睡着' : '打动提伯尔特') : `${left} 秒`;
    const bi = dogSpawned && !dogDown ? bossIndex() : -1;
    show($('#boss'), bi >= 0);
    if (bi >= 0) { const bt = TYPES[E.type[bi]]; $('#boss b').textContent = bt.label; $('#boss i').style.width = (E.hp[bi] / (bt.hp + HP_ADD[E.type[bi]] * (act - 1)) * 100) + '%'; }
    show($('#calm'), act === 4);
    if (act === 4) { $('#calm i').style.width = Math.max(0, calm) + '%'; calmHit -= dt; $('#calm').classList.toggle('hit', calmHit > 0); }
  }
}

// ---------- 暂停、声音 ----------
let pausedFrom = null;
$('#tools .b-pause').onclick = () => { if (phase !== 'fight') return; pausedFrom = phase; phase = 'paused'; show($('#pause')); };
$('#pause .b-resume').onclick = () => { show($('#pause'), false); phase = pausedFrom || 'fight'; pausedFrom = null; };
$('#pause .b-restart').onclick = () => { show($('#pause'), false); pausedFrom = null; show($('#boss'), false); show($('#calm'), false); startRun(true); };
$('#tools .b-mute').onclick = (e) => { muted = !muted; e.target.textContent = muted ? '声音 关' : '声音 开'; };

// ---------- 全屏 ----------
// iPhone 的网页没法自己全屏，也没法锁横屏：在微信、抖音这类应用里打开时，提示用户换到浏览器；
// 在 Safari 里提示"添加到主屏幕"（manifest.webmanifest 设成全屏）。安卓和 iPad 点开始时直接请求全屏。
const UA = navigator.userAgent;
const IN_APP = /MicroMessenger|aweme|BytedanceWebview|NewsArticle|Weibo|xhsdiscover|DingTalk|AlipayClient|Lark| QQ\//i.test(UA);
const IOS = /iPhone|iPod/.test(UA);
const STANDALONE = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
{
  const h = $('#title .fshint');
  if (IN_APP) h.innerHTML = '想全屏玩：点右上角 <b>···</b> →「<b>在浏览器打开</b>」，再「添加到主屏幕」';
  else if (IOS && !STANDALONE) h.innerHTML = '想全屏玩：点 Safari 的 <b>分享</b> 按钮 →「<b>添加到主屏幕</b>」，再从主屏幕打开';
  show(h, !!h.innerHTML && !AUTO);
}
function goFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || STANDALONE) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => { screen.orientation?.lock?.('landscape').catch(() => {}); setTimeout(layout, 300); }).catch(() => {});
  } catch {}
}

// ---------- 开始画面 ----------
let titleReady = false;
$('#title').onclick = () => { if (!titleReady) return; titleReady = false; initAudio(); if (!AUTO) goFullscreen(); show($('#title .fshint'), false); startRun(); };

Promise.all([loadModel('fantasy', 1.9), loadModel('wedding-dress', 1.95), loadModel('minotaur', 2.3), loadModel('rabbit', 1.85)]).then(([h, j, t, m]) => {
  hero = h; juliet = j; tybalt = t; mercutio = m;
  scene.add(hero, juliet, tybalt, mercutio);
  juliet.visible = tybalt.visible = mercutio.visible = false;
  titleReady = true;
  $('#title .go').textContent = '点一下开始';
  if (AUTO) $('#title').click();
}).catch((e) => { $('#title .go').textContent = '加载失败，请刷新：' + e.message; console.error(e); });

// 给自动测试用的接口
window.__game = {
  E, B, O, player,
  get phase() { return phase; }, get level() { return level; }, get kills() { return kills; },
  get actTime() { return actTime; }, get time() { return time; }, get levels() { return levels; }, get act() { return act; }, get calm() { return calm; },
};

// ---------- 主循环 ----------
setAct(1);
let last = performance.now(), frames = 0, fpsT = last, slowSecs = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (document.body.classList.contains('portrait')) return;
  if (slowmo > 0) { if (phase !== 'levelup') slowmo -= dt; dt *= 0.25; }   // 慢动作（升级前、茂丘西奥倒下时）按真实时间倒数
  if (phase !== 'levelup' && phase !== 'story' && phase !== 'card' && phase !== 'dead' && phase !== 'paused') step(dt);
  else if (phase === 'levelup' && slowmo > 0) step(dt);
  else stepFx(dt);
  draw(dt);
  frames++;
  if (now - fpsT >= 1000) {
    window.__fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    // 自动降画质：打斗中连续 2 秒低于 40 帧，清晰度降一档（最低 1），不再升回去
    if (phase === 'fight' && window.__fps < 40) { slowSecs++; if (slowSecs >= 2 && pixelCap > 1 && renderer.getPixelRatio() > 1) { pixelCap = Math.max(1, renderer.getPixelRatio() - 0.25); layout(); slowSecs = 0; } } else slowSecs = 0;
    if (DEBUG) { const info = renderer.info.render; $('#fps').textContent = `${window.__fps.toFixed(0)} 帧 · 怪 ${E.n} · 音符 ${B.n} · ${(info.triangles / 1000).toFixed(0)}k 面 · ${info.calls} 次绘制`; }
  }
}
requestAnimationFrame(loop);
