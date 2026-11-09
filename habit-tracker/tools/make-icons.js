// Draws icon-192.png and icon-512.png (same design as icon.svg) with no packages.
// Run: node tools/make-icons.js
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Colour of one point in the 512x512 design, or null if transparent.
function sample(x, y) {
  const r = 112;
  const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r);
  if (Math.hypot(x - cx, y - cy) > r) return null;
  const bg = [15, 17, 21];
  if (Math.hypot(x - 256, y - 256) > 170) return bg;
  const d = Math.min(segDist(x, y, 170, 262, 232, 322), segDist(x, y, 232, 322, 346, 196));
  if (d <= 22) return bg;
  const t = Math.max(0, Math.min(1, (x + y - 172) / 680));
  return [Math.round(34 + (20 - 34) * t), Math.round(197 + (184 - 197) * t), Math.round(94 + (166 - 94) * t)];
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4, scale = 512 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = sample((x + (sx + 0.5) / ss) * scale, (y + (sy + 0.5) / ss) * scale);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const i = (y * size + x) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = Math.round(a / (ss * ss) * 255);
    }
  }
  return png(size, buf);
}

const out = path.join(__dirname, "..");
[192, 512].forEach(function (s) {
  fs.writeFileSync(path.join(out, "icon-" + s + ".png"), draw(s));
  console.log("Wrote icon-" + s + ".png");
});
