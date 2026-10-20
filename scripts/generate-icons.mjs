import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Pure Node PNG generator that renders the Attendly Location Pin + Checkmark icon at any resolution
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function renderAttendlyIcon(size, { maskable = false, foregroundOnly = false, backgroundOnly = false } = {}) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const scale = maskable ? 0.78 : 1.0;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      // Normalized coordinates in [-1, 1]
      const nx = ((x + 0.5) / size - 0.5) * 2;
      const ny = ((y + 0.5) / size - 0.5) * 2;

      const sx = nx / scale;
      const sy = ny / scale;

      // Default background: #16A34A (22, 163, 74)
      let r = 22, g = 163, b = 74, a = 255;

      if (foregroundOnly) {
        r = 0; g = 0; b = 0; a = 0;
      }

      if (!backgroundOnly) {
        // Location pin geometry: top circle centered at (0, -0.14) with radius 0.48,
        // tapering cone down to tip at (0, 0.65)
        const cy = -0.14;
        const pinRadius = 0.46;
        const distTop = Math.hypot(sx, sy - cy);
        const inTopCircle = distTop <= pinRadius;

        // Cone between y = 0.02 and y = 0.64
        const inCone =
          sy >= 0.02 &&
          sy <= 0.64 &&
          Math.abs(sx) <= (0.64 - sy) * 0.72;

        const inTip = Math.hypot(sx, sy - 0.60) <= 0.06;

        if (inTopCircle || inCone || inTip) {
          // White pin body
          r = 255; g = 255; b = 255; a = 255;

          // Inner dark green badge circle (#166534 -> 22, 101, 52)
          if (distTop <= 0.31) {
            r = 22; g = 101; b = 52; a = 255;

            // Crisp white checkmark inside badge
            const d1 = distToSegment(sx, sy, -0.13, -0.13, -0.03, -0.02);
            const d2 = distToSegment(sx, sy, -0.03, -0.02, 0.15, -0.22);
            if (Math.min(d1, d2) <= 0.045) {
              r = 255; g = 255; b = 255; a = 255;
            }
          }
        }
      }

      const idx = rowStart + 1 + x * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync('public', { recursive: true });
fs.mkdirSync('mobile/assets', { recursive: true });

const files = [
  { out: 'public/pwa-192x192.png', size: 192, opts: {} },
  { out: 'public/pwa-512x512.png', size: 512, opts: {} },
  { out: 'public/pwa-maskable-512x512.png', size: 512, opts: { maskable: true } },
  { out: 'public/apple-touch-icon.png', size: 180, opts: {} },
  { out: 'mobile/assets/icon.png', size: 512, opts: {} },
  { out: 'mobile/assets/adaptive-icon-foreground.png', size: 432, opts: { maskable: true, foregroundOnly: true } },
  { out: 'mobile/assets/adaptive-icon-background.png', size: 432, opts: { backgroundOnly: true } },
  { out: 'mobile/assets/splash-icon.png', size: 512, opts: { maskable: true } },
];

for (const f of files) {
  fs.writeFileSync(path.resolve(f.out), renderAttendlyIcon(f.size, f.opts));
}
console.log('Generated Attendly PNG icon assets successfully.');
