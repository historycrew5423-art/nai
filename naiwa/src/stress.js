// v0.1 压力测试版：方块代替模型。双摇杆移动和瞄准、音符自动连发、怪潮追人、经验球。
// 目的：先在 iPhone 上量出同屏多少只怪还不卡，再决定模型面数和画质。
import * as THREE from 'three';
import { Input } from './input.js?v=20261031final';

const VERSION = 'v0.1 压力测试';
const HALF = 30;            // 可玩区域半边长（米），见 docs/场景规格.md
const MAX_ENEMIES = 1500;
const MAX_BULLETS = 3000;
const MAX_ORBS = 2000;

// ---------- 画面：固定 16:9 ----------
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
let quality = 'high';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f2a);
scene.fog = new THREE.Fog(0x1b1f2a, 26, 60);
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 120);
const CAM_OFFSET = new THREE.Vector3(0, 16, 14); // 往下约 49 度看

function layout() {
  const portrait = innerHeight > innerWidth;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('rotate-hint', portrait);   // 压力测试版只做了横屏
  const w = Math.min(innerWidth, innerHeight * 16 / 9);
  const h = w * 9 / 16;
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
  renderer.setSize(w, h, false);
}
addEventListener('resize', layout);
layout();

// ---------- 场地（占位，以后换成队友的场景） ----------
scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3040, 1.6));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
sun.position.set(-8, 20, 6);
scene.add(sun);

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4f5c'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#5a6070'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(15, 15);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: gridTexture() }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x23262f }));
outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02;
scene.add(outer);
const wallMat = new THREE.MeshLambertMaterial({ color: 0x6b5f7a });
for (const [x, z, w, d] of [[0, -HALF - 0.5, HALF * 2 + 2, 1], [0, HALF + 0.5, HALF * 2 + 2, 1], [-HALF - 0.5, 0, 1, HALF * 2], [HALF + 0.5, 0, 1, HALF * 2]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), wallMat);
  m.position.set(x, 0.3, z);
  scene.add(m);
}
// 障碍物：中间 16×16 米留空，彼此隔开，怪能流过去
const obstacles = [];
const obsMat = new THREE.MeshLambertMaterial({ color: 0x8a7f70 });
for (const [x, z, w, d] of [[-13, -13, 3, 2], [13, -13, 2, 3], [-13, 13, 2, 3], [13, 13, 3, 2], [0, -21, 4, 2], [0, 21, 4, 2], [-21, 0, 2, 4], [21, 0, 2, 4]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), obsMat);
  m.position.set(x, 1, z);
  scene.add(m);
  obstacles.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
}
// 把圆（x, z, 半径 r）推出障碍物和场地边界
function pushOut(p, r) {
  for (const o of obstacles) {
    const cx = Math.max(o.x0, Math.min(p.x, o.x1));
    const cz = Math.max(o.z0, Math.min(p.z, o.z1));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else { p.x = p.x < (o.x0 + o.x1) / 2 ? o.x0 - r : o.x1 + r; }
    }
  }
  const lim = HALF - r;
  p.x = Math.max(-lim, Math.min(lim, p.x));
  p.z = Math.max(-lim, Math.min(lim, p.z));
}

// ---------- 主角（占位） ----------
const player = { x: 0, z: 0, r: 0.5, hp: 20, hurtCd: 0, speed: 7, god: true, aimX: 0, aimZ: -1 };
const playerObj = new THREE.Group();
const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshLambertMaterial({ color: 0xf2c94c }));
body.scale.set(1, 1.15, 1); body.position.y = 0.65;
const lyre = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
lyre.position.set(0, 0.8, -0.75);
playerObj.add(body, lyre);
scene.add(playerObj);

// ---------- 怪、音符、经验球：同一种东西一次画完（实例化绘制） ----------
function instanced(geo, mat, max, colored) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const enemyMesh = instanced(new THREE.BoxGeometry(0.8, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_ENEMIES, true);
const bulletMesh = instanced(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0x9ff3ff }), MAX_BULLETS, false);
const orbMesh = instanced(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0x9dff6b }), MAX_ORBS, false);

