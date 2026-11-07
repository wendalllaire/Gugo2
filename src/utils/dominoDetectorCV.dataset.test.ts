import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { detectDominoesOffline } from './dominoDetectorCV.ts';

const sampleDirectory = path.resolve('public/samples');
const referenceImage = 'IMG_20261102_231406.jpg';
const referenceExpected = ['1-11', '4-6', '7-11'];
// Only photographs explicitly named with domino values belong to the gold-standard
// dataset. Stagnation Lab screenshots and annotated/green-confirmed UI references
// are illustrative material, not recognition ground truth, and must never be parsed
// for expected domino values (their dates contain misleading number pairs).
const sampleNames = fs.readdirSync(sampleDirectory)
  .filter((name) => /^\d{1,2}-\d{1,2}(?:\s|\.jpe?g$)/i.test(name))
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

function compareWithGoldStandard(
  name: string,
  rgba: Uint8Array,
  width: number,
  height: number,
  expected: string[],
  transform = 'original'
): string | null {
  const result = detectDominoesOffline(rgba, width, height);
  const actual = result.pieces.map((piece) => normalizePair(piece.sideA, piece.sideB)).sort();
  if (JSON.stringify(actual) === JSON.stringify(expected)) return null;
  const oriented = result.pieces.map((piece) => ({
    sides: [piece.sideA, piece.sideB],
    box: piece.box2d,
    confidence: piece.confidence,
  }));
  return `${name} [${transform}] expected=${expected.join(',')} actual=${actual.join(',')} oriented=${JSON.stringify(oriented)} total=${result.totalPoints}`;
}

function assertNoMismatches(title: string, errors: string[]) {
  assert.equal(
    errors.length,
    0,
    `${title}: ${errors.length} mismatch(es)\n${errors.slice(0, 40).join('\n')}\n${errors.length > 40 ? `... and ${errors.length - 40} more` : ''}`
  );
}

test('repository reference photograph matches its documented gold standard', () => {
  const image = decodeSample(referenceImage);
  const mismatch = compareWithGoldStandard(referenceImage, image.data, image.width, image.height, referenceExpected);
  assertNoMismatches('reference photograph', mismatch ? [mismatch] : []);
  const result = detectDominoesOffline(image.data, image.width, image.height);
  assert.equal(result.totalPoints, 40);
});

test('every labeled public/samples image matches the domino values in its filename', () => {
  assert.ok(sampleNames.length >= 10, `Expected the labeled sample set in public/samples; found ${sampleNames.length}`);
  const errors: string[] = [];
  for (const name of sampleNames) {
    const expected = expectedPairsFromFilename(name);
    const image = decodeSample(name);
    assert.ok(expected.length > 0, `No domino gold-standard pairs parsed from ${name}`);
    const mismatch = compareWithGoldStandard(name, image.data, image.width, image.height, expected);
    if (mismatch) errors.push(mismatch);
  }
  assertNoMismatches('unmodified sample photos', errors);
});

test('single 0-n sample photos preserve the physical left-to-right side order', () => {
  for (const name of sampleNames) {
    const pair = expectedPairsFromFilename(name);
    assert.equal(pair.length, 1, `Expected one labeled domino in ${name}`);
    const expectedN = Number(name.match(/0-(\d{1,2})/)?.[1]);
    const image = decodeSample(name);
    const result = detectDominoesOffline(image.data, image.width, image.height);
    assert.equal(result.pieces.length, 1, `${name}: expected exactly one piece, got ${result.pieces.length}`);
    assert.equal(result.pieces[0].sideA, 0, `${name}: the blank left half must remain side A`);
    assert.equal(result.pieces[0].sideB, expectedN, `${name}: the right half must retain its pip count`);
  }
});

test('all labeled sample photos keep their gold standard under rotations and color/exposure transforms', () => {
  const samples = [
    { name: referenceImage, expected: referenceExpected },
    ...sampleNames.map((name) => ({ name, expected: expectedPairsFromFilename(name) })),
  ];
  const configs = [
    { brightness: 1, contrast: 1, saturation: 1, label: 'neutral' },
    { brightness: 0.78, contrast: 0.85, saturation: 0.45, label: 'dim-low-contrast-low-saturation' },
    { brightness: 0.92, contrast: 1.25, saturation: 1.5, label: 'slightly-dim-high-contrast-high-saturation' },
    { brightness: 1.12, contrast: 0.72, saturation: 0.65, label: 'bright-low-contrast-muted-colors' },
  ];
  const rotations = [0, 90, 180, 270] as const;
  const errors: string[] = [];

  for (const { name, expected } of samples) {
    const image = decodeSample(name);
    for (const degrees of rotations) {
      const rotated = rotateRgba(image.data, image.width, image.height, degrees);
      for (const config of configs) {
        const rgba = adjustColor(rotated.data, config.brightness, config.contrast, config.saturation);
        const transform = `rotation=${degrees}; ${config.label}; brightness=${config.brightness}; contrast=${config.contrast}; saturation=${config.saturation}`;
        const mismatch = compareWithGoldStandard(name, rgba, rotated.width, rotated.height, expected, transform);
        if (mismatch) errors.push(mismatch);
      }
    }
  }
  assertNoMismatches('rotated and color-adjusted sample photos', errors);
});

const fullSequenceNames = ['Todas peças v1.jpg', 'Todas peças v2.jpg'];
const fullSequenceExpected = Array.from({ length: 12 }, (_, index) => `0-${index + 1}`).sort();

