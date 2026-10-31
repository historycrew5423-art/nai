// 正式游戏 v0.2：四幕。舞会 → 阳台（花园）→ 决斗（广场）→ 墓室（守住沉睡的朱丽叶，两种结局）。
// 玩法：双摇杆，罗密欧唱情歌射出音符；怪被打动后变成萤火，捡了升级，三选一技能。
// 地图没有边界：地面和障碍物按 40 米一块无缝重复，玩家走到哪铺到哪（docs/场景规格.md 开头）。
// 怪物的 3D 模型还没有，先用参考图做的立牌（assets/sprites/）。
// 网址参数：?auto=1 自动跳过对话、自动选第一张卡（给测试机器人用）；?god=1 不会死；?debug=1 显示帧数；?len=秒数 缩短第一幕。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Input } from './input.js?v=20261031f';
import { byId, drawCards, baseStats } from './skills.js?v=20261031f';
import { PEOPLE, SCENES, CAST, ACT1_LINES, ACT2_LINES, ACT3_LINES, ACT4_LINES, TP_LINES, TP_BOSS, BOSS_LINES, EVENT_LINES, DEATH, LOVE, PAINTINGS } from './dialogue.js?v=20261031f';
import { save, persist, unlock, recordChoice, recordBest, resetSave } from './save.js?v=20261031f';
import { makeIsland, coastR, START as ISLE_START } from './island.js?v=20261031f';

const VERSION = 'v0.2';
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), GOD = Q.has('god'), DEBUG = Q.has('debug');
const TILE = 40;                 // 地块边长（米）
const ACT_LEN = +Q.get('len') || 45;    // 每一幕打斗时长（秒）；?len=12 给测试用，缩短每一幕
const START_ACT = +Q.get('act') || 1;   // ?act=2 直接从第二幕开始（测试用）
const MAX_E = 900, MAX_B = 1600, MAX_O = 1600;
const CAM = new THREE.Vector3(0, 10, 8.6);          // 镜头在主角上方 10 米、往镜头那侧 8.6 米（往下约 49 度）；10-31 拉近一点，模型看得更清楚
const PITCH = Math.atan2(CAM.y, CAM.z);             // 立牌朝镜头倾斜的角度

// ---------- 画面：固定 16:9 ----------
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;   // 只有海岛那一幕的太阳投影子（见 setAct），别的幕不画影子，不费电
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
document.addEventListener('fullscreenchange', () => setTimeout(layout, 200));
if (window.visualViewport) visualViewport.addEventListener('resize', layout);
layout();

// ---------- 灯：冷蓝的月光和环境光，主角身上一盏暖光 ----------
const hemi = new THREE.HemisphereLight(0x8a90c8, 0x2a1e2a, 1.25); scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.9); moon.position.set(-6, 12, -4); scene.add(moon, moon.target);
moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.03;
Object.assign(moon.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 }); moon.shadow.camera.updateProjectionMatrix();
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
      g.fillStyle = `rgb(${82 + v | 0},${60 + v * 0.8 | 0},${76 + v | 0})`;   // 10-31 调亮（原来 50,36,48 在手机上像黑屏）
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

// 海岛地面（第二部，照《漂岛奇航》的画风）：米黄色沙滩上一块块鲜绿的草地，几汪碧蓝的浅水，水边一圈白色浪花。四方连续。
function islandFloor() {
  return canvasTex(1024, (g, S) => {
    let seed = 41; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#ead9a6'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 9000; k++) { const v = rnd(); g.fillStyle = v < 0.5 ? 'rgba(255,248,220,.35)' : 'rgba(190,160,110,.25)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
    const blob = (x, y, r, fill, wob = 0.25, n = 14) => {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath();
        for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = r * (1 + Math.sin(a * 3 + x) * wob * 0.5 + Math.cos(a * 5 + y) * wob * 0.5); g.lineTo(x + ox + Math.cos(a) * rr, y + oy + Math.sin(a) * rr); }
        g.closePath(); g.fill();
      }
    };
    // 浅水：先画浪花圈，再画水
    const pools = [[S * 0.5, S * 0.5, S * 0.07], [S * 0.12, S * 0.62, S * 0.06], [S * 0.8, S * 0.22, S * 0.05]];
    for (const [x, y, r] of pools) { g.fillStyle = 'rgba(255,255,255,.85)'; blob(x, y, r * 1.18); g.fillStyle = '#5fd0d8'; blob(x, y, r * 1.05); g.fillStyle = '#3db8cc'; blob(x, y, r * 0.7); }
    // 草地
    const grass = [[S * 0.27, S * 0.27, S * 0.17], [S * 0.75, S * 0.72, S * 0.16], [S * 0.22, S * 0.86, S * 0.1], [S * 0.86, S * 0.48, S * 0.09], [S * 0.6, S * 0.1, S * 0.09]];
    for (const [x, y, r] of grass) { g.fillStyle = '#c9c48a'; blob(x, y, r * 1.08); g.fillStyle = '#67bd45'; blob(x, y, r); }
    for (let k = 0; k < 2600; k++) { const x = rnd() * S, y = rnd() * S; const p = g.getImageData(x | 0, y | 0, 1, 1).data; if (p[1] > 150 && p[0] < 140) { g.fillStyle = rnd() < 0.5 ? 'rgba(140,215,90,.6)' : 'rgba(60,140,50,.45)'; g.fillRect(x, y, 3, 5); } }
  }, true);
}

// ---------- 无限地面 ----------
const floors = { 1: ballroomFloor() };
const FLOOR_FN = { 2: gardenFloor, 3: piazzaFloor, 4: tombFloor, 5: islandFloor };
const floorTex = floors[1]; floorTex.repeat.set(3, 3);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 3, TILE * 3), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---------- 地块里的障碍物（第一幕，坐标见 docs/Unity场景和提示词.md「补充 2」） ----------
const ACT1_OBS = [
  { kind: 'table', x: -11, z: -11, r: 1.3 }, { kind: 'table', x: 11, z: 11, r: 1.3 },
  { kind: 'harp', x: 11, z: -11, r: 1.0 }, { kind: 'harp', x: -11, z: 11, r: 1.0 },
  { kind: 'candle', x: -15, z: 0, r: 0.6 }, { kind: 'candle', x: 15, z: 0, r: 0.6 },
  // 10-31 用户说第一幕"立体度差"：加一圈高大的大理石柱子（有金环），配上影子
  { kind: 'bcolumn', x: 0, z: -15, r: 0.75 }, { kind: 'bcolumn', x: 0, z: 15, r: 0.75 },
  { kind: 'bcolumn', x: -16, z: -16, r: 0.75 }, { kind: 'bcolumn', x: 16, z: 16, r: 0.75 }, { kind: 'bcolumn', x: 16, z: -16, r: 0.75 }, { kind: 'bcolumn', x: -16, z: 16, r: 0.75 },
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
const ACT5_OBS_OLD = [
  { kind: 'hill', x: -11, z: -11, r: 3.0 }, { kind: 'palm', x: 11, z: -11, r: 0.6 }, { kind: 'rock', x: 11, z: 11, r: 1.3 },
  { kind: 'palm', x: -11, z: 11, r: 0.6 }, { kind: 'chest', x: -15, z: 0, r: 0.8 }, { kind: 'palm', x: 15, z: 0, r: 0.6 },
];
const OBS = { 1: ACT1_OBS, 2: ACT2_OBS, 3: ACT3_OBS, 4: ACT4_OBS, 5: [] };   // 第五幕的障碍物在 island.js 里（不重复，按世界坐标）
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
  isleStone: new THREE.MeshLambertMaterial({ color: 0x8e9196 }),
  isleStone2: new THREE.MeshLambertMaterial({ color: 0x6f7378 }),
  isleGrass: new THREE.MeshLambertMaterial({ color: 0x6cc44a }),
  palmTrunk: new THREE.MeshLambertMaterial({ color: 0xa97b4c }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x3faa4f, side: THREE.DoubleSide }),
  bushGreen: new THREE.MeshLambertMaterial({ color: 0x4fb04c }),
  chestWood: new THREE.MeshLambertMaterial({ color: 0xa4602a }),
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
    else if (o.kind === 'hill') {   // 一层一层的石头小山，每层顶上是绿的
      for (const [r, y0, h] of [[3.0, 0, 0.85], [2.3, 0.85, 0.8], [1.55, 1.65, 0.75]]) {
        put(y0 === 0 ? 'isleStone2' : 'isleStone', new THREE.CylinderGeometry(r * 0.94, r, h, 18), x + y0 * 0.15, y0 + h / 2, z - y0 * 0.1);
        put('isleGrass', new THREE.CylinderGeometry(r * 0.9, r * 0.94, 0.12, 18), x + y0 * 0.15, y0 + h + 0.03, z - y0 * 0.1);
      }
      for (let k = 0; k < 4; k++) put('bushGreen', new THREE.SphereGeometry(0.35, 8, 6).scale(1, 0.75, 1), x + 0.3 + Math.cos(k * 1.7) * 1.0, 2.55, z - 0.2 + Math.sin(k * 1.7) * 1.0);
    } else if (o.kind === 'palm') {   // 棕榈树：弯弯的树干，一圈垂下来的叶子
      let px = x, py = 0, lean = 0.12;
      for (let k = 0; k < 4; k++) { put('palmTrunk', new THREE.CylinderGeometry(0.13 - k * 0.012, 0.17 - k * 0.012, 0.55, 7), px, py + 0.27, z, 0, 0, -lean * k * 0.6); px += lean * 0.6 * k * 0.18; py += 0.53; }
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2, leaf = new THREE.PlaneGeometry(0.34, 1.25);
        leaf.translate(0, 0.62, 0); leaf.rotateX(-1.3); leaf.rotateY(a);
        put('palmLeaf', leaf, px, py + 0.05, z);
      }
      for (let k = 0; k < 3; k++) put('palmTrunk', new THREE.SphereGeometry(0.12, 6, 5), px + Math.cos(k * 2.1) * 0.15, py - 0.12, z + Math.sin(k * 2.1) * 0.15);
    } else if (o.kind === 'rock') {
      put('isleStone', new THREE.DodecahedronGeometry(1.25, 1).scale(1, 0.7, 1), x, 0.6, z);
      put('isleGrass', new THREE.SphereGeometry(0.95, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1, 0.5, 1), x, 1.18, z);
      put('isleStone2', new THREE.DodecahedronGeometry(0.55, 0), x + 1.3, 0.3, z + 0.4);
    } else if (o.kind === 'chest') {   // 被冲上岸的宝箱和木牌
      put('chestWood', new THREE.BoxGeometry(1.1, 0.6, 0.7), x, 0.3, z);
      put('chestWood', new THREE.CylinderGeometry(0.35, 0.35, 1.1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), x, 0.6, z);
      put('gold', new THREE.BoxGeometry(1.14, 0.08, 0.74), x, 0.62, z);
      put('palmTrunk', new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6), x + 1.2, 0.7, z - 0.6);
      put('chestWood', new THREE.BoxGeometry(0.8, 0.3, 0.06), x + 1.35, 1.25, z - 0.6, 0, 0, -0.15);
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
    } else if (o.kind === 'bcolumn') {
      put('stone', new THREE.BoxGeometry(1.5, 0.5, 1.5), x, 0.25, z);
      put('gold', new THREE.TorusGeometry(0.56, 0.06, 6, 16), x, 0.62, z, Math.PI / 2);
      put('stone', new THREE.CylinderGeometry(0.42, 0.5, 2.0, 16), x, 1.5, z);   // 别太高：镜头从上往下看，太高的柱子会挡住人
      put('gold', new THREE.TorusGeometry(0.46, 0.06, 6, 16), x, 2.5, z, Math.PI / 2);
      put('gold', new THREE.CylinderGeometry(0.5, 0.42, 0.3, 16), x, 2.65, z);
      for (let k = 0; k < 3; k++) { put('wax', new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), x + (k - 1) * 0.28, 2.92, z); flame(x + (k - 1) * 0.28, 3.1, z); }
      put('redBanner', new THREE.PlaneGeometry(0.6, 1.2), x, 1.6, z + 0.5);
      pool(x, z, 2.6);
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
    } else if (act === 5) {   // 海岛：障碍物周围长灌木、散几块小石头
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.28, d = o.r + 0.8 + Math.random() * 1.6; put('bushGreen', new THREE.SphereGeometry(0.32 + Math.random() * 0.15, 8, 6).scale(1, 0.7, 1), x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d); }
      for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, d = o.r + 1 + Math.random() * 1.5; put('isleStone', new THREE.DodecahedronGeometry(0.22, 0), x + Math.cos(a) * d, 0.12, z + Math.sin(a) * d); }
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
    m.castShadow = !/pool|glow|flame|coolPool/i.test(k);   // 月光的影子（每一幕都有，手机卡了会自动关）
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
  // 10-31 用户在手机上看"黑屏的很多"：维罗纳四幕原来太暗，整体调亮
  1: { bg: 0x1c1826, hemi: [0x9aa0d8, 0x3a2a3a, 2.2], moon: [0xb0c0ff, 1.4] },
  2: { bg: 0x142030, hemi: [0x8aa6d8, 0x24382f, 2.0], moon: [0xb8ccff, 2.0] },
  3: { bg: 0x2e1f2a, hemi: [0xffd0a0, 0x4a3a50, 1.6], moon: [0xffb070, 2.3], sun: [-14, 7, 2] },
  4: { bg: 0x101018, hemi: [0x7080b8, 0x1c1c2a, 1.6], moon: [0x90b0ff, 1.0] },
  5: { bg: 0x8fd3ee, hemi: [0xdff3ff, 0x9cc07a, 0.75], moon: [0xfff0d6, 1.05], sun: [-9, 16, 8], day: true, fog: [45, 90] },   // 白天的海岛：太阳偏暖、影子清楚（亮度别太高，不然沙子一片白）
};
let isle = null, islandKit = null, noShadow = Q.has('noshadow');   // 手机太卡时自动关影子（见主循环）
function setAct(n) {
  if (tileAct !== n) {
    for (const t of tiles) scene.remove(t);
    if (tiles[0]) tiles[0].traverse((o) => o.geometry && o.geometry.dispose());
    const proto = buildTile(n);
    tiles = []; for (let i = 0; i < 9; i++) { const t = proto.clone(); scene.add(t); tiles.push(t); }
    if (n !== 5) {
      if (!floors[n]) { floors[n] = FLOOR_FN[n](); floors[n].repeat.set(3, 3); }
      floor.material.map = floors[n]; floor.material.needsUpdate = true;
    }
    tileAct = n;
  }
  // 第二部的海岛：不用无限地块，是一座有海岸的岛（src/island.js）。第一次进这一幕时才搭
  const isl = n === 5;
  if (isl && (!isle || (isle.partial && islandKit))) { if (isle) scene.remove(isle.group); isle = makeIsland(islandKit || {}); isle.partial = !islandKit; scene.add(isle.group); }
  if (isle) isle.group.visible = isl;
  floor.visible = !isl;
  moon.castShadow = !noShadow; heroLight.visible = !isl; heroGlow.visible = !isl;
  shadowMesh.material.opacity = isl ? 0.45 : 1;
  curObs = OBS[n];
  const L = LOOKS[n];
  scene.background.setHex(L.bg); scene.fog.color.setHex(L.bg); [scene.fog.near, scene.fog.far] = L.fog || [17, 33];
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  moon.color.setHex(L.moon[0]); moon.intensity = L.moon[1]; moon.position.set(...(L.sun || [-6, 12, -4]));
  bier.visible = n === 4; bierLight.visible = n === 4;
  ui.classList.toggle('day', !!L.day); ariel.visible = n === 5;
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
  if (act === 5 && isle) {   // 海岛：推出石头山、树、沉船；走到海边被挡住
    for (const o of isle.obs) {
      const dx = p.x - o.x, dz = p.z - o.z, rr = o.r + r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; p.x = o.x + dx / d * rr; p.z = o.z + dz / d * rr; }
    }
    const d = Math.hypot(p.x, p.z), lim = coastR(Math.atan2(p.z, p.x)) - 1.7 - r * 0.4;
    if (d > lim) { p.x *= lim / d; p.z *= lim / d; }
    return;
  }
  if (act === 4) { const d = Math.hypot(p.x, p.z), rr = BIER_R + r; if (d < rr) { const k = rr / (d || 1e-3); p.x *= k; p.z *= k; } }
  const ox = Math.round(p.x / TILE) * TILE, oz = Math.round(p.z / TILE) * TILE;
  for (const o of curObs) {
    const dx = p.x - (ox + o.x), dz = p.z - (oz + o.z), rr = o.r + r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; p.x = ox + o.x + dx / d * rr; p.z = oz + o.z + dz / d * rr; }
  }
}

