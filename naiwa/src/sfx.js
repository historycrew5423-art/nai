// 声音总管：分三条总线，让主角（奶蛙/罗密欧）的声音永远站在最前面，小怪的梗音效一只一只清楚地冒出来。
//   主角总线：喷“哈”、奶龙口头禅、闪身步、捧腹大笑、肥嘟嘟——居中、最响；主角一出声，小怪总线自动压低（闪避压限 ducking）。
//   小怪总线：咕咕嘎嘎、我的刀盾、香蕉猫哭、OIIA——同一时间只放一只（新的更重要才顶掉旧的），两只之间留一点空，
//            按怪在画面左右偏声像，离得远就小声，再削掉一点低频和人声最亮的那段频率，给主角让位置。
//   效果总线：嗖、啵、嘭这些合成的小音效。
//   三条总线最后进一个压缩器兜底，几十只怪一起倒下也不会爆音。
// 音效来源和版权说明见 缝合说明.md。改切哪一段，只改 CLIPS 里的 [文件, 从第几秒开始, 放多长]。
export const CLIPS = {
  // 小怪：attack 打人时叫，death 被打倒时叫
  'penguin.attack': ['assets/audio/gugugaga-1.mp3', 0.04, 1.0],
  'penguin.death': ['assets/audio/gugugaga-2.mp3', 0.14, 1.04],
  'dog.attack': ['assets/audio/daodun.mp3', 0.2, 1.0],
  'dog.death': ['assets/audio/daodun-2.mp3', 0.2, 0.84],
  'banana.attack': ['assets/audio/banana-cry-1.mp3', 0.14, 0.84],
  'banana.death': ['assets/audio/banana-cry-2.mp3', 0.24, 1.04],
  'oiia.attack': ['assets/audio/oiia-1.mp3', 0.46, 1.5],
  'oiia.death': ['assets/audio/oiia-2.mp3', 0.28, 1.48],
  // 主角：奶龙口头禅（喷出特殊字时喊）、闪身步
  'hero.hola': ['assets/audio/nl-hola-gabadie.mp3', 0.12, 0.86],
  'hero.gabadie': ['assets/audio/nl-hola-gabadie.mp3', 1.1, 0.74],
  'hero.gajiaosai': ['assets/audio/nl-gajiaosai.mp3', 0.1, 0.76],
  'hero.shui': ['assets/audio/nl-gagadilashui.mp3', 0.1, 0.96],
  'hero.dupu': ['assets/audio/nl-dupu.mp3', 0.1, 0.8],
  'hero.shanshen': ['assets/audio/shanshenbu.mp3', 0, 0.72],
  // “你的胆子真是肥嘟嘟的”——老外口音（英语声音念中文拼读），后面再跟一声尖一点的“Fay doo doo!”回声
  // 想换成别的录音：直接用同名文件覆盖 assets/audio/feidudu.mp3
  'hero.feidudu': ['assets/audio/feidudu.mp3', 0.08, 2.9],
  'hero.feidudu.echo': ['assets/audio/feidudu-echo.mp3', 0.28, 0.82],
};
const OPTIONAL = new Set(['assets/audio/feidudu-echo.mp3']);

let actx = null, master = null, heroBus = null, mobBus = null, mobDuck = null, sfxBus = null, noiseBuf = null;
const bufs = {};
let loading = null;

export function initMixer(ctx) {
  if (!ctx || master) return;
  actx = ctx;
  master = actx.createDynamicsCompressor();
  master.threshold.value = -14; master.knee.value = 10; master.ratio.value = 3.5; master.attack.value = 0.004; master.release.value = 0.25;
  master.connect(actx.destination);
  heroBus = actx.createGain(); heroBus.gain.value = 1; heroBus.connect(master);
  mobDuck = actx.createGain(); mobDuck.gain.value = 1; mobDuck.connect(master);
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
  const carve = actx.createBiquadFilter(); carve.type = 'peaking'; carve.frequency.value = 2600; carve.Q.value = 0.9; carve.gain.value = -4;
  mobBus = actx.createGain(); mobBus.gain.value = 0.62;
  mobBus.connect(hp).connect(carve).connect(mobDuck);
  sfxBus = actx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  try { const ss = window.speechSynthesis; if (ss) { ss.getVoices(); ss.addEventListener?.('voiceschanged', () => ss.getVoices()); } } catch { /* 不支持朗读 */ }   // 先把朗读声音列表加载好（Chrome 是异步的）
}
export const heroOut = () => heroBus || (actx && actx.destination);
export const sfxOut = () => sfxBus || (actx && actx.destination);