// 用连续数组存数据，死掉的和最后一个交换，保持紧凑
const E = { n: 0, x: new Float32Array(MAX_ENEMIES), z: new Float32Array(MAX_ENEMIES), hp: new Float32Array(MAX_ENEMIES),
  flash: new Float32Array(MAX_ENEMIES), phase: new Float32Array(MAX_ENEMIES), speed: new Float32Array(MAX_ENEMIES) };
const B = { n: 0, x: new Float32Array(MAX_BULLETS), z: new Float32Array(MAX_BULLETS), dx: new Float32Array(MAX_BULLETS),
  dz: new Float32Array(MAX_BULLETS), life: new Float32Array(MAX_BULLETS) };
const O = { n: 0, x: new Float32Array(MAX_ORBS), z: new Float32Array(MAX_ORBS) };

function killEnemy(i) {
  if (O.n < MAX_ORBS) { O.x[O.n] = E.x[i]; O.z[O.n] = E.z[i]; O.n++; }
  const j = --E.n;
  E.x[i] = E.x[j]; E.z[i] = E.z[j]; E.hp[i] = E.hp[j]; E.flash[i] = E.flash[j]; E.phase[i] = E.phase[j]; E.speed[i] = E.speed[j];
  kills++;
}
function removeBullet(i) {
  const j = --B.n;
  B.x[i] = B.x[j]; B.z[i] = B.z[j]; B.dx[i] = B.dx[j]; B.dz[i] = B.dz[j]; B.life[i] = B.life[j];
}

// ---------- 空间网格：只和附近格子里的怪比较，几百只怪也算得动 ----------
const CELL = 1, GRID = Math.ceil((HALF * 2 + 4) / CELL), GOFF = HALF + 2;
const cellCount = new Int32Array(GRID * GRID), cellStart = new Int32Array(GRID * GRID + 1), cellItems = new Int32Array(MAX_ENEMIES);
const cellOfEnemy = new Int32Array(MAX_ENEMIES);
const cx = (x) => Math.max(0, Math.min(GRID - 1, Math.floor((x + GOFF) / CELL)));
function buildGrid() {
  cellCount.fill(0);
  for (let i = 0; i < E.n; i++) { const c = cx(E.x[i]) + cx(E.z[i]) * GRID; cellOfEnemy[i] = c; cellCount[c]++; }
  cellStart[0] = 0;
  for (let c = 0; c < GRID * GRID; c++) cellStart[c + 1] = cellStart[c] + cellCount[c];
  cellCount.fill(0);
  for (let i = 0; i < E.n; i++) { const c = cellOfEnemy[i]; cellItems[cellStart[c] + cellCount[c]++] = i; }
}

// ---------- 状态 ----------
const input = new Input();
let targetEnemies = 150, shots = 1, kills = 0, xp = 0, level = 1, levelText = 0;
let fireCd = 0, time = 0, fired = 0, hits = 0;
const xpNeed = (L) => Math.round(4 * Math.pow(L, 1.4));

function reset() {
  E.n = 0; B.n = 0; O.n = 0;
  player.x = 0; player.z = 0; player.hp = 20;
  kills = 0; xp = 0; level = 1;
}

function spawnEnemy() {
  if (E.n >= MAX_ENEMIES) return;
  const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 6;
  const p = { x: player.x + Math.cos(a) * d, z: player.z + Math.sin(a) * d };
  pushOut(p, 0.5);
  const i = E.n++;
  E.x[i] = p.x; E.z[i] = p.z; E.hp[i] = 3; E.flash[i] = 0; E.phase[i] = Math.random() * 10; E.speed[i] = 2.4 + Math.random() * 1.2;
}

