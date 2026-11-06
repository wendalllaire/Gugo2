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
  detectAllPips,
  buildAdaptivePipMask,
  buildYellowPipMask,
  buildChromaticPipMask,
  buildNeutralDominoBodyMask,
  splitMergedBodyComponents,
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
  const leftTile = tiles.find((tile) => tile.bbox.x < 100)!;
  assert.equal(leftTile.sideA, 2, 'Top/left half must remain side A');
  assert.equal(leftTile.sideB, 1, 'Bottom/right half must remain side B');
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

  // Physical separator bars between the two halves.
  for (let x = 30; x < 90; x++) {
    let i = (90 * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 18;
    i = (210 * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 18;
  }
  for (let x = 180; x < 240; x++) {
    const i = (90 * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 18;
  }

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


test('adaptive pip mask detects yellow and grey pips after rotation and exposure/color changes', () => {
  const width = 240;
  const height = 160;
  const rgba = new Uint8ClampedArray(width * height * 4);

  const put = (x: number, y: number, color: [number, number, number]) => {
    const i = (y * width + x) * 4;
    rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = 255;
  };
  // Dark felt around a warm ivory tile. Pips are deliberately not black:
  // yellow pips have high luminance and grey pips are low-contrast.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    put(x, y, [28, 48, 35]);
  }
  for (let y = 38; y < 122; y++) for (let x = 24; x < 216; x++) {
    put(x, y, [235, 228, 210]);
  }

  const drawPip = (cx: number, cy: number, radius: number, color: [number, number, number]) => {
    for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) put(x, y, color);
    }
  };
  // A=2 yellow pips, B=12 grey pips (4 columns x 3 rows).
  drawPip(58, 64, 4, [220, 178, 18]);
  drawPip(88, 96, 4, [220, 178, 18]);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    drawPip(137 + col * 19, 52 + row * 28, 4, [158, 153, 143]);
  }

  const rotate = (src: Uint8ClampedArray, w: number, h: number, degrees: 0 | 90 | 180 | 270) => {
    const outW = degrees === 90 || degrees === 270 ? h : w;
    const outH = degrees === 90 || degrees === 270 ? w : h;
    const out = new Uint8ClampedArray(outW * outH * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dx = x, dy = y;
      if (degrees === 90) { dx = h - 1 - y; dy = x; }
      if (degrees === 180) { dx = w - 1 - x; dy = h - 1 - y; }
      if (degrees === 270) { dx = y; dy = w - 1 - x; }
      const si = (y * w + x) * 4, di = (dy * outW + dx) * 4;
      out.set(src.subarray(si, si + 4), di);
    }
    return { data: out, width: outW, height: outH };
  };

  const changeColor = (src: Uint8ClampedArray, brightness: number, contrast: number, saturation: number) => {
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      for (let c = 0; c < 3; c++) {
        const value = c === 0 ? r : c === 1 ? g : b;
        const saturated = luma + (value - luma) * saturation;
        out[i + c] = Math.max(0, Math.min(255, Math.round(((saturated - 128) * contrast + 128) * brightness)));
      }
      out[i + 3] = 255;
    }
    return out;
  };

  const variants: Array<{ data: Uint8ClampedArray; width: number; height: number }> = [];
  for (const rotation of [0, 90, 180, 270] as const) {
    const rotated = rotate(rgba, width, height, rotation);
    variants.push(rotated);
    for (const [brightness, contrast, saturation] of [
      [0.78, 0.85, 0.45],
      [0.92, 1.25, 1.5],
      [1.12, 0.72, 0.0],
    ] as const) {
      variants.push({
        ...rotated,
        data: changeColor(rotated.data, brightness, contrast, saturation),
      });
    }
  }

  for (const variant of variants) {
    const gray = rgbToGrayscale(variant.data, variant.width, variant.height);
    const mask = buildAdaptivePipMask(gray, variant.width, variant.height);
    const pips = detectAllPips(mask, variant.width, variant.height, 2.5, 12, 0.25);
    assert.equal(
      pips.length,
      14,
      `Expected 14 colored pips after image transforms; got ${pips.length} for ${variant.width}x${variant.height}`
    );
  }
});