// ---------- 怪：参考图做的立牌，同一种怪一次画完 ----------
const texLoader = new THREE.TextureLoader();
// 模型都用 meshopt 压缩过（tools/compress-models.mjs），读的时候要解压
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// 下载模型：GitHub Pages 不给 .glb 做 gzip，所以旁边放了一份 .glb.gz（小 30%），浏览器自己解压；
// 老手机没有 DecompressionStream 就下原文件。失败了重试两次。下载进度记在 LOAD 里，封面上显示百分比。
const GZ = typeof DecompressionStream !== 'undefined' && !Q.has('nogz');
const LOAD = { got: {}, size: {} };
let onLoadProgress = () => {};
async function fetchBytes(url, key) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const total = +res.headers.get('content-length');
  if (total && !res.headers.get('content-encoding')) LOAD.size[key] = total;
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); LOAD.got[key] = b.length; onLoadProgress(); return b; }
  const reader = res.body.getReader(), chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; LOAD.got[key] = got; onLoadProgress(); }
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  return buf;
}
async function gunzip(b) {
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b;   // 服务器已经解压过了
  return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
async function getGLB(url) {
  for (let i = 0; ; i++) {
    try {
      let b = null;
      if (GZ) b = await fetchBytes(url + '.gz', url).then(gunzip).catch((e) => { console.warn('gz 不行，下原文件', url, e); return null; });
      if (!b) b = await fetchBytes(url, url);
      return await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), url.slice(0, url.lastIndexOf('/') + 1));
    } catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
}
const TYPES = [
  { key: 'lute', h: 1.55, r: 0.5, hp: 2, speed: 2.1, dmg: 7, xp: 1, flip: false },
  { key: 'birdhead', h: 1.15, r: 0.36, hp: 1, speed: 3.9, dmg: 4, xp: 1, flip: true },
  { key: 'drum', h: 1.7, r: 0.7, hp: 9, speed: 1.5, dmg: 12, xp: 4, flip: true },
  { key: 'cerberus', h: 3.0, r: 1.4, hp: 110, speed: 2.1, dmg: 16, xp: 0, flip: true, boss: true, label: '看门的三头犬' },
  { key: 'horn', h: 1.5, r: 0.45, hp: 3, speed: 2.3, dmg: 6, xp: 2, flip: true, ranged: true },
  { key: 'shade', h: 1.5, r: 0.42, hp: 3, speed: 1.9, dmg: 6, xp: 1, flip: false, ghost: true },
  { key: 'tybalt', model: true, h: 2.3, r: 0.8, hp: 200, speed: 2.5, dmg: 18, xp: 0, boss: true, label: '提伯尔特' },
  { key: 'caliban', model: true, h: 2.7, r: 1.0, hp: 240, speed: 2.2, dmg: 16, xp: 0, boss: true, label: '卡利班' },
];
const HP_ADD = [1, 0, 3, 0, 1, 0, 0, 0];   // 每往后一幕，怪多几点血
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
// 3D 怪（Tripo 生成，assets/models/monsters/）：把走路动作烘成 8 个姿势，每个姿势一个实例化网格。
// 几百只怪只要在 CPU 上挑每只用哪个姿势，不用每帧算骨骼，手机跑得动。模型没加载好时先用上面的立牌。
// yaw：把模型的正面转到 +Z（tools/mock/monsters.html 四个方向看过：鲁特琴、鼓、亡魂、三头犬的脸朝 +X，鸟嘴面具和号角朝 -Z）
const MON = { lute: { yaw: -Math.PI / 2 }, birdhead: { yaw: Math.PI }, drum: { yaw: -Math.PI / 2 }, horn: { yaw: Math.PI }, shade: { yaw: -Math.PI / 2 }, cerberus: { yaw: -Math.PI / 2 } };
const monFrames = [];   // monFrames[类型] = { meshes, n, dur }
async function bakeMonster(ty) {
  const t = TYPES[ty], cfg = MON[t.key];
  const g = await getGLB(`assets/models/monsters/${t.key}.glb`);
  const root = g.scene; root.updateMatrixWorld(true);
  let mesh = null; root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const clip = g.animations[0]; let mixer = null;
  if (clip && mesh.isSkinnedMesh) {
    const hip = mesh.skeleton.bones.find((b) => /Hip/i.test(b.name));
    if (hip) fixHip(clip, [hip.position.x, hip.position.y, hip.position.z]);
    mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play();
  }
  const N = mixer ? 8 : 1, pos = mesh.geometry.attributes.position, n = pos.count, v = new THREE.Vector3(), raw = [];
  for (let f = 0; f < N; f++) {
    if (mixer) { mixer.setTime(clip.duration * f / N); root.updateMatrixWorld(true); }
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    raw.push(out);
  }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; const a0 = raw[0];
  for (let i = 0; i < n; i++) { const x = a0[i * 3], y = a0[i * 3 + 1], z = a0[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const sc = t.h / (y1 - y0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = Math.cos(cfg.yaw), sy = Math.sin(cfg.yaw);
  const map = mesh.material.map;
  const mat = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.2 });
  const meshes = raw.map((out) => {
    for (let i = 0; i < n; i++) {
      const x = (out[i * 3] - cx) * sc, y = (out[i * 3 + 1] - y0) * sc, z = (out[i * 3 + 2] - cz) * sc;
      out[i * 3] = x * cy + z * sy; out[i * 3 + 1] = y; out[i * 3 + 2] = -x * sy + z * cy;
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(out, 3));
    if (mesh.geometry.attributes.uv) g2.setAttribute('uv', mesh.geometry.attributes.uv);
    if (mesh.geometry.index) g2.setIndex(mesh.geometry.index);
    g2.computeVertexNormals();
    const m = new THREE.InstancedMesh(g2, mat, MAX_E);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_E * 3).fill(1), 3);
    m.count = 0; m.frustumCulled = false; m.visible = false; m.castShadow = true; scene.add(m);
    return m;
  });
  monFrames[ty] = { meshes, n: N, dur: clip ? clip.duration : 1 };
  if (enemyMeshes[ty]) enemyMeshes[ty].visible = false;
}
function loadMonsters() { return Promise.all(TYPES.map((t, ty) => (MON[t.key] ? bakeMonster(ty).catch((e) => console.warn('怪物模型加载失败，用立牌', t.key, e)) : null))); }
// 写实例矩阵：绕 Y 轴转 yaw，统一缩放 s
function writeMatrixY(arr, i, x, y, z, s, yaw) {
  const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s, o = i * 16;
  arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -n; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = n; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
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
// 第二部：精灵爱丽儿，一团淡蓝色的光，绕着罗密欧飞
const ariel = new THREE.Group();
{ const m1 = new THREE.Mesh(billboardGeo(1.3, 1.3, true), additive(glowTex('170,225,255'), 0.95)); const m2 = new THREE.Mesh(billboardGeo(0.5, 0.5, true), additive(glowTex('255,255,255'), 1)); ariel.add(m1, m2); }
ariel.visible = false; scene.add(ariel);

// ---------- 角色模型 ----------
async function loadModel(name, height) {
  const g = await getGLB(`assets/models/${name}.glb`);
  const obj = g.scene; brighten(obj); obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = height / size.y;
  obj.scale.setScalar(s); obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const wrap = new THREE.Group(), inner = new THREE.Group();
  inner.add(obj); wrap.add(inner); wrap.userData.inner = inner;
  return wrap;
}
// 角色在暗处也看得清：把颜色贴图也当成一点自发光（10-31 用户说模型很精美，游戏里却看不出来）
function brighten(obj, k = 0.22) {
  obj.traverse((o) => { if (o.isMesh && o.material && o.material.map) { o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = k; } });
}
// 绑了骨骼、带动作的角色（Tripo 自动绑骨加动作，assets/models/anim/）。
// Tripo 的走路和跑步动作把髋部整体挪开了一米多（"原地播放"留下的偏移），这里把髋部的位置轨道平移回站立时的位置，只留上下起伏。
function fixHip(clip, ref) {
  for (const tr of clip.tracks) {
    if (!/Hip\.position$/.test(tr.name)) continue;
    const v = tr.values, n = v.length / 3; let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) { mx += v[i * 3]; my += v[i * 3 + 1]; mz += v[i * 3 + 2]; }
    mx /= n; my /= n; mz /= n;
    for (let i = 0; i < n; i++) { v[i * 3] += ref[0] - mx; v[i * 3 + 1] += ref[1] - my; v[i * 3 + 2] += ref[2] - mz; }
  }
}
async function loadAnimated(name, height) {
  const g = await getGLB(`assets/models/anim/${name}.glb`);
  const obj = g.scene;
  obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });   // 蒙皮网格按绑定姿势算包围球，动起来会被误裁掉
  brighten(obj);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = height / size.y;
  obj.scale.setScalar(s); obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const wrap = new THREE.Group(), inner = new THREE.Group();
  inner.add(obj); wrap.add(inner);
  const idle = g.animations.find((a) => a.name === 'idle');
  const hipTrack = idle && idle.tracks.find((t) => /Hip\.position$/.test(t.name));
  const ref = hipTrack ? [hipTrack.values[0], hipTrack.values[1], hipTrack.values[2]] : [0, 0, 0];
  const mixer = new THREE.AnimationMixer(obj), actions = {};
  for (const clip of g.animations) { fixHip(clip, ref); actions[clip.name] = mixer.clipAction(clip); }
  Object.assign(wrap.userData, { inner, mixer, actions, cur: null });
  return wrap;
}
// 海岛的布景：Quaternius 自然素材包（CC0）里挑的 14 样，加上 Tripo 做的棕榈树、叠石山、石拱门。
// 读成 { 名字: { parts: [{ geometry, material, rel }], box } } 交给 island.js 摆成实例化网格。材质换成便宜的 Lambert。
const KIT_NAMES = ['CommonTree_3', 'CommonTree_4', 'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Pebble_Round_3', 'Grass_Common_Short', 'Flower_3_Group', 'Flower_4_Group', 'Fern_1', 'Plant_1'];
function toLambert(m) {   // 再加一点自发光，树叶灌木在阳光下不发黑
  const col = m.color ? m.color.clone() : new THREE.Color(0xffffff);
  return new THREE.MeshLambertMaterial({ map: m.map || null, color: col, side: m.side, vertexColors: m.vertexColors, alphaTest: m.alphaTest || (m.transparent ? 0.5 : 0),
    emissive: m.map ? 0xffffff : col.clone().multiplyScalar(0.2), emissiveMap: m.map || null, emissiveIntensity: m.map ? 0.2 : 1 });
}
async function loadIslandKit() {
  const names = ['kit-nature', 'props/palm', 'props/pillar', 'props/arch'];
  const got = await Promise.all(names.map((n) => getGLB(`assets/models/${n}.glb`).catch((e) => { console.warn('布景模型加载失败', n, e); return null; })));
  const kit = {};
  const take = (root, node, key) => {
    root.updateMatrixWorld(true);
    const inv = node.matrixWorld.clone().invert(), parts = [];
    node.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: toLambert(o.material), rel: inv.clone().multiply(o.matrixWorld) }); });
    if (parts.length) kit[key] = { parts, box: new THREE.Box3().setFromObject(node).applyMatrix4(inv) };
  };
  if (got[0]) for (const n of KIT_NAMES) { const o = got[0].scene.getObjectByName(n); if (o) take(got[0].scene, o, n); }
  ['palm', 'pillar', 'arch'].forEach((k, i) => { if (got[i + 1]) take(got[i + 1].scene, got[i + 1].scene, k); });
  islandKit = kit;
}
// 切换动作：淡入新的、淡出旧的。once = 只播一次，停在最后一帧（比如茂丘西奥倒下）
function playAnim(w, name, { fade = 0.22, once = false, speed = 1 } = {}) {
  const u = w && w.userData; if (!u || !u.actions || !u.actions[name]) return;
  const a = u.actions[name]; a.timeScale = speed;
  if (u.cur === name) return;
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
  a.fadeIn(fade).play();
  if (u.cur && u.actions[u.cur]) u.actions[u.cur].fadeOut(fade);
  u.cur = name;
}
let hero = null, juliet = null, tybalt = null, mercutio = null, caliban = null;

