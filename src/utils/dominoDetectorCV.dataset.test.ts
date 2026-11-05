import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { detectDominoesOffline, detectPipsByRadialVoting, detectDominoesByRadialVoting, rgbToGrayscale } from './dominoDetectorCV.ts';

const samplePath = path.resolve('public/samples/IMG_20261102_231406.jpg');
const expectedUnordered = ['1-11', '4-6', '7-11'];

function normalizePair(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join('-');
}

function rotateRgba(data: Uint8Array, width: number, height: number, degrees: 0 | 90 | 180 | 270) {
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

test('repository reference photo matches its documented domino gold standard', () => {
  assert.ok(fs.existsSync(samplePath), `Missing reference photo: ${samplePath}`);
  const decoded = jpeg.decode(fs.readFileSync(samplePath), { useTArray: true });
  const radialPips = detectPipsByRadialVoting(
    rgbToGrayscale(decoded.data, decoded.width, decoded.height), decoded.width, decoded.height
  );
  const radialTiles = detectDominoesByRadialVoting(decoded.data, decoded.width, decoded.height);
  const result = detectDominoesOffline(decoded.data, decoded.width, decoded.height);
  const actual = result.pieces.map((piece) => normalizePair(piece.sideA, piece.sideB)).sort();
  assert.deepEqual(actual, expectedUnordered, JSON.stringify({
    radialPips: radialPips.length, radialTiles: radialTiles.map(t => [t.sideA, t.sideB]),
    pieces: result.pieces.map(({ sideA, sideB }) => [sideA, sideB]),
    totalPoints: result.totalPoints,
    threshold: result.thresholdUsed,
  }));
  assert.equal(result.totalPoints, 40);
});

test('repository reference photo keeps its pip totals after rotations and color transforms', () => {
  const decoded = jpeg.decode(fs.readFileSync(samplePath), { useTArray: true });
  const source = decoded.data as Uint8Array;
  const configs = [
    [1, 1, 1],
    [0.82, 0.9, 0.45],
    [0.92, 1.25, 1.45],
    [1.08, 0.78, 0],
  ] as const;

  for (const degrees of [0, 90, 180, 270] as const) {
    const rotated = rotateRgba(source, decoded.width, decoded.height, degrees);
    for (const [brightness, contrast, saturation] of configs) {
      const rgba = adjustColor(rotated.data, brightness, contrast, saturation);
      const result = detectDominoesOffline(rgba, rotated.width, rotated.height);
      const actual = result.pieces.map((piece) => normalizePair(piece.sideA, piece.sideB)).sort();
      assert.deepEqual(actual, expectedUnordered, `rotation=${degrees}, brightness=${brightness}, contrast=${contrast}, saturation=${saturation}; pieces=${JSON.stringify(result.pieces.map(p => [p.sideA,p.sideB]))}; total=${result.totalPoints}`);
      assert.equal(result.totalPoints, 40);
    }
  }
});
