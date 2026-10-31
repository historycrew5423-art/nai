// 从《勇者奶蛙》搬来的玩法：喷“哈”字、变身大奶蛙捧腹大笑、牛来式低头冲撞的预警线、飘字、星星
// 只放和 game.js 无关的零件（贴图、声音、界面、大奶蛙模型），游戏逻辑仍在 game.js。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Rig } from './minions.js?v=20261031n2';
import { findSyllables } from './laugh-audio.js?v=20261031n2';

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const HAHA_COLORS = ['#ffd94a', '#ff9de0', '#7ef0ff', '#ffffff', '#b6ff6b', '#ffb35c'];

// ---------- 文字贴图 ----------
const texCache = new Map();
export function textTexture(text, { color = '#ffd94a', stroke = '#4a2a10', px = 92, glow = '' } = {}) {
  const key = [text, color, stroke, px, glow].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = `900 ${px}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Heiti SC",sans-serif`;
  g.font = font;
  c.width = Math.max(128, Math.ceil(g.measureText(text).width + px * .7)); c.height = Math.ceil(px * 1.5);
  if (glow) { const r = g.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, c.height / 2); r.addColorStop(0, glow); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, c.width, c.height); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = px * .17; g.strokeStyle = stroke; g.strokeText(text, c.width / 2, c.height / 2 + px * .05);
  g.fillStyle = color; g.fillText(text, c.width / 2, c.height / 2 + px * .05);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const entry = { tex, aspect: c.width / c.height };
  texCache.set(key, entry);
  return entry;
}
// 喷出去的字子弹：普通混合，带一圈光晕。前两个是普通的“哈”，后面几种是特殊字，打中怪时效果各不一样：
//   fx：bounce 弹到下一只怪、stun 打跌倒（原地趴 1.5 秒）、boom 炸开一圈、splash 冲走并减速、pierce 一路穿过去
//   voice：喷出这种字时主角喊的奶龙口头禅（名字见 sfx.js 的 CLIPS），say 是同时打在屏幕上的字幕
export const HAHA_GLYPHS = [
  { text: '哈', color: '#ffe066', glow: 'rgba(255,200,90,.55)', fx: 'none' },
  { text: '哈', color: '#ff9de0', glow: 'rgba(255,120,200,.45)', fx: 'none' },
  { text: '嘎', color: '#8ff4ff', glow: 'rgba(90,220,255,.45)', fx: 'bounce' },
  { text: '跌', color: '#d3b0ff', glow: 'rgba(170,120,255,.55)', fx: 'stun', voice: 'hero.gabadie', say: '嘎巴跌！' },
  { text: '塞', color: '#ff9a52', glow: 'rgba(255,120,60,.6)', fx: 'boom', voice: 'hero.gajiaosai', say: '嘎脚塞！' },
  { text: '水', color: '#6cc4ff', glow: 'rgba(80,170,255,.6)', fx: 'splash', voice: 'hero.shui', say: '嘎嘎滴啦水～' },
  { text: '噗', color: '#a8ff8f', glow: 'rgba(130,255,120,.55)', fx: 'pierce', voice: 'hero.dupu', say: '嘟噗！' },
];
export function hahaMaterial(k) {
  const g = HAHA_GLYPHS[k], t = textTexture(g.text, { color: g.color, glow: g.glow, px: 84 });
  return new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false });
}

// ---------- 飘字、星星（3D 精灵，永远画在最上层） ----------
const floats = [];
export function floatText(scene, text, x, y, z, { color = '#ffffff', stroke = '#2a1020', h = .7, rise = 1.6, life = 1.1 } = {}) {
  if (floats.length > 30) { const o = floats.shift(); scene.remove(o.s); o.s.material.dispose(); }
  const t = textTexture(text, { color, stroke });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false, depthTest: false }));
  s.renderOrder = 20; s.position.set(x, y, z); s.scale.set(h * t.aspect, h, 1); s.userData.aspect = t.aspect;
  scene.add(s); floats.push({ s, vy: rise, life, max: life, h });
}
// camera：传进来时按离镜头的远近缩放，第一/第三人称里贴脸的字不会糊满屏幕（俯视时镜头约 12 米远，大小不变）
export function updateFloats(scene, dt, camera) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.s.position.y += f.vy * dt; f.vy *= Math.exp(-dt * 2.2);
    const k = 1 - f.life / f.max, near = camera ? Math.min(1, Math.max(.22, f.s.position.distanceTo(camera.position) / 12)) : 1;
    const pop = (k < .15 ? .6 + k / .15 * .5 : 1.1) * near;
    f.s.scale.set(f.h * f.s.userData.aspect * pop, f.h * pop, 1); f.s.material.opacity = Math.min(1, f.life / (f.max * .4));
    if (f.life <= 0) { scene.remove(f.s); f.s.material.dispose(); floats.splice(i, 1); }
  }
}
export function makeStars() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const t = textTexture('★', { color: '#ffe95c', stroke: '#7a4b00' });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false }));
    const a = i / 3 * Math.PI * 2; s.position.set(Math.cos(a) * .55, 0, Math.sin(a) * .55); s.scale.set(.45 * t.aspect, .45, 1); g.add(s);
  }
  g.visible = false;
  return g;
}

