'use strict';

// Unit tests for parseImageDimensions
// Run: node test-parse-image-dims.js
// Exit code 0 = all pass, 1 = failures

const { parseImageDimensions } = require('./server.js');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  FAIL: ${testName}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: PNG (100x200)
// ---------------------------------------------------------------------------
console.log('\nTest 1: PNG (100x200)');
{
  const buf = Buffer.alloc(30);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47;
  buf[4] = 0x0D; buf[5] = 0x0A; buf[6] = 0x1A; buf[7] = 0x0A;
  // IHDR chunk: width at 16 (UInt32BE), height at 20 (UInt32BE)
  buf.writeUInt32BE(100, 16);
  buf.writeUInt32BE(200, 20);
  const result = parseImageDimensions(buf);
  assert(result && result.width === 100 && result.height === 200, 'PNG 100x200 parsed correctly');
}

// ---------------------------------------------------------------------------
// Test 2: JPEG (640x480)
// ---------------------------------------------------------------------------
console.log('\nTest 2: JPEG (640x480)');
{
  const buf = Buffer.alloc(30);
  // SOI marker
  buf[0] = 0xFF; buf[1] = 0xD8;
  // SOF0 marker
  buf[2] = 0xFF; buf[3] = 0xC0;
  // Segment length
  buf.writeUInt16BE(0x0011, 4);
  // Precision
  buf[6] = 0x08;
  // Height at offset 5 (from marker start) = offset 7 in buffer (offset+5 where offset=2)
  buf.writeUInt16BE(480, 7);  // height
  buf.writeUInt16BE(640, 9);  // width
  const result = parseImageDimensions(buf);
  assert(result && result.width === 640 && result.height === 480, 'JPEG 640x480 parsed correctly');
}

// ---------------------------------------------------------------------------
// Test 3: WebP lossy VP8 (320x240)
// ---------------------------------------------------------------------------
console.log('\nTest 3: WebP lossy VP8 (320x240)');
{
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(22, 4); // file size (doesn't matter for parsing)
  buf.write('WEBP', 8);
  buf.write('VP8 ', 12);
  // Width at byte 26, height at byte 28 (UInt16LE)
  buf.writeUInt16LE(320, 26);
  buf.writeUInt16LE(240, 28);
  const result = parseImageDimensions(buf);
  assert(result && result.width === 320 && result.height === 240, 'WebP VP8 320x240 parsed correctly');
}

// ---------------------------------------------------------------------------
// Test 4: WebP lossless VP8L (150x75)
// ---------------------------------------------------------------------------
console.log('\nTest 4: WebP lossless VP8L (150x75)');
{
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8);
  buf.write('VP8L', 12);
  // At byte 21: UInt32LE encoding (width-1) in bits 0-13, (height-1) in bits 14-27
  // 150x75: bits = (150-1) | ((75-1) << 14) = 149 | (74 << 14) = 149 | 1212416 = 1212565
  buf.writeUInt32LE(1212565, 21);
  const result = parseImageDimensions(buf);
  assert(result && result.width === 150 && result.height === 75, 'WebP VP8L 150x75 parsed correctly');
}

// ---------------------------------------------------------------------------
// Test 5: WebP extended VP8X (1920x1080)
// ---------------------------------------------------------------------------
console.log('\nTest 5: WebP extended VP8X (1920x1080)');
{
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8);
  buf.write('VP8X', 12);
  // Canvas at bytes 24-29: width-1 as 3 bytes LE, height-1 as 3 bytes LE
  // 1919 = 0x077F
  buf[24] = 0x7F; buf[25] = 0x07; buf[26] = 0x00;
  // 1079 = 0x0437
  buf[27] = 0x37; buf[28] = 0x04; buf[29] = 0x00;
  const result = parseImageDimensions(buf);
  assert(result && result.width === 1920 && result.height === 1080, 'WebP VP8X 1920x1080 parsed correctly');
}

// ---------------------------------------------------------------------------
// Test 6: GIF (80x60)
// ---------------------------------------------------------------------------
console.log('\nTest 6: GIF (80x60)');
{
  const buf = Buffer.alloc(30);
  buf.write('GIF89a', 0);
  buf.writeUInt16LE(80, 6);
  buf.writeUInt16LE(60, 8);
  const result = parseImageDimensions(buf);
  assert(result && result.width === 80 && result.height === 60, 'GIF 80x60 parsed correctly');
}

// ---------------------------------------------------------------------------
// Test 7: null/tiny buffer returns null
// ---------------------------------------------------------------------------
console.log('\nTest 7: null/tiny buffer returns null');
{
  assert(parseImageDimensions(null) === null, 'null buffer returns null');
  assert(parseImageDimensions(Buffer.alloc(5)) === null, 'tiny buffer returns null');
}

// ---------------------------------------------------------------------------
// Test 8: Unrecognized format returns null
// ---------------------------------------------------------------------------
console.log('\nTest 8: Unrecognized format returns null');
{
  const buf = Buffer.alloc(30);
  buf[0] = 0xAA; buf[1] = 0xBB; buf[2] = 0xCC; buf[3] = 0xDD;
  assert(parseImageDimensions(buf) === null, 'unrecognized format returns null');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
