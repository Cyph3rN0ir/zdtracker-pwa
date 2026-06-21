/**
 * Generates minimal valid PNG icons for PWA from pure JavaScript.
 * No external dependencies required.
 *
 * Usage: node generate-icons.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { deflateSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPNG(width, height, drawFn) {
  // Create raw RGBA pixel data
  const pixels = new Uint8Array(width * height * 4);

  // Fill background with #111111
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4 + 0] = 0x11; // R
    pixels[i * 4 + 1] = 0x11; // G
    pixels[i * 4 + 2] = 0x11; // B
    pixels[i * 4 + 3] = 0xff; // A
  }

  // Call the draw function
  drawFn(pixels, width, height);

  // Create scanlines with filter byte (0 = None)
  const rawData = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter type: None
    rawData.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1
    );
  }

  // Compress
  const compressed = deflateSync(Buffer.from(rawData));

  // Build PNG
  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk("IHDR", ihdr));

  // IDAT
  chunks.push(makeChunk("IDAT", compressed));

  // IEND
  chunks.push(makeChunk("IEND", Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeBytes, Buffer.from(data), crcVal]);
}

// Helper: set pixel with alpha blending
function setPixel(pixels, w, h, x, y, r, g, b, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = (y * w + x) * 4;
  const alpha = a / 255;
  pixels[idx + 0] = Math.round(pixels[idx + 0] * (1 - alpha) + r * alpha);
  pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - alpha) + g * alpha);
  pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - alpha) + b * alpha);
  pixels[idx + 3] = Math.min(255, pixels[idx + 3] + a);
}

// Bresenham thick line
function drawLine(pixels, w, h, x0, y0, x1, y1, r, g, b, thickness = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const half = Math.floor(thickness / 2);

  while (true) {
    // Draw a filled circle at each point for thickness
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) {
        if (ox * ox + oy * oy <= half * half + half) {
          setPixel(pixels, w, h, x0 + ox, y0 + oy, r, g, b);
        }
      }
    }
    if (x0 === Math.round(x1) && y0 === Math.round(y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function drawZeroTrackIcon(pixels, w, h) {
  const padding = Math.round(w * 0.2);
  const lineWidth = Math.max(3, Math.round(w * 0.06));

  const left = padding;
  const right = w - padding;
  const top = padding;
  const bottom = h - padding;

  // White "Z" shape
  // Top horizontal
  drawLine(pixels, w, h, left, top, right, top, 255, 255, 255, lineWidth);
  // Diagonal
  drawLine(pixels, w, h, right, top, left, bottom, 255, 255, 255, lineWidth);
  // Bottom horizontal
  drawLine(pixels, w, h, left, bottom, right, bottom, 255, 255, 255, lineWidth);

  // Green chart uptick in the middle
  const chartWidth = Math.max(2, Math.round(w * 0.04));
  const midX = Math.round(w * 0.5);
  const midY = Math.round(h * 0.5);
  const span = Math.round(w * 0.08);
  const dip = Math.round(h * 0.04);
  const peak = Math.round(h * 0.08);

  drawLine(pixels, w, h, midX - span, midY + dip, midX, midY - peak, 74, 222, 128, chartWidth);
  drawLine(pixels, w, h, midX, midY - peak, midX + span, midY + Math.round(dip * 0.5), 74, 222, 128, chartWidth);
}

// Generate icons
const sizes = [192, 512];

for (const size of sizes) {
  const png = createPNG(size, size, drawZeroTrackIcon);
  writeFileSync(join(iconsDir, `icon-${size}x${size}.png`), png);
  console.log(`✓ icon-${size}x${size}.png (${png.length} bytes)`);

  // Maskable variant (same design, same file)
  writeFileSync(join(iconsDir, `icon-maskable-${size}x${size}.png`), png);
  console.log(`✓ icon-maskable-${size}x${size}.png`);
}

console.log("\n✅ All PWA icons generated successfully!");