// ---------- 牛来式冲撞的预警线：红底白箭头，贴地，箭头指向冲撞方向 ----------
export function makeLane() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(228,60,52,.6)'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,245,230,.95)'; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(22, 38); g.lineTo(64, 84); g.lineTo(106, 38); g.stroke();   // 箭头朝 +V（平面里朝前）
  const tex = new THREE.CanvasTexture(c); tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  // 平面放平后，长度方向是本地 +Z；rotation.y = atan2(dx, dz) 时朝 (dx, dz)
  const geo = new THREE.PlaneGeometry(1.8, 1).rotateX(-Math.PI / 2).translate(0, 0, .5);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: .85, depthWrite: false }));
  m.position.y = .05; m.renderOrder = 1; m.visible = false;
  return m;
}
export function placeLane(lane, x, z, dx, dz, len) {
  lane.position.set(x, .05, z); lane.rotation.y = Math.atan2(dx, dz); lane.scale.set(1, 1, len);
  lane.material.map.repeat.set(1, len / 1.8); lane.visible = true;
}

// ---------- 声音（都是 MIT，来源见 缝合说明.md） ----------
// 爆笑原声：14 秒，前 2.6 秒是静音，后面一直在笑——切成一个个“哈”给子弹用，复活时也放它
// 桌宠笑声：1.8 秒，和捧腹大笑动图出自同一个作者，变身时连放两遍，正好配一段动画
const LONG_URL = 'assets/audio/naiwa-baoxiao.mp3', SHORT_URL = 'assets/audio/naiwa-pet-laugh.wav', LONG_START = 2.6;
let longBuf = null, shortBuf = null, syllables = [], lastHa = 0, voices = [], loading = null;
// 笑声接到哪里：game.js 会设成 sfx.js 的主角总线（居中、最响，并且会压低小怪）；没设时直接接扬声器
let out = null, onPlay = null;
export function setLaughOut(node, duckFn) { out = node; onPlay = duckFn || null; }
const dest = (actx) => out || actx.destination;
const decode = (actx, url) => fetch(url).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b));
export function loadLaugh(actx) {
  if (loading || !actx) return loading;
  loading = Promise.all([
    decode(actx, LONG_URL).then(buf => {
      longBuf = buf;
      syllables = findSyllables(buf.getChannelData(0), buf.sampleRate, { maxLength: 0.26 }).filter(s => s.start >= LONG_START);
      window.__hahaSyllables = syllables.length;
    }),
    decode(actx, SHORT_URL).then(buf => { shortBuf = buf; }),
  ]).catch(() => console.warn('笑声加载失败'));
  return loading;
}
export function hahaReady() { return !!longBuf && syllables.length > 0; }
export function playHa(actx, volume = .42) {
  if (!actx || !longBuf || !syllables.length) return false;
  const now = performance.now(); if (now - lastHa < 90) return true; lastHa = now;
  const seg = pick(syllables), rate = .95 + Math.random() * .4, dur = seg.end - seg.start, real = dur / rate, t0 = actx.currentTime;
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = longBuf; src.playbackRate.value = rate;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(volume, t0 + .012);
  g.gain.setValueAtTime(volume, t0 + Math.max(.02, real - .04)); g.gain.linearRampToValueAtTime(0, t0 + real);
  src.connect(g).connect(dest(actx)); src.start(t0, seg.start, dur);
  if (onPlay) onPlay(.55, real);   // 每个“哈”都把小怪轻轻压低一下
  return true;
}
function playBuf(actx, buf, when, offset, len, volume) {
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(volume, when); g.gain.setValueAtTime(volume, when + Math.max(.05, len - .35)); g.gain.linearRampToValueAtTime(0, when + len);
  src.connect(g).connect(dest(actx)); src.start(when, offset, len);
  voices.push(src);
}
// kind：'short' 变身（桌宠笑声连放），'long' 复活（爆笑原声）
export function playLaugh(actx, seconds = 3.8, kind = 'short', volume = .95) {
  stopLaugh();
  if (!actx) return;
  const t0 = actx.currentTime;
  if (onPlay) onPlay(.18, seconds);   // 捧腹大笑时小怪几乎静音，只听奶蛙笑
  if (kind === 'short' && shortBuf) {
    for (let t = 0; t < seconds; t += shortBuf.duration) playBuf(actx, shortBuf, t0 + t, 0, Math.min(shortBuf.duration, seconds - t), volume);
  } else if (longBuf) {
    playBuf(actx, longBuf, t0, LONG_START, Math.min(seconds, longBuf.duration - LONG_START), volume);
  }
}
export function stopLaugh() { for (const v of voices) { try { v.stop(); } catch { /* 已经播完 */ } } voices = []; }

