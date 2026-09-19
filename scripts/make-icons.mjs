/**
 * Generates the home screen icons.
 *
 * iOS needs a real PNG to put on the Home Screen. Without one it screenshots the
 * page, and an empty `icons` array in the manifest can stop the manifest being
 * treated as installable at all, which is what leaves the browser bars on screen.
 *
 * Written by hand rather than pulled from a library: it is a few rectangles, and
 * a build that needs no extra dependency is one less thing to break.
 *
 * Usage: node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const TEAL = [14, 118, 124];
const PAPER = [244, 244, 240];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Inside a rectangle with rounded corners? */
function inRounded(x, y, left, top, right, bottom, r) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = x < left + r ? left + r : x > right - r ? right - r : x;
  const cy = y < top + r ? top + r : y > bottom - r ? bottom - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => v * size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      let colour = null;

      // Teal rounded-square ground. iOS masks the corners itself, but rounding
      // here keeps it tidy anywhere else the icon is shown.
      if (inRounded(x, y, 0, 0, size - 1, size - 1, s(0.18))) colour = TEAL;

      // A speech bubble: the app says things out loud.
      if (
        colour &&
        inRounded(x, y, s(0.2), s(0.22), s(0.8), s(0.64), s(0.1))
      ) {
        colour = PAPER;
      }
      // The bubble's tail.
      if (colour && y > s(0.6) && y < s(0.8)) {
        const width = s(0.16) * (1 - (y - s(0.6)) / s(0.2));
        if (x > s(0.3) && x < s(0.3) + width) colour = PAPER;
      }

      // Three dots inside the bubble, the universal "talking" mark.
      if (colour === PAPER) {
        for (const cx of [0.36, 0.5, 0.64]) {
          if ((x - s(cx)) ** 2 + (y - s(0.43)) ** 2 <= s(0.055) ** 2) colour = TEAL;
        }
      }

      if (colour) {
        px[i] = colour[0];
        px[i + 1] = colour[1];
        px[i + 2] = colour[2];
        px[i + 3] = 255;
      }
    }
  }
  return png(size, px);
}

const dir = path.join(process.cwd(), 'public');
mkdirSync(dir, { recursive: true });

for (const size of [180, 192, 512]) {
  const file = path.join(dir, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log(`wrote public/icon-${size}.png`);
}
