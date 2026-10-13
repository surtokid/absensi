import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generatePNG(width, height, isMaskable = false) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data with filter byte (0) per scanline
  const stride = width * 4;
  const rawBuf = Buffer.alloc(height * (stride + 1));
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * (isMaskable ? 0.38 : 0.44);

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawBuf[offset++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Gradient background: indigo (#4338ca) to blue-violet (#6366f1)
      const ratio = y / height;
      let r = Math.round(67 + ratio * (79 - 67));
      let g = Math.round(56 + ratio * (70 - 56));
      let b = Math.round(202 + ratio * (241 - 202));
      let a = 255;

      // Inside central circular badge
      if (dist <= radius) {
        // Subtle glow in center
        const glow = Math.max(0, 1 - dist / radius);
        r = Math.min(255, Math.round(r + 30 * glow));
        g = Math.min(255, Math.round(g + 30 * glow));
        b = 255;

        // Draw simplified "Check & ID Card" shape in center (white)
        const innerRatioX = Math.abs(dx) / radius;
        const innerRatioY = Math.abs(dy) / radius;
        // Central icon pattern
        if (
          (innerRatioX < 0.45 && innerRatioY < 0.55 && (Math.abs(dy) > radius * 0.45 || Math.abs(dx) > radius * 0.38)) ||
          (dx > -radius * 0.3 && dx < radius * 0.3 && dy > -radius * 0.15 && dy < -radius * 0.05) ||
          (dx > -radius * 0.25 && dx < 0 && dy > radius * 0.1 && dy < radius * 0.35) ||
          (dx >= 0 && dx < radius * 0.25 && dy > radius * 0.1 && dy < radius * 0.2)
        ) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      rawBuf[offset++] = r;
      rawBuf[offset++] = g;
      rawBuf[offset++] = b;
      rawBuf[offset++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawBuf, { level: 9 });
  const idatChunk = createChunk('IDAT', deflated);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePNG(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePNG(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePNG(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePNG(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePNG(32, 32, false));

console.log('Successfully generated all PWA icons in /public!');
