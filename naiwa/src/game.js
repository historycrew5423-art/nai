// 正式游戏 v0.2：四幕。舞会 → 阳台（花园）→ 决斗（广场）→ 墓室（守住沉睡的朱丽叶，两种结局）。
// 玩法：双摇杆，罗密欧唱情歌射出音符；怪被打动后变成萤火，捡了升级，三选一技能。
// 地图没有边界：地面和障碍物按 40 米一块无缝重复，玩家走到哪铺到哪（docs/场景规格.md 开头）。
// 缝合版：小怪换成 3D 刀盾狗、咕咕嘎嘎企鹅、香蕉猫、OIIA 猫（src/minions.js，带攻击动作）；三头犬仍是立牌（assets/sprites/）。
// 声音分层（src/sfx.js）：主角的声音居中最响，小怪的梗音效一次只叫一只、按左右偏声像，主角一开口就把小怪压低。
// 网址参数：?auto=1 自动跳过对话、自动选第一张卡（给测试机器人用）；?god=1 不会死；?debug=1 显示帧数；?len=秒数 缩短第一幕；
//           ?cam=1 / ?cam=2 用第三人称 / 第一人称开局；?prologue=1 开头先放序幕对话（默认直接开打，前 10 秒就上梗）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Input } from './input.js?v=20261031n2';
import { byId, drawCards, baseStats } from './skills.js?v=20261031n2';
import { PEOPLE, SCENES, ACT1_LINES, ACT2_LINES, ACT3_LINES, ACT4_LINES, BOSS_LINES, EVENT_LINES, DEATH, LOVE, PAINTINGS } from './dialogue.js?v=20261031n2';
import { loadMinions, frameIndex, lungeOffset, SWING_TIME, WALK_RATE, WALK_FRAMES } from './minions.js?v=20261031n2';
import { HAHA_GLYPHS, HAHA_COLORS, hahaMaterial, floatText, updateFloats, makeStars, makeLane, placeLane, loadLaugh, playHa, playLaugh, stopLaugh, makeLaughUI, loadBigFrog, bigFrogPose, pick, setLaughOut } from './naiwa.js?v=20261031n2';
import { initMixer, loadClips, heroOut, duck, heroSay, heroBusy, holdHero, mobSay, hasClip, whoosh, pop, boing, boom, tone, speak, stopSpeak } from './sfx.js?v=20261031n2';
import { Pacing, PACE } from './pacing.js?v=20261031n2';

const VERSION = 'v0.2';
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), GOD = Q.has('god'), DEBUG = Q.has('debug');
const TILE = 40;                 // 地块边长（米）
const ACT_LEN = +Q.get('len') || 45;    // 每一幕打斗时长（秒）；?len=12 给测试用，缩短每一幕
const START_ACT = +Q.get('act') || 1;   // ?act=2 直接从第二幕开始（测试用）
const MAX_E = 900, MAX_B = 1600, MAX_O = 1600;
const CAM = new THREE.Vector3(0, 11, 9.5);          // 镜头在主角上方 11 米、往镜头那侧 9.5 米（往下约 49 度）
const PITCH = Math.atan2(CAM.y, CAM.z);             // 场景里烛光贴片朝镜头倾斜的角度
// 视角：0 俯视（原来的）、1 第三人称（跟在背后）、2 第一人称（主角的眼睛）。C 键或右上角按钮切换
// camYaw 是镜头朝向（世界里的前方 = (sin, cos)），俯视时固定朝 -Z（π）
let camMode = Math.min(2, Math.max(0, Math.round(+Q.get('cam') || 0))), camYaw = Math.PI, camPitch = 0;
const CAM_NAMES = ['俯视', '第三人称', '第一人称'];
const FOG = [[17, 33], [13, 36], [9, 32]];   // 每种视角的雾：近处开始、远处全遮住（米）
// 竖屏（手机竖着拿）：俯视镜头更高、更陡一点（约 55 度，离主角约 22 米），视野按屏幕比例算，左右能看到约 12 米，
// 同一台手机上人物和横屏一样大
const CAMP = new THREE.Vector3(0, 18, 12.5), CAMP_D = CAMP.length(), PORTRAIT_HALF_W = 6;
const FOG_P = [[24, 44], [14, 40], [9, 34]];
let portrait = false;

// ---------- 画面：横屏固定 16:9；竖屏铺满整个屏幕 ----------
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14121c);
scene.fog = new THREE.Fog(0x14121c, 17, 33);
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 80);

let pixelCap = 1.75;   // 清晰度上限；帧数低时自动往下调（见主循环）
function layout() {
  portrait = innerHeight > innerWidth;
  document.body.classList.toggle('portrait', portrait);
  const w = portrait ? innerWidth : Math.min(innerWidth, innerHeight * 16 / 9), h = portrait ? innerHeight : w * 9 / 16;
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.setProperty('--u', (Math.min(w, h) / 100) + 'px');   // 界面的尺寸单位：短边的 1%，横屏竖屏的字一样大
  renderer.setPixelRatio(Math.min(devicePixelRatio, pixelCap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', layout);
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
  // minion：换成 3D 小怪（dog 刀盾狗举刀砍、penguin 咕咕嘎嘎企鹅肘击），mh 是模型高度，tint 是整体染色
  { key: 'lute', h: 1.55, r: 0.5, hp: 2, speed: 2.1, dmg: 7, xp: 1, flip: false, minion: 'dog', mh: 1.3 },
  { key: 'birdhead', h: 1.15, r: 0.36, hp: 1, speed: 3.9, dmg: 4, xp: 1, flip: true, minion: 'penguin', mh: 1.0 },
  { key: 'drum', h: 1.7, r: 0.7, hp: 9, speed: 1.5, dmg: 12, xp: 4, flip: true, minion: 'dog', mh: 1.85, tint: [1.1, 0.9, 0.85] },
  { key: 'cerberus', h: 3.0, r: 1.4, hp: 110, speed: 2.1, dmg: 16, xp: 0, flip: true, boss: true, label: '看门的三头犬' },
  { key: 'horn', h: 1.5, r: 0.45, hp: 3, speed: 2.3, dmg: 6, xp: 2, flip: true, ranged: true, minion: 'penguin', mh: 1.25, tint: [1.15, 0.95, 0.95] },
  { key: 'shade', h: 1.5, r: 0.42, hp: 3, speed: 1.9, dmg: 6, xp: 1, flip: false, ghost: true, minion: 'penguin', mh: 1.15, tint: [0.62, 0.74, 1.3] },
  { key: 'tybalt', model: true, h: 2.3, r: 0.8, hp: 200, speed: 2.5, dmg: 18, xp: 0, boss: true, label: '提伯尔特' },
  // 新加的两只猫：香蕉猫（哭着用香蕉头槌）、圆滚滚的 OIIA 猫（原地转圈撞人，血厚一点）
  { key: 'banana', h: 1.2, r: 0.42, hp: 2, speed: 2.7, dmg: 5, xp: 1, minion: 'banana', mh: 1.15 },
  { key: 'oiia', h: 1.0, r: 0.5, hp: 4, speed: 1.9, dmg: 6, xp: 2, minion: 'oiia', mh: 1.05 },
];
const HP_ADD = [1, 0, 3, 0, 1, 0, 0, 1, 2];   // 每往后一幕，怪多几点血
const T = Object.fromEntries(TYPES.map((t, i) => [t.key, i]));
// 每种小怪的梗：第一次登场时的字幕、被打倒时的字幕（和它的叫声一起出）、头顶的短字、字幕颜色
const MEME = {
  penguin: { intro: '咕咕嘎嘎？', die: ['咕咕嘎嘎！', '嘎——！', '咕咕……嘎'], pop: '嘎！', color: '#9fe8ff' },
  dog: { intro: '我的刀盾！', die: ['我的刀盾！！', 'What the dog doing?!', '刀……盾……'], pop: '刀盾！', color: '#ffd28a' },
  banana: { intro: '香蕉猫：呜哇哇哇（哭）', die: ['呜哇——（香蕉猫哭了）', '呜呜呜……', '哇啊啊啊'], pop: '呜哇', color: '#fff36b' },
  oiia: { intro: 'OIIA OIIA OIIA', die: ['OIIA OIIA～螺旋升天', 'OIIAOIIA！', '转晕了……OIIA'], pop: 'OIIA', color: '#ffb8ec' },
};
// 立牌（字子弹、萤火、酸音、三头犬）：竖着的平面，画的时候整块转到正对镜头（见 writeBill），哪种视角都不会变扁
function billboardGeo(w, h, centerY) {
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, centerY ? 0 : h / 2, 0); return g;
}
const enemyMeshes = TYPES.map((t) => {
  if (t.model || t.minion) return null;   // 提伯尔特和 3D 小怪不用立牌
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
// 3D 小怪（企鹅、刀盾狗）：加载后烘焙成 16 帧实例网格，见 src/minions.js
let minionMeshes = null;
const minionsReady = loadMinions(scene, MAX_E).then(m => { minionMeshes = m; }).catch(e => console.warn('小怪模型加载失败', e));
const ONE3 = [1, 1, 1];
// 声音的左右：按怪在镜头里偏左还是偏右（viewYaw 是这一帧镜头的朝向，俯视时是 π）
let viewYaw = Math.PI;
const panOf = (dx, dz) => Math.max(-1, Math.min(1, (-dx * Math.cos(viewYaw) + dz * Math.sin(viewYaw)) / 9));
// 梗的节奏（src/pacing.js）：新梗一个一个上，同一类梗按热度限次数，大招前后安静几秒
const pace = new Pacing();
let heatNow = 0;
// 小怪打人：只有贴身打到罗密欧、而且节奏允许时才叫（叫声主要留给“被打倒”）
function swingStart(i, t, d) {
  E.swing[i] = SWING_TIME; E.scd[i] = 1.05 + Math.random() * 0.5;
  window.__swings = (window.__swings || 0) + 1;   // 给自动测试统计攻击次数
  if (muted || !actx || d > 3 || Math.random() > 0.35 || heroBusy() || !pace.mobOk(time, t.minion, false)) return;
  if (mobSay(t.minion, 'attack', { pan: panOf(E.x[i] - player.x, E.z[i] - player.z), dist: d })) pace.mobPlayed(time, t.minion, heatNow, t.minion + ' 打人');
}
shadowMesh.renderOrder = 0;

// 子弹：罗密欧张嘴喷出的“哈”字（从《勇者奶蛙》搬来）。三种字各一个实例网格，按 B.glyph 分
const hahaMeshes = HAHA_GLYPHS.map((g, k) => flatInst(billboardGeo(1, 1, true), hahaMaterial(k), MAX_B + 8));
// 提伯尔特学牛来低头冲撞：地上的红色预警线、撞晕后头上转的星星
const lane = makeLane(); scene.add(lane);
const tyStars = makeStars(); scene.add(tyStars);
// 变身大奶蛙捧腹大笑：表情包弹窗、满屏“哈”，以及大奶蛙模型
const laughUI = makeLaughUI(stage);
let bigFrog = null;
const bigReady = loadBigFrog().then((b) => { bigFrog = b; scene.add(b.group); }).catch((e) => console.warn('大奶蛙模型加载失败', e));
const fireflyMesh = flatInst(billboardGeo(1, 1, true), additive(glowTex('127,227,216')), MAX_O);
const ebMesh = flatInst(billboardGeo(1, 1, true), additive(glowTex('255,96,72')), 240);   // 号角怪的酸音：红色的光团
const ringMat = additive(canvasTex(128, (g, s) => { g.strokeStyle = 'rgba(255,214,140,1)'; g.lineWidth = 7; g.shadowColor = '#ffb85c'; g.shadowBlur = 14; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); g.stroke(); }));
const rings = [];
function ring(x, z, r, life = 0.45, color) {
  if (rings.length > 40) { const o = rings.shift(); scene.remove(o.m); o.m.material.dispose(); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMat.clone());
  if (color) m.material.color.set(color);
  m.position.set(x, 0.1, z); scene.add(m); rings.push({ m, r, t: 0, life });
}
// 闪身步的残影：主角模型复制 4 份，换成半透明的青色，闪的时候一路留在身后再淡掉
const ghosts = [];
function makeGhosts() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const inner = hero.userData.inner; hero.userData.inner = null;   // userData 会被 JSON 复制，先把里面的 3D 对象拿掉
  for (let k = 0; k < 4; k++) {
    const g = cloneSkinned(hero);
    g.userData.inner = g.children[0];
    g.traverse((o) => { if (o.isMesh) { o.material = mat.clone(); o.frustumCulled = false; } });
    g.visible = false; scene.add(g); ghosts.push({ g, t: 0 });
  }
  hero.userData.inner = inner;
  // 先编译一次残影的着色器，免得第一次闪身步时卡一下
  for (const gh of ghosts) gh.g.visible = true;
  try { renderer.compile(scene, camera); } catch { /* 编译失败就等第一次画的时候再编 */ }
  for (const gh of ghosts) gh.g.visible = false;
}
function dropGhost() {
  if (!hero || !ghosts.length || camMode === 2) return;
  const gh = ghosts.reduce((a, b) => (a.t <= b.t ? a : b));
  gh.g.position.copy(hero.position); gh.g.rotation.copy(hero.rotation);
  const a = hero.userData.inner, b = gh.g.userData.inner;
  if (a && b) { b.rotation.copy(a.rotation); b.scale.copy(a.scale); b.position.copy(a.position); }
  gh.t = 0.36; gh.g.visible = true;
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
  ocd: new Float32Array(MAX_E), face: new Int8Array(MAX_E), atk: new Float32Array(MAX_E),
  swing: new Float32Array(MAX_E), scd: new Float32Array(MAX_E),   // 3D 小怪：攻击动作剩余时间、下次攻击冷却
  stun: new Float32Array(MAX_E), slow: new Float32Array(MAX_E), puff: new Float32Array(MAX_E) };   // 被“跌”打趴、被“水”减速、被肥嘟嘟吹胀的剩余时间
const E_ARRAYS = [E.type, E.x, E.z, E.hp, E.flash, E.phase, E.speed, E.id, E.ocd, E.face, E.atk, E.swing, E.scd, E.stun, E.slow, E.puff];
// 怪射来的酸音（号角怪）
const MAX_EB = 240;
const EB = { n: 0, x: new Float32Array(MAX_EB), z: new Float32Array(MAX_EB), dx: new Float32Array(MAX_EB), dz: new Float32Array(MAX_EB), life: new Float32Array(MAX_EB) };
const B = { n: 0, x: new Float32Array(MAX_B), z: new Float32Array(MAX_B), dx: new Float32Array(MAX_B), dz: new Float32Array(MAX_B),
  life: new Float32Array(MAX_B), dmg: new Float32Array(MAX_B), pierce: new Int16Array(MAX_B), bounce: new Int16Array(MAX_B),
  size: new Float32Array(MAX_B), last: new Int32Array(MAX_B), glyph: new Uint8Array(MAX_B) };   // glyph：这颗“哈”用哪种字
const O = { n: 0, x: new Float32Array(MAX_O), z: new Float32Array(MAX_O), v: new Float32Array(MAX_O), t: new Float32Array(MAX_O) };
let nextId = 1;

const player = { x: 0, z: 0, r: 0.45, hp: 100, hurtCd: 0, aimX: 0, aimZ: 1, moving: 0, kx: 0, kz: 0, mvx: 0, mvz: 1, manualAim: false };   // aimZ = 1：开打前面朝镜头；kx/kz 是被撞飞的速度；mvx/mvz 是走路方向
// 闪身步：走满 DODGE_EVERY 米自动往旁边闪一下（左右轮流），闪的时候不挨打、身后留残影；电脑上空格键也能闪
const DODGE_EVERY = 6, DODGE_DIST = 2.4, DODGE_TIME = 0.2;
const dodge = { t: 0, vx: 0, vz: 0, side: 1, cd: 0, walk: 0, ghostT: 0, voiceAt: -9, want: false, n: 0 };
// 肥嘟嘟（技能键）：喷字攒能量，攒满 10 秒亮起🦘按钮（电脑按 F），按下去袋鼠喊“你的胆子真是肥嘟嘟的！”，画面里的小怪被吹成气球“啵”地爆掉
const FAT_TIME = 10, FAT_R = 16;   // 16 米：整个画面里的小怪
const FDD_SAY = 'Nee duh dahn-zuh, jen shur, fay doo doo duh!';   // 老外念“你的胆子真是肥嘟嘟的”：横幅下面的小字幕，也是备用朗读的文本
let spitT = 0, fatBannerT = 0, fats = 0, fatHintSaid = false;
// 喷字：每 3 口里有 1 口是特殊字（第一幕按 PACE.wordsAt 一个一个解锁），特殊字第一次出现时喊对应的奶龙口头禅，之后按节奏偶尔喊
let volley = 0;
// 连杀计数（短视频那种“x10”），开场梗和第一次见到每种怪时的介绍
let combo = 0, comboT = 0, bestCombo = 0, autoLaughDone = false, coldOpenDone = false;
const seenKinds = new Set(), introQueue = [];
let introT = 0;
// 变身大奶蛙：laughT 捧腹大笑剩余时间，laughCd 冷却（开打 6 秒后第一次能用）
const LAUGH_TIME = 3.4, LAUGH_CD = 18;
// 难度放低：受到的伤害只算 60%；被打倒时不结束，立刻捧腹大笑、满血复活（?norevive=1 关掉，测原版倒下流程用）
const DMG_TAKEN = 0.6, REVIVE = !Q.has('norevive');
let revives = 0;
let laughT = 0, laughCd = 6, pulseT = 0, pulsesLeft = 0, shake = 0, laughHintSaid = false;
// 提伯尔特冲撞：stalk 逼近 → windup 低头蓄力（红线）→ charge 冲撞 → recover / stunned（撞到障碍物眼冒金星）
let tyMode = 'stalk', tyT = 0, tyCd = 2.5, tyDX = 0, tyDZ = 1, tyLeft = 0, tyHit = false, tyChain = 0, tySaid = false;
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
  if (tybalt) { tybalt.visible = false; const inner = tybalt.userData.inner; inner.rotation.set(0, 0, 0); inner.position.set(0, 0, 0); inner.scale.setScalar(1); }
  if (juliet) juliet.visible = false;
  player.kx = player.kz = 0; laughCd = 8.5; laughHintSaid = false; endLaugh();   // 第一幕第 8.5 秒自动变身一次，给玩家看看
  tyMode = 'stalk'; lane.visible = false; tyStars.visible = false;
  autoLaughDone = coldOpenDone = false; seenKinds.clear(); introQueue.length = 0; introT = 0;
  combo = comboT = bestCombo = 0; spitT = 0; fats = 0; fatHintSaid = false; volley = 0; corpses.length = 0;
  dodge.t = dodge.cd = dodge.walk = 0; dodge.n = 0;
  pace.reset();
}