test('yellow domino body is detected by chroma even when grayscale threshold is insufficient', () => {
  const w = 400;
  const h = 300;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 20; rgba[i * 4 + 1] = 75; rgba[i * 4 + 2] = 35; rgba[i * 4 + 3] = 255;
  }
  for (let y = 105; y < 195; y++) for (let x = 175; x < 225; x++) {
    const i = (y * w + x) * 4;
    rgba[i] = 245; rgba[i + 1] = 205; rgba[i + 2] = 45;
  }
  const drawPip = (cx: number, cy: number) => {
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= 9) {
        const i = (y * w + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 15;
      }
    }
  };
  for (let y = 147; y < 153; y++) for (let x = 175; x < 225; x++) {
    const i = (y * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 15;
  }
  drawPip(200, 125); drawPip(200, 175);
  const result = detectDominoesOffline(rgba, w, h);
  assert.ok(result.tiles.length >= 1, 'Yellow domino should be detected');
});

test('chromatic pip mask detects blue, red and green dots on a light face', () => {
  const width = 300;
  const height = 300;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 245; rgba[i * 4 + 1] = 240; rgba[i * 4 + 2] = 225; rgba[i * 4 + 3] = 255;
  }
  const dots = [
    { cx: 50, cy: 150, color: [35, 125, 190] },
    { cx: 150, cy: 150, color: [190, 55, 65] },
    { cx: 250, cy: 150, color: [55, 145, 80] },
  ];
  for (const dot of dots) {
    for (let y = dot.cy - 10; y <= dot.cy + 10; y++) {
      for (let x = dot.cx - 10; x <= dot.cx + 10; x++) {
        if ((x - dot.cx) ** 2 + (y - dot.cy) ** 2 > 100) continue;
        const offset = (y * width + x) * 4;
        rgba[offset] = dot.color[0]; rgba[offset + 1] = dot.color[1]; rgba[offset + 2] = dot.color[2];
      }
    }
  }
  const mask = buildChromaticPipMask(rgba, width, height);
  const active = mask.reduce((sum, value) => sum + value, 0);
  assert.ok(active > 600 && active < 1100, `expected compact colored pip pixels, got ${active}`);
  for (const dot of dots) assert.equal(mask[dot.cy * width + dot.cx], 1);
  assert.equal(mask[10 * width + 10], 0, 'light tile face must not be considered a colored pip');
});

test('yellow pip chroma mask isolates yellow dots independently from the white tile face', () => {
  const width = 180;
  const height = 120;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 45; rgba[i * 4 + 1] = 70; rgba[i * 4 + 2] = 48; rgba[i * 4 + 3] = 255;
  }
  for (let y = 20; y < 100; y++) for (let x = 18; x < 162; x++) {
    const i = (y * width + x) * 4;
    rgba[i] = 238; rgba[i + 1] = 235; rgba[i + 2] = 229;
  }
  const drawYellow = (cx: number, cy: number, radius: number) => {
    for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        const i = (y * width + x) * 4;
        rgba[i] = 220; rgba[i + 1] = 178; rgba[i + 2] = 18;
      }
    }
  };
  drawYellow(48, 44, 5);
  drawYellow(82, 76, 5);
  drawYellow(128, 44, 5);

  const mask = buildYellowPipMask(rgba, width, height);
  const pips = detectAllPips(mask, width, height, 2.5, 12, 0.25);
  assert.equal(pips.length, 3, `Expected 3 yellow pips, got ${pips.length}`);
});

test('a solid yellow domino face is not misclassified as yellow pips', () => {
  const width = 120;
  const height = 90;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 245; rgba[i * 4 + 1] = 205; rgba[i * 4 + 2] = 45; rgba[i * 4 + 3] = 255;
  }
  const mask = buildYellowPipMask(rgba, width, height);
  assert.equal(mask.reduce((sum, value) => sum + value, 0), 0,
    'a large yellow surface must be kept out of the pip mask');
});

