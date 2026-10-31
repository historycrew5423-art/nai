// 梗的节奏（循序渐进）：梗太密会审美疲劳，所以
//   1. 第一幕一开始只有“哈”和一种小怪，新的小怪、新的喷字隔几秒才“上新”一个，每个新梗第一次出现时一定会叫、会喊；
//   2. 之后同一类梗按“热度”限次数：刚开打时很克制（小怪约 6 秒叫一声），越往后、连杀越多、Boss 在场时越热闹（最密约 3 秒一声）；
//   3. 大招（捧腹大笑、肥嘟嘟）放的时候和放完之后安静几秒，只留“哈”和小音效，让下一个梗重新好笑。
// 这里只管“这一刻能不能出声”，具体放什么声音在 sfx.js，什么时候调用在 game.js。要调手感，只改 PACE 里的数字。
export const PACE = {
  // 第一幕：每种小怪从第几秒开始出现（后面几幕全都有）
  kindsAt: { dog: 0, penguin: 7, banana: 18, oiia: 28 },
  // 第一幕：特殊字从第几秒开始出现（下标是 naiwa.js 里 HAHA_GLYPHS 的位置：2 嘎、3 跌、4 塞、5 水、6 噗）
  wordsAt: { 2: 6, 3: 14, 4: 22, 5: 30, 6: 37 },
  mobGap: [4.5, 2.6],     // 小怪叫声：两次之间隔几秒（最冷 → 最热），实际再乘 0.75~1.3 的随机数；同一种怪连着叫要再多等一半
  lineGap: [14, 7],       // 主角的口头禅（喷特殊字时喊）：两句之间隔几秒（最冷 → 最热）
  dodgeLineGap: 14,       // “闪身步”原声：两次之间至少隔几秒（其他时候只有“嗖”）
  firstGap: 1.2,          // 新梗第一次出现：不看上面的间隔，但离上一声小怪叫至少隔这么久
  quietAfterLaugh: 2.5,   // 捧腹大笑结束后安静几秒
  quietAfterFat: 2.0,     // 肥嘟嘟喊完后安静几秒
  quietAfterBoss: 2.0,    // Boss 登场喊话后安静几秒
};

const lerp = (a, b, k) => a + (b - a) * k;

export class Pacing {
  constructor() { this.reset(); }
  reset() {
    this.quietUntil = 0; this.nextMob = 0; this.lastMob = -99; this.lastMobKind = ''; this.nextLine = 0; this.nextDodgeLine = 0;
    this.firstDeath = new Set(); this.firstWord = new Set(); this.events = [];
  }
  // 热度 0~1：第一幕从冷慢慢变热；后面几幕一开始就有点热；Boss 在场、连杀多时更热
  heat(act, actTime, combo, boss) {
    let h = act === 1 ? Math.min(1, Math.max(0, (actTime - 3) / 40)) : 0.35 + Math.min(0.45, actTime / 90);
    if (boss) h += 0.2;
    h += Math.min(0.15, combo / 200);
    return Math.min(1, h);
  }
  // 第一幕到第几秒为止，解锁了哪些小怪、哪些特殊字
  kindOpen(kind, act, actTime) { return act > 1 || actTime >= (PACE.kindsAt[kind] ?? 0); }
  wordOpen(g, act, actTime) { return act > 1 || actTime >= (PACE.wordsAt[g] ?? 0); }
  // 大招期间和之后：安静 sec 秒（小怪不叫、主角不喊口头禅，“哈”和小音效照常）
  quiet(now, sec) { this.quietUntil = Math.max(this.quietUntil, now + sec); }
  isQuiet(now) { return now < this.quietUntil; }
  // 小怪能不能叫：first = 新梗第一次出现（第一次登场、这种怪第一次被打倒）
  mobOk(now, kind, first) {
    if (now < this.quietUntil) return false;
    if (first) return now - this.lastMob >= (kind === this.lastMobKind ? 3 : PACE.firstGap);   // 同一种怪的登场和第一次被打倒，至少隔 3 秒
    if (now < this.nextMob) return false;
    if (kind === this.lastMobKind && now < this.nextMob + (this.nextMob - this.lastMob) * 0.5) return false;   // 换着种类叫，不重复
    return true;
  }
  mobPlayed(now, kind, heat, what) {
    this.lastMob = now; this.lastMobKind = kind;
    this.nextMob = now + lerp(PACE.mobGap[0], PACE.mobGap[1], heat) * (0.75 + Math.random() * 0.55);
    this.log(now, what);
  }
  // 主角的口头禅能不能喊：first = 这个字第一次喷出来
  lineOk(now, first) { return now >= this.quietUntil && (first || now >= this.nextLine); }
  linePlayed(now, heat, what) { this.nextLine = now + lerp(PACE.lineGap[0], PACE.lineGap[1], heat) * (0.8 + Math.random() * 0.45); this.log(now, what); }
  dodgeLineOk(now) { return now >= this.nextDodgeLine && now >= this.quietUntil; }
  dodgeLinePlayed(now) { this.nextDodgeLine = now + PACE.dodgeLineGap * (0.9 + Math.random() * 0.3); this.log(now, '闪身步'); }
  // 记一笔给自动测试看（window.__gags）：[时间, 什么梗]
  log(now, what) { this.events.push([+now.toFixed(1), what]); if (this.events.length > 300) this.events.shift(); }
}