// ---------- 怪的生成和数量（第一幕：开局很简单，慢慢变多） ----------
// 开场就要热闹：前 20 秒从 9 只涨到 23 只（原来是 2 只起步，前 10 秒太冷清）
function act1Target(t) { return t < 20 ? Math.round(9 + t * 0.7) : Math.round(23 + (t - 20) * 1.25); }
let spawnAcc = 0, birdWaves = 0;
function spawnEnemy(type, ang, dist, cx = player.x, cz = player.z) {
  if (E.n >= MAX_E) return -1;
  // 第一幕前 20 秒生成得近一点（刚出屏幕），走两三秒就进画面，不冷场
  const a = ang ?? Math.random() * Math.PI * 2, d = dist ?? (act === 1 && actTime < 20 ? 12.5 : actTime < 10 ? 15 : 17) + Math.random() * 3;
  const ca = Math.cos(a), p = { x: cx + Math.sin(a) * d, z: cz + ca * d * (ca < 0 ? 1.1 : 0.75) };   // 生成在屏幕外
  pushOut(p, 0.6);
  const t = TYPES[type], i = E.n++;
  E.type[i] = type; E.x[i] = p.x; E.z[i] = p.z; E.flash[i] = 0; E.phase[i] = Math.random() * 10; E.ocd[i] = 0; E.face[i] = 1; E.atk[i] = 1 + Math.random() * 2;
  E.swing[i] = 0; E.scd[i] = Math.random() * 0.8; E.stun[i] = E.slow[i] = E.puff[i] = 0;
  E.hp[i] = t.hp + HP_ADD[type] * (act - 1) + (type === T.lute && act === 1 && actTime > 22 ? 1 : 0);
  E.speed[i] = t.speed * (0.85 + Math.random() * 0.3); E.id[i] = nextId++;
  // 每种梗怪第一次出现：记下来，等它走进画面再播它的招牌叫声 + 字幕（一种一种来，不叠在一起）
  if (t.minion && !seenKinds.has(t.minion) && (phase === 'fight' || phase === 'levelup')) { seenKinds.add(t.minion); introQueue.push(t.minion); }
  return i;
}
// 第一幕的小怪：按 PACE.kindsAt 一种一种上新——开头只有刀盾狗，第 7 秒企鹅，第 18 秒香蕉猫，第 28 秒 OIIA 猫
const ACT1_MIX = [['dog', T.lute, 0.4], ['penguin', T.birdhead, 0.2], ['banana', T.banana, 0.25], ['oiia', T.oiia, 0.15]];
function act1Pick() {
  const open = ACT1_MIX.filter(([k]) => pace.kindOpen(k, 1, actTime));
  let r = Math.random() * open.reduce((s, m) => s + m[2], 0);
  for (const [, ty, w] of open) { r -= w; if (r <= 0) return ty; }
  return T.lute;
}
// 冷开场：一开打就有一小队刀盾狗从左上走进画面（只有一种怪，先让玩家看清楚、打爽）
function coldOpen() {
  coldOpenDone = true;
  const group = (type, a, n, d) => { for (let k = 0; k < n; k++) spawnEnemy(type, a + (k - (n - 1) / 2) * 0.22, d + Math.random() * 1.2); };
  group(T.lute, -2.2, 4, 9);   // 左上
  group(T.lute, 1.6, 2, 8.5);  // 右边
}
const lowHp = () => player.hp < maxHp() * 0.35;
function director(dt) {
  if (phase !== 'fight') return;
  if (act === 2) { director2(dt); return; }
  if (act === 3) { director3(dt); return; }
  if (act === 4) { director4(dt); return; }
  if (!coldOpenDone && actTime >= 0.35) coldOpen();
  const target = act1Target(actTime) * (lowHp() ? 0.75 : 1);   // 血少时悄悄少出一点
  spawnAcc += dt * (actTime < 20 ? 5 : 6);
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n < target) spawnEnemy(act1Pick()); }
  // 咕咕嘎嘎企鹅：第 7 秒第一群（从一个方向冲来），之后每 9 秒一群
  const penguinAt = PACE.kindsAt.penguin;
  if (actTime > penguinAt + birdWaves * 9 && actTime < ACT_LEN - 3) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 4 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, (birdWaves === 1 ? 13 : 17) + Math.random() * 3);
  }
  if (actTime > 38 && E.n < target + 3 && Math.random() < dt * 0.6) spawnEnemy(T.drum);
}
// 第二幕：家丁和鼓怪更多更厚，鸟嘴面具一群群来，第 22 秒左右三头犬从远处冲来（打它时小怪变少）
const DOG_AT = Math.min(22, ACT_LEN * 0.5);
function director2(dt) {
  const boss = dogSpawned && !dogDown;
  const target = (22 + actTime * 0.8) * (boss ? 0.45 : 1) * (lowHp() ? 0.75 : 1);
  spawnAcc += dt * 7;
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n < target) { const r = Math.random(); spawnEnemy(r < 0.26 ? T.drum : r < 0.48 ? T.banana : r < 0.62 ? T.oiia : T.lute); } }
  if (!boss && actTime > 5 + birdWaves * 7) {
    birdWaves++;
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 8 + birdWaves * 2; k++) spawnEnemy(T.birdhead, a + (Math.random() - 0.5) * 0.5, 17 + Math.random() * 3);
  }
  if (!dogSpawned && actTime >= DOG_AT) {
    dogSpawned = true; bossChargeCd = 4;
    spawnEnemy(T.cerberus, Math.PI, 15);
    bark(BOSS_LINES.dogIn.who, BOSS_LINES.dogIn.text);
    pace.quiet(time, PACE.quietAfterBoss); pace.log(time, '三头犬登场');   // Boss 登场：先安静两秒，让人看清它
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
    spawnEnemy(r < 0.2 && count(T.horn) < 8 ? T.horn : r < 0.36 ? T.drum : r < 0.52 ? T.banana : r < 0.64 ? T.oiia : T.lute);
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
    tyMode = 'stalk'; tyT = 0; tyCd = 2.5; tyChain = 0; tySaid = false; lane.visible = false;
    spawnEnemy(T.tybalt, Math.PI, 14);
    bark(BOSS_LINES.tybaltIn.who, BOSS_LINES.tybaltIn.text);
    pace.quiet(time, PACE.quietAfterBoss); pace.log(time, '提伯尔特登场');
    setTimeout(() => { if (act === 3 && phase === 'fight') bark(BOSS_LINES.tybaltIn2.who, BOSS_LINES.tybaltIn2.text); }, 2400);
  }
}
// 第四幕：亡魂从四面八方涌向石台上的朱丽叶，也有一些家丁冲着罗密欧来
function director4(dt) {
  const target = (16 + actTime * 0.9) * (lowHp() ? 0.8 : 1);
  spawnAcc += dt * 6;
  while (spawnAcc >= 1) {
    spawnAcc -= 1; if (E.n >= target) continue;
    if (Math.random() < 0.8) spawnEnemy(T.shade, undefined, 17 + Math.random() * 4, 0, 0);
    else { const r = Math.random(); spawnEnemy(r < 0.3 ? T.drum : r < 0.55 ? T.banana : r < 0.75 ? T.oiia : T.lute); }
  }
}

