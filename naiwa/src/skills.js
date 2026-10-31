// 技能：升级时三选一。名字按音乐起，效果对应 docs/成长和技能.md 里的设计。
// 每个技能有 max 级；apply(s, lv) 在拿到第 lv 级时修改主角的数值 s。

export const SKILLS = [
  { id: 'chord', name: '和弦', kind: 'shot', max: 3,
    desc: ['一次射出 2 个音符', '一次射出 3 个音符', '一次射出 5 个音符'],
    apply(s, lv) { s.projectiles = [1, 2, 3, 5][lv]; } },
  { id: 'echo', name: '回声', kind: 'shot', max: 3,
    desc: ['身后也射出音符', '左右两边也射出音符', '回声的音符也会分叉'],
    apply(s, lv) { s.echo = lv; } },
  { id: 'sustain', name: '长音', kind: 'shot', max: 3,
    desc: ['音符能穿过 2 只怪', '能穿过 4 只怪', '穿过所有怪'],
    apply(s, lv) { s.pierce = [0, 2, 4, 99][lv]; } },
  { id: 'forte', name: '强音', kind: 'shot', max: 3,
    desc: ['音符变大、伤害 ×1.4，能把怪撞退', '再大一圈、伤害 ×1.8', '巨大的音符、伤害 ×2.3'],
    apply(s, lv) { s.size = [1, 1.4, 1.8, 2.2][lv]; s.dmgMul = [1, 1.4, 1.8, 2.3][lv]; s.knock = [0, 3, 4.5, 6][lv]; s.rateMul *= 0.92; } },
  { id: 'arpeggio', name: '琶音', kind: 'shot', max: 3,
    desc: ['打中后弹向旁边的怪 1 次', '弹 2 次', '弹 3 次'],
    apply(s, lv) { s.bounce = lv; } },
  { id: 'presto', name: '急板', kind: 'shot', max: 3,
    desc: ['弹得更快：射速 +25%', '射速再 +25%', '射速再 +25%'],
    apply(s) { s.rateMul *= 1.25; } },
  { id: 'drum', name: '低音鼓', kind: 'aura', max: 3,
    desc: ['每 4 秒震地一次，掀开身边的怪', '震得更远、更快（3.3 秒）', '震得最远、最快（2.6 秒）'],
    apply(s, lv) { s.drum = lv; } },
  { id: 'orbit', name: '环绕声', kind: 'aura', max: 3,
    desc: ['2 个音符绕着你转', '3 个音符绕着你转', '4 个音符，转得更快'],
    apply(s, lv) { s.orbit = lv; } },
  { id: 'stride', name: '轻快', kind: 'body', max: 2,
    desc: ['走得更快：移动 +15%', '再 +15%'],
    apply(s) { s.speedMul *= 1.15; } },
  { id: 'hymn', name: '颂歌', kind: 'body', max: 3,
    desc: ['生命上限 +25，回满一半血', '生命上限再 +25，回一半血', '生命上限再 +25，回一半血'],
    apply(s) { s.maxHpBonus += 25; s.healNow = 0.5; } },
];

export const byId = Object.fromEntries(SKILLS.map((k) => [k.id, k]));

// 抽三张卡。前几级多给"改音符"的技能，简单好懂；后面三类都出。
export function drawCards(levels, playerLevel, rng = Math.random) {
  const avail = SKILLS.filter((k) => (levels[k.id] || 0) < k.max);
  const weight = (k) => {
    let w = 1;
    if (playerLevel <= 3) w = k.kind === 'shot' ? 3 : 0.6;
    if (levels[k.id]) w *= 1.4; // 已经有的技能更容易再出，方便叠满
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

export function baseStats() {
  return { projectiles: 1, echo: 0, pierce: 0, size: 1, dmgMul: 1, knock: 0, bounce: 0, rateMul: 1,
    drum: 0, orbit: 0, speedMul: 1, maxHpBonus: 0, healNow: 0 };
}