// 鼠标瞄准：把鼠标位置投到地面上
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
function mouseAim() {
  const r = canvas.getBoundingClientRect();
  ndc.set((input.mouse.x - r.left) / r.width * 2 - 1, -((input.mouse.y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(groundPlane, hit)) return null;
  const dx = hit.x - player.x, dz = hit.z - player.z, d = Math.hypot(dx, dz);
  return d > 0.3 ? { x: dx / d, z: dz / d } : null;
}
// 右摇杆不碰时，自动打最近的怪
function nearestEnemy(range) {
  let best = -1, bd = range * range;
  for (let i = 0; i < E.n; i++) {
    const dx = E.x[i] - player.x, dz = E.z[i] - player.z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = i; }
  }
  return best;
}

// ---------- 每一帧 ----------
function step(dt) {
  time += dt;

  // 主角移动
  const mv = input.getMove();
  player.x += mv.x * player.speed * dt;
  player.z += mv.y * player.speed * dt;
  pushOut(player, player.r);

  // 补怪到目标数量（每帧最多补 20 只，免得一下子卡住）
  for (let k = 0; k < 20 && E.n < targetEnemies; k++) spawnEnemy();

  // 怪：先朝主角走，再把重叠的怪推开（直接挪位置，挤得再密也不会叠在一起）
  const ER = 0.42, R = ER * 2, R2 = R * R, touch = player.r + ER;
  for (let i = 0; i < E.n; i++) {
    const dx = player.x - E.x[i], dz = player.z - E.z[i];
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(E.speed[i] * dt, Math.max(0, d - touch));
    E.x[i] += dx / d * step;
    E.z[i] += dz / d * step;
    if (E.flash[i] > 0) E.flash[i] -= dt;
    // 贴到主角就扣血
    if (d < touch + 0.1 && !player.god && player.hurtCd <= 0) { player.hp--; player.hurtCd = 0.5; if (player.hp <= 0) { reset(); return; } }
  }
  if (player.hurtCd > 0) player.hurtCd -= dt;

  buildGrid();
  for (let i = 0; i < E.n; i++) {
    const gx = cx(E.x[i]), gz = cx(E.z[i]);
    for (let oz = -1; oz <= 1; oz++) {
      const zz = gz + oz; if (zz < 0 || zz >= GRID) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = gx + ox; if (xx < 0 || xx >= GRID) continue;
        const c = xx + zz * GRID;
        for (let s = cellStart[c], e2 = s + cellCount[c]; s < e2; s++) {
          const j = cellItems[s]; if (j <= i) continue;
          let ex = E.x[i] - E.x[j], ez = E.z[i] - E.z[j];
          let q = ex * ex + ez * ez;
          if (q >= R2) continue;
          if (q < 1e-8) { ex = Math.random() - 0.5; ez = Math.random() - 0.5; q = ex * ex + ez * ez; }
          const dd = Math.sqrt(q), push = (R - dd) * 0.5 / dd;
          E.x[i] += ex * push; E.z[i] += ez * push;
          E.x[j] -= ex * push; E.z[j] -= ez * push;
        }
      }
    }
  }
  // 不许钻进主角身体，也不许穿过障碍物和场地边界
  const p = { x: 0, z: 0 };
  for (let i = 0; i < E.n; i++) {
    const dx = E.x[i] - player.x, dz = E.z[i] - player.z, q = dx * dx + dz * dz;
    if (q < touch * touch && q > 1e-8) { const dd = Math.sqrt(q); E.x[i] = player.x + dx / dd * touch; E.z[i] = player.z + dz / dd * touch; }
    p.x = E.x[i]; p.z = E.z[i]; pushOut(p, ER); E.x[i] = p.x; E.z[i] = p.z;
  }
  buildGrid();

  // 瞄准方向：右摇杆 > 鼠标 > 自动瞄最近的怪
  let aim = null;
  if (input.aim.active) { const d = Math.hypot(input.aim.x, input.aim.y); aim = { x: input.aim.x / d, z: input.aim.y / d }; }
  else if (input.mouse.active) aim = mouseAim();
  if (!aim) { const t = nearestEnemy(16); if (t >= 0) { const dx = E.x[t] - player.x, dz = E.z[t] - player.z, d = Math.hypot(dx, dz) || 1; aim = { x: dx / d, z: dz / d }; } }
  if (aim) { player.aimX = aim.x; player.aimZ = aim.z; }

  // 开火：每秒 8 发，"子弹 ×N"时扇形打出 N 发
  fireCd -= dt;
  if (aim && fireCd <= 0) {
    fireCd = 1 / 8;
    const base = Math.atan2(player.aimX, player.aimZ), spread = 0.16;
    for (let k = 0; k < shots && B.n < MAX_BULLETS; k++) {
      const a = base + (k - (shots - 1) / 2) * spread;
      const i = B.n++;
      B.x[i] = player.x; B.z[i] = player.z; B.dx[i] = Math.sin(a) * 20; B.dz[i] = Math.cos(a) * 20; B.life[i] = 0.9;
      fired++;
    }
  }

  // 音符：飞行、打中怪
  for (let i = B.n - 1; i >= 0; i--) {
    B.x[i] += B.dx[i] * dt; B.z[i] += B.dz[i] * dt; B.life[i] -= dt;
    if (B.life[i] <= 0 || Math.abs(B.x[i]) > HALF || Math.abs(B.z[i]) > HALF) { removeBullet(i); continue; }
    const gx = cx(B.x[i]), gz = cx(B.z[i]);
    let hitIdx = -1;
    for (let oz = -1; oz <= 1 && hitIdx < 0; oz++) {
      const zz = gz + oz; if (zz < 0 || zz >= GRID) continue;
      for (let ox = -1; ox <= 1 && hitIdx < 0; ox++) {
        const xx = gx + ox; if (xx < 0 || xx >= GRID) continue;
        const c = xx + zz * GRID;
        for (let s = cellStart[c], e2 = s + cellCount[c]; s < e2; s++) {
          const j = cellItems[s];
          if (j >= E.n) continue;
          const ex = E.x[j] - B.x[i], ez = E.z[j] - B.z[i];
          if (ex * ex + ez * ez < 0.36) { hitIdx = j; break; }
        }
      }
    }
    if (hitIdx >= 0) {
      E.hp[hitIdx] -= 1; E.flash[hitIdx] = 0.08; hits++;
      removeBullet(i);
      if (E.hp[hitIdx] <= 0) killEnemy(hitIdx);
    }
  }

  // 经验球：靠近就吸过来
  for (let i = O.n - 1; i >= 0; i--) {
    const dx = player.x - O.x[i], dz = player.z - O.z[i], d = Math.hypot(dx, dz);
    if (d < 0.6) {
      O.n--; O.x[i] = O.x[O.n]; O.z[i] = O.z[O.n];
      if (++xp >= xpNeed(level)) { xp = 0; level++; levelText = 1.2; }
    } else if (d < 3.5) { O.x[i] += dx / d * 14 * dt; O.z[i] += dz / d * 14 * dt; }
  }
  if (levelText > 0) levelText -= dt;
}