// ---------- 小怪被打倒：叫一声（同一时间只叫一只）、打字幕、按各自的梗飞走 ----------
const corpses = [];
function addCorpse(kind, x, z, ux, uz, t) {
  if (corpses.length >= 70) corpses.shift();
  corpses.push({ kind, x, z, ux, uz, yaw: Math.atan2(uz, -ux), t: 0, mh: t.mh, tint: t.tint || ONE3, spin: Math.random() < 0.5 ? -1 : 1 });
}
function minionDown(i, t) {
  const dx = E.x[i] - player.x, dz = E.z[i] - player.z, d = Math.hypot(dx, dz) || 1;
  addCorpse(t.minion, E.x[i], E.z[i], dx / d, dz / d, t);
  if (muted || !actx || d > 14 || heroBusy()) return;   // 画面外的不叫；主角正在说话（口头禅、笑声）时不插嘴，第一次的梗留到下一只再叫
  // 这种怪第一次被打倒：一定叫（新梗）；之后按节奏，隔几秒才轮到一只
  const first = !pace.firstDeath.has(t.minion);
  if (!pace.mobOk(time, t.minion, first)) return;
  const rate = t.key === 'drum' ? 0.82 : t.key === 'shade' ? 1.18 : t.key === 'horn' ? 1.08 : 1;   // 大狗声音低一点，亡魂尖一点
  if (mobSay(t.minion, 'death', { pan: panOf(dx, dz), dist: d, rate, priority: first ? 3 : 2 })) {
    pace.firstDeath.add(t.minion); pace.mobPlayed(time, t.minion, heatNow, t.minion + (first ? ' 第一次被打倒' : ' 被打倒'));
    if (first) { const q = introQueue.indexOf(t.minion); if (q >= 0) introQueue.splice(q, 1); }   // 还没登场就先被打倒叫过了：不用再登场一次
    const M = MEME[t.minion];
    mobCaption(pick(M.die), M.color);
    floatText(scene, M.pop, E.x[i], 2.3, E.z[i], { color: M.color, stroke: '#1a1020', h: 0.62, life: 0.9 });
    window.__deathVoices = (window.__deathVoices || 0) + 1;
  }
}
function bumpCombo() {
  combo++; comboT = 2.6; if (combo > bestCombo) bestCombo = combo;
  const el = $('#combo');
  el.querySelector('b').textContent = combo; show(el, combo >= 5);
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if (combo === 20 || combo === 50 || (combo >= 100 && combo % 100 === 0)) {   // 连杀的大字和小号声：只在 20、50、100……时出，别太勤
    heroCaption(combo >= 50 ? `哈哈哈哈哈 ×${combo}！` : `${combo} 连哈！`, combo >= 50 ? '#ff8ae0' : '#ffe14d');
    shake = Math.max(shake, 0.2);
    if (!muted) { tone(784, 0.05, 0.18, 'square'); setTimeout(() => tone(988, 0.05, 0.18, 'square'), 90); setTimeout(() => tone(1319, 0.06, 0.3, 'square'), 180); }
  }
}
// how：不填 = 被打倒（叫一声、飞走）；'quiet' = 幕结束时安静地变成萤火；'pop' = 被肥嘟嘟吹爆（不叫、不飞，直接啵）
function killEnemy(i, how) {
  const t = TYPES[E.type[i]];
  const live = phase === 'fight' || phase === 'levelup';
  if (!how && t.minion && live) minionDown(i, t);
  if (t.boss) {   // Boss 被打动：散出一大圈萤火
    dogDown = true;
    if (t.key === 'tybalt') { lane.visible = false; tyStars.visible = false; tyMode = 'stalk'; }
    for (let k = 0; k < 26 && O.n < MAX_O; k++) { const a = k / 26 * 6.28, d = 1 + Math.random() * 2, j = O.n++; O.x[j] = E.x[i] + Math.cos(a) * d; O.z[j] = E.z[i] + Math.sin(a) * d; O.v[j] = 1; O.t[j] = Math.random() * 6; }
    if (phase === 'fight' || phase === 'levelup') { const L = t.key === 'tybalt' ? BOSS_LINES.tybaltDown : BOSS_LINES.dogDown; bark(L.who, L.text); }
    ring(E.x[i], E.z[i], 6, 0.8);
  } else if (O.n < MAX_O) { const k = O.n++; O.x[k] = E.x[i]; O.z[k] = E.z[i]; O.v[k] = t.xp * [1, 1, 1.2, 1.5, 1.5][act]; O.t[k] = Math.random() * 6; }   // 后面几幕每只怪给的经验多一点
  const j = --E.n;
  for (const a of E_ARRAYS) a[i] = a[j];
  kills++;
  if (how !== 'quiet' && live) bumpCombo();
}
// ---------- 提伯尔特学牛来：低头蓄力（地上出现红线）→ 沿直线冲撞 → 撞到障碍物眼冒金星 ----------
const probe = { x: 0, z: 0 };
function blockedAt(x, z, r) { probe.x = x; probe.z = z; pushOut(probe, r); return Math.abs(probe.x - x) + Math.abs(probe.z - z) > 1e-4; }
function tyLaneLen(x, z) { let len = 0; while (len < 13 && !blockedAt(x + tyDX * (len + 0.4), z + tyDZ * (len + 0.4), 0.8)) len += 0.4; return Math.max(1.5, len); }
function tyWindup(i, dx, dz, d) {
  tyMode = 'windup'; tyT = 0; tyDX = dx / d; tyDZ = dz / d;
  placeLane(lane, E.x[i], E.z[i], tyDX, tyDZ, tyLaneLen(E.x[i], E.z[i]));
  floatText(scene, pick(['哞！', '不许笑！', '你笑什么笑！', '看我顶飞你！']), E.x[i], 3.3, E.z[i], { color: '#ff6b5a', stroke: '#2a0a08', h: 0.85 });
  if (!tySaid) { tySaid = true; bark('tybalt', '哞——看清地上的红线，我要撞过来了！'); }
}
// 被捧腹大笑笑晕、或者撞到东西：原地转圈 sec 秒
function tyStun(sec) {
  if (tyMode !== 'stunned') { tyMode = 'stunned'; tyT = 0; lane.visible = false; }
  tyT = Math.min(tyT, 1.8 - sec);
}
// 返回 true 表示罗密欧被撞倒了（step 要立刻结束）
function tybaltStep(i, dx, dz, d, dt, fighting) {
  const t = TYPES[T.tybalt], touch = player.r + t.r, angry = E.hp[i] < t.hp / 2;
  tyT += dt;
  if (Math.abs(dx) > 0.2) E.face[i] = dx > 0 ? 1 : -1;
  if (tyMode === 'stalk') {
    const st = Math.min(E.speed[i] * dt, Math.max(0, d - touch));
    E.x[i] += dx / d * st; E.z[i] += dz / d * st;
    tyCd -= dt;
    if (fighting && d < touch + 0.12 && player.hurtCd <= 0 && !GOD) { player.hp -= t.dmg * 0.5 * DMG_TAKEN; player.hurtCd = 0.6; if (player.hp <= 0) { player.hp = 0; die(); return true; } }
    if (fighting && tyCd <= 0 && d < 16) tyWindup(i, dx, dz, d);
  } else if (tyMode === 'windup') {
    const wt = angry ? 0.65 : 0.9;
    if (tyT < wt * 0.6) { tyDX = dx / d; tyDZ = dz / d; placeLane(lane, E.x[i], E.z[i], tyDX, tyDZ, tyLaneLen(E.x[i], E.z[i])); }
    lane.material.opacity = 0.55 + Math.abs(Math.sin(tyT * 18)) * 0.4;
    if (tyT >= wt) { tyMode = 'charge'; tyT = 0; tyLeft = tyLaneLen(E.x[i], E.z[i]) + 1.2; tyHit = false; }
  } else if (tyMode === 'charge') {
    const step = (angry ? 15 : 12.5) * dt, nx = E.x[i] + tyDX * step, nz = E.z[i] + tyDZ * step;
    if (blockedAt(nx, nz, 0.8)) {   // 撞上井、马车、木箱……
      tyStun(1.8); shake = Math.max(shake, 0.6); ring(E.x[i], E.z[i], 2.6, 0.6);
      floatText(scene, '咚！', E.x[i], 3, E.z[i], { color: '#fff1a0', stroke: '#5a1a08', h: 1.1 });
      floatText(scene, '眼冒金星', E.x[i], 3.9, E.z[i], { color: '#ffe95c', h: 0.6 });
      if (Math.random() < 0.5) bark('tybalt', pick(['哞……谁把井放在这儿的……', '眼冒金星……', '这柱子不讲武德！']));
      window.__tyCrash = (window.__tyCrash || 0) + 1;
    } else {
      E.x[i] = nx; E.z[i] = nz; tyLeft -= step;
      if (tyLeft <= 0) { tyMode = 'recover'; tyT = 0; lane.visible = false; }
    }
    if (Math.random() < dt * 14) ring(E.x[i] - tyDX * 0.7, E.z[i] - tyDZ * 0.7, 0.8, 0.35);   // 脚下扬起的尘土
    const px = player.x - E.x[i], pz = player.z - E.z[i];
    if (!tyHit && fighting && Math.hypot(px, pz) < touch + 0.3) {
      tyHit = true;   // 每次冲撞只判定一次
      if (player.hurtCd <= 0 && !GOD) { player.hp -= (angry ? 26 : 20) * DMG_TAKEN; player.hurtCd = 0.9; if (player.hp <= 0) { player.hp = 0; die(); return true; } }
      let sx = -tyDZ, sz = tyDX; if (sx * px + sz * pz < 0) { sx = -sx; sz = -sz; }
      player.kx = tyDX * 10 + sx * 6; player.kz = tyDZ * 10 + sz * 6; shake = Math.max(shake, 0.55);
      floatText(scene, '哞！！', E.x[i], 3.2, E.z[i], { color: '#ff6b5a', stroke: '#2a0a08', h: 0.9 });
      window.__tyHits = (window.__tyHits || 0) + 1;
    }
  } else if (tyMode === 'stunned') {
    if (tyT > 1.8) { tyMode = 'stalk'; tyCd = angry ? 1.6 : 2.6; }
  } else if (tyMode === 'recover') {
    if (tyT > 0.5) {
      if (angry && tyChain < 1) { tyChain++; tyWindup(i, dx, dz, d); }   // 血少了会连撞两次
      else { tyChain = 0; tyMode = 'stalk'; tyCd = angry ? 1.8 : 2.8; }
    }
  }
  return false;
}
function removeBullet(i) {
  const j = --B.n;
  for (const a of [B.x, B.z, B.dx, B.dz, B.life, B.dmg, B.pierce, B.bounce, B.size, B.last, B.glyph]) a[i] = a[j];
}
function hurtEnemy(i, dmg, kx = 0, kz = 0) {
  if (tyMode === 'stunned' && E.type[i] === T.tybalt) dmg *= 1.5;   // 提伯尔特撞晕时多吃 50% 伤害
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
// 声音分三条总线（见 src/sfx.js）：笑声和“哈”接主角总线，小怪的叫声接小怪总线，弹琴声和合成音效接效果总线
function initAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume();
    initMixer(actx); setLaughOut(heroOut(), duck); loadClips(); loadLaugh(actx);
  } catch { actx = null; }
}
let muted = false;
function pluck(semi, vol = 0.05, dur = 0.35, type = 'triangle') {
  if (!actx || muted) return;
  tone(392 * Math.pow(2, semi / 12), vol, dur, type);
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
<div id="title" data-ui><h1>罗密欧与朱丽叶</h1><p class="sub">张嘴喷“哈”打怪，改写莎士比亚的结局</p><p class="go">加载中……</p><p class="tip">手机横屏竖屏都能玩：手指拖着走，不碰也会自动喷“哈”；攒满点🦘肥嘟嘟、点「变身」捧腹大笑<br>电脑：WASD 走 · 鼠标瞄 · F 肥嘟嘟 · V 变身 · 空格 闪身步 · C 换视角</p><p class="ver">${VERSION} 奶蛙缝合版：勇者奶蛙的抽象玩法</p></div>
<div id="capMob" class="cap hide"></div>
<div id="capHero" class="cap hide"></div>
<div id="combo" class="hide"><b>0</b><span>连哈</span></div>
<div id="fatBanner" class="hide"><span class="roo">🦘</span><div><b>你的胆子真是肥嘟嘟的！</b><small>Nee duh dahn-zuh, jen shur, fay doo doo duh!</small></div></div>
<div id="xhair" class="hide"></div>
<div id="tools" class="hide"><button class="b-cam">视角 俯视</button><button class="b-pause">暂停</button><button class="b-mute">声音 开</button></div>
<div id="pause" class="hide" data-ui><h2>暂停</h2><button class="b-resume">继续</button><button class="b-restart">从头开始</button></div>
<div id="fps" class="${DEBUG ? '' : 'hide'}"></div>`;
const $ = (s) => ui.querySelector(s);
const show = (el, on = true) => el.classList.toggle('hide', !on);
// 变身按钮在右边；input.js 会跳过按在按钮上的手指，所以不会误触右摇杆。电脑上按 V
const laughBtn = document.createElement('button'); laughBtn.className = 'b-laugh hide';
ui.appendChild(laughBtn);
laughBtn.addEventListener('click', (e) => { e.stopPropagation(); startLaugh(); });
// 肥嘟嘟按钮在变身按钮上面：一圈粉色表示攒了多少，攒满了发光、袋鼠跳。电脑上按 F
const fatBtn = document.createElement('button'); fatBtn.className = 'b-fat hide';
fatBtn.innerHTML = '<span class="roo">🦘</span><b>肥嘟嘟</b><small></small>';
ui.appendChild(fatBtn);
fatBtn.addEventListener('click', (e) => { e.stopPropagation(); tryFeidudu(); });
// 点完按钮马上让它失去焦点：不然之后按空格闪身步，会把刚点过的按钮（视角、声音）又按一次
ui.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); }, true);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat) startLaugh();
  if (e.code === 'KeyF' && !e.repeat) tryFeidudu();
  if (e.code === 'KeyC' && !e.repeat && (phase === 'fight' || phase === 'title')) setCamMode((camMode + 1) % 3);
  if (e.code === 'Space' && phase === 'fight') { e.preventDefault(); if (!e.repeat) dodge.want = true; }   // 空格闪身步（不让空格去点按钮）
});
let laughLabel = '';

// ---------- 短视频字幕：下面一行是主角说的（大、黄），上面一行是小怪叫的（小一点、按怪的颜色） ----------
let capHeroT = 0, capMobT = 0;
function caption(el, text, color) {
  el.textContent = text; el.style.color = color || '';
  show(el); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
function heroCaption(text, color = '#ffe14d') { caption($('#capHero'), text, color); capHeroT = 1.5; }
function mobCaption(text, color = '#ffffff') { caption($('#capMob'), text, color); capMobT = 1.15; }

// ---------- 视角切换 ----------
function setCamMode(m) {
  camMode = m;
  if (camMode > 0) { camYaw = Math.atan2(player.aimX, player.aimZ); camPitch = 0; }
  $('#tools .b-cam').textContent = `视角 ${CAM_NAMES[camMode]}`;
  if (camMode === 0 && document.pointerLockElement) document.exitPointerLock();
  if (phase === 'fight') {
    heroCaption(camMode === 0 ? '俯视' : camMode === 1 ? '第三人称：鼠标 / Q E 转身' : '第一人称：鼠标 / Q E 转身', '#ffffff');
    if (camMode > 0 && !('ontouchstart' in window)) canvas.requestPointerLock?.();
  }
}
$('#tools .b-cam').onclick = (e) => { e.stopPropagation(); setCamMode((camMode + 1) % 3); };
$('#tools .b-cam').textContent = `视角 ${CAM_NAMES[camMode]}`;
// 第一/第三人称：点一下画面锁定鼠标，左右移动鼠标转身，按住左键往准星方向喷
let mouseHeld = false;
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseHeld = true;
  if (camMode > 0 && phase === 'fight' && !document.pointerLockElement) canvas.requestPointerLock?.();
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || camMode === 0) return;
  camYaw -= e.movementX * 0.0026;
  camPitch = Math.max(-0.5, Math.min(0.55, camPitch - e.movementY * 0.002));
});

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
  } else if (!again && Q.has('prologue')) await playScene(SCENES.prologue);   // 默认不放序幕：点开始就直接开打，前 10 秒先上梗
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
  spitT = 0; corpses.length = 0; combo = 0; show($('#combo'), false);
  introT = Math.max(introT, 1.7);   // 开场笑声放完再介绍第一只梗怪
  camYaw = Math.PI; camPitch = 0;   // 第一/第三人称：开打时朝画面上方（和俯视一致）
  phase = 'fight';
  // 开打第一秒：奶蛙先笑一声、闪一下白，字幕打出来——点开始的那一下就有反馈
  if (!muted && actx) { playLaugh(actx, 1.8, 'short', 0.9); holdHero(1.7); }
  heroCaption(n === 1 ? '哈哈哈哈哈哈！' : pick(['哈哈哈！', '又来？哈哈哈！', '嘎巴跌！']));
  laughUI.flash(); shake = Math.max(shake, 0.25);
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
  for (let i = E.n - 1; i >= 0; i--) killEnemy(i, 'quiet');
  corpses.length = 0; stopSpeak();
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
// 被打倒：立刻变身大奶蛙捧腹大笑，满血复活，周围的怪被笑声震开
function laughRevive() {
  revives++; heroCaption('笑着复活！哈哈哈哈！');
  player.hp = maxHp(); player.kx = player.kz = 0; player.hurtCd = Math.max(player.hurtCd, 1.5);
  startLaugh(true);
  floatText(scene, '笑着复活！', player.x, 4.4, player.z, { color: '#ffe36b', stroke: '#5a2e10', h: 1.15, life: 1.8 });
  bark('romeo', pick(['哈哈哈！笑一笑就活过来了！', '绷不住了……复活！', '倒下？不存在的，哈哈哈哈！']));
  window.__revives = revives;
}
async function die() {
  if (REVIVE && (phase === 'fight' || phase === 'levelup')) { laughRevive(); return; }
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

  // 主角移动。摇杆/WASD 的方向按镜头朝向换算：俯视时上 = 往画面上方走，第一/第三人称时上 = 往前走
  const mv = input.getMove();
  const canMove = fighting || phase === 'title';
  const third = camMode > 0 && fighting;
  if (third) {   // 转身：Q/E 键；手机上右手（竖屏是第二根手指）左右拖；鼠标锁定时在 mousemove 里转
    const k = input.keys;
    camYaw += ((k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0)) * 2.4 * dt;
    if (input.aim.active) camYaw -= input.aim.x * 2.6 * dt;
    else if (Math.hypot(input.touchMove.x, input.touchMove.y) > 0.2 && document.pointerLockElement !== canvas) {
      // 手机上只用一根手指走路：镜头慢慢转到身后（往右推就会一边走一边往右拐）；往回走时不转
      let d = Math.atan2(player.mvx, player.mvz) - camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 2.2) camYaw += d * Math.min(1, dt * 1.6);
    }
  }
  const yawM = third ? camYaw : Math.PI, fx = Math.sin(yawM), fz = Math.cos(yawM);
  const wmx = fx * -mv.y - fz * mv.x, wmz = fz * -mv.y + fx * mv.x;
  const mvLen = Math.hypot(mv.x, mv.y);
  if (canMove && phase !== 'title') {
    const sp = 6.4 * stats.speedMul * (laughT > 0 ? 0.4 : 1);   // 捧腹大笑时笑得走不动
    let vx = wmx * sp, vz = wmz * sp;
    if (dodge.t > 0) {   // 闪身步：往旁边滑一步，身后留残影
      dodge.t -= dt; vx += dodge.vx; vz += dodge.vz;
      dodge.ghostT -= dt; if (dodge.ghostT <= 0) { dodge.ghostT = 0.045; dropGhost(); }
    }
    player.x += (vx + player.kx) * dt; player.z += (vz + player.kz) * dt;
    const fade = Math.exp(-dt * 6); player.kx *= fade; player.kz *= fade;   // 被提伯尔特顶飞后慢慢停下
    pushOut(player, player.r);
    if (mvLen > 0.1) { player.mvx = wmx / mvLen; player.mvz = wmz / mvLen; }
    if (fighting) {
      dodge.cd -= dt;
      if (mvLen > 0.3 && dodge.t <= 0) dodge.walk += sp * mvLen * dt;
      if ((dodge.walk >= DODGE_EVERY || dodge.want) && dodge.cd <= 0 && dodge.t <= 0 && laughT <= 0) startDodge(mvLen > 0.1);
      dodge.want = false;
    }
  }
  player.moving = canMove && phase !== 'title' ? mvLen : 0;
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
    if (E.swing[i] > 0) E.swing[i] -= dt;
    if (E.scd[i] > 0) E.scd[i] -= dt;
    if (E.puff[i] > 0) { E.puff[i] -= dt; if (E.puff[i] <= 0) { popEnemy(i); i--; } continue; }   // 被肥嘟嘟吹胀：飘着，到点“啵”
    if (E.stun[i] > 0) { E.stun[i] -= dt; continue; }   // 被“跌”字打趴：原地趴着，不走也不打人
    if (E.slow[i] > 0) E.slow[i] -= dt;
    const slowK = E.slow[i] > 0 ? 0.45 : 1;              // 被“水”字泡着：走得慢
    if (t.ghost && d > 2.2) {   // 亡魂飘向石台上的朱丽叶；罗密欧挡在身边时改去缠他
      const gx = -E.x[i], gz = -E.z[i], gd = Math.hypot(gx, gz) || 1, reach = BIER_R + t.r + 0.05;
      const st = Math.min(E.speed[i] * slowK * dt, Math.max(0, gd - reach));
      E.x[i] += gx / gd * st; E.z[i] += gz / gd * st;
      if (Math.abs(gx) > 0.2) E.face[i] = gx > 0 ? 1 : -1;
      if (fighting && gd < reach + 0.15 && E.atk[i] <= 0) { E.atk[i] = 1.0; calm -= 2.4 * DMG_TAKEN; E.flash[i] = 0.05; calmHit = 0.25; if (t.minion) swingStart(i, t, d); }
      continue;
    }
    if (t.key === 'tybalt') { if (tybaltStep(i, dx, dz, d, dt, fighting)) return; continue; }   // 学牛来低头冲撞
    let sp = E.speed[i] * (t.boss && bossCharge > 0 ? 3.2 : 1) * slowK;
    if (t.ranged) {   // 号角怪：站在 7 到 9 米外，每隔两三秒吹一发酸音
      if (d < 7) sp = -sp * 0.6; else if (d < 9) sp = 0;
      if (fighting && d < 13 && E.atk[i] <= 0 && EB.n < MAX_EB) {
        E.atk[i] = 2.4 + Math.random() * 1.2;
        const k = EB.n++; EB.x[k] = E.x[i]; EB.z[k] = E.z[i]; EB.dx[k] = dx / d * 7; EB.dz[k] = dz / d * 7; EB.life[k] = 2.4;
        if (t.minion) swingStart(i, t, d);   // 远程企鹅：边肘击边“咕咕嘎嘎”喷出酸音
      }
    }
    const st = sp >= 0 ? Math.min(sp * dt, Math.max(0, d - touch)) : sp * dt;
    E.x[i] += dx / d * st; E.z[i] += dz / d * st;
    if (Math.abs(dx) > 0.2) E.face[i] = dx > 0 ? 1 : -1;
    // 近身的 3D 小怪：刀盾狗挥刀、企鹅肘击，同时叫一声
    if (t.minion && !t.ranged && fighting && d < touch + 0.75 && E.scd[i] <= 0) swingStart(i, t, d);
    if (fighting && d < touch + 0.12 && player.hurtCd <= 0 && !GOD) {
      player.hp -= t.dmg * early * DMG_TAKEN; player.hurtCd = 0.6;
      if (player.hp <= 0) { player.hp = 0; die(); return; }
    }
  }
  if (player.hurtCd > 0) player.hurtCd -= dt;
  for (let k = EB.n - 1; k >= 0; k--) {
    EB.x[k] += EB.dx[k] * dt; EB.z[k] += EB.dz[k] * dt; EB.life[k] -= dt;
    const hx = EB.x[k] - player.x, hz = EB.z[k] - player.z;
    const hitP = fighting && hx * hx + hz * hz < 0.55 * 0.55;
    if (hitP && player.hurtCd <= 0 && !GOD) { player.hp -= 7 * DMG_TAKEN; player.hurtCd = 0.6; if (player.hp <= 0) { player.hp = 0; die(); return; } }
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

  // 瞄准：右摇杆 > 鼠标 > 自动打最近的怪。第一/第三人称：右摇杆和鼠标管转身，自动打前方扇形里最近的怪
  let aim = null;
  if (camMode > 0) aim = aimAhead();
  else if (input.aim.active) { const d = Math.hypot(input.aim.x, input.aim.y); aim = { x: input.aim.x / d, z: input.aim.y / d }; }
  else if (input.mouse.active) aim = mouseAim();
  if (!aim && camMode === 0) { let t = nearestEnemy(player.x, player.z, 15);
    const bi = dogSpawned && !dogDown ? bossIndex() : -1;   // Boss 在 11 米内时，自动瞄准先打 Boss
    if (act === 4) { let bd = 1e9; for (let i = 0; i < E.n; i++) if (TYPES[E.type[i]].ghost) { const q = E.x[i] * E.x[i] + E.z[i] * E.z[i]; const pd = Math.hypot(E.x[i] - player.x, E.z[i] - player.z); if (q < 36 && pd < 12 && q < bd) { bd = q; t = i; } } }   // 第四幕：先打离朱丽叶最近的亡魂
    if (bi >= 0 && Math.hypot(E.x[bi] - player.x, E.z[bi] - player.z) < 11) t = bi;
    if (t >= 0) { const dx = E.x[t] - player.x, dz = E.z[t] - player.z, d = Math.hypot(dx, dz) || 1; aim = { x: dx / d, z: dz / d }; } }
  if (aim) { player.aimX = aim.x; player.aimZ = aim.z; }

  // 热度：这一刻梗可以多密（第一幕从冷到热；Boss 在场、连杀多时更热），见 src/pacing.js
  heatNow = pace.heat(act, actTime, combo, dogSpawned && !dogDown);

  // 开火。每 3 口里有 1 口喷特殊字（第一幕按 PACE.wordsAt 一个一个解锁），特殊字打中有不同效果
  fireCd -= dt;
  if (aim && laughT <= 0) spitT = Math.min(FAT_TIME, spitT + dt);   // 肥嘟嘟：喷字攒能量，攒满就亮起🦘按钮
  if (aim && fireCd <= 0 && laughT <= 0) {   // 捧腹大笑时不喷字，靠声波
    fireCd = 1 / (3.4 * stats.rateMul);
    volley++;
    const g = volley % 3 === 0 ? pickWord() : (Math.random() < 0.6 ? 0 : 1), G = HAHA_GLYPHS[g];
    const base = Math.atan2(player.aimX, player.aimZ), spread = 0.17;
    const fan = (ang, n) => { for (let k = 0; k < n; k++) shoot(ang + (k - (n - 1) / 2) * spread, g); };
    fan(base, stats.projectiles);
    const en = stats.echo >= 3 ? Math.min(3, stats.projectiles) : 1;
    if (stats.echo >= 1) fan(base + Math.PI, en);
    if (stats.echo >= 2) { fan(base + Math.PI / 2, en); fan(base - Math.PI / 2, en); }
    // 声音：每喷一口播一个“哈”（从奶蛙笑声里切出来的音节），这是主角的基本声音，一直都有。
    // 特殊字：第一次喷出来时一定喊它的口头禅（新梗），之后按节奏隔七到十几秒才喊一次；喊的时候不放“哈”，一句话说完整
    if (!muted && actx) {
      const first = G.voice && !pace.firstWord.has(g);
      if (G.voice && !heroBusy() && hasClip(G.voice) && pace.lineOk(time, first)) {
        pace.firstWord.add(g); pace.linePlayed(time, heatNow, G.say + (first ? '（第一次）' : ''));
        heroSay(G.voice, { volume: 1, duckTo: 0.25 }); heroCaption(G.say, G.color);
      } else if (!heroBusy() && !playHa(actx)) pluck(MELODY[noteIdx++ % MELODY.length], 0.035, 0.3);
    }
  }
  // 肥嘟嘟第一次攒满：叮一声、提示按钮（之后就靠按钮发光）；自动测试时攒满直接放
  if (fighting && spitT >= FAT_TIME && !fatHintSaid) {
    fatHintSaid = true;
    bark('mercutio', '肥嘟嘟攒满了！快点右边的🦘袋鼠（电脑按 F）！');
    if (!muted) { tone(1047, 0.05, 0.25, 'sine'); setTimeout(() => tone(1568, 0.05, 0.35, 'sine'), 110); }
  }
  if (AUTO && fighting && spitT >= FAT_TIME && laughT <= 0) feidudu();

  // 第一次见到每种梗怪：等它走进画面（离罗密欧 11 米内），再播它的招牌叫声，配字幕；一种一种来，大招期间先等着
  while (introQueue.length && pace.firstDeath.has(introQueue[0])) introQueue.shift();
  if (introQueue.length) {
    introT -= dt;
    const kind = introQueue[0];
    let near = false;
    for (let i = 0; i < E.n && !near; i++) if (TYPES[E.type[i]].minion === kind && Math.hypot(E.x[i] - player.x, E.z[i] - player.z) < 11) near = true;
    if (introT <= 0 && near && !heroBusy() && pace.mobOk(time, kind, true)) { introT = 1.25; introduce(introQueue.shift()); }
  }

  // 变身大奶蛙：捧腹大笑 3.4 秒，每 0.62 秒一圈全屏声波，期间不掉血。第一幕第 8.5 秒自动变身一次，演示给玩家看
  if (fighting && laughCd > 0) laughCd -= dt;
  if (fighting && act === 1 && !autoLaughDone && actTime >= 8.5) { autoLaughDone = true; if (laughT <= 0 && laughCd <= 0.05) startLaugh(); }
  if (fighting && !laughHintSaid && laughCd <= 0 && actTime > 12) { laughHintSaid = true; bark('mercutio', '罗密欧，再笑一个！按 V 或右边的「变身」，变成大奶蛙捧腹大笑！'); }
  if (laughT > 0) {
    laughT -= dt; pulseT -= dt;
    player.hurtCd = Math.max(player.hurtCd, 0.05);
    if (pulseT <= 0 && pulsesLeft > 0) { bellyPulse(); pulsesLeft--; pulseT = 0.62; }
    if (laughT <= 0) finishLaugh();
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
    const wfx = HAHA_GLYPHS[B.glyph[i]].fx;
    if (wfx === 'stun' || wfx === 'boom' || wfx === 'splash') wordHit(wfx, hit, hid, hx, hz, B.dx[i] / v, B.dz[i] / v, B.dmg[i]);
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
function shoot(ang, g = 0) {
  if (B.n >= MAX_B) return;
  const i = B.n++, sp = 15, fx = HAHA_GLYPHS[g].fx;
  B.x[i] = player.x + Math.sin(ang) * 0.5; B.z[i] = player.z + Math.cos(ang) * 0.5;
  B.dx[i] = Math.sin(ang) * sp; B.dz[i] = Math.cos(ang) * sp; B.life[i] = 1.05;
  B.dmg[i] = stats.dmgMul; B.pierce[i] = stats.pierce; B.bounce[i] = stats.bounce; B.size[i] = stats.size; B.last[i] = -1;
  B.glyph[i] = g;
  if (fx !== 'none') B.size[i] *= 1.15;   // 特殊字大一号，好认
  if (fx === 'bounce') B.bounce[i] += 2;   // 嘎：弹到旁边的怪身上，连弹两次
  if (fx === 'pierce') { B.pierce[i] += 4; B.size[i] *= 1.2; B.life[i] = 1.3; }   // 噗：大泡泡，一路穿过去
}
// 特殊字：只从已经解锁的字里挑（第一幕按 PACE.wordsAt 一个一个上新）；刚解锁的字先喷一口，让玩家看到它
const WORD_W = { 2: 0.24, 3: 0.19, 4: 0.19, 5: 0.19, 6: 0.19 };   // 嘎（弹）多一点，其余四种一样多
const shownWords = new Set();
function pickWord() {
  const open = Object.keys(WORD_W).map(Number).filter((g) => pace.wordOpen(g, act, actTime));
  if (!open.length) return Math.random() < 0.6 ? 0 : 1;
  const fresh = pace.isQuiet(time) ? undefined : open.find((g) => !shownWords.has(g));   // 大招安静的时候先不上新字，等安静完再亮相
  if (fresh !== undefined) { shownWords.add(fresh); return fresh; }
  let r = Math.random() * open.reduce((s, g) => s + WORD_W[g], 0);
  for (const g of open) { r -= WORD_W[g]; if (r <= 0) return g; }
  return open[open.length - 1];
}
// 特殊字打中之后：跌 = 打趴 1.5 秒；塞 = 炸开一圈；水 = 把一片怪冲开并减速
let boomAt = 0, popAt = 0;
function wordHit(fx, hit, hid, hx, hz, ux, uz, dmg) {
  const alive = hit < E.n && E.id[hit] === hid;
  if (fx === 'stun') {
    if (alive && !TYPES[E.type[hit]].boss) {
      E.stun[hit] = 1.5; E.swing[hit] = 0;
      if (Math.random() < 0.45) floatText(scene, '跌！', hx, 2.1, hz, { color: '#d3b0ff', stroke: '#2a1046', h: 0.6, life: 0.7 });
    }
  } else if (fx === 'boom') {
    ring(hx, hz, 1.9, 0.4, '#ff9a52');
    if (!muted && time - boomAt > 0.12) { boomAt = time; boom(0.4); }
    if (Math.random() < 0.35) floatText(scene, '嘭！', hx, 2.2, hz, { color: '#ff9a52', stroke: '#3a1404', h: 0.7, life: 0.6 });
    for (let j = E.n - 1; j >= 0; j--) {
      if (E.id[j] === hid) continue;
      const ex = E.x[j] - hx, ez = E.z[j] - hz, q = ex * ex + ez * ez;
      if (q < 1.9 * 1.9) { const d = Math.sqrt(q) || 0.01; hurtEnemy(j, dmg * 0.9, ex / d * 0.6, ez / d * 0.6); }
    }
  } else if (fx === 'splash') {
    ring(hx, hz, 2.3, 0.45, '#6cc4ff');
    for (let j = 0; j < E.n; j++) {
      if (TYPES[E.type[j]].boss) continue;
      const ex = E.x[j] - hx, ez = E.z[j] - hz;
      if (ex * ex + ez * ez < 2.3 * 2.3) { E.x[j] += ux * 1.3; E.z[j] += uz * 1.3; E.slow[j] = 2.5; }
    }
  }
}
// 闪身步：垂直于走路方向往旁边滑一步（左右轮流，带一点往前），闪的 0.2 秒里不挨打
function startDodge(moving) {
  let fx = moving ? player.mvx : player.aimX, fz = moving ? player.mvz : player.aimZ;
  const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  dodge.side = -dodge.side;
  const sx = -fz * dodge.side, sz = fx * dodge.side, v = DODGE_DIST / DODGE_TIME;
  dodge.vx = (sx * 0.9 + fx * 0.3) * v; dodge.vz = (sz * 0.9 + fz * 0.3) * v;
  dodge.t = DODGE_TIME; dodge.cd = 0.5; dodge.walk = 0; dodge.ghostT = 0; dodge.n++;
  player.hurtCd = Math.max(player.hurtCd, DODGE_TIME + 0.15);
  // 每次闪都有“嗖”和残影；喊“闪身步！”的原声和大字只在第一次、之后隔十几秒才来一次
  const voiced = !muted && actx && !heroBusy() && (dodge.n === 1 || pace.dodgeLineOk(time));
  if (!muted && actx) whoosh(0.35);
  if (voiced) {
    pace.dodgeLinePlayed(time);
    heroSay('hero.shanshen', { volume: 0.95, duckTo: 0.3 }); heroCaption('闪身步！', '#7ef0ff');
    floatText(scene, '闪身步！', player.x, 2.7, player.z, { color: '#7ef0ff', stroke: '#06283a', h: 0.72, life: 0.8 });
  }
  window.__dodges = dodge.n;
}
// 肥嘟嘟：袋鼠喊“你的胆子真是肥嘟嘟的！”，画面里的小怪全被吹成粉色气球飘起来，一个接一个“啵”地爆掉
// 按🦘按钮或 F 键：攒满了才能放；捧腹大笑时不能放（两个大招不叠在一起）
function tryFeidudu() {
  if (phase !== 'fight' || laughT > 0 || spitT < FAT_TIME) return false;
  feidudu(); return true;
}
function feidudu() {
  spitT = 0; fats++; fatBannerT = 2.4;
  const el = $('#fatBanner'); show(el); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  heroCaption('你的胆子真是肥嘟嘟的！', '#ffb3e6');
  // 老外口音：录好的 feidudu.mp3（英语声音念中文拼读）；说完再跟一声尖一点的“Fay doo doo!”，越听越上头
  // 录音没加载上时，用浏览器里的英语声音现场念拼读，一样是老外口音。喊完之后安静一会儿，只听气球一个个“啵”
  let len = 3;
  if (!muted && actx) {
    len = hasClip('hero.feidudu') ? heroSay('hero.feidudu', { volume: 1.7, duckTo: 0.12 }) : speak(FDD_SAY);   // 录音本身偏小声，放大一点
    if (hasClip('hero.feidudu.echo')) setTimeout(() => { if (!muted && phase === 'fight') heroSay('hero.feidudu.echo', { volume: 1.5, rate: 1.08, duckTo: 0.18, cut: false }); }, (len + 0.08) * 1000);
    boing(0.32);
  }
  pace.quiet(time, len + 0.9 + PACE.quietAfterFat); pace.log(time, '肥嘟嘟');
  let n = 0;
  for (let i = 0; i < E.n; i++) {
    const t = TYPES[E.type[i]], dx = E.x[i] - player.x, dz = E.z[i] - player.z;
    if (t.boss || E.puff[i] > 0 || dx * dx + dz * dz > FAT_R * FAT_R) continue;
    E.puff[i] = 1.1 + Math.random() * 0.5; E.stun[i] = 0; E.swing[i] = 0; n++;
  }
  const bi = bossIndex();   // Boss 吹不爆：提伯尔特被笑晕一下、掉点血
  if (bi >= 0 && Math.hypot(E.x[bi] - player.x, E.z[bi] - player.z) < FAT_R) { if (E.type[bi] === T.tybalt) tyStun(1.0); hurtEnemy(bi, 6 * stats.dmgMul); }
  ring(player.x, player.z, FAT_R, 0.7, '#ffb3e6'); shake = Math.max(shake, 0.25);
  floatText(scene, '肥嘟嘟！', player.x, 3.6, player.z, { color: '#ffb3e6', stroke: '#4a1038', h: 1.0, life: 1.4 });
  window.__fat = fats; window.__puffed = (window.__puffed || 0) + n;
}
function popEnemy(i) {
  const x = E.x[i], z = E.z[i];
  ring(x, z, 1.1, 0.3, '#ffd0f0');
  if (!muted && actx && time - popAt > 0.04) { popAt = time; pop(0.7 + Math.random() * 0.8, 0.28); }
  if (Math.random() < 0.3) floatText(scene, pick(['啵！', '嘟！', '肥嘟嘟']), x, 2.6, z, { color: '#ffb3e6', stroke: '#4a1038', h: 0.6, life: 0.7 });
  killEnemy(i, 'pop');
}
// 第一次见到某种梗怪：在离得最近的那只头上冒字，播它的招牌叫声（优先级最高，能顶掉别的小怪叫声）
function introduce(kind) {
  const M = MEME[kind];
  let idx = -1, bd = 1e9;
  for (let i = 0; i < E.n; i++) if (TYPES[E.type[i]].minion === kind) { const q = (E.x[i] - player.x) ** 2 + (E.z[i] - player.z) ** 2; if (q < bd) { bd = q; idx = i; } }
  mobCaption(M.intro, M.color);
  if (idx >= 0) floatText(scene, M.intro.length > 9 ? M.pop : M.intro, E.x[idx], 2.6, E.z[idx], { color: M.color, stroke: '#1a1020', h: 0.78, life: 1.3 });
  if (!muted && actx && mobSay(kind, 'attack', { pan: idx >= 0 ? panOf(E.x[idx] - player.x, E.z[idx] - player.z) : 0, dist: idx >= 0 ? Math.sqrt(bd) : 6, priority: 3 })) pace.mobPlayed(time, kind, heatNow, kind + ' 登场');
  else pace.log(time, kind + ' 登场（没声音）');
  window.__intros = (window.__intros || 0) + 1;
}
// 第一/第三人称的自动瞄准：按住鼠标左键就往准星方向喷；否则打前方 57 度扇形里最近的怪（Boss 优先），背后贴身的怪也会顺手喷
function aimAhead() {
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  if (mouseHeld && document.pointerLockElement === canvas) return { x: fx, z: fz };
  let best = -1, bs = 1e9;
  for (let i = 0; i < E.n; i++) {
    const dx = E.x[i] - player.x, dz = E.z[i] - player.z, d = Math.hypot(dx, dz);
    if (d > 16 || d < 1e-3) continue;
    const c = (dx * fx + dz * fz) / d;
    const s = c > 0.55 ? d - (TYPES[E.type[i]].boss ? 4 : 0) : d < 3.5 ? d + 30 : 1e9;
    if (s < bs) { bs = s; best = i; }
  }
  if (best < 0) return null;
  const dx = E.x[best] - player.x, dz = E.z[best] - player.z, d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}
// ---------- 变身大奶蛙，捧腹大笑（从《勇者奶蛙》搬来） ----------
// force：倒下复活时强制捧腹大笑，不看冷却，也不占用冷却
function startLaugh(force = false) {
  if (!bigFrog || !(phase === 'fight' || (force && phase === 'levelup'))) return;
  if (!force && (laughT > 0 || laughCd > 0)) return;
  laughT = LAUGH_TIME; if (!force) laughCd = LAUGH_CD;
  pulseT = force ? 0.15 : 0.35; pulsesLeft = 5; bigFrog.pop = 0;
  bigFrog.group.position.set(player.x, 0, player.z); bigFrog.group.visible = true;
  laughUI.showMeme(force ? '笑着复活！' : '捧腹大笑！'); laughUI.flash(); shake = Math.max(shake, 0.35);
  // 变身：桌宠笑声连放两遍，配捧腹大笑动图；复活：放更长更响的爆笑原声
  if (!muted) { playLaugh(actx, LAUGH_TIME + 0.4, force ? 'long' : 'short'); holdHero(LAUGH_TIME + 0.4); }
  pace.quiet(time, LAUGH_TIME + PACE.quietAfterLaugh); pace.log(time, force ? '笑着复活' : '捧腹大笑');   // 笑的时候和笑完之后，小怪不叫、口头禅不喊
  ring(player.x, player.z, 3, 0.5);
  if (!force) { floatText(scene, '变身！', player.x, 3.4, player.z, { color: '#ffe36b', h: 1.1 }); bark('romeo', '绷不住了！哈哈哈哈哈哈！'); }
  window.__laughs = (window.__laughs || 0) + 1;
}
function finishLaugh() {   // 笑完变回罗密欧
  const was = laughT > 0 || (bigFrog && bigFrog.group.visible);
  laughT = 0; pulsesLeft = 0;
  if (bigFrog) bigFrog.group.visible = false;
  laughUI.clear();
  if (was) ring(player.x, player.z, 2.5, 0.4);
}
function endLaugh() { finishLaugh(); stopLaugh(); }   // 幕结束、暂停、倒下时立刻收掉
// 一圈全屏声波：画面里的怪都挨一下并被震开，Boss 被笑晕
function bellyPulse() {
  ring(player.x, player.z, 16, 0.75);
  const dmg = (3 + act * 0.5) * stats.dmgMul;   // 大部分小怪一圈就倒，鼓怪要两三圈
  for (let i = E.n - 1; i >= 0; i--) {
    const dx = E.x[i] - player.x, dz = E.z[i] - player.z, d = Math.hypot(dx, dz) || 0.001;
    if (d > 17) continue;
    const t = TYPES[E.type[i]];
    if (t.key === 'tybalt') { tyStun(1.2); if (Math.random() < 0.5) floatText(scene, pick(['笑晕了', '别笑了！', '哈？']), E.x[i], 3.6, E.z[i], { color: '#ffe95c', h: 0.7 }); }
    hurtEnemy(i, t.boss ? 8 * stats.dmgMul : dmg, dx / d * 1.6, dz / d * 1.6);
  }
  laughUI.rain(6); shake = Math.max(shake, 0.3);
  for (let k = 0; k < 4; k++) floatText(scene, pick(['哈', '哈哈', '哈哈哈', 'HA']), player.x + (Math.random() - 0.5) * 7, 1.6 + Math.random() * 1.5, player.z + (Math.random() - 0.5) * 4, { color: pick(HAHA_COLORS), h: 1, rise: 2.5 });
  window.__pulses = (window.__pulses || 0) + 1;
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
// 立牌正对镜头：BR 是这一帧镜头的旋转（三根轴），立牌的平面按它转，任何视角下都是正面
const BR = new Float32Array(9);
function billRot() {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  BR[0] = e[0]; BR[1] = e[1]; BR[2] = e[2]; BR[3] = e[4]; BR[4] = e[5]; BR[5] = e[6]; BR[6] = e[8]; BR[7] = e[9]; BR[8] = e[10];
}
function writeBill(arr, i, x, y, z, sx, sy) {
  const o = i * 16;
  arr[o] = BR[0] * sx; arr[o + 1] = BR[1] * sx; arr[o + 2] = BR[2] * sx; arr[o + 3] = 0;
  arr[o + 4] = BR[3] * sy; arr[o + 5] = BR[4] * sy; arr[o + 6] = BR[5] * sy; arr[o + 7] = 0;
  arr[o + 8] = BR[6]; arr[o + 9] = BR[7]; arr[o + 10] = BR[8]; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
const counts = new Int32Array(TYPES.length);
const camTarget = new THREE.Vector3(), camLook = new THREE.Vector3();
let camDist = 1;
const kindMeshes = (kind) => minionMeshes[kind] || minionMeshes.penguin || minionMeshes.dog;   // 某只猫没加载上时拿企鹅顶上
const cm4 = new THREE.Matrix4(), cq = new THREE.Quaternion(), ce = new THREE.Euler(0, 0, 0, 'YXZ'), cp = new THREE.Vector3(), cs = new THREE.Vector3();
// 3D 小怪：选走路/攻击帧，转身面向目标，攻击时往前冲一点。被“跌”打趴时侧躺着抖，被肥嘟嘟吹胀时变大飘起来
function drawMinion(i, t) {
  const tx = t.ghost && Math.hypot(player.x - E.x[i], player.z - E.z[i]) > 2.2 ? 0 : player.x;
  const tz = t.ghost && Math.hypot(player.x - E.x[i], player.z - E.z[i]) > 2.2 ? 0 : player.z;
  const stunned = E.stun[i] > 0, puffed = E.puff[i] > 0;
  const fi = stunned || puffed ? 1 : frameIndex(time * (WALK_RATE[t.minion] || 1.6) * (E.speed[i] / t.speed) * (E.slow[i] > 0 ? 0.45 : 1) + E.phase[i], E.swing[i]);
  const mm = kindMeshes(t.minion)[fi], k = mm.count++;
  const yaw = Math.atan2(-(tz - E.z[i]), tx - E.x[i]), c = Math.cos(yaw), sn = Math.sin(yaw);
  const sc = t.mh * (E.flash[i] > 0 ? 1.08 : 1);
  const a = mm.instanceMatrix.array, o = k * 16;
  if (stunned || puffed) {
    let y = 0, s = sc, roll = 0, sy = 1;
    if (puffed) { const p = Math.max(0, Math.min(1, 1 - E.puff[i] / 1.1)); s *= 1 + p * 1.4; sy = 1 - p * 0.15; y = p * p * 2.2 + Math.sin(time * 9 + E.phase[i]) * 0.06 * p; roll = Math.sin(time * 7 + E.phase[i]) * 0.25 * p; }
    else { roll = 1.25 + Math.sin(time * 30 + E.phase[i]) * 0.06; y = 0.12 * t.mh; }   // 跌倒：侧躺，抽搐
    cm4.compose(cp.set(E.x[i], y, E.z[i]), cq.setFromEuler(ce.set(roll, yaw, 0)), cs.set(s, s * sy, s));
    cm4.toArray(a, o);
  } else {
    const lunge = E.swing[i] > 0 ? lungeOffset(t.minion, 1 - E.swing[i] / SWING_TIME) * t.mh : 0;
    a[o] = c * sc; a[o + 1] = 0; a[o + 2] = -sn * sc; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sc; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = sn * sc; a[o + 9] = 0; a[o + 10] = c * sc; a[o + 11] = 0;
    a[o + 12] = E.x[i] + c * lunge; a[o + 13] = 0; a[o + 14] = E.z[i] - sn * lunge; a[o + 15] = 1;
  }
  const col = mm.instanceColor.array, f = E.flash[i] > 0 ? 2.4 : 1, tint = t.tint || ONE3;
  if (puffed) { col[k * 3] = 1.5; col[k * 3 + 1] = 0.9; col[k * 3 + 2] = 1.35; }        // 吹胀：粉粉的
  else if (E.slow[i] > 0) { col[k * 3] = tint[0] * f * 0.7; col[k * 3 + 1] = tint[1] * f * 0.95; col[k * 3 + 2] = tint[2] * f * 1.45; }   // 被水泡着：发蓝
  else { col[k * 3] = tint[0] * f; col[k * 3 + 1] = tint[1] * f; col[k * 3 + 2] = tint[2] * f; }
}
// 被打倒的小怪按各自的梗飞走：OIIA 猫螺旋升天、香蕉猫翻跟头飞出去、企鹅先被拍扁再弹飞、刀盾狗仰面倒下
function drawCorpses(dt) {
  for (let k = corpses.length - 1; k >= 0; k--) {
    const c = corpses[k]; c.t += dt;
    const life = c.kind === 'oiia' ? 1.1 : 0.8;
    if (c.t >= life || !minionMeshes) { corpses.splice(k, 1); continue; }
    const p = c.t / life, fade = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    let y = Math.max(0, 5 * c.t - 7 * c.t * c.t), yaw = c.yaw, roll = 0, tilt = 0, sx = 1, sy = 1, sp = 3.4, fi = 2;
    if (c.kind === 'oiia') { y = c.t * c.t * 3.6 + c.t * 0.8; yaw += c.t * c.t * 40 + c.t * 8; sy = 1 + p * 0.4; sp = 0.6; fi = WALK_FRAMES + 3; }
    else if (c.kind === 'banana') { roll = c.spin * c.t * 13; sp = 4.2; }
    else if (c.kind === 'penguin') {
      const q = Math.min(1, c.t * 9), t2 = c.t - 0.12;
      sy = 1 - q * 0.55 + (t2 > 0 ? Math.min(0.55, t2 * 4) : 0); sx = 1 + q * 0.35 - (t2 > 0 ? Math.min(0.35, t2 * 3) : 0);
      y = t2 > 0 ? Math.max(0, 6 * t2 - 9 * t2 * t2) : 0; sp = t2 > 0 ? 4 : 0; roll = t2 > 0 ? c.spin * t2 * 9 : 0;
    } else { tilt = Math.min(1.45, c.t * 7); y = 0; sp = 1.5; }
    c.x += c.ux * sp * dt; c.z += c.uz * sp * dt;
    const list = kindMeshes(c.kind), mm = list[Math.min(fi, list.length - 1)], n = mm.count++;
    const s = c.mh * fade;
    cm4.compose(cp.set(c.x, y, c.z), cq.setFromEuler(ce.set(roll, yaw, tilt)), cs.set(s * sx, s * sy, s * sx));
    cm4.toArray(mm.instanceMatrix.array, n * 16);
    const col = mm.instanceColor.array; col[n * 3] = c.tint[0] * 1.3; col[n * 3 + 1] = c.tint[1] * 1.3; col[n * 3 + 2] = c.tint[2] * 1.3;
  }
}
// 镜头：俯视跟着主角；第三人称跟在背后；第一人称在眼睛的位置。捧腹大笑时第一人称也临时退到背后，好看见大奶蛙
function updateCamera(dt) {
  const live = phase === 'fight' || phase === 'levelup' || phase === 'paused';
  const mode = live ? camMode : 0;
  const big = !!(bigFrog && bigFrog.group.visible);
  // 视野（上下张角）：横屏一直是 45 度；竖屏屏幕窄，俯视时按屏幕比例放大到左右能看到约 13 米，第一/第三人称用 78 度
  const fov = !portrait ? 45 : mode === 0 ? Math.min(72, Math.max(42, 2 * Math.atan(PORTRAIT_HALF_W / CAMP_D / camera.aspect) * 180 / Math.PI)) : 78;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (mode === 0) {
    const want = phase === 'actEnd' ? 0.62 : phase === 'card' ? 1.5 : phase === 'title' || phase === 'over' ? 0.8 : laughT > 0 ? 0.78 : 1;   // 捧腹大笑时镜头拉近一点
    camDist += (want - camDist) * Math.min(1, dt * 2.2);
    const C = portrait ? CAMP : CAM, menu = phase === 'title' || phase === 'over';
    // 开始和结束画面：横屏时镜头往右平移，主角站到画面左边；竖屏时往上平移，主角站到标题下面
    const panX = menu && !portrait ? 5.5 : 0, panZ = menu && portrait ? -7.5 : 0;
    camTarget.set(player.x + panX + C.x * camDist, C.y * camDist, player.z + panZ + C.z * camDist);
    camera.position.lerp(camTarget, Math.min(1, dt * 7));
    camera.lookAt(camera.position.x - C.x * camDist, phase === 'actEnd' ? 0.9 : 0, camera.position.z - C.z * camDist);
    viewYaw = Math.PI;
  } else {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;   // r：镜头的右手方向
    if (mode === 1 || big) {
      // 第三人称：越过右肩看（主角在画面偏左，准星不被脑袋挡住）；变身大奶蛙时退远、升高，看全身。竖屏再退远一点
      const pk = portrait ? 1.4 : 1, dist = (big ? 7.4 : 5.0) * pk, side = big ? 0 : portrait ? 0.5 : 0.95, h = (big ? 4.0 : 2.45) * pk - camPitch * 1.6;
      camTarget.set(player.x - fx * dist + rx * side, Math.max(0.8, h), player.z - fz * dist + rz * side);
      camera.position.lerp(camTarget, Math.min(1, dt * 9));
      camLook.set(player.x + fx * 4 + rx * side, (big ? 1.6 : 1.2) + camPitch * 2.6, player.z + fz * 4 + rz * side);
    } else {
      const bob = player.moving > 0.1 ? Math.abs(Math.sin(time * 11)) * 0.06 : 0;
      camTarget.set(player.x + fx * 0.15, 1.6 + bob, player.z + fz * 0.15);
      camera.position.copy(camTarget);
      camLook.set(camTarget.x + fx * Math.cos(camPitch) * 4, camTarget.y + Math.sin(camPitch) * 4, camTarget.z + fz * Math.cos(camPitch) * 4);
    }
    camera.lookAt(camLook);
    viewYaw = camYaw;
  }
  const fg = (portrait ? FOG_P : FOG)[mode];
  scene.fog.near = fg[0]; scene.fog.far = fg[1];
  if (shake > 0) {   // 冲撞、撞墙、捧腹大笑时镜头抖一下
    const k = mode === 2 && !big ? 0.35 : 1;
    camera.position.x += (Math.random() - 0.5) * shake * 0.6 * k; camera.position.y += (Math.random() - 0.5) * shake * 0.4 * k;
    shake = Math.max(0, shake - dt * 1.8);
  }
  billRot();
}
function draw(dt) {
  updateCamera(dt);   // 先摆镜头：立牌要按这一帧的镜头转
  counts.fill(0);
  if (minionMeshes) for (const list of Object.values(minionMeshes)) for (const m of list) m.count = 0;
  const sm = shadowMesh.instanceMatrix.array;
  for (let i = 0; i < E.n; i++) {
    const ty = E.type[i], t = TYPES[ty], m = enemyMeshes[ty], k = counts[ty]++;
    if (t.minion) {
      if (minionMeshes) drawMinion(i, t);
      const ss = t.r * 3;
      writeMatrix(sm, i, E.x[i], 0.012, E.z[i], ss, 1, ss * 0.7);
      continue;
    }
    if (!m) {   // 提伯尔特：3D 模型
      if (tybalt) {
        tybalt.visible = true; tybalt.position.set(E.x[i], 0, E.z[i]);
        const inner = tybalt.userData.inner, fl = E.flash[i] > 0 ? 1.06 : 1;
        if (tyMode === 'windup' || tyMode === 'charge') {   // 低头：整个身体往前压，冲的时候一颠一颠
          const run = tyMode === 'charge';
          tybalt.rotation.y = Math.atan2(tyDX, tyDZ);
          inner.rotation.x = run ? 0.5 : 0.32;
          inner.rotation.z = run ? Math.sin(time * 22) * 0.06 : Math.sin(time * 30) * 0.03;
          inner.position.y = run ? Math.abs(Math.sin(time * 22)) * 0.2 : Math.abs(Math.sin(time * 16)) * 0.05;
          inner.scale.set(fl, (run ? 1 : 0.93) * fl, fl);
        } else if (tyMode === 'stunned') {   // 撞晕：往后仰着晃，头上转星星
          inner.rotation.x = -0.12; inner.rotation.z = Math.sin(time * 6) * 0.14; inner.position.y = 0; inner.scale.setScalar(fl);
        } else {
          tybalt.rotation.y = Math.atan2(player.x - E.x[i], player.z - E.z[i]);
          inner.rotation.x = 0; inner.position.y = Math.abs(Math.sin(time * 7)) * 0.12; inner.rotation.z = Math.sin(time * 7) * 0.05;
          inner.scale.setScalar(fl);
        }
        tyStars.visible = tyMode === 'stunned';
        if (tyStars.visible) { tyStars.position.set(E.x[i], 2.75, E.z[i]); tyStars.rotation.y += dt * 5; }
      }
      writeMatrix(sm, i, E.x[i], 0.012, E.z[i], t.r * 3, 1, t.r * 2.1);
      continue;
    }
    const b = Math.abs(Math.sin(time * (ty === T.birdhead ? 13 : 8) + E.phase[i]));
    const s = t.h, flip = t.flip ? E.face[i] : 1;
    writeBill(m.instanceMatrix.array, k, E.x[i], b * 0.12, E.z[i], s * flip * (1 + (1 - b) * 0.06), s * (0.94 + b * 0.08));
    const f = E.flash[i] > 0 ? 2.6 : 0.92, col = m.instanceColor.array;
    col[k * 3] = f; col[k * 3 + 1] = f; col[k * 3 + 2] = E.flash[i] > 0 ? 2.6 : 0.98;
    const ss = t.r * 3;
    writeMatrix(sm, i, E.x[i], 0.012, E.z[i], ss, 1, ss * 0.7);
  }
  if (tybalt && act === 3 && !(dogSpawned && !dogDown) && tybalt.visible) tybalt.visible = false;
  drawCorpses(dt);
  enemyMeshes.forEach((m, ty) => { if (!m) return; m.count = counts[ty]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
  if (minionMeshes) for (const list of Object.values(minionMeshes)) for (const m of list) if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  shadowMesh.count = E.n; shadowMesh.instanceMatrix.needsUpdate = true;

  // “哈”字子弹：从嘴巴的高度喷出去，字比原来的音符大一点好认
  const hc = HAHA_GLYPHS.map(() => 0);
  const fp = camMode === 2 && (phase === 'fight' || phase === 'levelup' || phase === 'paused'), cpx = camera.position.x, cpz = camera.position.z;
  for (let i = 0; i < B.n; i++) {
    const g = B.glyph[i];
    let s = 0.95 * B.size[i];
    if (fp) s *= Math.max(0.2, Math.min(1, (Math.hypot(B.x[i] - cpx, B.z[i] - cpz) - 0.3) / 3.5));   // 第一人称：刚喷出嘴的字很贴脸，先小后大
    writeBill(hahaMeshes[g].instanceMatrix.array, hc[g]++, B.x[i], fp ? 1.35 : 1.25, B.z[i], s * 1.13, s);
  }
  const on = phase === 'fight' || phase === 'levelup' ? ([0, 2, 3, 4][stats.orbit] || 0) : 0;
  for (let k = 0; k < on; k++) {
    const a = time * (stats.orbit >= 3 ? 3.6 : 2.6) + k / on * Math.PI * 2;
    writeBill(hahaMeshes[0].instanceMatrix.array, hc[0]++, player.x + Math.sin(a) * 2.3, 1.15, player.z + Math.cos(a) * 2.3, 1.0, 0.9);
  }
  hahaMeshes.forEach((m, g) => { m.count = hc[g]; m.instanceMatrix.needsUpdate = true; });

  const em = ebMesh.instanceMatrix.array;
  for (let k = 0; k < EB.n; k++) { const s = 0.75 + Math.sin(time * 20 + k) * 0.1; writeBill(em, k, EB.x[k], 0.9, EB.z[k], s, s); }
  ebMesh.count = EB.n; ebMesh.instanceMatrix.needsUpdate = true;

  const fm = fireflyMesh.instanceMatrix.array;
  for (let i = 0; i < O.n; i++) { const s = 0.5 + Math.sin(O.t[i] * 5) * 0.1; writeBill(fm, i, O.x[i], 0.45 + Math.sin(O.t[i] * 3) * 0.12, O.z[i], s, s); }
  fireflyMesh.count = O.n; fireflyMesh.instanceMatrix.needsUpdate = true;

  // 主角：用代码做的动作。走路一蹦一蹦、左右摇，站着时轻轻呼吸
  // 转身：走路时立刻转向走的方向（转得快，转弯时身子往里歪），站着不动时才转向瞄准的方向
  if (hero) {
    const inner = hero.userData.inner, mv = player.moving, walking = mv > 0.1 && phase === 'fight';
    const hop = Math.abs(Math.sin(time * 11));
    hero.position.set(player.x, mv > 0.1 ? hop * 0.14 : 0, player.z);
    const want = walking ? Math.atan2(player.mvx, player.mvz) : Math.atan2(player.aimX, player.aimZ);
    let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    hero.rotation.y += dr * Math.min(1, dt * (walking ? 22 : 15));
    const lean = Math.max(-0.28, Math.min(0.28, dr * 0.45));
    inner.rotation.z = (mv > 0.1 ? Math.sin(time * 11) * 0.07 : 0) - lean + (dodge.t > 0 ? -dodge.side * 0.35 : 0);
    inner.rotation.x = mv > 0.1 ? 0.08 + (dodge.t > 0 ? 0.15 : 0) : 0;
    const breathe = 1 + Math.sin(time * 2.4) * 0.015;
    inner.scale.set(1 + (mv > 0.1 ? (1 - hop) * 0.04 : 0), breathe - (mv > 0.1 ? (1 - hop) * 0.05 : 0), 1);
    const firstPerson = camMode === 2 && (phase === 'fight' || phase === 'levelup' || phase === 'paused');
    hero.visible = !firstPerson && !(player.hurtCd > 0.25 && dodge.t <= 0 && Math.floor(time * 20) % 2) && !(bigFrog && bigFrog.group.visible);
  }
  const ghostA = camMode === 1 ? 0.22 : 0.45;   // 第三人称时残影离镜头近，淡一点
  for (const gh of ghosts) {   // 闪身步残影慢慢淡掉
    if (gh.t <= 0) continue;
    gh.t -= dt; gh.g.visible = gh.t > 0;
    gh.g.traverse((o) => { if (o.isMesh) o.material.opacity = Math.max(0, gh.t / 0.36) * ghostA; });
  }
  // 大奶蛙：正面朝镜头，捧着肚子前仰后合、一颠一颠，出场时“嘭”地变大
  if (laughT > 0 && phase !== 'fight' && phase !== 'levelup' && phase !== 'paused') endLaugh();
  if (bigFrog && bigFrog.group.visible) {
    const p = bigFrog.pop = Math.min(1, (bigFrog.pop || 0) + dt * 3.2), pop = p < 1 ? (0.35 + 0.65 * p) * (1 + Math.sin(p * Math.PI) * 0.3) : 1;
    bigFrog.group.position.set(player.x, Math.abs(Math.sin(time * 15)) * 0.08, player.z);
    bigFrog.group.rotation.y = Math.sin(time * 7.5) * 0.16;
    bigFrog.inner.scale.setScalar(pop);
    bigFrog.inner.rotation.x = -0.08 + Math.sin(time * 15) * 0.03;
    bigFrogPose(bigFrog.rig, time, 1);
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

  updateFloats(scene, dt, camera);
  renderer.render(scene, camera);

  // 变身按钮和表情包弹窗（选卡时先把弹窗收起来，免得挡住卡片）
  const inFight = phase === 'fight' || phase === 'levelup';
  show(laughBtn, inFight);
  if (inFight) {
    laughBtn.disabled = laughCd > 0 || laughT > 0 || !bigFrog;
    const lbl = laughT > 0 ? '哈哈哈<small>捧腹大笑中</small>' : laughCd > 0 ? `变身<small>${Math.ceil(laughCd)} 秒</small>` : '变身<small>捧腹大笑 · V</small>';
    if (lbl !== laughLabel) { laughLabel = lbl; laughBtn.innerHTML = lbl; }
  }
  if (laughT > 0) { if (phase === 'fight') laughUI.showMeme(); else laughUI.hideMeme(); }

  // 第一/第三人称：准星；离开打斗（选卡、对话、暂停）时把鼠标放出来，好点按钮
  show($('#xhair'), camMode > 0 && phase === 'fight');
  if (document.pointerLockElement && phase !== 'fight') document.exitPointerLock();
  // 字幕、连杀、肥嘟嘟进度条
  if (capHeroT > 0) { capHeroT -= dt; if (capHeroT <= 0) show($('#capHero'), false); }
  if (capMobT > 0) { capMobT -= dt; if (capMobT <= 0) show($('#capMob'), false); }
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) { combo = 0; show($('#combo'), false); } }
  if (fatBannerT > 0) { fatBannerT -= dt; if (fatBannerT <= 0) show($('#fatBanner'), false); }
  // 肥嘟嘟按钮：外圈按攒的能量变粉，攒满了发光；捧腹大笑时先灰着
  show(fatBtn, inFight);
  if (inFight) {
    const f = Math.min(1, spitT / FAT_TIME), ready = f >= 1 && laughT <= 0 && phase === 'fight';
    fatBtn.style.setProperty('--p', f.toFixed(3));
    fatBtn.classList.toggle('ready', ready); fatBtn.disabled = !ready;
    const s = ready ? '点我！· F' : `${Math.floor(f * 100)}%`;
    if (fatBtn.lastChild.textContent !== s) fatBtn.lastChild.textContent = s;
  }

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
$('#tools .b-pause').onclick = () => { if (phase !== 'fight') return; pausedFrom = phase; phase = 'paused'; stopLaugh(); stopSpeak(); show($('#pause')); };
$('#pause .b-resume').onclick = () => { show($('#pause'), false); phase = pausedFrom || 'fight'; pausedFrom = null; };
$('#pause .b-restart').onclick = () => { show($('#pause'), false); pausedFrom = null; show($('#boss'), false); show($('#calm'), false); startRun(true); };
$('#tools .b-mute').onclick = (e) => { muted = !muted; e.target.textContent = muted ? '声音 关' : '声音 开'; if (muted) { stopLaugh(); stopSpeak(); } };

// ---------- 开始画面 ----------
let titleReady = false;
$('#title').onclick = () => { if (!titleReady) return; titleReady = false; initAudio(); startRun(); };

Promise.all([loadModel('fantasy', 1.9), loadModel('wedding-dress', 1.95), loadModel('minotaur', 2.3), loadModel('rabbit', 1.85), minionsReady, bigReady]).then(([h, j, t, m]) => {
  hero = h; juliet = j; tybalt = t; mercutio = m;
  scene.add(hero, juliet, tybalt, mercutio);
  try { makeGhosts(); } catch (e) { console.warn('闪身步残影没做出来', e); }
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
  // 缝合版：变身和提伯尔特冲撞的状态，给自动测试看
  startLaugh, get laughT() { return laughT; }, get laughCd() { return laughCd; }, set laughCd(v) { laughCd = v; }, get revives() { return revives; },
  get tyMode() { return tyMode; }, get bigVisible() { return !!(bigFrog && bigFrog.group.visible); }, blockedAt, T,
  // 新加的：视角、闪身步、肥嘟嘟、连杀、小怪模型
  setCamMode, get camMode() { return camMode; }, get camYaw() { return camYaw; }, set camYaw(v) { camYaw = v; },
  get spitT() { return spitT; }, set spitT(v) { spitT = v; }, get fats() { return fats; }, get combo() { return combo; }, get bestCombo() { return bestCombo; },
  get dodges() { return dodge.n; }, get corpses() { return corpses.length; }, get minionKinds() { return minionMeshes ? Object.keys(minionMeshes) : []; },
  get heroRot() { return hero ? hero.rotation.y : 0; }, get ghostsVisible() { return ghosts.filter((g) => g.g.visible).length; },
  // 梗的节奏：每个出声的梗 [时间, 是什么]，和这一刻的热度；肥嘟嘟按钮
  get gags() { return pace.events; }, get heat() { return heatNow; }, tryFeidudu, get portrait() { return portrait; },
};

// ---------- 主循环 ----------
setAct(1);
let last = performance.now(), frames = 0, fpsT = last, slowSecs = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(1 / 30, (now - last) / 1000); last = now;
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
