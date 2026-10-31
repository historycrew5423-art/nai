// 技能（10-31 第 55 轮重做）：两类卡。
// "唱法"＝武器，每种打法完全不同，最多 4 种（情歌一开始就有）；"心情"＝被动加成，最多 4 种。
// 一种唱法练满 + 对应的心情至少 1 级，再开一个宝箱，就"进化"成超级唱法（配方写在卡上）。
// 每幕前半段怪少但耐打，"热恋"（伤害）最划算；后半段怪潮，范围、穿透、弹射最划算（卡上标"现在推荐"）。
// apply(s, lv) 在拿到第 lv 级时修改主角的数值 s。

export const SONG_SLOTS = 4, MOOD_SLOTS = 4;

export const SKILLS = [
  // ---- 唱法 ----
  { id: 'love', name: '情歌', kind: 'song', max: 5, evo: 'aria', with: 'forte', tag: 'single',
    desc: ['朝走路的方向唱，音符会拐弯追上前面的怪', '一次 2 个音符', '一次 3 个音符', '唱得更快 +20%', '一次 5 个音符'],
    apply(s, lv) { s.projectiles = [1, 1, 2, 3, 3, 5][lv]; if (lv === 4) s.rateMul *= 1.2; } },
  { id: 'echo', name: '回声', kind: 'song', max: 3, evo: 'choir', with: 'presto', tag: 'crowd',
    desc: ['身后也唱：背后的怪也打得到', '左右两边也唱', '每个方向都多一个音符'],
    apply(s, lv) { s.echo = lv; } },
  { id: 'orbit', name: '环绕声', kind: 'song', max: 3, evo: 'wreath', with: 'width', tag: 'crowd',
    desc: ['2 个音符绕着你转，碰到的怪都会疼', '3 个音符', '4 个音符，转得更快'],
    apply(s, lv) { s.orbit = lv; } },
  { id: 'drum', name: '低音鼓', kind: 'song', max: 3, evo: 'heartbeat', with: 'hymn', tag: 'crowd',
    desc: ['每 4 秒震地一次，掀开身边一圈怪', '震得更远、更快（3.3 秒）', '震得最远、最快（2.6 秒）'],
    apply(s, lv) { s.drum = lv; } },
  { id: 'arpeggio', name: '颤音', kind: 'song', max: 3, evo: 'lightning', with: 'sustain', tag: 'crowd',
    desc: ['打中后弹向旁边的怪 1 次', '弹 2 次', '弹 3 次'],
    apply(s, lv) { s.bounce = lv; } },
  { id: 'rose', name: '抛玫瑰', kind: 'song', max: 3, evo: 'petals', with: 'stride', tag: 'crowd',
    desc: ['每 2.4 秒朝怪群扔一朵玫瑰，落地炸开', '一次扔 2 朵', '一次扔 3 朵，炸得更大'],
    apply(s, lv) { s.rose = lv; } },
  // ---- 心情 ----
  { id: 'forte', name: '热恋', kind: 'mood', max: 3, tag: 'single',
    desc: ['伤害 ×1.35（怪少又硬的时候最划算）', '伤害再 ×1.35', '伤害再 ×1.35'],
    apply(s) { s.dmgMul *= 1.35; s.size *= 1.12; } },
  { id: 'presto', name: '心跳', kind: 'mood', max: 3, tag: 'any',
    desc: ['唱得更快 +22%', '再 +22%', '再 +22%'],
    apply(s) { s.rateMul *= 1.22; } },
  { id: 'sustain', name: '执着', kind: 'mood', max: 3, tag: 'crowd',
    desc: ['音符能穿过 2 只怪', '穿过 4 只', '穿过所有怪'],
    apply(s, lv) { s.pierce = [0, 2, 4, 99][lv]; } },
  { id: 'width', name: '深情', kind: 'mood', max: 3, tag: 'crowd',
    desc: ['音符、鼓点、玫瑰的范围 +25%', '再 +25%', '再 +25%'],
    apply(s) { s.area *= 1.25; s.size *= 1.12; } },
  { id: 'stride', name: '思念', kind: 'mood', max: 3, tag: 'any',
    desc: ['萤火捡得更远，走得快 8%', '再远一点、再快 8%', '再远一点、再快 8%'],
    apply(s) { s.reach += 0.9; s.speedMul *= 1.08; } },
  { id: 'hymn', name: '勇气', kind: 'mood', max: 3, tag: 'any',
    desc: ['生命上限 +20，回满一半血', '再 +20，回一半血', '再 +20，回一半血'],
    apply(s) { s.maxHpBonus += 20; s.healNow = 0.5; } },
];

// 进化：开宝箱时满足条件就出这张卡
export const EVOS = {
  aria: { id: 'aria', from: 'love', name: '咏叹调', desc: '情歌变成巨大的音符，穿过所有怪，伤害 ×1.6' },
  choir: { id: 'choir', from: 'echo', name: '合唱团', desc: '八个方向一起唱，伴舞唱得快一倍' },
  wreath: { id: 'wreath', from: 'orbit', name: '玫瑰花环', desc: '6 个音符绕着你转，圈更大，伤害 ×2' },
  heartbeat: { id: 'heartbeat', from: 'drum', name: '心跳鼓', desc: '每 1.8 秒震一次，震得很远，每次回 2 点血' },
  lightning: { id: 'lightning', from: 'arpeggio', name: '相思雷', desc: '打中后连着弹 7 次' },
  petals: { id: 'petals', from: 'rose', name: '花雨', desc: '一次扔 6 朵玫瑰，炸得更大' },
};

export const byId = Object.fromEntries(SKILLS.map((k) => [k.id, k]));

const owned = (levels, kind) => SKILLS.filter((k) => k.kind === kind && (levels[k.id] || 0) > 0).length;

// 抽三张卡。格子满了就不出新的唱法或心情。phase = 'early'（怪少又硬）或 'late'（怪潮），用来标"现在推荐"
export function drawCards(levels, playerLevel, rng = Math.random, phase = 'early') {
  const songFull = owned(levels, 'song') >= SONG_SLOTS, moodFull = owned(levels, 'mood') >= MOOD_SLOTS;
  const avail = SKILLS.filter((k) => {
    const lv = levels[k.id] || 0;
    if (lv >= k.max) return false;
    if (!lv && k.kind === 'song' && songFull) return false;
    if (!lv && k.kind === 'mood' && moodFull) return false;
    return true;
  });
  const weight = (k) => {
    let w = 1;
    if (levels[k.id]) w *= 1.5;   // 已经有的更容易再出，方便练满
    if (k.tag === (phase === 'early' ? 'single' : 'crowd')) w *= 1.4;
    return w;
  };
  const picks = [];
  const pool = avail.slice();
  while (picks.length < 3 && pool.length) {
    const total = pool.reduce((a, k) => a + weight(k), 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= weight(pool[i]); if (r <= 0) break; }
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}
// 能进化的：唱法满级、对应心情至少 1 级、还没进化过
export function evoReady(levels, evo) {
  return Object.values(EVOS).filter((e) => !evo[e.id] && (levels[e.from] || 0) >= byId[e.from].max && (levels[byId[e.from].with] || 0) >= 1);
}

export function baseStats() {
  return { projectiles: 1, echo: 0, pierce: 0, size: 1, dmgMul: 1, knock: 0, bounce: 0, rateMul: 1,
    drum: 0, orbit: 0, rose: 0, area: 1, reach: 0, speedMul: 1, maxHpBonus: 0, healNow: 0, evo: {} };
}
