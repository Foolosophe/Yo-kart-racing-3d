// Generate a simple 1024x1024 PNG icon for Tauri
const { createCanvas } = (() => {
  try { return require('canvas'); } catch(e) { return { createCanvas: null }; }
})();

const fs = require('fs');
const path = require('path');

// Create a minimal valid 32x32 PNG manually (no dependencies needed)
function createMinimalPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw image data
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter none
    for (let x = 0; x < width; x++) {
      // Simple gradient kart icon
      const cx = width / 2, cy = height / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = width / 2;

      if (dist < maxDist * 0.85) {
        // Inside circle - gradient
        const t = dist / (maxDist * 0.85);
        rawData.push(Math.round(r * (1 - t * 0.3)));
        rawData.push(Math.round(g * (1 - t * 0.3)));
        rawData.push(Math.round(b * (1 - t * 0.3)));
      } else if (dist < maxDist * 0.95) {
        // Border
        rawData.push(255);
        rawData.push(255);
        rawData.push(255);
      } else {
        // Outside - dark
        rawData.push(30);
        rawData.push(30);
        rawData.push(40);
      }
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend)
  ]);
}

// Generate a 1024x1024 icon
const icon = createMinimalPNG(1024, 1024, 0, 180, 255); // Blue kart theme
const outPath = path.join(__dirname, 'app-icon.png');
fs.writeFileSync(outPath, icon);
console.log(`Icon generated: ${outPath} (${icon.length} bytes)`);