// ---------- 捧腹大笑的界面：表情包弹窗、满屏“哈”、闪白 ----------
// 动图：奶蛙艺术圣殿库房 pet/奶蛙-桌宠-捧腹大笑.gif（25 帧、180×180、透明底），原帧出自 liaosongjie/Codex-Voice-Input，MIT
const CSS = `
#memePop{position:absolute;left:calc(var(--u)*4);top:calc(var(--u)*14);width:calc(var(--u)*27);text-align:center;z-index:6;animation:memein .45s cubic-bezier(.2,1.6,.4,1) both;pointer-events:none}
#memePop img{position:relative;display:block;width:100%;aspect-ratio:1;border-radius:50%;border:calc(var(--u)*.6) solid #fff3c4;box-shadow:0 0 0 calc(var(--u)*.7) #f0a93a,0 calc(var(--u)*1) calc(var(--u)*4) #0009;background:radial-gradient(circle,#fffbe8 0%,#ffeeb0 62%,#f8cf72 100%);object-fit:contain;animation:memewob .32s ease-in-out infinite alternate}
#memePop .rays{position:absolute;left:50%;top:50%;width:190%;aspect-ratio:1;transform:translate(-50%,-56%);border-radius:50%;background:repeating-conic-gradient(#ffe48a66 0 12deg,#0000 12deg 24deg);animation:memespin 4s linear infinite;-webkit-mask:radial-gradient(circle,#000 35%,#0000 70%);mask:radial-gradient(circle,#000 35%,#0000 70%)}
#memePop b{position:relative;display:inline-block;white-space:nowrap;margin-top:calc(var(--u)*-2);padding:calc(var(--u)*.6) calc(var(--u)*1.8);font:900 calc(var(--u)*3.8) "Microsoft YaHei","PingFang SC",sans-serif;color:#4a2a10;background:#ffd84d;border:calc(var(--u)*.4) solid #fff;border-radius:calc(var(--u)*1.4);transform:rotate(-4deg);letter-spacing:.08em}
@keyframes memein{from{transform:scale(.2) rotate(-25deg);opacity:0}}
@keyframes memewob{from{transform:rotate(-3deg)}to{transform:rotate(3deg) scale(1.04)}}
@keyframes memespin{to{transform:translate(-50%,-56%) rotate(360deg)}}
#hahaRain{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5}
#hahaRain span{position:absolute;bottom:calc(var(--u)*-10);font:900 calc(var(--u)*6) "Microsoft YaHei","PingFang SC",sans-serif;-webkit-text-stroke:calc(var(--u)*.3) #5a2e10;animation:hahaup linear forwards}
@keyframes hahaup{0%{transform:translateY(0) scale(.6);opacity:0}12%{opacity:1}100%{transform:translateY(calc(var(--u)*-120)) rotate(var(--spin,30deg)) scale(1.3);opacity:.85}}
#flashW{position:absolute;inset:0;background:#fff7d0;opacity:0;pointer-events:none;z-index:4}
#flashW.on{animation:flashw .5s ease-out}
@keyframes flashw{0%{opacity:.85}100%{opacity:0}}
#ui button.b-laugh{position:absolute;right:calc(var(--u)*3);bottom:calc(var(--u)*24);width:calc(var(--u)*15);height:calc(var(--u)*15);border-radius:50%;border:calc(var(--u)*.4) solid #fff3c0;background:radial-gradient(circle at 35% 30%,#fff2a0,#ffc84a 55%,#e8902a);color:#4b2440;font:900 calc(var(--u)*3) "Microsoft YaHei","PingFang SC",sans-serif;box-shadow:0 0 calc(var(--u)*2) #ffcf5a99;line-height:1.1;cursor:pointer}
#ui button.b-laugh small{display:block;font-size:calc(var(--u)*1.9);font-weight:700}
#ui button.b-laugh:disabled{filter:grayscale(.85) brightness(.75);box-shadow:none}
`;
export function makeLaughUI(stageEl) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const flash = document.createElement('div'); flash.id = 'flashW'; stageEl.appendChild(flash);
  const rain = document.createElement('div'); rain.id = 'hahaRain'; stageEl.appendChild(rain);
  const meme = document.createElement('div'); meme.id = 'memePop'; meme.hidden = true;
  meme.innerHTML = '<div class="rays"></div><img src="assets/img/naiwa-belly-laugh.gif" alt="奶蛙捧腹大笑"><b>捧腹大笑！</b>';
  const label = meme.querySelector('b');
  stageEl.appendChild(meme);
  return {
    showMeme(text) { if (text) label.textContent = text; meme.hidden = false; },
    hideMeme() { meme.hidden = true; },
    flash() { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); },
    rain(n = 6) {
      for (let i = 0; i < n && rain.childElementCount < 40; i++) {
        const s = document.createElement('span');
        s.textContent = pick(['哈', '哈', '哈哈', '哈哈哈', '咳', 'HA']);
        s.style.left = `${Math.random() * 92}%`; s.style.color = pick(HAHA_COLORS);
        s.style.fontSize = `calc(var(--u) * ${4 + Math.random() * 6})`; s.style.animationDuration = `${1.3 + Math.random() * 1.1}s`;
        s.style.setProperty('--spin', `${(Math.random() - .5) * 80}deg`);
        s.addEventListener('animationend', () => s.remove());
        rain.appendChild(s);
      }
    },
    clear() { meme.hidden = true; rain.replaceChildren(); },
  };
}