// ---------- 数据 ----------
const E = { n: 0, type: new Uint8Array(MAX_E), x: new Float32Array(MAX_E), z: new Float32Array(MAX_E), hp: new Float32Array(MAX_E),
  flash: new Float32Array(MAX_E), phase: new Float32Array(MAX_E), speed: new Float32Array(MAX_E), id: new Int32Array(MAX_E),
  ocd: new Float32Array(MAX_E), face: new Int8Array(MAX_E), atk: new Float32Array(MAX_E), wind: new Float32Array(MAX_E) };
// 怪射来的酸音（号角怪）
const MAX_EB = 240;
const EB = { n: 0, x: new Float32Array(MAX_EB), z: new Float32Array(MAX_EB), dx: new Float32Array(MAX_EB), dz: new Float32Array(MAX_EB), life: new Float32Array(MAX_EB) };
const B = { n: 0, x: new Float32Array(MAX_B), z: new Float32Array(MAX_B), dx: new Float32Array(MAX_B), dz: new Float32Array(MAX_B),
  life: new Float32Array(MAX_B), dmg: new Float32Array(MAX_B), pierce: new Int16Array(MAX_B), bounce: new Int16Array(MAX_B),
  size: new Float32Array(MAX_B), last: new Int32Array(MAX_B) };
const O = { n: 0, x: new Float32Array(MAX_O), z: new Float32Array(MAX_O), v: new Float32Array(MAX_O), t: new Float32Array(MAX_O) };
let nextId = 1;