test('neutral domino body mask survives dim exposure and rejects warm tabletop pixels', () => {
  const width = 400;
  const height = 300;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 204; rgba[i * 4 + 1] = 180; rgba[i * 4 + 2] = 168; rgba[i * 4 + 3] = 255;
  }
  const drawTile = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = 238; rgba[i + 1] = 235; rgba[i + 2] = 229;
    }
  };
  drawTile(70, 65, 145, 245);
  drawTile(250, 65, 325, 245);

  const dim = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    for (let c = 0; c < 3; c++) {
      const value = c === 0 ? r : c === 1 ? g : b;
      const saturated = luma + (value - luma) * 0.45;
      dim[i + c] = Math.max(0, Math.min(255, Math.round(((saturated - 128) * 0.85 + 128) * 0.78)));
    }
    dim[i + 3] = 255;
  }

  const gray = rgbToGrayscale(dim, width, height);
  const mask = buildNeutralDominoBodyMask(dim, gray, width, height);
  const blobs = findConnectedComponents(mask, width, height, width * height * 0.001, width * height * 0.3);
  const candidates = blobs.filter((blob) => blob.area > width * height * 0.025);
  assert.equal(candidates.length, 2, `Expected 2 domino bodies, got ${candidates.length}`);
  assert.ok(candidates.every((blob) => blob.minX > 50 && blob.maxX < 350),
    'warm background pixels must not expand the detected tile bounds');
});


test('split merged touching white domino bodies only when a dark seam supports it', () => {
  const width = 400, height = 400;
  const gray = new Uint8Array(width * height);
  gray.fill(220);
  const blob = {
    id: 7, minX: 40, maxX: 359, minY: 40, maxY: 359,
    area: 320 * 320, perimeter: 1280, centroidX: 200, centroidY: 200,
  };
  // A narrow vertical dark boundary separates two upright, touching tiles.
  for (let y = 65; y < 335; y++) gray[y * width + 200] = 25;
  const split = splitMergedBodyComponents([blob], gray, width, height);
  assert.equal(split.length, 2, 'near-square merged component should become two domino bodies');
  assert.ok(split.every(part => part.maxY - part.minY + 1 > (part.maxX - part.minX + 1) * 1.5));
  assert.ok(split[0].maxX < split[1].minX, 'left/right physical order must be preserved');

  const noSeam = new Uint8Array(width * height);
  noSeam.fill(220);
  const untouched = splitMergedBodyComponents([blob], noSeam, width, height);
  assert.equal(untouched.length, 1, 'a single broad bright object without a seam must not be split');
  assert.equal(untouched[0].id, blob.id);
});

test('domino geometry filter rejects tiny and oversized objects but accepts a tile', async () => {
  const { isPlausibleDominoBox } = await import('./dominoDetectorCV.ts');
  assert.equal(isPlausibleDominoBox({ x: 10, y: 10, width: 5, height: 10 }, 640, 480), false);
  assert.equal(isPlausibleDominoBox({ x: 10, y: 10, width: 84, height: 38 }, 1280, 1707), false,
    'tiny rectangular reflections must not be classified as dominoes');
  assert.equal(isPlausibleDominoBox({ x: 0, y: 0, width: 600, height: 400 }, 640, 480), false);
  // The large empty tray from the supplied camera example is not a domino.
  assert.equal(isPlausibleDominoBox({ x: 300, y: 400, width: 330, height: 540 }, 691, 1536), false);
  // A real domino in the supplied original photo is within the accepted scale.
  assert.equal(isPlausibleDominoBox({ x: 389, y: 325, width: 382, height: 202 }, 1152, 1536), true);
  assert.equal(isPlausibleDominoBox({ x: 100, y: 100, width: 40, height: 80 }, 640, 480), true);
  assert.equal(isPlausibleDominoBox({ x: 0, y: 300, width: 200, height: 100 }, 1280, 1707), false,
    'objects clipped by the image edge must be rejected');
  assert.equal(isPlausibleDominoBox({ x: 500, y: 600, width: 200, height: 100 }, 1280, 1707), true);
  assert.equal(isPlausibleDominoBox({ x: 100, y: 100, width: 520, height: 300 }, 1280, 1707), false,
    'a merged multi-piece/table region must not pass as one domino');
});
