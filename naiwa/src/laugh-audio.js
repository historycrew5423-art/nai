// 从“咳哈哈哈哈~”笑声里自动切出一个个“哈”音节，供哈哈波每次发射时播放
// 纯函数：输入单声道采样，输出 [{start, end}]（单位：秒）
export function findSyllables(samples, sampleRate, { frame = .01, minGap = .05, minLength = .07, maxLength = .42, threshold = .35 } = {}) {
  const hop = Math.max(1, Math.round(sampleRate * frame));
  const env = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + hop; j++) sum += samples[j] * samples[j];
    env.push(Math.sqrt(sum / hop));
  }
  if (!env.length) return [];
  const sorted = [...env].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * .95)] || 0;
  if (loud <= 1e-4) return [];
  const on = loud * threshold, off = loud * threshold * .6;
  const segments = [];
  let start = -1, quiet = 0;
  for (let i = 0; i < env.length; i++) {
    if (start < 0) { if (env[i] >= on) { start = i; quiet = 0; } continue; }
    if (env[i] < off) quiet++; else quiet = 0;
    const length = (i - start) * frame;
    if (quiet * frame >= minGap || length >= maxLength) {
      const end = i - quiet + 1;
      if ((end - start) * frame >= minLength) segments.push({ start: start * frame, end: Math.min(env.length, end + 2) * frame });
      start = -1; quiet = 0;
    }
  }
  if (start >= 0 && (env.length - start) * frame >= minLength) segments.push({ start: start * frame, end: env.length * frame });
  return segments;
}