// ---------- 大奶蛙：模型本身就是捧腹大笑的造型，用骨骼让它笑得前仰后合 ----------
// 返回的 group 在这个游戏的约定里正面朝 +Z（rotation.y = atan2(dx, dz)）
export async function loadBigFrog(url = 'assets/models/bigfrog.glb', height = 2.5) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), s = height / size.y;
  model.scale.setScalar(s); model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      m.side = THREE.DoubleSide; m.transparent = false; m.depthWrite = true;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if ('roughness' in m) m.roughness = Math.max(.5, m.roughness ?? .8);
      if ('metalness' in m) m.metalness = Math.min(.2, m.metalness ?? 0);
    }
  });
  const spin = new THREE.Group(); spin.rotation.y = -Math.PI / 2; spin.add(model);   // 模型原生朝 +X，转成朝 +Z
  const inner = new THREE.Group(); inner.add(spin);
  const group = new THREE.Group(); group.add(inner); group.visible = false;
  const rig = new Rig(model, spin);   // spin 里面是模型自己的坐标系：+X 前、+Y 上、+Z 右
  return { group, inner, rig };
}
// laugh 0~1：笑得多夸张。头往后仰、胸口一抖一抖、手在肚子上拍
export function bigFrogPose(rig, t, laugh) {
  const a = Math.sin(t * 15), b = Math.sin(t * 15 + 1.2);
  rig.begin();
  rig.turn('Pelvis', 'z', laugh * a * .04);
  rig.turn('Chest', 'z', laugh * (.12 + a * .07)).turn('Chest', 'x', laugh * Math.sin(t * 7) * .06);
  rig.turn('Head', 'z', laugh * (.3 + b * .15)).turn('Head', 'x', laugh * Math.sin(t * 5) * .08);
  rig.turn('UpperArm.L', 'z', laugh * a * .06).turn('UpperArm.R', 'z', laugh * b * .06);
}