export function loadClips() {
  if (loading || !actx) return loading;
  const urls = [...new Set(Object.values(CLIPS).map(c => c[0]))];
  loading = Promise.all(urls.map(async url => {
    try {
      const res = await fetch(url);
      if (!res.ok) { if (!OPTIONAL.has(url)) console.warn('音效缺失', url); return; }
      bufs[url] = await actx.decodeAudioData(await res.arrayBuffer());
    } catch { if (!OPTIONAL.has(url)) console.warn('音效加载失败', url); }
  }));
  return loading;
}
export const hasClip = (name) => !!(CLIPS[name] && bufs[CLIPS[name][0]]);

// ---------- 小怪压低：主角说话时把小怪总线压到 depth，seconds 秒后慢慢放回来 ----------
let duckUntil = 0, duckDepth = 1;
export function duck(depth = 0.3, seconds = 0.5) {
  if (!mobDuck) return;
  const g = mobDuck.gain, t = actx.currentTime;
  if (t < duckUntil && depth >= duckDepth) { if (t + seconds <= duckUntil) return; depth = duckDepth; }
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
  g.linearRampToValueAtTime(depth, t + 0.03);
  g.setValueAtTime(depth, t + Math.max(0.04, seconds));
  g.linearRampToValueAtTime(1, t + seconds + 0.35);
  duckUntil = t + seconds; duckDepth = depth;
}

// ---------- 主角说话（居中、最响，同时压低小怪） ----------
let heroUntil = 0, heroSrc = null;
export function heroSay(name, { volume = 1, rate = 1, duckTo = 0.22, cut = true } = {}) {
  const clip = CLIPS[name], buf = clip && bufs[clip[0]];
  if (!actx || !buf) return 0;
  const t = actx.currentTime, len = Math.min(clip[2], buf.duration - clip[1]), real = len / rate;
  if (cut && heroSrc && t < heroUntil) { try { heroSrc.stop(t + 0.03); } catch { /* 已经停了 */ } }
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = buf; src.playbackRate.value = rate;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + 0.012);
  g.gain.setValueAtTime(volume, t + Math.max(0.02, real - 0.07)); g.gain.linearRampToValueAtTime(0, t + real);
  src.connect(g).connect(heroBus); src.start(t, clip[1], len);
  heroSrc = src; heroUntil = t + real;
  duck(duckTo, real);
  return real;
}
// 主角正在喊口头禅：这时候不放“哈”，免得两句话叠在一起
export const heroBusy = () => !!actx && actx.currentTime < heroUntil;
// 主角在放别的长声音（笑声）时，占住主角这条线 sec 秒
export function holdHero(sec) { if (actx) heroUntil = Math.max(heroUntil, actx.currentTime + sec); }

