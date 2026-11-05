import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { detectDominoesOffline } from './dominoDetectorCV.ts';

const sampleDirectory = path.resolve('public/samples');
const referenceImage = 'IMG_20261102_231406.jpg';
const referenceExpected = ['1-11', '4-6', '7-11'];
const sampleNames = fs.readdirSync(sampleDirectory)
  .filter((name) => /\d{1,2}-\d{1,2}/.test(name) && /\.jpe?g$/i.test(name))
  .sort();

function normalizePair(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join('-');
}

function expectedPairsFromFilename(name: string): string[] {
  const pairs = name.match(/\d{1,2}-\d{1,2}/g) || [];
  return pairs.map((pair) => {
    const [a, b] = pair.split('-').map(Number);
    return normalizePair(a, b);
  }).sort();
}

function resizeForApp(data: Uint8Array, width: number, height: number, maxWidth = 1280) {
  const scale = Math.min(1, maxWidth / width);
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  if (outWidth === width && outHeight === height) {
    return { data, width, height };
  }

  // Bilinear downscale, matching the browser canvas normalization before CV/Gemini.
  const out = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    const sourceY = Math.max(0, Math.min(height - 1, (y + 0.5) / scale - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < outWidth; x++) {
      const sourceX = Math.max(0, Math.min(width - 1, (x + 0.5) / scale - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = sourceX - x0;
      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      const target = (y * outWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
        const bottom = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
        out[target + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { data: out, width: outWidth, height: outHeight };
}

function decodeSample(name: string) {
  const decoded = jpeg.decode(fs.readFileSync(path.join(sampleDirectory, name)), { useTArray: true });
  return resizeForApp(decoded.data, decoded.width, decoded.height);
}

function rotateRgba(data: Uint8Array, width: number, height: number, degrees: 0 | 90 | 180 | 270) {
  if (degrees === 0) return { data, width, height };
  const outWidth = degrees === 90 || degrees === 270 ? height : width;
  const outHeight = degrees === 90 || degrees === 270 ? width : height;
  const out = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let dx = x, dy = y;
    if (degrees === 90) { dx = height - 1 - y; dy = x; }
    if (degrees === 180) { dx = width - 1 - x; dy = height - 1 - y; }
    if (degrees === 270) { dx = y; dy = width - 1 - x; }
    const source = (y * width + x) * 4;
    const target = (dy * outWidth + dx) * 4;
    out[target] = data[source];
    out[target + 1] = data[source + 1];
    out[target + 2] = data[source + 2];
    out[target + 3] = data[source + 3];
  }
  return { data: out, width: outWidth, height: outHeight };
}

function adjustColor(
  data: Uint8Array,
  brightness: number,
  contrast: number,
  saturation: number
): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    for (let c = 0; c < 3; c++) {
      const value = c === 0 ? r : c === 1 ? g : b;
      const saturated = luma + (value - luma) * saturation;
      out[i + c] = Math.max(0, Math.min(255, Math.round(((saturated - 128) * contrast + 128) * brightness)));
    }
    out[i + 3] = 255;
  }
  return out;
}

function assertMatchesGoldStandard(
  name: string,
  rgba: Uint8Array,
  width: number,
  height: number,
  expected: string[],
  transform = 'original'
) {
  const result = detectDominoesOffline(rgba, width, height);
  const actual = result.pieces.map((piece) => normalizePair(piece.sideA, piece.sideB)).sort();
  assert.deepEqual(
    actual,
    expected,
    `${name} [${transform}] expected ${expected.join(', ')}; got ${actual.join(', ')}; oriented=${JSON.stringify(result.pieces.map(p => [p.sideA,p.sideB]))}; total=${result.totalPoints}`
  );
}

test('repository reference photograph matches its documented gold standard', () => {
  const image = decodeSample(referenceImage);
  assertMatchesGoldStandard(referenceImage, image.data, image.width, image.height, referenceExpected);
  const result = detectDominoesOffline(image.data, image.width, image.height);
  assert.equal(result.totalPoints, 40);
});

test('every labeled public/samples image matches the domino values in its filename', () => {
  assert.ok(sampleNames.length >= 10, `Expected the labeled sample set in public/samples; found ${sampleNames.length}`);
  for (const name of sampleNames) {
    const expected = expectedPairsFromFilename(name);
    const image = decodeSample(name);
    assert.ok(expected.length > 0, `No domino gold-standard pairs parsed from ${name}`);
    assertMatchesGoldStandard(name, image.data, image.width, image.height, expected);
  }
});

test('yellow and grey domino sample and its v2 keep their values under rotation and color transforms', () => {
  const names = [
    '2-12 3-4 6-9.jpg',
    '2-12 3-4 6-9 v2.jpg',
    '7-11 1-11 4-6.jpg',
    '7-11 1-11 4-6 v2.jpg',
  ];
  const configs = [
    [1, 1, 1],
    [0.78, 0.85, 0.45],
    [0.92, 1.25, 1.5],
    [1.12, 0.72, 0],
  ] as const;
  const rotations = [0, 90, 180, 270] as const;

  for (const name of names) {
    const image = decodeSample(name);
    const expected = expectedPairsFromFilename(name);
    for (const degrees of rotations) {
      const rotated = rotateRgba(image.data, image.width, image.height, degrees);
      for (const [brightness, contrast, saturation] of configs) {
        const rgba = adjustColor(rotated.data, brightness, contrast, saturation);
        assertMatchesGoldStandard(
          name,
          rgba,
          rotated.width,
          rotated.height,
          expected,
          `rotation=${degrees}; brightness=${brightness}; contrast=${contrast}; saturation=${saturation}`
        );
      }
    }
  }
});