const player = { x: 0, z: 0, r: 0.45, hp: 100, hurtCd: 0, aimX: 0, aimZ: 1, moving: 0, mvx: 0, mvz: 1 };   // aimZ = 1：开打前面朝镜头
let stats = baseStats(), levels = {}, level = 1, xp = 0, kills = 0, pendingLevels = 0;
let time = 0, actTime = 0, fireCd = 0, drumCd = 0, slowmo = 0, noteIdx = 0, act = 1, snapshot = null;
let calmHit = 0, dogSpawned = false, dogDown = false, bossCharge = 0, bossChargeCd = 4, calm = 100, mercFell = false, tybaltHalfSaid = false;
let phase = 'title';            // title → story → fight → levelup → actEnd → card → over
const maxHp = () => 100 + stats.maxHpBonus;
const xpNeed = (L) => (L === 1 ? 3 : Math.round(4 * Math.pow(L, 1.45)));   // 10-31 用户说升级太快：比原来慢一半左右（第 2 级要 3 个，第 5 级要 41 个）
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
  E.type[i] = type; E.x[i] = p.x; E.z[i] = p.z; E.flash[i] = 0; E.wind[i] = 0; E.phase[i] = Math.random() * 10; E.ocd[i] = 0; E.face[i] = 1; E.atk[i] = 1 + Math.random() * 2;
  E.hp[i] = t.hp + HP_ADD[type] * (act - 1) + (type === T.lute && act === 1 && actTime > 22 ? 1 : 0);
  E.speed[i] = t.speed * (0.85 + Math.random() * 0.3); E.id[i] = nextId++;
}
const lowHp = () => player.hp < maxHp() * 0.35;
function director(dt) {
  if (phase !== 'fight') return;
  if (act === 2) { director2(dt); return; }
  if (act === 3) { director3(dt); return; }
  if (act === 4) { director4(dt); return; }
  if (act === 5) { director5(dt); return; }
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
    dogSpawned = true; sfxBoss(); bossChargeCd = 4;
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
    dogSpawned = true; sfxBoss(); bossChargeCd = 3; tybaltHalfSaid = false;
    spawnEnemy(T.tybalt, Math.PI, 14);
    bark(BOSS_LINES.tybaltIn.who, BOSS_LINES.tybaltIn.text);
    setTimeout(() => { if (act === 3 && phase === 'fight') bark(BOSS_LINES.tybaltIn2.who, BOSS_LINES.tybaltIn2.text); }, 2400);
  }
}
// 第二部「漂岛」：被冲上岸的乐器、成群的海鸟、海浪精灵（亡魂的样子），第 22 秒卡利班出场
function director5(dt) {
  const boss = dogSpawned && !dogDown;
  const target = (actTime < 12 ? 6 + actTime * 1.2 : 20 + actTime * 0.7) * (boss ? 0.5 : 1) * (lowHp() ? 0.75 : 1);
  spawnAcc += dt * 6;
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n >= target) continue; const r = Math.random(); spawnEnemy(r < 0.4 ? T.shade : r < 0.75 ? T.lute : T.drum); }
  if (!boss && actTime > 8 + birdWaves * 7) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 7 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, 17 + Math.random() * 3);
  }
  if (!dogSpawned && actTime >= Math.min(22, ACT_LEN * 0.5)) {
    dogSpawned = true; sfxBoss(); bossChargeCd = 3; tybaltHalfSaid = false;
    spawnEnemy(T.caliban, Math.PI, 14);
    bark(TP_BOSS.in.who, TP_BOSS.in.text);
    setTimeout(() => { if (act === 5 && phase === 'fight') bark(TP_BOSS.in2.who, TP_BOSS.in2.text); }, 2400);
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
    if (phase === 'fight' || phase === 'levelup') { const L = t.key === 'tybalt' ? BOSS_LINES.tybaltDown : t.key === 'caliban' ? TP_BOSS.down : BOSS_LINES.dogDown; bark(L.who, L.text); }
    ring(E.x[i], E.z[i], 6, 0.8);
  } else if (O.n < MAX_O) { const k = O.n++; O.x[k] = E.x[i]; O.z[k] = E.z[i]; O.v[k] = t.xp * [1, 1, 1.2, 1.5, 1.5, 1.2][act]; O.t[k] = Math.random() * 6; }   // 后面几幕每只怪给的经验多一点
  const j = --E.n;
  for (const a of [E.type, E.x, E.z, E.hp, E.flash, E.phase, E.speed, E.id, E.ocd, E.face, E.atk, E.wind]) a[i] = a[j];
  sfxPop(t.boss);
  kills++; comboAdd();
  if (t.boss) { shake = Math.max(shake, 1.1); hitStop = 0.25; } else if (t.hp >= 9) { shake = Math.max(shake, 0.35); hitStop = Math.max(hitStop, 0.05); }
}
function removeBullet(i) {
  const j = --B.n;
  for (const a of [B.x, B.z, B.dx, B.dz, B.life, B.dmg, B.pierce, B.bounce, B.size, B.last]) a[i] = a[j];
}
function hurtEnemy(i, dmg, kx = 0, kz = 0) {
  E.hp[i] -= dmg; E.flash[i] = 0.09;
  popNumber(E.x[i], E.z[i], dmg, TYPES[E.type[i]].boss);
  if (TYPES[E.type[i]].boss) { kx *= 0.08; kz *= 0.08; }   // 三头犬推不太动
  if (kx || kz) { E.x[i] += kx; E.z[i] += kz; }
  if (E.hp[i] <= 0) { killEnemy(i); return true; }
  sfxHit();
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
// iPhone 侧面静音键开着时，网页的 Web Audio 没声音：把声音类型设成"播放"，再放一段无声的 <audio>，就不受静音键影响（10-31 用户说手机里没声音）
let unlocked = false;
function unlockAudio() {
  if (unlocked) return; unlocked = true;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  try {
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf), w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = document.createElement('audio'); a.setAttribute('playsinline', ''); a.loop = true; a.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    a.play().catch(() => {});
  } catch {}
}
function initAudio() { unlockAudio(); try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); bgmStart(); } catch { actx = null; } }
// 第一次碰屏幕就打开声音（微信里也要在手指点下去的那一刻）
for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => initAudio(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && actx) actx.resume(); });
let muted = false;
function pluck(semi, vol = 0.05, dur = 0.35, type = 'triangle') {
  if (!actx || muted) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = 392 * Math.pow(2, semi / 12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
}
// ---------- 音效和背景音乐：全用 Web Audio 现场合成，不用下载文件（10-31 用户说"没有音效"） ----------
let noiseBuf = null;
function noise() {
  if (!noiseBuf) { const n = actx.sampleRate * 0.5 | 0; noiseBuf = actx.createBuffer(1, n, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  return noiseBuf;
}
const lastSfx = {};
const gate = (k, ms) => { const t = performance.now(); if (t - (lastSfx[k] || 0) < ms) return false; lastSfx[k] = t; return true; };   // 同一种声音别叠太密
function tone(freq, { t0 = 0, dur = 0.2, vol = 0.05, type = 'sine', to = 0, attack = 0.005 } = {}) {
  if (!actx || muted) return;
  const t = actx.currentTime + t0, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function burst({ t0 = 0, dur = 0.12, vol = 0.05, freq = 1200, q = 1, type = 'bandpass' } = {}) {
  if (!actx || muted) return;
  const t = actx.currentTime + t0, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur + 0.02);
}
const G4 = 392, nt = (n) => G4 * Math.pow(2, n / 12);
function sfxPop(boss) {   // 怪被打动：一声往上滑的"啵"
  if (boss) { [0, 4, 7, 12, 16, 19].forEach((n, k) => tone(nt(n), { t0: k * 0.07, dur: 0.6, vol: 0.06, type: 'triangle' })); burst({ dur: 0.5, vol: 0.05, freq: 5000, type: 'highpass' }); return; }
  if (!gate('pop', 45)) return;
  tone(520 + Math.random() * 160, { dur: 0.13, vol: 0.045, to: 1250 }); burst({ dur: 0.05, vol: 0.02, freq: 3200, q: 2 });
}
let pickN = 0, pickT = 0;
function sfxPick() {   // 捡萤火：叮，连着捡音越来越高
  const t = performance.now(); pickN = t - pickT < 700 ? Math.min(pickN + 1, 14) : 0; pickT = t;
  if (!gate('pick', 35)) return;
  tone(nt(12 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33][pickN]), { dur: 0.16, vol: 0.035, type: 'triangle' });
}
function sfxHurt() { shake = Math.max(shake, 0.75); flashHurt(); comboBreak(); if (!gate('hurt', 120)) return; tone(190, { dur: 0.28, vol: 0.13, to: 55 }); burst({ dur: 0.16, vol: 0.08, freq: 500, type: 'lowpass' }); }
function sfxHit() { if (gate('hit', 60)) burst({ dur: 0.045, vol: 0.018, freq: 2400, q: 3 }); }
function sfxLevel() { [0, 4, 7, 12, 16, 19, 24].forEach((n, k) => tone(nt(n), { t0: k * 0.055, dur: 0.45, vol: 0.05, type: 'triangle' })); burst({ t0: 0.3, dur: 0.6, vol: 0.03, freq: 7000, type: 'highpass' }); }
function sfxStep() { if (gate('step', 140)) burst({ dur: 0.04, vol: 0.012, freq: 900, q: 1.5 }); }
function sfxClick() { if (gate('click', 60)) tone(1250, { dur: 0.05, vol: 0.03, type: 'triangle' }); }
function sfxBoss() { tone(98, { dur: 1.4, vol: 0.07, type: 'sawtooth', to: 82 }); tone(146.8, { dur: 1.4, vol: 0.04, type: 'sawtooth', to: 123 }); burst({ dur: 0.9, vol: 0.06, freq: 260, type: 'lowpass' }); }
function sfxAct() { [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach((ch, k) => ch.forEach((n) => tone(nt(n), { t0: k * 0.16, dur: k === 3 ? 0.9 : 0.25, vol: 0.035, type: 'triangle' }))); }
// 背景音乐：G 大调 I–vi–IV–V（墓室那一幕换成小调的顺序），垫底的和弦 + 低音 + 分解和弦，打起来加一点镲。92 拍每分钟
const PROG = { day: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], night: [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]] };
const BGM = { next: 0, step: 0, timer: 0 };
function bgmStart() { if (!actx || BGM.timer) return; BGM.next = actx.currentTime + 0.1; BGM.t0 = BGM.next; BGM.timer = setInterval(bgmTick, 120); }
function bgmTick() {
  if (!actx) return;
  if (muted || document.hidden || actx.state !== 'running') { BGM.next = actx.currentTime + 0.1; return; }
  const spb = 60 / 92 / 2;
  while (BGM.next < actx.currentTime + 0.3) {
    const st = BGM.step++, bar = Math.floor(st / 8) % 4, beat = st % 8, ch = (act === 4 ? PROG.night : PROG.day)[bar], t0 = Math.max(0, BGM.next - actx.currentTime);
    const fight = phase === 'fight' || phase === 'levelup', base = 196;
    if (beat === 0) for (const n of ch) tone(base * Math.pow(2, n / 12), { t0, dur: spb * 8, vol: 0.014, attack: 0.4 });
    if (beat === 0 || beat === 4 || (fight && beat === 6)) tone(base / 2 * Math.pow(2, ch[0] / 12), { t0, dur: spb * 2.5, vol: 0.055, type: 'triangle' });
    tone(base * 2 * Math.pow(2, ch[[0, 1, 2, 1, 0, 1, 2, 1][beat]] / 12), { t0, dur: spb * 1.4, vol: fight ? 0.017 : 0.011, type: 'triangle' });
    if (fight && (beat === 2 || beat === 6)) burst({ t0, dur: 0.05, vol: 0.014, freq: 7000, q: 0.7, type: 'highpass' });
    if (fight && (beat === 0 || beat === 4)) tone(120, { t0, dur: 0.12, vol: 0.05, to: 50 });
    BGM.next += spb;
  }
}

// ---------- 界面 ----------
const ui = document.createElement('div'); ui.id = 'ui'; stage.appendChild(ui);
ui.innerHTML = `
<div id="vignette"></div>
<div id="bars" class="hide"><div class="hpbar"><i></i></div><div class="xpbar"><i></i></div><span class="lv">1 级</span></div>
<div id="actinfo" class="hide"><b>第一幕 · 舞会</b><span class="goal"></span><span class="tm"></span></div>
<div id="boss" class="hide"><b>看门的三头犬</b><div class="bossbar"><i></i></div></div>
<div id="acttitle" class="hide"><b></b><small></small></div>
<div id="calm" class="hide"><b>朱丽叶的安稳</b><div class="bossbar"><i></i></div></div>
<div id="bark" class="hide"><img alt=""><div><b></b><span></span></div></div>
<div id="dlg" class="hide" data-ui><div class="cg hide"><img alt=""></div><div class="por"><img alt=""></div><div class="box"><b class="who"></b><div class="txt"></div><i class="more">▼</i></div><button class="skip">跳过 ›</button></div>
<div id="cards" class="hide" data-ui><h2></h2><div class="row"></div></div>
<div id="art" class="hide" data-ui><div class="frame"><img alt=""></div><div class="info"><h2></h2><p class="by"></p><p class="where"></p><ul></ul><div class="btns"></div></div></div>
<div id="title" class="hide" data-ui><div class="tbg"><img alt="" src="assets/cg/key-rj.jpg"></div>
 <div class="thead"><h1>莎士比亚的两场戏</h1><p class="sub">用一首情歌，改写莎士比亚的结局</p></div>
 <div class="stories">
  <div class="story" data-s="rj"><img alt="" src="assets/cg/key-rj.jpg"><div class="st"><b>第一部 · 罗密欧与朱丽叶</b><small>选一幕开始</small><div class="acts"></div><div class="sb"></div></div></div>
  <div class="story" data-s="tp"><img alt="" src="assets/cg/key-tp.jpg"><div class="st"><b>第二部 · 暴风雨</b><small>新 · 海上的魔法岛</small><div class="acts"></div><div class="sb"></div></div></div>
 </div>
 <div class="tfoot"><span class="hello"></span><button class="b-mem">回忆</button><button class="b-how">怎么玩</button><button class="b-name">起个名字</button></div>
 <p class="go">加载中……</p><p class="ver">${VERSION} 开发中</p><p class="fshint hide"></p></div>
<div id="cover" data-ui><div class="cbg"><img class="c1" alt="" src="assets/cg/key-rj.jpg"><img class="c2" alt="" src="assets/cg/key-tp.jpg"></div>
 <div class="clogo"><small>一首情歌，改写两个结局</small><h1>莎士比亚的两场戏</h1><p>罗密欧与朱丽叶 · 暴风雨</p></div>
 <p class="cgo">加载中……</p><p class="chint">手机横过来玩 · 开声音更好听</p><p class="fshint2"></p></div>
<div id="wait" class="hide"><span>布景还在搬上台</span><b>0%</b><small>网络慢的话要等一会儿</small></div>
<div id="over" class="hide" data-ui><h1></h1><p class="sub"></p><p class="tip"></p><div class="btns"></div></div>
<div id="cast" class="hide" data-ui><h2>人物关系</h2><div class="row"></div><p class="hint">点一下继续</p></div>
<div id="mem" class="hide" data-ui><div class="inner"><h2></h2><p class="stat"></p><h3>名画</h3><div class="grid g-paint"></div><h3>插图</h3><div class="grid g-cg"></div><h3>你说过的情话</h3><ul class="said"></ul><div class="btns"><button class="b-back">返回</button><button class="b-clear">清空存档</button></div></div></div>
<div id="how" class="hide" data-ui><div class="inner"><h2>怎么玩</h2><ul>
 <li><b>左手</b>在屏幕左半边按住拖动：走。</li><li><b>右手</b>在右半边按住拖动：朝那个方向唱歌（射出音符）。右手不碰时，会自动唱给最近的怪。</li>
 <li>怪被歌声打动，会变成<b>萤火</b>，捡起来升级。每次升级从<b>三首新歌</b>里选一首，选完会震开身边一圈怪。</li>
 <li>每一幕打完，会看到这一幕故事的<b>名画</b>和插图；幕和幕之间，你替罗密欧<b>选一句情话</b>，那句情话就是一首新歌。</li>
 <li>第一部的最后一幕：守住沉睡的朱丽叶，就能<b>改写结局</b>。</li>
 <li>进度存在这台手机里，下次打开能从上次那一幕<b>继续</b>。</li></ul><div class="btns"><button class="b-back">返回</button></div></div></div>
<div id="viewer" class="hide" data-ui><img alt=""></div>
<div id="tools" class="hide"><button class="b-pause">暂停</button><button class="b-mute">声音 开</button></div>
<div id="pause" class="hide" data-ui><h2>暂停</h2><button class="b-resume">继续</button><button class="b-restart">从头开始</button></div>
<div id="fps" class="${DEBUG ? '' : 'hide'}"></div>`;
const $ = (s) => ui.querySelector(s);
ui.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button')) sfxClick(); }, true);   // 点按钮的轻响
const show = (el, on = true) => el.classList.toggle('hide', !on);
// 游戏自己的封面出来了，去掉网页一打开就显示的那张（index.html 里的 #boot），等封面图下好再去，免得中间闪一下黑
{ const b = document.getElementById('boot'), im = ui.querySelector('#cover .c1'); const off = () => b && b.remove(); if (im.complete) off(); else { im.onload = im.onerror = off; setTimeout(off, 12000); } }

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
// 插图：先在后台下好、解码好再换上去，没下好之前保留上一张（或者露出游戏画面），不会闪黑屏（10-31 用户说"黑屏的很多"）
const imgCache = {};
function loadImg(src) {
  return imgCache[src] || (imgCache[src] = new Promise((res, rej) => {
    const i = new Image(); i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => res(i));
    i.onerror = () => { delete imgCache[src]; rej(new Error(src)); }; i.src = src;
  }));
}
// 进一个故事时，把它的插图、名画、头像都先下起来
function preloadStory(story) {
  const pre = story === 'tp' ? 'tp-' : 'rj-';
  for (const k of CG_ALL) if (k.startsWith(pre)) loadImg(`assets/cg/${k}.jpg`).catch(() => {});
  for (const p of Object.values(PEOPLE)) if (p.img) loadImg(p.img).catch(() => {});
  for (const k of PAINT_ALL) if ((story === 'tp') === k.startsWith('tp')) loadImg(PAINTINGS[k].img).catch(() => {});
}
let cgWant = null;
function setCG(name) {
  const box = $('#dlg .cg'), img = box.querySelector('img');
  cgWant = name;
  if (!name) { show(box, false); return; }
  unlock('cgs', name);
  const src = `assets/cg/${name}.jpg`;
  loadImg(src).then(() => {
    if (cgWant !== name) return;
    img.src = src; show(box);
    box.classList.remove('kb'); void box.offsetWidth; box.classList.add('kb');
  }).catch(() => {});
}
function showCast() {
  return new Promise((resolve) => {
    const el = $('#cast'), row = el.querySelector('.row');
    row.innerHTML = CAST.map((c) => `<div class="c"><img alt="" src="${PEOPLE[c.who].img}"><b>${PEOPLE[c.who].name}</b><small>${c.line}</small></div>`).join('');
    show(el);
    const done = () => { el.onclick = null; show(el, false); resolve(); };
    setTimeout(() => { el.onclick = done; }, 400);
    if (AUTO) setTimeout(done, 60);
  });
}
async function playScene(lines) {
  const el = $('#dlg'); let skip = false;
  el.querySelector('.skip').onclick = (e) => { e.stopPropagation(); skip = true; advance && advance(); };
  let advance = null;
  el.onclick = () => advance && advance();
  setCG(null);
  show(el);
  for (const line of lines) {
    if (line.choice) { show(el, false); await chooseCards(line.choice, true); show(el); continue; }
    if ('cg' in line) { setCG(line.cg); continue; }
    if (line.cast) { if (!skip) await showCast(); continue; }
    if (line.painting) { show(el, false); await paintingCard(line.painting, { buttons: [['继续', 'go']] }); show(el); continue; }
    if (skip) continue;
    const [who, raw] = line, p = PEOPLE[who], text = raw.replace(/\{你\}/g, save.name || '你');
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
  setCG(null);
  show(el, false);
}

// 三选一：升级时，或者幕间"对话里选回答"
// 卡片出来后 0.6 秒内点不了（10-31 用户说"一不小心连升两级"：连着两次升级时，第二组卡片刚出来就被手指点上了）
let cardLock = 0;
function chooseCards(title, isChoice) {
  cardLock = Date.now() + (AUTO ? 0 : 650);
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
      b.onclick = () => { if (Date.now() < cardLock) return; cardLock = Date.now() + 1e9; show(el, false); takeSkill(k.id); if (isChoice) recordChoice(title, LOVE[k.id], k.name); resolve(k.id); };
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
    unlock('paintings', String(act));
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
  1: { name: '第一幕 · 舞会', lines: ACT1_LINES, goal: '打动闹事的客人，撑到舞会散场' },
  2: { name: '第二幕 · 阳台', lines: ACT2_LINES, goal: '守在阳台下，打动冲来的三头犬' },
  3: { name: '第三幕 · 决斗', lines: ACT3_LINES, goal: '用歌声打动提伯尔特，别让决斗见血' },
  4: { name: '第四幕 · 墓室', lines: ACT4_LINES, goal: '守住沉睡的朱丽叶，别让亡魂靠近石台' },
  5: { name: '第二部 · 漂岛', lines: TP_LINES, goal: '打动海里爬上来的怪，再打动卡利班' },
};
const storyOf = (n) => (n <= 4 ? 'rj' : 'tp');
const ACT_NO = ['', '第一', '第二', '第三', '第四'];
// 开始一个故事。from = 从第几幕开始（继续存档时 > 1）；again = 倒下后从头再来，不再放开场对话
async function startStory(story, from, again) {
  resetRun();
  show($('#title'), false); show($('#over'), false);
  phase = 'story';
  if (!again) { save.plays++; persist(); }
  if (story === 'tp') {
    if (islandKit) { setAct(5); player.x = ISLE_START.x; player.z = ISLE_START.z; }   // 剧情背后就是海岛（原来是第一幕的舞厅）
    if (!again) await playScene(SCENES.tpIntro);
    await waitRest(); beginAct(5); return;
  }
  if (from > 1) {   // 选关卡或继续：有这一幕的存档就用自己的等级和技能，没有就送一套够用的
    const snap = save.rj.snaps[from];
    if (snap) { const d = structuredClone(snap); stats = { ...baseStats(), ...d.stats }; levels = d.levels; level = d.level; xp = d.xp; }
    else giveBuild(from);
    player.hp = maxHp(); setAct(from);   // 剧情背后是这一幕的场景
    if (!again && SCENES[`act${from - 1}To${from}`]) await playScene(SCENES[`act${from - 1}To${from}`]);   // 先放这一幕前面的剧情，好知道故事走到哪了
    await waitRest(); beginAct(from); return;
  }
  if (START_ACT > 1 && !again) {   // 测试用：直接从后面的幕开始，先送几级
    for (const id of ['chord', 'presto', 'sustain', 'chord']) { takeSkill(id); level++; }
    if (START_ACT === 5) { await waitRest(); beginAct(5); return; }
  } else if (!again) await playScene(SCENES.prologue);
  await waitRest(); beginAct(again ? 1 : START_ACT);
}
const startRun = (again) => startStory('rj', 1, again);
// 直接从后面的幕开始、又没有存档时，送的技能和等级（大约是正常打到那一幕的水平）
function giveBuild(n) {
  const picks = { 2: ['chord', 'presto', 'sustain'], 3: ['chord', 'presto', 'sustain', 'forte', 'chord'], 4: ['chord', 'presto', 'sustain', 'forte', 'chord', 'orbit', 'hymn'] }[n] || [];
  for (const id of picks) { takeSkill(id); level++; }
}
function beginAct(n, retry) {
  act = n;
  if (retry && snapshot) { ({ stats, levels, level, xp } = structuredClone(snapshot)); player.hp = maxHp(); }
  else {
    snapshot = structuredClone({ stats, levels, level, xp });
    const st = save[storyOf(n)]; st.snaps[n] = snapshot; st.reached = Math.max(st.reached, n); persist();   // 存档：下次能从这一幕继续
  }
  E.n = B.n = O.n = 0; if (retry) pendingLevels = 0;   // 上一幕结束时攒下的升级，这一幕一开打就选
  player.x = player.z = 0; player.aimX = 0; player.aimZ = 1; player.hurtCd = 0;
  if (n > 1 && !retry) player.hp = Math.min(maxHp(), player.hp + maxHp() * 0.35);   // 每一幕开头回一点血
  actTime = 0; lineIdx = 0; birdWaves = 0; spawnAcc = 0; saidLow = false;
  dogSpawned = dogDown = false; bossCharge = 0; calm = 100; saidCalmHalf = saidCalmLow = false; mercFell = false; EB.n = 0;
  if (juliet) { juliet.visible = false; layJuliet(false); }
  if (tybalt) tybalt.visible = false;
  if (mercutio) { mercutio.visible = n === 1 || n === 3; mercutio.position.set(-1.6, 0, 1.2); mercutio.userData.inner.rotation.set(0, 0, 0); }   // 茂丘西奥第一幕也跟着罗密欧去舞会
  if (n === 4) { player.z = 3.2; if (juliet) { juliet.visible = true; layJuliet(true); } }
  if (n === 5) { player.x = ISLE_START.x; player.z = ISLE_START.z; }
  setAct(n);
  camDist = 0.45;   // 每一幕开头镜头贴近主角，再拉到打斗的高度
  $('#actinfo b').textContent = ACTS[n].name;
  show($('#bars')); show($('#actinfo')); show($('#tools'));
  $('#actinfo .goal').textContent = ACTS[n].goal;
  const at = $('#acttitle'); at.querySelector('b').textContent = ACTS[n].name; at.querySelector('small').textContent = ACTS[n].goal; show(at); at.classList.remove('pop'); void at.offsetWidth; at.classList.add('pop');
  setTimeout(() => show(at, false), 3400);
  sfxAct();
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
  await playScene(SCENES[act === 5 ? 'tpEnd' : `act${act}End`]);
  phase = 'card';
  stage.classList.add('freeze');
  await sleep(AUTO ? 50 : 900);
  await paintingCard(act === 5 ? 'tp1' : act, { buttons: [['继续', 'go']] });
  stage.classList.remove('freeze');
  if (SCENES[`act${act}To${act + 1}`]) await playScene(SCENES[`act${act}To${act + 1}`]);
  if (act < 4 && ACTS[act + 1]) beginAct(act + 1);
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
    unlock('endings', 'good');
    await paintingCard('good', { lead: '你守住了朱丽叶，改写了莎士比亚的结局。', buttons: [['看结尾', 'go']] });
    stage.classList.remove('freeze'); bierLight.intensity = 22;
    theEnd(true);
  } else {
    unlock('endings', 'bad');
    const v = await paintingCard('bad', { lead: '莎士比亚写下的结局就是这样。再来一次，改写它？', buttons: [['从这一幕重来', 'act'], ['从头开始', 'all']] });
    stage.classList.remove('freeze');
    if (v === 'act') beginAct(4, true); else startRun(true);
  }
}
// 结束画面：标题、一句话、这一局的成绩、按钮
function endScreen(h1, sub, buttons) {
  phase = 'over';
  recordBest(kills, level);
  const el = $('#over');
  el.querySelector('h1').textContent = h1;
  el.querySelector('.sub').textContent = sub;
  el.querySelector('.tip').textContent = `这一局：${level} 级，打动了 ${kills} 只怪 · 一共演了 ${save.plays} 次`;
  const b = el.querySelector('.btns'); b.innerHTML = '';
  for (const [label, fn] of buttons) { const x = document.createElement('button'); x.textContent = label; x.onclick = () => { show(el, false); fn(); }; b.appendChild(x); }
  show(el);
  if (AUTO) setTimeout(() => {}, 0);
}
function theEnd() {
  save.rj.done = true; persist();
  endScreen('第一部 · 全剧终', '这一次，罗密欧和朱丽叶都活了下来。', [['进入第二部 · 暴风雨', () => startStory('tp')], ['回到开始画面', showTitle]]);
}
function paintingCardEnd() {
  if (act === 5) endScreen('第二部 · 第一幕 完', '下一幕正在制作，先演到这里。', [['回到开始画面', showTitle]]);
  else endScreen(`${ACT_NO[act]}幕 完`, '后面的几幕正在制作，先玩到这里。', [['回到开始画面', showTitle]]);
}
async function die() {
  phase = 'dead';
  show($('#bark'), false); show($('#boss'), false);
  await sleep(AUTO ? 50 : 1200);
  show($('#bars'), false); show($('#actinfo'), false); show($('#tools'), false);
  await playScene([['narrator', DEATH[act]]]);
  const btns = act > 1 ? [['从这一幕重来', 'act'], ['从头开始', 'all']] : [['再来一次', 'all']];
  recordBest(kills, level);
  const btns2 = act === 5 ? [['再来一次', 'act'], ['回到开始画面', 'title']] : [...btns, ['回到开始画面', 'title']];
  const v = await paintingCard(act === 4 ? 'bad' : act === 5 ? 'tp1' : act, { lead: `你在${act === 5 ? '漂岛' : ACT_NO[act] + '幕'}倒下了。先看看这一幕的名画：`, buttons: btns2 });   // 第四幕没有单独的画，用原版结局那幅
  if (v === 'act') beginAct(act, true); else if (v === 'title') showTitle(); else startRun(true);
}

