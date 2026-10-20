import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'design/fox/motion-v2';
const size = 320;
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const canvas = () => sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } });

function bounds(data, width, height, threshold = 220) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < threshold) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Locate actual painted silhouettes, since generated rows are not pixel grids.
function subjects(data, width, height) {
  const seen = new Uint8Array(width * height), result = [];
  for (let p = 0; p < seen.length; p++) {
    if (seen[p] || data[p * 4 + 3] < 220) continue;
    const queue = [p], pixels = []; seen[p] = 1;
    let count = 0, left = width, top = height, right = 0, bottom = 0;
    while (queue.length) {
      const a = queue.pop(), x = a % width, y = Math.floor(a / width);
      pixels.push(a);
      count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const b of [x > 0 ? a - 1 : -1, x + 1 < width ? a + 1 : -1, a - width, a + width]) {
        if (b < 0 || b >= seen.length || seen[b] || data[b * 4 + 3] < 220) continue;
        seen[b] = 1; queue.push(b);
      }
    }
    if (count > 10_000) result.push({ left, top, right, bottom, pixels });
  }
  // The two rows have a clear gap between the bottom of each set of foxes.
  result.sort((a, b) => a.bottom - b.bottom);
  return [...result.slice(0, 3).sort((a, b) => a.left - b.left), ...result.slice(3).sort((a, b) => a.left - b.left)];
}

await mkdir('src/assets/fox/motion', { recursive: true });
const endpoints = {};
const report = { size, endpoints: {}, clips: [] };
for (const pose of ['resting', 'sitting', 'sleeping']) {
  const source = `src/assets/fox/fox-a-${pose}-v1.png`;
  const pixels = await sharp(source).resize(size, size, { fit: 'contain', position: pose === 'sitting' ? 'centre' : 'south', background: '#00000000' }).ensureAlpha().raw().toBuffer();
  const png = await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  endpoints[pose] = { png, bounds: bounds(pixels, size, size) };
  report.endpoints[pose] = { source, rgbaHash: hash(pixels), bounds: endpoints[pose].bounds };
}
const clips = [['rise', 'resting', 'sitting'], ['lie', 'sitting', 'resting'], ['sleep', 'resting', 'sleeping'], ['wake', 'sleeping', 'resting']];
const frames = [];
for (const [id, from, to] of clips) {
  const source = `${folder}/${id}-source.png`;
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const boxes = subjects(data, info.width, info.height);
  if (boxes.length !== 6) throw new Error(`${id}: expected six silhouettes, got ${boxes.length}`);
  const a = endpoints[from].bounds, b = endpoints[to].bounds;
  const alignment = [];
  frames.push(endpoints[from].png);
  for (let i = 0; i < 6; i++) {
    const { pixels, ...box } = boxes[i], t = [0.08, 0.24, 0.42, 0.60, 0.78, 0.94][i];
    // Register silhouettes between the actual endpoint bounds; this removes
    // generator framing drift. Endpoints themselves are never cropped or warped.
    const target = Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, Math.round(a[key] + (b[key] - a[key]) * t)]));
    const cutWidth = box.right - box.left + 1, cutHeight = box.bottom - box.top + 1;
    const mask = new Uint8Array(cutWidth * cutHeight);
    for (const p of pixels) {
      const x = p % info.width - box.left, y = Math.floor(p / info.width) - box.top;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (x + dx >= 0 && x + dx < cutWidth && y + dy >= 0 && y + dy < cutHeight) mask[(y + dy) * cutWidth + x + dx] = 1;
      }
    }
    const extracted = Buffer.alloc(cutWidth * cutHeight * 4);
    for (let y = 0; y < cutHeight; y++) for (let x = 0; x < cutWidth; x++) {
      if (mask[y * cutWidth + x]) data.copy(extracted, (y * cutWidth + x) * 4, ((box.top + y) * info.width + box.left + x) * 4, ((box.top + y) * info.width + box.left + x) * 4 + 4);
    }
    const cut = await sharp(extracted, { raw: { width: cutWidth, height: cutHeight, channels: 4 } })
      .resize(target.width, target.height, { fit: 'fill' }).png().toBuffer();
    frames.push(await canvas().composite([{ input: cut, left: target.left, top: target.top }]).png().toBuffer());
    alignment.push({ source: box, target, progress: t });
  }
  frames.push(endpoints[to].png);
  report.clips.push({ id, from, to, alignment });
}
// Lossless storage keeps the packed endpoint samples bit-identical to their
// correctly sized source images. Runtime also displays the original DOM images
// for these frames, including their existing 640px Astro image optimization.
const packed = Buffer.alloc(size * 8 * size * 4 * 4);
for (let i = 0; i < frames.length; i++) {
  const pixels = await sharp(frames[i]).ensureAlpha().raw().toBuffer();
  for (let y = 0; y < size; y++) pixels.copy(packed, ((Math.floor(i / 8) * size + y) * size * 8 + i % 8 * size) * 4, y * size * 4, (y + 1) * size * 4);
}
const atlas = await sharp(packed, { raw: { width: size * 8, height: size * 4, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
await writeFile('src/assets/fox/motion/fox-motion-v2.webp', atlas);
for (const [row, [, from, to]] of clips.entries()) {
  for (const [col, pose] of [[0, from], [7, to]]) {
    const actual = await sharp(atlas).extract({ left: col * size, top: row * size, width: size, height: size }).ensureAlpha().raw().toBuffer();
    // Fully transparent RGB is immaterial and libwebp is permitted to discard it.
    const expected = await sharp(endpoints[pose].png).ensureAlpha().raw().toBuffer();
    let differences = 0;
    for (let p = 0; p < actual.length; p += 4) {
      if (actual[p + 3] !== expected[p + 3] || (expected[p + 3] > 0 && [0,1,2].some(c => actual[p+c] !== expected[p+c]))) differences++;
    }
    if (differences) throw new Error(`Endpoint ${row}:${col} differs at ${differences} pixels`);
  }
}
report.endpointVerification = 'All 8 endpoint cells match original resized RGBA (ignoring RGB under zero alpha).';
await writeFile(`${folder}/alignment.json`, JSON.stringify(report, null, 2) + '\n');
await sharp(atlas).flatten({ background: '#f7f5f0' }).png().toFile(`${folder}/contact.png`);
console.log(`V2: ${Math.round(atlas.length / 1024)} KiB; all eight endpoint cells verified against original images.`);