test('both full-sequence photos contain exactly the 0-1 through 0-12 set', () => {
  const errors: string[] = [];
  const configs = [
    { brightness: 1, contrast: 1, saturation: 1, label: 'neutral' },
    { brightness: 0.92, contrast: 1.12, saturation: 1.15, label: 'slight-dim-contrast-saturation' },
    { brightness: 1.08, contrast: 0.9, saturation: 0.85, label: 'slight-bright-soft-muted' },
  ];
  const rotations = [0, 90, 180, 270] as const;

  for (const name of fullSequenceNames) {
    const image = decodeSample(name);
    for (const degrees of rotations) {
      const rotated = rotateRgba(image.data, image.width, image.height, degrees);
      for (const config of configs) {
        const rgba = adjustColor(rotated.data, config.brightness, config.contrast, config.saturation);
        const transform = `rotation=${degrees}; ${config.label}`;
        const mismatch = compareWithGoldStandard(name, rgba, rotated.width, rotated.height, fullSequenceExpected, transform);
        if (mismatch) errors.push(mismatch);
      }
    }
  }
  assertNoMismatches('full-sequence sample photos', errors);
});


interface SourceTileBox {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

const isolatedSequenceBoxes: Record<string, { sourceWidth: number; sourceHeight: number; boxes: SourceTileBox[] }> = {
  'Todas peças v1.jpg': {
    sourceWidth: 3072,
    sourceHeight: 4096,
    boxes: [
      { x: 517, y: 162, width: 1011, height: 580, value: 1 },
      { x: 1667, y: 213, width: 977, height: 582, value: 7 },
      { x: 460, y: 756, width: 1017, height: 557, value: 2 },
      { x: 1606, y: 838, width: 989, height: 550, value: 8 },
      { x: 432, y: 1367, width: 1013, height: 535, value: 3 },
      { x: 1562, y: 1423, width: 989, height: 517, value: 9 },
      { x: 428, y: 1998, width: 997, height: 495, value: 4 },
      { x: 1506, y: 2006, width: 986, height: 505, value: 10 },
      { x: 458, y: 2558, width: 981, height: 515, value: 5 },
      { x: 1479, y: 2581, width: 973, height: 502, value: 11 },
      { x: 457, y: 3148, width: 974, height: 512, value: 6 },
      { x: 1475, y: 3168, width: 953, height: 517, value: 12 },
    ],
  },
  'Todas peças v2.jpg': {
    sourceWidth: 2461,
    sourceHeight: 3281,
    boxes: [
      { x: 629, y: 366, width: 594, height: 366, value: 1 },
      { x: 1299, y: 403, width: 583, height: 349, value: 7 },
      { x: 609, y: 738, width: 589, height: 336, value: 2 },
      { x: 1266, y: 788, width: 579, height: 324, value: 8 },
      { x: 604, y: 1104, width: 579, height: 319, value: 3 },
      { x: 1246, y: 1130, width: 570, height: 305, value: 9 },
      { x: 606, y: 1474, width: 570, height: 289, value: 4 },
      { x: 1220, y: 1474, width: 564, height: 288, value: 10 },
      { x: 627, y: 1805, width: 561, height: 287, value: 5 },
      { x: 1206, y: 1818, width: 557, height: 275, value: 11 },
      { x: 621, y: 2151, width: 566, height: 281, value: 6 },
      { x: 1207, y: 2160, width: 550, height: 284, value: 12 },
    ],
  },
};

function cropTileFromSequence(
  image: { data: Uint8Array; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  box: SourceTileBox
) {
  const scaleX = image.width / sourceWidth;
  const scaleY = image.height / sourceHeight;
  const x = Math.max(0, Math.floor(box.x * scaleX));
  const y = Math.max(0, Math.floor(box.y * scaleY));
  const width = Math.min(image.width - x, Math.ceil(box.width * scaleX));
  const height = Math.min(image.height - y, Math.ceil(box.height * scaleY));
  // Keep neighbouring tiles out, then add enough dark surround for the isolated
  // tile to occupy less than half the frame. The detector intentionally rejects
  // near-full-frame bright regions as backgrounds rather than domino bodies.
  const padX = Math.max(16, Math.round(width * 0.28));
  const padY = Math.max(16, Math.round(height * 0.28));
  const cropWidth = width + padX * 2;
  const cropHeight = height + padY * 2;
  const background = [image.data[0], image.data[1], image.data[2], 255];
  const data = new Uint8Array(cropWidth * cropHeight * 4);

  for (let i = 0; i < cropWidth * cropHeight; i++) {
    const offset = i * 4;
    data[offset] = background[0];
    data[offset + 1] = background[1];
    data[offset + 2] = background[2];
    data[offset + 3] = 255;
  }

  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    const target = ((padY + row) * cropWidth + padX) * 4;
    data.set(image.data.subarray(from, from + width * 4), target);
  }

  return { data, width: cropWidth, height: cropHeight };
}

test('reverse validation: each tile isolated from v1 and v2 reads as 0-1 through 0-12', () => {
  const errors: string[] = [];

  for (const name of fullSequenceNames) {
    const reference = isolatedSequenceBoxes[name];
    const image = decodeSample(name);
    assert.equal(reference.boxes.length, 12, `${name}: expected 12 isolated tile regions`);

    for (const box of reference.boxes) {
      const isolated = cropTileFromSequence(image, reference.sourceWidth, reference.sourceHeight, box);
      const result = detectDominoesOffline(isolated.data, isolated.width, isolated.height);
      const actual = result.pieces.map(piece => [piece.sideA, piece.sideB]);
      if (actual.length !== 1 || actual[0][0] !== 0 || actual[0][1] !== box.value) {
        errors.push(`${name} isolated 0-${box.value}: expected [0,${box.value}], got ${JSON.stringify(actual)}; crop=${isolated.width}x${isolated.height}`);
      }
    }
  }

  assertNoMismatches('isolated tiles extracted from both full-sequence photos', errors);
});