// ---------- 每一帧 ----------
const tmp = { x: 0, z: 0 };
function step(dt) {
  time += dt;
  if (phase === 'fight') actTime += dt;
  const fighting = phase === 'fight';

  // 主角移动
  const mv = input.getMove(), mag = Math.hypot(mv.x, mv.y), mvOn = mag > 0.2;   // 摇杆推得很轻时不动（原来会"站着不动却在挪"）
  const canMove = fighting || phase === 'title';
  if (canMove && phase !== 'title' && mvOn) {
    const sp = 6.4 * stats.speedMul;
    player.x += mv.x * sp * dt; player.z += mv.y * sp * dt;
    pushOut(player, player.r);
  }
  player.moving = canMove && phase !== 'title' && mvOn ? mag : 0;
  if (player.moving > 0.1) { player.mvx = mv.x; player.mvz = mv.y; }
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
    if (act === 5 && dogSpawned && !dogDown && !tybaltHalfSaid) { const bi = bossIndex(); if (bi >= 0 && E.hp[bi] < TYPES[T.caliban].hp / 2) { tybaltHalfSaid = true; bark(TP_BOSS.half.who, TP_BOSS.half.text); } }
    if (act === 3 && dogSpawned && !dogDown && !tybaltHalfSaid) {
      const bi = bossIndex(); if (bi >= 0 && E.hp[bi] < TYPES[T.tybalt].hp / 2) { tybaltHalfSaid = true; bark(BOSS_LINES.tybaltHalf.who, BOSS_LINES.tybaltHalf.text); }
    }
    if (dogSpawned && !dogDown) {   // 三头犬每隔几秒猛冲一下
      bossChargeCd -= dt; bossCharge -= dt;
      if (bossChargeCd <= 0) { bossChargeCd = 5; bossCharge = 0.8; }
    }
  }
  if (act === 1 && tybalt && tybalt.visible) {   // 第一幕：提伯尔特在场边露面，站着盯一会儿再走开
    tybalt.userData.t += dt;
    tybalt.rotation.y = Math.atan2(player.x - tybalt.position.x, player.z - tybalt.position.z);
    playAnim(tybalt, tybalt.userData.t > 5 ? 'walk' : 'idle');
    if (tybalt.userData.t > 5) { tybalt.position.x -= dt * 2.2; tybalt.rotation.y = -Math.PI / 2; }
    if (tybalt.userData.t > 9) tybalt.visible = false;
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
    if (t.ghost && act === 4 && d > 2.2) {   // 亡魂飘向石台上的朱丽叶；罗密欧挡在身边时改去缠他
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
        const k = EB.n++; EB.x[k] = E.x[i]; EB.z[k] = E.z[i]; EB.dx[k] = dx / d * 5; EB.dz[k] = dz / d * 5; EB.life[k] = 3.2;   // 慢一点，看得见、躲得开
      }
    }
    // 10-31 用户说小怪"自动攻击、必中、躲不掉"：改成先蓄力（变红、停下、鼓起来）再扑，蓄力时走开就打不中
    if (E.wind[i] > 0) {
      E.wind[i] -= dt; sp = 0;
      if (E.wind[i] <= 0) {
        E.atk[i] = t.boss ? 1.1 : 1.3;
        if (fighting && d < touch + (t.boss ? 0.9 : 0.5) && player.hurtCd <= 0 && !GOD) {
          player.hp -= t.dmg * early; player.hurtCd = 0.45; sfxHurt();
          if (player.hp <= 0) { player.hp = 0; die(); return; }
        }
      }
    } else if (fighting && !t.ranged && d < touch + (t.boss ? 0.6 : 0.3) && E.atk[i] <= 0) E.wind[i] = t.boss ? 0.7 : t.key === 'birdhead' ? 0.45 : 0.6;
    const st = sp >= 0 ? Math.min(sp * dt, Math.max(0, d - touch)) : sp * dt;
    E.x[i] += dx / d * st; E.z[i] += dz / d * st;
    if (Math.abs(dx) > 0.2) E.face[i] = dx > 0 ? 1 : -1;
  }
  if (player.hurtCd > 0) player.hurtCd -= dt;
  for (let k = EB.n - 1; k >= 0; k--) {
    EB.x[k] += EB.dx[k] * dt; EB.z[k] += EB.dz[k] * dt; EB.life[k] -= dt;
    const hx = EB.x[k] - player.x, hz = EB.z[k] - player.z;
    const hitP = fighting && hx * hx + hz * hz < 0.55 * 0.55;
    if (hitP && player.hurtCd <= 0 && !GOD) { player.hp -= 7; player.hurtCd = 0.45; sfxHurt(); if (player.hp <= 0) { player.hp = 0; die(); return; } }
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
  stepOrbs(dt, 1.7, boost);   // 10-31 用户要"掉在怪倒下的地方，走过去捡"：萤火留在原地，走到 1.7 米内才飞过来（"轻快"技能捡得远一点）
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
    const pull = phase === 'actEnd' ? 99 : magnet * (1 + (levels.stride || 0) * 0.4);
    if (d < 0.6) {
      xp += O.v[i] * boost; O.n--; sfxPick();
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
  sfxLevel();
  await sleep(AUTO ? 10 : 380);
  slowmo = 0;
  if (!firstLevelSaid) { firstLevelSaid = true; bark(EVENT_LINES.firstLevel.who, EVENT_LINES.firstLevel.text); }
  else if (Math.random() < 0.4) { const L = EVENT_LINES.levelUp[Math.random() * EVENT_LINES.levelUp.length | 0]; bark(L.who, L.text); }
  while (pendingLevels > 0) {
    pendingLevels--;
    await chooseCards(`升到 ${level - pendingLevels} 级！选一首新歌`, false);
    shockwave(5.5, 3);
    if (hero) { playAnim(hero, 'jump', { once: true, fade: 0.1, speed: 1.3 }); hero.userData.jumpT = 0.8; }
    if (pendingLevels > 0) await sleep(AUTO ? 10 : 350);
  }
  if (phase === 'levelup') phase = 'fight';
}

// ---------- 手感：震屏、顿帧、伤害数字、连击、脚下的小烟 ----------
let shake = 0, hitStop = 0, combo = 0, comboT = 0, comboBest = 0;
const fxLayer = document.createElement('div'); fxLayer.id = 'fx'; stage.appendChild(fxLayer);
const numPool = Array.from({ length: 28 }, () => { const b = document.createElement('b'); b.className = 'num'; fxLayer.appendChild(b); return b; });
let numK = 0, numGate = 0;
const projV = new THREE.Vector3();
function toScreen(x, y, z) { projV.set(x, y, z).project(camera); return [(projV.x + 1) / 2 * 100, (1 - projV.y) / 2 * 100]; }
function popNumber(x, z, dmg, big) {
  const t = performance.now(); if (!big && t - numGate < 70) return; numGate = t;
  const el = numPool[numK++ % numPool.length], [sx, sy] = toScreen(x, 1.8, z);
  el.textContent = Math.max(1, Math.round(dmg * 10)); el.className = 'num' + (big ? ' big' : dmg >= 2 ? ' crit' : '');
  el.style.left = (sx + (Math.random() - 0.5) * 3) + '%'; el.style.top = sy + '%';
  void el.offsetWidth; el.classList.add('go');
}
const comboEl = document.createElement('div'); comboEl.id = 'combo'; comboEl.className = 'hide'; comboEl.innerHTML = '<b></b><small>连击</small>'; fxLayer.appendChild(comboEl);
function comboAdd() {
  combo++; comboT = 2.6; comboBest = Math.max(comboBest, combo);
  if (combo >= 5) { comboEl.classList.remove('hide'); comboEl.querySelector('b').textContent = '×' + combo; comboEl.classList.remove('pop'); void comboEl.offsetWidth; comboEl.classList.add('pop'); }
  if (combo === 25 || combo === 60 || combo === 120 || combo % 200 === 0) cheer(combo);
}
function comboBreak() { combo = 0; comboT = 0; comboEl.classList.add('hide'); }
function stepCombo(dt) { if (comboT > 0) { comboT -= dt; if (comboT <= 0) comboBreak(); } }
// 连击到一定数量：屏幕中间跳一句夸奖
function cheer(n) {
  const words = ['太动人了！', '全场起立！', '安可！安可！', '莎士比亚都哭了'];
  const el = document.createElement('div'); el.className = 'cheer'; el.textContent = words[Math.min(words.length - 1, [25, 60, 120].indexOf(n) < 0 ? 3 : [25, 60, 120].indexOf(n))];
  fxLayer.appendChild(el); setTimeout(() => el.remove(), 1600);
  [0, 4, 7, 12].forEach((k, j) => tone(nt(k + 12), { t0: j * 0.06, dur: 0.3, vol: 0.04, type: 'triangle' }));
}
// 受伤：屏幕边缘红一下
function flashHurt() { const v = document.getElementById('vignette'); if (!v) return; v.classList.remove('hurt'); void v.offsetWidth; v.classList.add('hurt'); }
// 脚下的小烟：几片淡淡的圆，轮流用
const dustMat = new THREE.MeshBasicMaterial({ map: glowTex('235,225,210'), transparent: true, opacity: 0.5, depthWrite: false });
const dusts = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2), dustMat.clone()); m.visible = false; m.userData.t = 9; scene.add(m); return m; });
let dustK = 0;
function dust(x, z) { const m = dusts[dustK++ % dusts.length]; m.position.set(x + (Math.random() - 0.5) * 0.3, 0.05, z + (Math.random() - 0.5) * 0.3); m.userData.t = 0; m.visible = true; }
function stepDust(dt) { for (const m of dusts) { if (m.userData.t > 0.5) { m.visible = false; continue; } m.userData.t += dt; const f = m.userData.t / 0.5; m.scale.setScalar(0.6 + f * 1.4); m.material.opacity = 0.45 * (1 - f); } }
// 节拍：0 到 1，背景音乐每一拍转一圈（没声音时按 92 拍每分钟算）
function beatPhase() { const t = actx && BGM.timer ? actx.currentTime - BGM.t0 : time; return (t * 92 / 60) % 1; }