// ---------- 小怪叫：同一时间只叫一只 ----------
// priority：1 攻击、2 被打倒、3 第一次登场。更重要的才能顶掉正在叫的那只
let mobUntil = 0, mobPri = 0, mobSrc = null, mobGain = null;
const kindAt = {};
export function mobSay(kind, ev, { pan = 0, dist = 0, rate = 1, priority = ev === 'death' ? 2 : 1 } = {}) {
  const clip = CLIPS[kind + '.' + ev], buf = clip && bufs[clip[0]];
  if (!actx || !buf) return false;
  const t = actx.currentTime;
  if (ev === 'attack' && t - (kindAt[kind] || -9) < 2.2) return false;   // 同一种怪打人时最多 2.2 秒叫一次
  if (t < mobUntil) {
    if (priority <= mobPri) return false;
    try { mobGain.gain.setTargetAtTime(0, t, 0.015); mobSrc.stop(t + 0.07); } catch { /* 已经停了 */ }
  } else if (t < mobUntil + 0.12 && priority < 3) return false;   // 两只之间留 0.12 秒空，一句一句听得清
  const r = rate * (0.96 + Math.random() * 0.08), len = Math.min(clip[2], buf.duration - clip[1]), real = len / r;
  const vol = (ev === 'attack' ? 0.6 : 0.95) * Math.max(0.45, Math.min(1, 1.15 - dist / 16));
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = buf; src.playbackRate.value = r;
  g.gain.setValueAtTime(0, t + 0.06); g.gain.linearRampToValueAtTime(vol, t + 0.075);
  g.gain.setValueAtTime(vol, t + 0.06 + Math.max(0.02, real - 0.08)); g.gain.linearRampToValueAtTime(0, t + 0.06 + real);
  let tail = g;
  if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = Math.max(-0.85, Math.min(0.85, pan)); g.connect(p); tail = p; }
  src.connect(g); tail.connect(mobBus); src.start(t + 0.06, clip[1], len);
  mobSrc = src; mobGain = g; mobUntil = t + 0.06 + real; mobPri = priority; kindAt[kind] = t;
  return true;
}

// ---------- 合成的小音效（效果总线） ----------
function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
// 嗖：闪身步、冲刺
export function whoosh(volume = 0.5) {
  if (!actx || !noiseBuf) return;
  const t = actx.currentTime, src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.6;
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
  env(g, t, volume, 0.04, 0.22);
  src.connect(f).connect(g).connect(sfxBus); src.start(t, 0, 0.3);
}
// 啵：肥嘟嘟吹胀的怪爆掉
export function pop(pitch = 1, volume = 0.35, when = 0) {
  if (!actx) return;
  const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(900 * pitch, t); o.frequency.exponentialRampToValueAtTime(180 * pitch, t + 0.09);
  env(g, t, volume, 0.004, 0.1);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.14);
}
// 啵嘤：怪被吹胀时的卡通弹簧声
export function boing(volume = 0.3) {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), lfo = actx.createOscillator(), lg = actx.createGain(), g = actx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.5);
  lfo.frequency.value = 14; lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
  env(g, t, volume, 0.02, 0.6);
  o.connect(g).connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
}
// 嘭：“塞”字炸开
export function boom(volume = 0.45) {
  if (!actx || !noiseBuf) return;
  const t = actx.currentTime, src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.3);
  env(g, t, volume, 0.005, 0.32);
  src.connect(f).connect(g).connect(sfxBus); src.start(t, 0, 0.4);
}
// 简单的电子音（原来的弹琴声、升级提示音）
export function tone(freq, volume = 0.05, dur = 0.35, type = 'triangle') {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur);
}

// ---------- 浏览器朗读（备用：肥嘟嘟的录音没加载上时，用英语声音念拼读，一样是老外口音） ----------
// lang：用哪种语言的声音；prefer：优先挑名字里带这些字的声音（比如男声）
export function speak(text, { lang = 'en-US', rate = 1, pitch = 1, volume = 1, prefer = /Guy|Christopher|Andrew|Eric|David|Mark|Male/i } = {}) {
  try {
    const ss = window.speechSynthesis; if (!ss) return 0;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate; u.pitch = pitch; u.volume = volume;
    const vs = ss.getVoices(), base = lang.slice(0, 2).toLowerCase();
    const same = vs.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(base));
    const v = same.find(v => v.lang.replace('_', '-') === lang && prefer.test(v.name)) || same.find(v => prefer.test(v.name)) || same.find(v => v.lang.replace('_', '-') === lang) || same[0];
    if (v) u.voice = v;
    ss.speak(u);
    const sec = text.length * 0.075 / rate + 0.4;
    duck(0.15, sec);
    if (actx) heroUntil = actx.currentTime + sec;   // 朗读期间算主角在说话：不放“哈”和口头禅，免得盖住
    return sec;
  } catch { return 0; }
}
export function stopSpeak() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* 不支持朗读 */ } }
