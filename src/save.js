// 存档：存在这台手机（这个浏览器）里，每个玩家各有一份自己的"游戏记忆"，不用注册账号。
// 记什么：名字、玩了几次、每个故事打到了第几幕（以及那一幕开头的等级和技能，好"继续"）、
// 看过的名画和插图、见过的结局、在对话里选过的情话、最好成绩。
const KEY = 'nai-save-v1';

function defaults() {
  return {
    name: '', plays: 0, created: Date.now(),
    rj: { reached: 1, snaps: {} },        // 第一部 罗密欧与朱丽叶：第 1 到 4 幕
    tp: { reached: 5, snaps: {} },        // 第二部 暴风雨：从第 5 幕算起
    paintings: [], cgs: [], endings: [], choices: [],
    best: { kills: 0, level: 1 },
  };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d) return defaults();
    const base = defaults();
    return { ...base, ...d, rj: { ...base.rj, ...d.rj }, tp: { ...base.tp, ...d.tp }, best: { ...base.best, ...d.best } };
  } catch { return defaults(); }
}

export const save = load();
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {} }
export function unlock(list, id) {
  if (id == null || save[list].includes(id)) return false;
  save[list].push(id); persist(); return true;
}
export function recordChoice(question, text, skill) {
  save.choices.push({ q: question, a: text, skill, t: Date.now() });
  if (save.choices.length > 24) save.choices.splice(0, save.choices.length - 24);
  persist();
}
export function recordBest(kills, level) {
  save.best.kills = Math.max(save.best.kills, kills); save.best.level = Math.max(save.best.level, level); persist();
}
export function resetSave() { localStorage.removeItem(KEY); Object.assign(save, defaults()); }
