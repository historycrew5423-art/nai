// 把几张图拼成一张小图，方便一次看完。输出的宽高都控制在 2000 像素以内。
// 用法：node tools/contact-sheet.mjs <输出.png> <每格边长> <每行几张> <图1> <图2> ...
import sharp from 'sharp';

const [out, cellArg, colsArg, ...files] = process.argv.slice(2);
let cell = +cellArg || 400;
const cols = +colsArg || 3;
const rows = Math.ceil(files.length / cols);
cell = Math.min(cell, Math.floor(2000 / cols), Math.floor(2000 / rows));
const tiles = await Promise.all(files.map((f) => sharp(f).resize(cell, cell, { fit: 'contain', background: '#ffffff' }).toBuffer()));
await sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#ffffff' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * cell })))
  .png().toFile(out);
console.log(`${out}: ${cols * cell}x${rows * cell}`);