// 直接写实例矩阵：绕 Y 轴转 + 缩放 + 平移
function writeMatrix(arr, i, x, y, z, rot, sx, sy, sz) {
  const c = Math.cos(rot), s = Math.sin(rot), o = i * 16;
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

function draw() {
  // 怪：蹦着走（用代码做的动作，不用骨骼），被打中闪白
  const m = enemyMesh.instanceMatrix.array, col = enemyMesh.instanceColor.array;
  for (let i = 0; i < E.n; i++) {
    const b = Math.abs(Math.sin(time * 9 + E.phase[i]));
    const rot = Math.atan2(player.x - E.x[i], player.z - E.z[i]);
    writeMatrix(m, i, E.x[i], 0.45 + b * 0.25, E.z[i], rot, 1 + (1 - b) * 0.12, 0.85 + b * 0.2, 1 + (1 - b) * 0.12);
    const f = E.flash[i] > 0;
    col[i * 3] = f ? 3 : 0.45; col[i * 3 + 1] = f ? 3 : 0.75; col[i * 3 + 2] = f ? 3 : 0.95;
  }
  enemyMesh.count = E.n; enemyMesh.instanceMatrix.needsUpdate = true; enemyMesh.instanceColor.needsUpdate = true;

  const bm = bulletMesh.instanceMatrix.array;
  for (let i = 0; i < B.n; i++) writeMatrix(bm, i, B.x[i], 0.8, B.z[i], time * 6, 1, 1, 1);
  bulletMesh.count = B.n; bulletMesh.instanceMatrix.needsUpdate = true;

  const om = orbMesh.instanceMatrix.array;
  for (let i = 0; i < O.n; i++) writeMatrix(om, i, O.x[i], 0.35 + Math.sin(time * 4 + i) * 0.08, O.z[i], time * 3 + i, 1, 1, 1);
  orbMesh.count = O.n; orbMesh.instanceMatrix.needsUpdate = true;

  // 主角：走路时一蹦一蹦，琴朝着瞄准方向
  const moving = Math.hypot(input.getMove().x, input.getMove().y) > 0.1;
  const hop = moving ? Math.abs(Math.sin(time * 12)) : 0;
  playerObj.position.set(player.x, hop * 0.18, player.z);
  playerObj.rotation.y = Math.atan2(player.aimX, player.aimZ) + Math.PI;
  body.scale.set(1 + (1 - hop) * 0.05 * (moving ? 1 : 0), 1.15 - (moving ? (1 - hop) * 0.08 : 0), 1);
  body.material.color.setHex(player.hurtCd > 0.35 ? 0xff6666 : 0xf2c94c);

  // 镜头跟着主角
  camera.position.lerp(new THREE.Vector3(player.x, 0, player.z).add(CAM_OFFSET), 0.12);
  camera.lookAt(camera.position.x - CAM_OFFSET.x, 0, camera.position.z - CAM_OFFSET.z);
  renderer.render(scene, camera);
}

// ---------- 按钮 ----------
const $ = (id) => document.getElementById(id);
$('b-more').onclick = () => { targetEnemies = Math.min(MAX_ENEMIES, targetEnemies + 100); };
$('b-less').onclick = () => { targetEnemies = Math.max(0, targetEnemies - 100); };
$('b-shots').onclick = () => { shots = shots >= 7 ? 1 : shots + 2; $('b-shots').textContent = `子弹 ×${shots}`; };
$('b-quality').onclick = () => { quality = quality === 'high' ? 'low' : 'high'; $('b-quality').textContent = `画质 ${quality === 'high' ? '高' : '低'}`; layout(); };
$('b-god').onclick = () => { player.god = !player.god; $('b-god').textContent = `无敌 ${player.god ? '开' : '关'}`; };

// 给自动测试用的接口（机器人试玩、压力测试）
window.__game = {
  E, B, O, player,
  setEnemies(n) { targetEnemies = Math.max(0, Math.min(MAX_ENEMIES, n)); },
  get kills() { return kills; },
  get level() { return level; },
  get fired() { return fired; },
  get hits() { return hits; },
  get time() { return time; },
};

// ---------- 主循环和帧数 ----------
let last = performance.now(), frames = 0, fpsT = last, fps = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  if (document.body.classList.contains('portrait')) return;
  step(dt);
  draw();
  frames++;
  if (now - fpsT >= 1000) {
    fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    window.__fps = fps;
    const info = renderer.info.render;
    hud.textContent = `${VERSION}\n每秒 ${fps.toFixed(0)} 帧　怪 ${E.n}/${targetEnemies}　音符 ${B.n}\n` +
      `三角面 ${(info.triangles / 1000).toFixed(0)}k　绘制 ${info.calls} 次　清晰度 ×${renderer.getPixelRatio().toFixed(1)}\n` +
      `等级 ${level}　经验 ${xp}/${xpNeed(level)}　击杀 ${kills}　血 ${player.god ? '无敌' : player.hp}` +
      (levelText > 0 ? '\n升级！' : '');
  }
}
requestAnimationFrame(loop);
