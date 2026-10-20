import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

// Extract the 32 painted poses by their opaque connected silhouettes. The
// generator's layout is approximate; packing by grid coordinates would clip ears.
const source = 'design/fox/motion/fox-motion-source-v1.png';
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const seen = new Uint8Array(info.width * info.height);
const subjects = [];
for (let p = 0; p < seen.length; p++) {
  if (seen[p] || data[p * 4 + 3] < 100) continue;
  const queue = [p];
  seen[p] = 1;
  let count = 0, left = info.width, top = info.height, right = 0, bottom = 0;
  while (queue.length) {
    const a = queue.pop(), x = a % info.width, y = Math.floor(a / info.width);
    count++;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    for (const b of [x > 0 ? a - 1 : -1, x + 1 < info.width ? a + 1 : -1, a - info.width, a + info.width]) {
      if (b < 0 || b >= seen.length || seen[b] || data[b * 4 + 3] < 100) continue;
      seen[b] = 1; queue.push(b);
    }
  }
  if (count > 1500) subjects.push({ left, top, right, bottom });
}
if (subjects.length !== 32) throw new Error(`Expected 32 foxes, found ${subjects.length}`);
const rows = [[], [], [], []];
for (const s of subjects) rows[s.top < 240 ? 0 : s.top < 490 ? 1 : s.top < 685 ? 2 : 3].push(s);
for (const row of rows) {
  row.sort((a, b) => a.left - b.left);
  if (row.length !== 8) throw new Error('Unexpected source row layout');
}
const ordered = rows.flat();
const cell = 320, scale = 1.08, ground = 288, rightEdge = 286;
const frames = await Promise.all(ordered.map(async (s) => {
  const left = Math.max(0, s.left - 2), top = Math.max(0, s.top - 2);
  const width = Math.min(info.width - left, s.right - left + 3);
  const height = Math.min(info.height - top, s.bottom - top + 3);
  const outputWidth = Math.round(width * scale), outputHeight = Math.round(height * scale);
  const cutout = await sharp(source).extract({ left, top, width, height }).resize(outputWidth, outputHeight).png().toBuffer();
  return sharp({ create: { width: cell, height: cell, channels: 4, background: '#00000000' } })
    .composite([{ input: cutout, left: rightEdge - outputWidth, top: ground - outputHeight }]).png().toBuffer();
}));
// Reuse canonical endpoint pixels at every join. Wake-up ends with a gentle
// lowering of the head instead of the source sheet's alternating high/low poses.
const order = [0,1,2,3,4,5,6,7, 7,9,10,11,12,13,15,0, 0,17,18,19,20,21,22,23, 23,25,26,27,28,30,29,0];
await mkdir('src/assets/fox/motion', { recursive: true });
const atlas = await sharp({ create: { width: cell * 8, height: cell * 4, channels: 4, background: '#00000000' } })
  .composite(order.map((id, i) => ({ input: frames[id], left: i % 8 * cell, top: Math.floor(i / 8) * cell })))
  .webp({ quality: 90, alphaQuality: 100 }).toBuffer();
await writeFile('src/assets/fox/motion/fox-motion-v1.webp', atlas);
await sharp(atlas).flatten({ background: '#f7f5f0' }).png().toFile('design/fox/motion/fox-motion-contact-v1.png');
await writeFile('design/fox/motion/frames-v1.json', JSON.stringify({ source, cell, columns: 8, rows: 4, ground, order, bounds: ordered }, null, 2) + '\n');
console.log(`Packed 32 frames, ${(atlas.length / 1024).toFixed(0)} KiB, canonical joins shared.`);
