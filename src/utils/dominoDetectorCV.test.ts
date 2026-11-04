import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToGrayscale,
  computeOtsuThreshold,
  binarize,
  findConnectedComponents,
  computeCircularity,
  splitTileHalves,
  detectDominoesOffline,
  clusterPipsIntoDominoes,
  DetectedPip,
} from './dominoDetectorCV.ts';

test('rgbToGrayscale correctly converts RGBA pixels to luma', () => {
  const rgba = new Uint8Array([
    255, 255, 255, 255,
    0, 0, 0, 255,
    255, 0, 0, 255,
  ]);
  const gray = rgbToGrayscale(rgba, 3, 1);
  assert.equal(gray.length, 3);
  assert.equal(gray[0], 255);
  assert.equal(gray[1], 0);
  assert.equal(gray[2], 76);
});

test('computeOtsuThreshold finds bimodal partition', () => {
  const gray = new Uint8Array(200);
  for (let i = 0; i < 100; i++) gray[i] = 40;
  for (let i = 100; i < 200; i++) gray[i] = 220;

  const threshold = computeOtsuThreshold(gray);
  assert.ok(threshold >= 40 && threshold <= 220, `Threshold ${threshold} should be between 40 and 220`);
});

test('binarize partitions image correctly', () => {
  const gray = new Uint8Array([20, 80, 150, 240]);
  const bin = binarize(gray, 100, false);
  assert.deepEqual(Array.from(bin), [1, 1, 0, 0]);
});

test('computeCircularity calculates quotient for circles and squares', () => {
  const r = 10;
  const areaCircle = Math.PI * r * r;
  const perimCircle = 2 * Math.PI * r;
  const circCircle = computeCircularity(areaCircle, perimCircle);
  assert.ok(circCircle > 0.95 && circCircle <= 1.0);

  const circSquare = computeCircularity(400, 80);
  assert.ok(circSquare > 0.75 && circSquare < 0.82);
});

test('splitTileHalves partitions vertical and horizontal dominoes', () => {
  const vBbox = { x: 10, y: 10, width: 40, height: 80 };
  const vSplit = splitTileHalves(vBbox, 'vertical');
  assert.equal(vSplit.halfA.width, 40);
  assert.equal(vSplit.halfB.width, 40);
  assert.ok(vSplit.halfA.height < 40);
  assert.ok(vSplit.halfB.y > vSplit.halfA.y + vSplit.halfA.height);

  const hBbox = { x: 10, y: 10, width: 80, height: 40 };
  const hSplit = splitTileHalves(hBbox, 'horizontal');
  assert.equal(hSplit.halfA.height, 40);
  assert.equal(hSplit.halfB.height, 40);
  assert.ok(hSplit.halfA.width < 40);
  assert.ok(hSplit.halfB.x > hSplit.halfA.x + hSplit.halfA.width);
});

test('findConnectedComponents identifies distinct blobs', () => {
  const w = 10;
  const h = 10;
  const bin = new Uint8Array(w * h);
  for (let y = 3; y <= 5; y++) {
    for (let x = 3; x <= 5; x++) {
      bin[y * w + x] = 1;
    }
  }

  const blobs = findConnectedComponents(bin, w, h, 2, 50);
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].area, 9);
  assert.equal(blobs[0].minX, 3);
  assert.equal(blobs[0].maxX, 5);
  assert.equal(blobs[0].minY, 3);
  assert.equal(blobs[0].maxY, 5);
});

test('clusterPipsIntoDominoes correctly separates two distinct dominoes', () => {
  // Two dominoes placed far apart on the table:
  // Domino 1 pips clustered around x: 50, y: 50..120
  // Domino 2 pips clustered around x: 250, y: 50..120
  const pips: DetectedPip[] = [
    // Domino 1: 3 pips
    { x: 45, y: 55, radius: 5, area: 78, circularity: 0.9 },
    { x: 55, y: 55, radius: 5, area: 78, circularity: 0.9 },
    { x: 50, y: 95, radius: 5, area: 78, circularity: 0.9 },
    // Domino 2: 4 pips
    { x: 240, y: 55, radius: 5, area: 78, circularity: 0.9 },
    { x: 260, y: 55, radius: 5, area: 78, circularity: 0.9 },
    { x: 240, y: 95, radius: 5, area: 78, circularity: 0.9 },
    { x: 260, y: 95, radius: 5, area: 78, circularity: 0.9 },
  ];

  const tiles = clusterPipsIntoDominoes(pips, 400, 300);
  assert.equal(tiles.length, 2, 'Should detect exactly 2 distinct dominoes instead of 1 lumped tile');
  assert.ok(tiles[0].points > 0);
  assert.ok(tiles[1].points > 0);
  assert.notEqual(tiles[0].bbox.x, tiles[1].bbox.x);
});

test('detectDominoesOffline detects multiple dominoes on synthetic image', () => {
  const w = 320;
  const h = 200;
  const rgba = new Uint8Array(w * h * 4);

  // Background: dark green felt (R: 20, G: 80, B: 30)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 20;
    rgba[i * 4 + 1] = 80;
    rgba[i * 4 + 2] = 30;
    rgba[i * 4 + 3] = 255;
  }

  // Draw Tile 1: x: 30..90 (w: 60), y: 30..150 (h: 120)
  for (let y = 30; y < 150; y++) {
    for (let x = 30; x < 90; x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 245;
      rgba[idx + 1] = 245;
      rgba[idx + 2] = 240;
    }
  }

  // Draw Tile 2: x: 180..240 (w: 60), y: 30..150 (h: 120)
  for (let y = 30; y < 150; y++) {
    for (let x = 180; x < 240; x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 245;
      rgba[idx + 1] = 245;
      rgba[idx + 2] = 240;
    }
  }

  const drawPip = (cx: number, cy: number, radius: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const idx = ((cy + dy) * w + (cx + dx)) * 4;
          rgba[idx] = 20;
          rgba[idx + 1] = 20;
          rgba[idx + 2] = 20;
        }
      }
    }
  };

  // Pips on Tile 1
  drawPip(48, 55, 4);
  drawPip(72, 65, 4);
  drawPip(60, 120, 4);

  // Pips on Tile 2
  drawPip(195, 55, 4);
  drawPip(225, 55, 4);
  drawPip(210, 115, 4);

  const result = detectDominoesOffline(rgba, w, h);
  assert.equal(result.source, 'offline_cv');
  assert.ok(result.tiles.length >= 2, `Should detect at least 2 distinct dominoes, found ${result.tiles.length}`);
  assert.equal(result.pieces.length, result.tiles.length);
  assert.ok(result.totalPoints > 0);
});