// ---------- 画 ----------
function writeMatrix(arr, i, x, y, z, sx, sy, sz) {
  const o = i * 16;
  arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
const counts = new Int32Array(TYPES.length), fcounts = new Int32Array(TYPES.length * 8);
const camTarget = new THREE.Vector3(), shakeV = new THREE.Vector3();
let camDist = 1;
function draw(dt) {
  stepDust(dt); if (phase === 'fight') stepCombo(dt);
  counts.fill(0); fcounts.fill(0);
  const sm = shadowMesh.instanceMatrix.array;
  for (let i = 0; i < E.n; i++) {
    const ty = E.type[i], t = TYPES[ty], m = enemyMeshes[ty], k = counts[ty]++;
    if (!m) {   // 提伯尔特：3D 模型
      const bm = t.key === 'caliban' ? caliban : tybalt;
      if (bm) {   // Boss 的 3D 模型：冲刺时跑，平时走，贴近罗密欧时挥剑（没有这个动作就走）
        bm.visible = true; bm.position.set(E.x[i], 0, E.z[i]);
        bm.rotation.y = Math.atan2(player.x - E.x[i], player.z - E.z[i]) + (bm.userData.yaw || 0);
        const near = E.wind[i] > 0 || Math.hypot(player.x - E.x[i], player.z - E.z[i]) < 1.6;
        playAnim(bm, near && bm.userData.actions?.slash ? 'slash' : bossCharge > 0 && bm.userData.actions?.run ? 'run' : 'walk', { speed: near ? 1.6 : 1 });
        bm.userData.inner.scale.setScalar(E.flash[i] > 0 ? 1.05 : E.wind[i] > 0 ? 1.08 : 1);
        if (!bm.userData.actions) bm.userData.inner.position.y = Math.abs(Math.sin(time * 6)) * 0.15;
      }
      writeMatrix(sm, i, E.x[i], 0.012, E.z[i], t.r * 3, 1, t.r * 2.1);
      continue;
    }
    const mf = monFrames[ty];
    if (mf) {   // 3D 怪：按走路的节奏挑姿势，面朝前进的方向
      counts[ty]--;
      const f = mf.n > 1 ? Math.floor(((time / mf.dur) * 1.3 + E.phase[i]) * mf.n) % mf.n : 0;
      const key = ty * 8 + f, k2 = fcounts[key]++, fm = mf.meshes[f];
      const dx = (t.ghost && act === 4 ? -E.x[i] : player.x - E.x[i]), dz = (t.ghost && act === 4 ? -E.z[i] : player.z - E.z[i]);
      const yaw = Math.atan2(dx, dz);
      const bob = mf.n === 1 ? (t.ghost ? 0.25 + Math.sin(time * 3 + E.phase[i]) * 0.15 : Math.abs(Math.sin(time * 9 + E.phase[i])) * 0.15) : 0;
      writeMatrixY(fm.instanceMatrix.array, k2, E.x[i], bob, E.z[i], E.wind[i] > 0 ? 1.12 : 1, yaw + (mf.n === 1 && !t.ghost ? Math.sin(time * 9 + E.phase[i]) * 0.12 : 0));
      const fl = E.flash[i] > 0 ? 2.4 : 1, w = E.wind[i] > 0 ? 0.5 + 0.5 * Math.sin(time * 40) : 0, col = fm.instanceColor.array;
      col[k2 * 3] = fl + w * 1.6; col[k2 * 3 + 1] = fl * (1 - w * 0.6); col[k2 * 3 + 2] = fl * (1 - w * 0.6);   // 蓄力时闪红
      writeMatrix(sm, i, E.x[i], 0.012, E.z[i], t.r * 3, 1, t.r * 2.1);
      continue;
    }
    const b = Math.abs(Math.sin(time * (ty === T.birdhead ? 13 : 8) + E.phase[i]));
    const s = t.h, flip = t.flip ? E.face[i] : 1;
    writeMatrix(m.instanceMatrix.array, k, E.x[i], b * 0.12, E.z[i], s * flip * (1 + (1 - b) * 0.06), s * (0.94 + b * 0.08), s * (0.94 + b * 0.08));
    const f = E.flash[i] > 0 ? 2.6 : 0.92, col = m.instanceColor.array, w = E.wind[i] > 0 ? 1 : 0;
    col[k * 3] = f + w; col[k * 3 + 1] = f * (1 - w * 0.5); col[k * 3 + 2] = (E.flash[i] > 0 ? 2.6 : 0.98) * (1 - w * 0.5);
    const ss = t.r * 3;
    writeMatrix(sm, i, E.x[i], 0.012, E.z[i], ss, 1, ss * 0.7);
  }
  if (tybalt && act === 3 && !(dogSpawned && !dogDown) && tybalt.visible) tybalt.visible = false;
  if (tybalt && tybalt.visible) tybalt.userData.mixer.update(dt);
  if (caliban) { if (act !== 5 || !(dogSpawned && !dogDown)) caliban.visible = false; else if (caliban.userData.mixer) caliban.userData.mixer.update(dt); }
  if (ariel.visible) { const a = time * 1.6; ariel.position.set(player.x + Math.cos(a) * 1.6, 1.9 + Math.sin(time * 3) * 0.25, player.z + Math.sin(a) * 1.0); }
  monFrames.forEach((mf, ty) => { if (!mf) return; mf.meshes.forEach((m, f) => { const c = fcounts[ty * 8 + f]; m.count = c; m.visible = c > 0; if (c) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }); });
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
  if (hero) {   // 罗密欧：跑的时候播跑步、面朝跑的方向；站着时播站立、面朝唱歌的方向
    // 10-31 用户说奶娃"经常立正、走路不放松"：手指短暂松开（0.2 秒内）还算在跑；站着时慢慢转身，跟着节拍摇摆点头；
    // 跑的时候身体前倾、一颠一颠、落地压扁一点，转弯往里歪
    const u = hero.userData;
    if (player.moving > 0.1) u.grace = 0.2; else if (u.grace > 0) u.grace -= dt;
    const mv = player.moving > 0.1 || u.grace > 0;
    hero.position.set(player.x, 0, player.z);
    const want = player.moving > 0.1 || u.grace > 0 ? Math.atan2(player.mvx, player.mvz) : Math.atan2(player.aimX, player.aimZ);
    let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    const turn = dr * Math.min(1, dt * (mv ? 10 : 4.5));
    hero.rotation.y += turn;
    const inner = u.inner, sp = mv ? Math.max(0.4, player.moving) : 0;
    u.lean = (u.lean || 0) + ((mv ? 0.16 * sp : 0) - (u.lean || 0)) * Math.min(1, dt * 8);
    u.bank = (u.bank || 0) + (Math.max(-0.22, Math.min(0.22, -turn / Math.max(dt, 1e-3) * 0.05)) - (u.bank || 0)) * Math.min(1, dt * 6);
    u.ph = (u.ph || 0) + dt * (mv ? 9.5 * stats.speedMul * (0.7 + sp * 0.5) : 0);
    const beat = beatPhase(), hop = Math.abs(Math.sin(u.ph));
    if (mv) {
      inner.position.y = hop * 0.09; inner.rotation.set(u.lean, 0, u.bank + Math.sin(u.ph) * 0.05);
      const sq = 1 - (1 - hop) * 0.07; inner.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
      if (Math.floor(u.ph / Math.PI) !== u.step) { u.step = Math.floor(u.ph / Math.PI); sfxStep(); dust(player.x, player.z); }
    } else {   // 站着唱歌：跟着拍子左右摇、点一点头，呼吸
      const sw = Math.sin(beat * Math.PI * 2);
      inner.position.y = Math.abs(Math.sin(beat * Math.PI * 2)) * 0.035; inner.rotation.set(u.lean + 0.04 * Math.abs(sw), 0, sw * 0.07);
      const br = 1 + Math.sin(time * 2.4) * 0.012; inner.scale.set(1 / Math.sqrt(br), br, 1 / Math.sqrt(br));
    }
    if (hero.userData.jumpT > 0) hero.userData.jumpT -= dt;
    if (hero.userData.jumpT <= 0 || mv) {   // 跳的时候一动就接着跑（原来跳完会定住，人在挪却不迈腿）
      hero.userData.jumpT = 0;
      const fast = player.moving > 0.62, k = stats.speedMul;
      playAnim(hero, !mv ? 'idle' : fast || !hero.userData.actions.walk ? 'run' : 'walk', { speed: !mv ? 1.4 : fast ? 0.85 * k + 0.25 * player.moving : (0.9 + player.moving * 0.8) * k, fade: 0.32 });
    }
    hero.userData.mixer.update(dt);
    hero.visible = !(player.hurtCd > 0.25 && Math.floor(time * 20) % 2);
  }
  if (juliet && juliet.visible && !juliet.userData.lying) { juliet.userData.inner.position.y = 0.06 + Math.sin(time * 1.8) * 0.04; }
  if (mercutio && mercutio.visible) {   // 第三幕：茂丘西奥跟在身边跑，倒下时播"倒下"并停在最后一帧
    if (!mercFell) {
      const tx = player.x - 1.7, tz = player.z + 1.1, ddx = tx - mercutio.position.x, ddz = tz - mercutio.position.z, dd = Math.hypot(ddx, ddz);
      mercutio.position.x += ddx * Math.min(1, dt * 4); mercutio.position.z += ddz * Math.min(1, dt * 4);
      const run = dd > 0.25;
      const want = run ? Math.atan2(ddx, ddz) : Math.atan2(player.aimX, player.aimZ);
      let dr = want - mercutio.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); mercutio.rotation.y += dr * Math.min(1, dt * 10);
      playAnim(mercutio, run ? 'run' : 'idle');
    } else playAnim(mercutio, 'fall', { once: true, fade: 0.15 });
    mercutio.userData.mixer.update(dt);
  }
  heroLight.position.set(player.x, 2.6, player.z + 1.2);
  heroGlow.position.x = player.x; heroGlow.position.z = player.z;
  {   // 太阳（月亮）和影子的范围跟着主角，往画面上方多照一点
    const sun = LOOKS[tileAct]?.sun || [-6, 12, -4], tx = player.x, tz = player.z - 4;
    moon.target.position.set(tx, 0, tz); moon.position.set(tx + sun[0] * 2, sun[1] * 2, tz + sun[2] * 2);
  }
  if (isle && isle.group.visible) isle.tick(time);   // 海岛：海浪和小船动起来

  // 镜头：打的时候跟着主角；幕结束时拉近；名画定格时拉起
  const want = (phase === 'actEnd' ? 0.62 : phase === 'card' ? 1.5 : phase === 'title' || phase === 'over' ? 0.8 : 1) * (act === 5 ? 1.12 : 1);   // 海岛镜头高一点，多看到海
  camDist += (want - camDist) * Math.min(1, dt * 2.2);
  const panX = phase === 'title' || phase === 'over' ? 5.5 : 0;   // 开始和结束画面：镜头往右平移，主角站到画面左边，别挡住标题
  camTarget.set(player.x + panX + CAM.x * camDist, CAM.y * camDist, player.z + CAM.z * camDist);
  camera.position.lerp(camTarget, Math.min(1, dt * 7));
  camera.lookAt(camera.position.x - CAM.x * camDist, phase === 'actEnd' ? 0.9 : 0, camera.position.z - CAM.z * camDist);
  shakeV.copy(camera.position);
  if (shake > 0) {   // 震屏：被打、打死大怪、Boss 砸地（只在画这一帧时挪一下镜头，画完放回去）
    shake = Math.max(0, shake - dt * 2.2);
    const a = shake * shake * 0.5; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a;
  }
  renderer.render(scene, camera);
  camera.position.copy(shakeV);

  // 界面数字
  if (phase === 'fight' || phase === 'levelup') {
    $('#bars .hpbar i').style.width = (player.hp / maxHp() * 100) + '%';
    $('#bars .xpbar i').style.width = (xp / xpNeed(level) * 100) + '%';
    $('#bars .lv').textContent = `${level} 级`;
    const left = Math.max(0, Math.ceil(ACT_LEN - actTime));
    $('#actinfo .tm').textContent = act === 4 ? `醒来还有 ${left} 秒` : actTime >= ACT_LEN && !dogDown ? (act === 2 ? '让三头犬睡着' : act === 5 ? '打动卡利班' : '打动提伯尔特') : `${left} 秒`;
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
$('#pause .b-restart').onclick = () => { show($('#pause'), false); pausedFrom = null; show($('#boss'), false); show($('#calm'), false); if (act === 5) startStory('tp', 1, true); else startRun(true); };
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
function go(story, from) { if (!titleReady) return; titleReady = false; initAudio(); if (!AUTO) goFullscreen(); show($('#title .fshint'), false); preloadStory(story); startStory(story, from); }
// 开始画面：两个故事、继续、回忆、怎么玩、名字
function refreshTitle() {
  const hello = $('#title .hello');
  hello.textContent = save.name ? `${save.name}，欢迎回来` + (save.plays ? ` · 已经演了 ${save.plays} 次` : '') : (save.plays ? `欢迎回来 · 已经演了 ${save.plays} 次` : '欢迎来到剧场');
  $('#title .b-name').textContent = save.name ? '改名字' : '起个名字';
  const rjb = $('#title .story[data-s=rj] .sb'), tpb = $('#title .story[data-s=tp] .sb');
  const btn = (label, fn, main) => { const b = document.createElement('button'); b.textContent = label; if (main) b.className = 'main'; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
  rjb.innerHTML = ''; tpb.innerHTML = '';
  const r = save.rj.reached;
  if (r > 1 && save.rj.snaps[r]) { rjb.append(btn(`继续 · ${ACT_NO[r]}幕`, () => go('rj', r), true), btn('从头开始', () => go('rj', 1))); }
  else rjb.append(btn('开始演出', () => go('rj', 1), true));
  tpb.append(btn('开始演出', () => go('tp'), true));
  // 选关卡：每一幕都能直接进（打到过的打勾）
  const ra = $('#title .story[data-s=rj] .acts'), ta = $('#title .story[data-s=tp] .acts');
  const actBtn = (n, label, fn, done) => { const b = document.createElement('button'); b.className = 'act' + (done ? ' done' : ''); b.innerHTML = `<i>${ACT_NO[n] || ''}幕</i>${label}`; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
  ra.innerHTML = ''; ta.innerHTML = '';
  [['舞会', 1], ['阳台', 2], ['决斗', 3], ['墓室', 4]].forEach(([label, n]) => ra.append(actBtn(n, label, () => go('rj', n), save.rj.reached > n || (n === 4 && save.endings.length))));
  ta.append(actBtn(1, '漂岛', () => go('tp'), save.paintings.includes('tp1')));
  const more = document.createElement('span'); more.className = 'more'; more.textContent = '下一幕制作中'; ta.append(more);
  $('#title .go').textContent = titleReady ? '' : '加载中……';
  $('#title').classList.toggle('loading', !titleReady);
}
// 封面：两张主图交替、慢慢推近，标题，点一下进入选择页面
let coverReady = false;
$('#cover').onclick = () => {
  if (!coverReady) return;
  initAudio(); pluck(0, 0.06, 0.6, 'sine'); pluck(4, 0.05, 0.7, 'sine'); pluck(7, 0.05, 0.8, 'sine');
  if (!AUTO) goFullscreen();
  const c = $('#cover'); c.classList.add('leave'); setTimeout(() => { show(c, false); c.classList.remove('leave'); }, 450);
  refreshTitle(); show($('#title'));
};
{ const h = $('#title .fshint'); if (h && h.innerHTML) $('#cover .fshint2').innerHTML = h.innerHTML; }
function showTitle() {
  phase = 'title'; resetRun(); setAct(1);
  show($('#over'), false); show($('#bars'), false); show($('#actinfo'), false); show($('#tools'), false); show($('#boss'), false); show($('#calm'), false);
  titleReady = true; refreshTitle(); show($('#title'));
}
$('#title .b-name').onclick = () => {
  const n = (prompt('你叫什么名字？（会存在这台手机里，结局里会写上你的名字）', save.name) || '').trim().slice(0, 12);
  if (n || n === '') { save.name = n; persist(); refreshTitle(); }
};
$('#title .b-how').onclick = () => show($('#how'));
$('#how .b-back').onclick = () => show($('#how'), false);
const CG_ALL = ['rj-01-feud', 'rj-02-ball', 'rj-03-first-sight', 'rj-04-palms', 'rj-05-balcony', 'rj-06-wedding', 'rj-07-duel', 'rj-08-mercutio-falls', 'rj-09-potion', 'rj-10-tomb', 'rj-11-sail-away', 'tp-01-storm', 'tp-02-shore', 'tp-03-ariel', 'tp-04-caliban', 'tp-05-reunion'];
const PAINT_ALL = ['1', '2', '3', 'bad', 'good', 'tpw', 'tp1'];
function openMemories() {
  const el = $('#mem');
  el.querySelector('h2').textContent = `${save.name || '你'}的回忆`;
  const ends = [save.endings.includes('good') ? '改写的结局 ✓' : '改写的结局 ？', save.endings.includes('bad') ? '原版的结局 ✓' : '原版的结局 ？'];
  el.querySelector('.stat').textContent = `演了 ${save.plays} 次 · 最多一局打动 ${save.best.kills} 只怪 · 最高 ${save.best.level} 级 · ${ends.join(' · ')}`;
  const gp = el.querySelector('.g-paint'); gp.innerHTML = '';
  for (const k of PAINT_ALL) {
    const d = document.createElement('div'); d.className = 'cell';
    if (save.paintings.includes(k)) { d.innerHTML = `<img alt="" src="${PAINTINGS[k].img}">`; d.onclick = () => { show(el, false); paintingCard(k, { buttons: [['返回', 'go']] }).then(() => show(el)); }; }
    else d.innerHTML = '<span>？</span>';
    gp.appendChild(d);
  }
  const gc = el.querySelector('.g-cg'); gc.innerHTML = '';
  for (const k of CG_ALL) {
    const d = document.createElement('div'); d.className = 'cell wide';
    if (save.cgs.includes(k)) { d.innerHTML = `<img alt="" src="assets/cg/${k}.jpg">`; d.onclick = () => { const v = $('#viewer'); v.querySelector('img').src = `assets/cg/${k}.jpg`; show(v); }; }
    else d.innerHTML = '<span>？</span>';
    gc.appendChild(d);
  }
  const said = el.querySelector('.said');
  said.innerHTML = save.choices.length ? save.choices.slice().reverse().map((c) => `<li><small>${c.q}</small>“${c.a}”</li>`).join('') : '<li><small>还没有。在幕和幕之间替罗密欧选一句情话，就会记在这里。</small></li>';
  show(el);
}
$('#title .b-mem').onclick = openMemories;
$('#mem .b-back').onclick = () => show($('#mem'), false);
$('#mem .b-clear').onclick = () => { if (confirm('清空这台手机上的存档和回忆？')) { resetSave(); show($('#mem'), false); refreshTitle(); } };
$('#viewer').onclick = () => show($('#viewer'), false);

// 分两批下载（10-31 用户说微信里"打不开、黑屏的很多"：原来 5MB 模型全下完才能进）：
// 第一批只有罗密欧和朱丽叶，下完就能点进去看开场剧情；其余的（另外三个角色、6 种怪、海岛的树和石头）在后台接着下，
// 真要开打时还没下完，就在画面上显示进度等一下。封面上显示百分比。
const CORE = ['anim/romeo', 'wedding-dress'];
const REST = ['anim/tybalt', 'anim/mercutio', 'anim/caliban', ...TYPES.filter((t) => MON[t.key]).map((t) => `monsters/${t.key}`), 'kit-nature', 'props/palm', 'props/pillar', 'props/arch'];
// 每个文件大约多大（KB，.gz 的），服务器报大小之前先用这个算百分比
Object.entries({ 'anim/romeo': 609, 'wedding-dress': 239, 'anim/tybalt': 566, 'anim/mercutio': 525, 'anim/caliban': 370, 'monsters/lute': 152, 'monsters/birdhead': 127, 'monsters/drum': 119,
  'monsters/cerberus': 96, 'monsters/horn': 84, 'monsters/shade': 76, 'kit-nature': 454, 'props/palm': 67, 'props/pillar': 58, 'props/arch': 75 }).forEach(([k, v]) => { LOAD.size[`assets/models/${k}.glb`] = v * 1024; });
const pct = (list) => { let a = 0, b = 0; for (const p of list) { const u = `assets/models/${p}.glb`, s = LOAD.size[u] || 300000; a += Math.min(LOAD.got[u] || 0, s); b += s; } return Math.min(99, Math.floor(a / b * 100)); };
let coreDone = false;
onLoadProgress = () => {
  if (!coreDone) $('#cover .cgo').textContent = `加载中 ${pct(CORE)}%`;
  const w = $('#wait'); if (!w.classList.contains('hide')) w.querySelector('b').textContent = `${pct(REST)}%`;
};
const coreP = Promise.all([loadAnimated('romeo', 1.9), loadModel('wedding-dress', 1.95)]).then(([h, j]) => {
  hero = h; juliet = j; scene.add(hero, juliet); juliet.visible = false;
  coreDone = true; titleReady = true; coverReady = true;
  $('#cover .cgo').textContent = '点一下进入';
  refreshTitle();
});
coreP.catch((e) => { $('#cover .cgo').textContent = '网络不太好，点这里重新加载'; coverReady = false; $('#cover').onclick = () => location.reload(); console.error(e); });
// 第二批：每样东西失败了不影响别的（怪用立牌代替，海岛少几棵树）；角色失败了就一直重试
const keep = (fn) => fn().catch(() => new Promise((r) => setTimeout(r, 2500)).then(() => keep(fn)));
const restP = coreP.then(() => Promise.all([
  keep(() => loadAnimated('tybalt', 2.3)).then((t) => { tybalt = t; t.visible = false; scene.add(t); }),
  keep(() => loadAnimated('mercutio', 1.85)).then((m) => { mercutio = m; m.visible = false; scene.add(m); }),
  loadAnimated('caliban', 2.7).then((c) => { caliban = c; c.visible = false; scene.add(c); }).catch(() => null),
  loadMonsters(),
  loadIslandKit().catch((e) => console.warn('海岛布景加载失败', e)),
]));
restP.then(() => { if (DEBUG) console.log('全部加载完'); });
// 开打前：第二批还没下完就等一下，画面上显示进度
async function waitRest() {
  let done = false; restP.then(() => { done = true; });
  await sleep(0);
  if (done) return;
  const w = $('#wait'); show(w); onLoadProgress();
  await restP; show(w, false);
}
if (AUTO) coreP.then(() => { show($('#cover'), false); go(START_ACT === 5 ? 'tp' : 'rj', 1); });

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
  if (hitStop > 0) { hitStop -= dt; dt *= 0.05; }   // 打死大怪时画面顿一下
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
    if (phase === 'fight' && window.__fps < 40) {
      slowSecs++;
      if (slowSecs >= 2 && pixelCap > 1 && renderer.getPixelRatio() > 1) { pixelCap = Math.max(1, renderer.getPixelRatio() - 0.25); layout(); slowSecs = 0; }
      else if (slowSecs >= 3 && moon.castShadow && !AUTO) { noShadow = true; moon.castShadow = false; slowSecs = 0; }   // 清晰度降到底还卡：海岛关掉影子
    } else slowSecs = 0;
    if (DEBUG) { const info = renderer.info.render; $('#fps').textContent = `${window.__fps.toFixed(0)} 帧 · 怪 ${E.n} · 音符 ${B.n} · ${(info.triangles / 1000).toFixed(0)}k 面 · ${info.calls} 次绘制`; }
  }
}
requestAnimationFrame(loop);
