/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Domino Detector - 100% Offline Classical Computer Vision Pipeline
 * Multi-Piece Recognition Architecture inspired by Double-Double-Dominoes
 * (https://github.com/hutanmihai/Double-Double-Dominoes)
 * 
 * Capable of segmenting and cataloging multiple domino tiles simultaneously
 * into individual pieces (sides 0-12 for Double-12 Mexican Train).
 */

import { DetectedPiece } from '../types';

export interface CVOptions {
  thresholdMode?: 'otsu' | 'manual';
  manualThreshold?: number;
  invertColors?: boolean;
}

export interface DetectedPip {
  x: number;
  y: number;
  radius: number;
  area: number;
  circularity: number;
}

export interface DominoHalfCV {
  bbox: { x: number; y: number; width: number; height: number };
  pips: DetectedPip[];
  count: number;
}

export interface DetectedTileCV {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
  orientation: 'vertical' | 'horizontal';
  halfA: DominoHalfCV;
  halfB: DominoHalfCV;
  sideA: number;
  sideB: number;
  points: number;
  confidence: number;
  label: string;
}

export interface OfflineCVResult {
  pieces: DetectedPiece[];
  tiles: DetectedTileCV[];
  totalPoints: number;
  source: 'offline_cv';
  processingTimeMs: number;
  tilesCount: number;
  pipsTotal: number;
  thresholdUsed: number;
  warning?: string;
}

/**
 * Converts RGBA pixel buffer to 8-bit Grayscale using standard ITU-R BT.601 luma formula.
 * Y = 0.299*R + 0.587*G + 0.114*B
 */
export function rgbToGrayscale(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const r = rgbaPixels[i * 4];
    const g = rgbaPixels[i * 4 + 1];
    const b = rgbaPixels[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Computes optimal binarization threshold via Otsu's Between-Class Variance algorithm.
 */
export function computeOtsuThreshold(gray: Uint8Array): number {
  const histogram = new Int32Array(256);
  const totalPixels = gray.length;

  for (let i = 0; i < totalPixels; i++) {
    histogram[gray[i]]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Binarizes grayscale image.
 */
export function binarize(
  gray: Uint8Array,
  threshold: number,
  invert: boolean = false
): Uint8Array {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const val = gray[i];
    bin[i] = invert ? (val > threshold ? 1 : 0) : (val < threshold ? 1 : 0);
  }
  return bin;
}

/**
 * Builds a local-contrast pip mask. A global grayscale threshold misses glossy
 * grey/yellow pips whenever exposure or reflected light lifts their luminance.
 * The local mean is computed with an integral image so the same detector works
 * at camera-preview and full-photo resolutions.
 */
export function buildAdaptivePipMask(
  gray: Uint8Array,
  width: number,
  height: number,
  invert = false
): Uint8Array {
  if (width <= 0 || height <= 0 || gray.length !== width * height) {
    throw new Error('Invalid grayscale frame dimensions');
  }

  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }

  const radius = Math.max(4, Math.min(14, Math.round(Math.min(width, height) * 0.018)));
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const localSum =
        integral[y1 * stride + x1] -
        integral[y0 * stride + x1] -
        integral[y1 * stride + x0] +
        integral[y0 * stride + x0];
      const localMean = localSum / ((x1 - x0) * (y1 - y0));
      const value = gray[y * width + x];
      const contrast = invert ? value - localMean : localMean - value;
      const requiredContrast = Math.max(10, localMean * 0.045);

      // Requiring a reasonably bright local neighbourhood confines detections
      // to tile faces and avoids turning dark felt texture into domino pips.
      if (localMean >= 105 && value <= 248 && contrast >= requiredContrast) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

export interface ComponentBlob {
  id: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
  perimeter: number;
  centroidX: number;
  centroidY: number;
}

/**
 * Two-pass connected components labeling with Disjoint Set Union (DSU).
 */
export function findConnectedComponents(
  bin: Uint8Array,
  width: number,
  height: number,
  minArea: number = 4,
  maxArea: number = width * height * 0.5
): ComponentBlob[] {
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const parent = [0];

  function findRoot(i: number): number {
    let root = i;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function unionRoots(i: number, j: number) {
    const rootI = findRoot(i);
    const rootJ = findRoot(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  }

  // Pass 1: Label and union
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (bin[idx] === 0) continue;

      const top = y > 0 ? labels[(y - 1) * width + x] : 0;
      const left = x > 0 ? labels[y * width + (x - 1)] : 0;

      if (top === 0 && left === 0) {
        labels[idx] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel++;
      } else if (top !== 0 && left === 0) {
        labels[idx] = top;
      } else if (top === 0 && left !== 0) {
        labels[idx] = left;
      } else {
        labels[idx] = top;
        if (top !== left) {
          unionRoots(top, left);
        }
      }
    }
  }

  // Pass 2: Accumulate component bounding boxes and stats
  const blobsMap = new Map<number, {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    area: number;
    perimeter: number;
    sumX: number;
    sumY: number;
  }>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const rawLabel = labels[idx];
      if (rawLabel === 0) continue;

      const root = findRoot(rawLabel);
      labels[idx] = root;

      let b = blobsMap.get(root);
      if (!b) {
        b = {
          minX: x,
          maxX: x,
          minY: y,
          maxY: y,
          area: 0,
          perimeter: 0,
          sumX: 0,
          sumY: 0,
        };
        blobsMap.set(root, b);
      }

      b.area++;
      b.sumX += x;
      b.sumY += y;
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;

      const isBoundary =
        x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
        bin[idx - 1] === 0 || bin[idx + 1] === 0 ||
        bin[idx - width] === 0 || bin[idx + width] === 0;

      if (isBoundary) {
        b.perimeter++;
      }
    }
  }

  const results: ComponentBlob[] = [];
  for (const [id, b] of blobsMap.entries()) {
    if (b.area >= minArea && b.area <= maxArea) {
      results.push({
        id,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
        area: b.area,
        perimeter: Math.max(b.perimeter, 4),
        centroidX: Math.round(b.sumX / b.area),
        centroidY: Math.round(b.sumY / b.area),
      });
    }
  }

  return results;
}

/**
 * Computes circularity: 4 * PI * Area / (Perimeter^2)
 */
export function computeCircularity(area: number, perimeter: number): number {
  if (perimeter <= 0) return 0;
  return Math.min(1.0, (4 * Math.PI * area) / (perimeter * perimeter));
}

/**
 * Detects all circular pip blobs across the entire frame.
 */
export function detectAllPips(
  binPips: Uint8Array,
  width: number,
  height: number,
  minRadius: number = 2.5,
  maxRadius: number = 36,
  minCircularity: number = 0.32
): DetectedPip[] {
  const minPipArea = Math.max(4, Math.PI * minRadius * minRadius * 0.5);
  const maxPipArea = Math.min(width * height * 0.05, Math.PI * maxRadius * maxRadius * 1.6);

  const blobs = findConnectedComponents(binPips, width, height, minPipArea, maxPipArea);
  const candidatePips: DetectedPip[] = [];

  for (const b of blobs) {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const aspect = bw / Math.max(1, bh);

    // Filter by circular aspect ratio
    if (aspect < 0.55 || aspect > 1.8) continue;

    const circularity = computeCircularity(b.area, b.perimeter);
    if (circularity < minCircularity) continue;

    const approxRadius = Math.max(2, Math.round(Math.sqrt(b.area / Math.PI)));
    candidatePips.push({
      x: b.centroidX,
      y: b.centroidY,
      radius: approxRadius,
      area: b.area,
      circularity,
    });
  }

  // Deduplicate overlapping candidate pips
  const filtered: DetectedPip[] = [];
  for (const pip of candidatePips) {
    const isDuplicate = filtered.some(
      (other) => Math.hypot(pip.x - other.x, pip.y - other.y) < Math.max(pip.radius, other.radius) * 1.15
    );
    if (!isDuplicate) {
      filtered.push(pip);
    }
  }

  return filtered;
}

/**
 * Detects pips within a specific rectangular half bounding box.
 */
export function detectPipsInHalf(
  bin: Uint8Array,
  fullWidth: number,
  halfBbox: { x: number; y: number; width: number; height: number },
  minRadius: number = 2.5,
  maxRadius: number = 32,
  minCircularity: number = 0.32
): DetectedPip[] {
  const { x: hx, y: hy, width: hw, height: hh } = halfBbox;
  if (hw <= 4 || hh <= 4) return [];

  const minPipArea = Math.max(4, Math.PI * minRadius * minRadius * 0.5);
  const maxPipArea = Math.min(hw * hh * 0.25, Math.PI * maxRadius * maxRadius * 1.5);

  const subBin = new Uint8Array(hw * hh);
  for (let dy = 0; dy < hh; dy++) {
    for (let dx = 0; dx < hw; dx++) {
      const srcIdx = (hy + dy) * fullWidth + (hx + dx);
      subBin[dy * hw + dx] = bin[srcIdx];
    }
  }

  const blobs = findConnectedComponents(subBin, hw, hh, minPipArea, maxPipArea);
  const pips: DetectedPip[] = [];

  const marginX = Math.max(2, hw * 0.05);
  const marginY = Math.max(2, hh * 0.05);

  for (const b of blobs) {
    const blobW = b.maxX - b.minX + 1;
    const blobH = b.maxY - b.minY + 1;
    const aspect = blobW / Math.max(1, blobH);

    if (aspect < 0.55 || aspect > 1.8) continue;

    const circularity = computeCircularity(b.area, b.perimeter);
    if (circularity < minCircularity) continue;

    if (
      b.centroidX < marginX ||
      b.centroidX > hw - marginX ||
      b.centroidY < marginY ||
      b.centroidY > hh - marginY
    ) {
      continue;
    }

    const approxRadius = Math.max(2, Math.round(Math.sqrt(b.area / Math.PI)));
    pips.push({
      x: hx + b.centroidX,
      y: hy + b.centroidY,
      radius: approxRadius,
      area: b.area,
      circularity,
    });
  }

  const filtered: DetectedPip[] = [];
  for (const pip of pips) {
    const isDuplicate = filtered.some(
      (other) => Math.hypot(pip.x - other.x, pip.y - other.y) < Math.max(pip.radius, other.radius) * 1.15
    );
    if (!isDuplicate) {
      filtered.push(pip);
    }
  }

  return filtered.slice(0, 12);
}

/**
 * Splits a domino tile bounding box into two halves (Side A and Side B).
 */
export function splitTileHalves(
  bbox: { x: number; y: number; width: number; height: number },
  orientation: 'vertical' | 'horizontal'
): {
  halfA: { x: number; y: number; width: number; height: number };
  halfB: { x: number; y: number; width: number; height: number };
} {
  const { x, y, width, height } = bbox;

  if (orientation === 'vertical') {
    const halfH = Math.floor(height / 2);
    const divBuffer = Math.max(1, Math.floor(height * 0.02));
    return {
      halfA: { x, y, width, height: Math.max(1, halfH - divBuffer) },
      halfB: { x, y: y + halfH + divBuffer, width, height: Math.max(1, halfH - divBuffer) },
    };
  } else {
    const halfW = Math.floor(width / 2);
    const divBuffer = Math.max(1, Math.floor(width * 0.02));
    return {
      halfA: { x, y, width: Math.max(1, halfW - divBuffer), height },
      halfB: { x: x + halfW + divBuffer, y, width: Math.max(1, halfW - divBuffer), height },
    };
  }
}

/**
 * Spatial clustering: Groups pips into individual dominoes based on proximity and aspect ratio.
 * This guarantees multiple dominoes are recognized separately instead of lumped together.
 */
export function clusterPipsIntoDominoes(
  pips: DetectedPip[],
  imgWidth: number,
  imgHeight: number
): DetectedTileCV[] {
  if (pips.length === 0) return [];

  // Determine median pip radius to establish adaptive proximity threshold
  const sortedRadii = [...pips].map((p) => p.radius).sort((a, b) => a - b);
  const medianRadius = sortedRadii[Math.floor(sortedRadii.length / 2)] || 6;

  // Maximum distance between pips belonging to the same domino tile
  // Standard domino pips are spaced ~3-6x their radius apart
  const maxPipDist = Math.max(30, Math.min(imgWidth * 0.28, medianRadius * 8.5));

  // Build adjacency graph for connected components of pips
  const n = pips.length;
  const adj: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = Math.hypot(pips[i].x - pips[j].x, pips[i].y - pips[j].y);
      if (dist <= maxPipDist) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // BFS / DFS to collect pip clusters
  const visited = new Uint8Array(n);
  const rawClusters: DetectedPip[][] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const cluster: DetectedPip[] = [];
    const queue = [i];
    visited[i] = 1;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      cluster.push(pips[curr]);
      for (const neighbor of adj[curr]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    if (cluster.length > 0) {
      rawClusters.push(cluster);
    }
  }

  // Process each cluster into one or more domino tiles
  const tiles: DetectedTileCV[] = [];
  let tileCounter = 1;

  for (const cluster of rawClusters) {
    // If a cluster has a very high pip count (> 24) or large aspect span,
    // it likely contains multiple dominoes touching each other.
    const minX = Math.min(...cluster.map((p) => p.x));
    const maxX = Math.max(...cluster.map((p) => p.x));
    const minY = Math.min(...cluster.map((p) => p.y));
    const maxY = Math.max(...cluster.map((p) => p.y));
    const spanW = maxX - minX;
    const spanH = maxY - minY;

    // Check if cluster should be partitioned (e.g. multiple touching dominoes)
    const shouldSplit = cluster.length > 24 || (spanW > imgWidth * 0.45 && spanW > spanH * 2.2);

    const subClusters: DetectedPip[][] = [];
    if (shouldSplit && spanW > spanH) {
      const mid = minX + spanW / 2;
      subClusters.push(cluster.filter((p) => p.x <= mid));
      subClusters.push(cluster.filter((p) => p.x > mid));
    } else if (shouldSplit && spanH >= spanW) {
      const mid = minY + spanH / 2;
      subClusters.push(cluster.filter((p) => p.y <= mid));
      subClusters.push(cluster.filter((p) => p.y > mid));
    } else {
      subClusters.push(cluster);
    }

    for (const sub of subClusters) {
      // An isolated speck is insufficient evidence. Phase A still detects
      // genuine [0|1] and blank tiles from their physical body.
      if (sub.length < 3) continue;

      const sMinX = Math.min(...sub.map((p) => p.x));
      const sMaxX = Math.max(...sub.map((p) => p.x));
      const sMinY = Math.min(...sub.map((p) => p.y));
      const sMaxY = Math.max(...sub.map((p) => p.y));

      const padX = Math.max(14, medianRadius * 3);
      const padY = Math.max(14, medianRadius * 3);

      const bboxX = Math.max(0, sMinX - padX);
      const bboxY = Math.max(0, sMinY - padY);
      const bboxW = Math.min(imgWidth - bboxX, (sMaxX - sMinX) + padX * 2);
      const bboxH = Math.min(imgHeight - bboxY, (sMaxY - sMinY) + padY * 2);

      const orientation: 'vertical' | 'horizontal' = bboxH >= bboxW ? 'vertical' : 'horizontal';
      const bbox = { x: bboxX, y: bboxY, width: bboxW, height: bboxH };
      if (!isPlausibleDominoBox(bbox, imgWidth, imgHeight)) continue;
      const { halfA, halfB } = splitTileHalves(bbox, orientation);

      // Separate pips into halfA and halfB
      let pipsA: DetectedPip[];
      let pipsB: DetectedPip[];

      if (orientation === 'vertical') {
        const midY = bboxY + bboxH / 2;
        pipsA = sub.filter((p) => p.y < midY);
        pipsB = sub.filter((p) => p.y >= midY);
      } else {
        const midX = bboxX + bboxW / 2;
        pipsA = sub.filter((p) => p.x < midX);
        pipsB = sub.filter((p) => p.x >= midX);
      }

      // Constrain to maximum 12 pips per half for Mexican Train Double-12
      const countA = Math.min(12, pipsA.length);
      const countB = Math.min(12, pipsB.length);
      // Preserve physical orientation: A is left/top, B is right/bottom.
      const sideA = countA;
      const sideB = countB;

      tiles.push({
        id: `tile-cluster-${tileCounter++}`,
        bbox,
        orientation,
        halfA: { bbox: halfA, pips: pipsA.slice(0, 12), count: countA },
        halfB: { bbox: halfB, pips: pipsB.slice(0, 12), count: countB },
        sideA,
        sideB,
        points: sideA + sideB,
        confidence: 0.94,
        label: `[${sideA}|${sideB}]`,
      });
    }
  }

  return tiles;
}


/** Scale and shape gate for a physical Double-12 domino, relative to the frame. */
export function isPlausibleDominoBox(
  bbox: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number
): boolean {
  if (frameWidth <= 0 || frameHeight <= 0 || bbox.width <= 0 || bbox.height <= 0) return false;
  const areaFraction = (bbox.width * bbox.height) / (frameWidth * frameHeight);
  const shortSide = Math.min(bbox.width, bbox.height);
  const longSide = Math.max(bbox.width, bbox.height);
  const aspect = longSide / shortSide;
  const frameShortSide = Math.min(frameWidth, frameHeight);
  const frameLongSide = Math.max(frameWidth, frameHeight);
  // A real domino occupies a substantial, elongated footprint. Reject
  // tiny reflected objects and any candidate clipped by the frame edge.
  const frameMargin = Math.max(2, frameShortSide * 0.006);
  const staysInsideFrame =
    bbox.x >= frameMargin &&
    bbox.y >= frameMargin &&
    bbox.x + bbox.width <= frameWidth - frameMargin &&
    bbox.y + bbox.height <= frameHeight - frameMargin;
  return staysInsideFrame &&
    areaFraction >= 0.002 && areaFraction <= 0.07 &&
    shortSide >= Math.max(20, frameShortSide * 0.06) &&
    longSide >= Math.max(40, frameShortSide * 0.10) &&
    longSide <= frameLongSide * 0.42 &&
    aspect >= 1.35 && aspect <= 2.75;
}

/** Yellow hue/chroma mask; works when a yellow tile is not bright enough in grayscale. */
export function isYellowTilePixel(r: number, g: number, b: number): boolean {
  return r >= 75 && g >= 65 && b <= Math.min(r, g) * 0.84 &&
    r - b >= 25 && g - b >= 18 && g >= r * 0.45 && r >= g * 0.82;
}

/** Geometry gate for a body-segmented tile. Larger close-up pieces are allowed
 * only on this path; pip-only proposals continue to use the stricter gate above. */
function isPlausibleDominoBodyBox(
  bbox: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number
): boolean {
  if (frameWidth <= 0 || frameHeight <= 0 || bbox.width <= 0 || bbox.height <= 0) return false;
  const frameShort = Math.min(frameWidth, frameHeight);
  const frameLong = Math.max(frameWidth, frameHeight);
  const shortSide = Math.min(bbox.width, bbox.height);
  const longSide = Math.max(bbox.width, bbox.height);
  const areaFraction = (bbox.width * bbox.height) / (frameWidth * frameHeight);
  const aspect = longSide / shortSide;
  const margin = Math.max(2, frameShort * 0.006);
  const inside = bbox.x >= margin && bbox.y >= margin &&
    bbox.x + bbox.width <= frameWidth - margin &&
    bbox.y + bbox.height <= frameHeight - margin;
  return inside &&
    areaFraction >= 0.01 && areaFraction <= 0.42 &&
    shortSide >= Math.max(20, frameShort * 0.055) &&
    longSide >= Math.max(40, frameShort * 0.10) &&
    longSide <= frameLong * 0.94 &&
    aspect >= 1.5 && aspect <= 3.0;
}

/** Verifies the dark separator stripe through the centre of a candidate body. */
function hasDominoDivider(
  gray: Uint8Array,
  frameWidth: number,
  frameHeight: number,
  bbox: { x: number; y: number; width: number; height: number },
  orientation: 'vertical' | 'horizontal'
): boolean {
  const x0 = Math.max(0, Math.floor(bbox.x + bbox.width * 0.12));
  const x1 = Math.min(frameWidth - 1, Math.ceil(bbox.x + bbox.width * 0.88));
  const y0 = Math.max(0, Math.floor(bbox.y + bbox.height * 0.12));
  const y1 = Math.min(frameHeight - 1, Math.ceil(bbox.y + bbox.height * 0.88));
  let total = 0, count = 0, darkest = Number.POSITIVE_INFINITY;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total += gray[y * frameWidth + x];
      count++;
    }
  }
  if (count === 0) return false;
  const faceMean = total / count;

  if (orientation === 'horizontal') {
    const start = Math.max(x0, Math.floor(bbox.x + bbox.width * 0.34));
    const end = Math.min(x1, Math.ceil(bbox.x + bbox.width * 0.66));
    for (let x = start; x <= end; x++) {
      let sum = 0;
      for (let y = y0; y <= y1; y++) sum += gray[y * frameWidth + x];
      darkest = Math.min(darkest, sum / Math.max(1, y1 - y0 + 1));
    }
  } else {
    const start = Math.max(y0, Math.floor(bbox.y + bbox.height * 0.34));
    const end = Math.min(y1, Math.ceil(bbox.y + bbox.height * 0.66));
    for (let y = start; y <= end; y++) {
      let sum = 0;
      for (let x = x0; x <= x1; x++) sum += gray[y * frameWidth + x];
      darkest = Math.min(darkest, sum / Math.max(1, x1 - x0 + 1));
    }
  }
  return Number.isFinite(darkest) && darkest < Math.min(145, faceMean * 0.72);
}

/** Rejoins the two nearly-square face components when a black divider
 * separates the halves completely in the binary body mask. */
function mergeAdjacentBodyComponents(
  blobs: ComponentBlob[],
  width: number,
  height: number
): ComponentBlob[] {
  const candidates = [...blobs];
  const frameShort = Math.min(width, height);
  const maxGap = Math.max(8, frameShort * 0.035);

  for (let i = 0; i < blobs.length; i++) {
    const a = blobs[i];
    const aw = a.maxX - a.minX + 1;
    const ah = a.maxY - a.minY + 1;
    const aShape = Math.max(aw, ah) / Math.max(1, Math.min(aw, ah));
    if (aShape > 1.8) continue;

    for (let j = i + 1; j < blobs.length; j++) {
      const b = blobs[j];
      const bw = b.maxX - b.minX + 1;
      const bh = b.maxY - b.minY + 1;
      const bShape = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
      if (bShape > 1.8) continue;

      const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1);
      const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + 1);
      const gapX = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX) - 1);
      const gapY = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY) - 1);
      const sameHeight = Math.min(ah, bh) / Math.max(ah, bh) >= 0.68;
      const sameWidth = Math.min(aw, bw) / Math.max(aw, bw) >= 0.68;
      const horizontalPair = sameHeight &&
        overlapY / Math.max(1, Math.min(ah, bh)) >= 0.72 && gapX <= maxGap;
      const verticalPair = sameWidth &&
        overlapX / Math.max(1, Math.min(aw, bw)) >= 0.72 && gapY <= maxGap;
      if (!horizontalPair && !verticalPair) continue;

      const bbox = {
        x: Math.min(a.minX, b.minX),
        y: Math.min(a.minY, b.minY),
        width: Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX) + 1,
        height: Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY) + 1,
      };
      if (!isPlausibleDominoBodyBox(bbox, width, height)) continue;
      if (candidates.some((existing) =>
        existing.minX === bbox.x && existing.minY === bbox.y &&
        existing.maxX === bbox.x + bbox.width - 1 &&
        existing.maxY === bbox.y + bbox.height - 1
      )) continue;

      const area = a.area + b.area;
      candidates.push({
        id: -((i + 1) * 10000 + j + 1),
        minX: bbox.x,
        maxX: bbox.x + bbox.width - 1,
        minY: bbox.y,
        maxY: bbox.y + bbox.height - 1,
        area,
        perimeter: 2 * (bbox.width + bbox.height),
        centroidX: Math.round((a.centroidX * a.area + b.centroidX * b.area) / Math.max(1, area)),
        centroidY: Math.round((a.centroidY * a.area + b.centroidY * b.area) / Math.max(1, area)),
      });
    }
  }

  return candidates;
}

/** Yellow pip mask; only compact, approximately circular yellow components
 * are pips. A solid yellow domino face is intentionally excluded. */
export function buildYellowPipMask(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (width <= 0 || height <= 0 || rgbaPixels.length !== width * height * 4) {
    throw new Error('Invalid RGBA frame dimensions');
  }
  const raw = new Uint8Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    const offset = i * 4;
    if (isYellowTilePixel(rgbaPixels[offset], rgbaPixels[offset + 1], rgbaPixels[offset + 2])) {
      raw[i] = 1;
    }
  }

  const frameShort = Math.min(width, height);
  const minRadius = Math.max(2.5, frameShort * 0.005);
  const maxRadius = Math.max(minRadius + 1, frameShort * 0.06);
  const blobs = findConnectedComponents(
    raw, width, height,
    Math.max(4, Math.PI * minRadius * minRadius * 0.5),
    Math.min(width * height * 0.02, Math.PI * maxRadius * maxRadius * 1.6)
  );
  const mask = new Uint8Array(raw.length);
  for (const blob of blobs) {
    const blobWidth = blob.maxX - blob.minX + 1;
    const blobHeight = blob.maxY - blob.minY + 1;
    const aspect = blobWidth / Math.max(1, blobHeight);
    const radius = Math.sqrt(blob.area / Math.PI);
    if (aspect < 0.55 || aspect > 1.8 || radius < minRadius || radius > maxRadius) continue;
    if (computeCircularity(blob.area, blob.perimeter) < 0.24) continue;
    for (let y = blob.minY; y <= blob.maxY; y++) {
      for (let x = blob.minX; x <= blob.maxX; x++) {
        const index = y * width + x;
        if (raw[index]) mask[index] = 1;
      }
    }
  }
  return mask;
}

/** Detects non-neutral pip colours (blue, green, red, purple, yellow, etc.)
 * independently of luminance. The mask is deliberately component-based: broad
 * coloured backgrounds are excluded by compact size, near-round shape and
 * circularity checks. Neutral black/grey pips remain covered by the grayscale
 * and adaptive masks. */
export function buildChromaticPipMask(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (width <= 0 || height <= 0 || rgbaPixels.length !== width * height * 4) {
    throw new Error('Invalid RGBA frame dimensions');
  }
  const raw = new Uint8Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    const offset = i * 4;
    const r = rgbaPixels[offset], g = rgbaPixels[offset + 1], b = rgbaPixels[offset + 2];
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const chroma = maximum - minimum;
    const saturation = maximum > 0 ? chroma / maximum : 0;
    if (maximum >= 65 && chroma >= 24 && saturation >= 0.20) raw[i] = 1;
  }

  const frameShort = Math.min(width, height);
  const minRadius = Math.max(2.5, frameShort * 0.0045);
  const maxRadius = Math.max(minRadius + 1, frameShort * 0.055);
  const blobs = findConnectedComponents(
    raw, width, height,
    Math.max(4, Math.PI * minRadius * minRadius * 0.38),
    Math.min(width * height * 0.012, Math.PI * maxRadius * maxRadius * 1.5)
  );
  const mask = new Uint8Array(raw.length);
  for (const blob of blobs) {
    const blobWidth = blob.maxX - blob.minX + 1;
    const blobHeight = blob.maxY - blob.minY + 1;
    const aspect = blobWidth / Math.max(1, blobHeight);
    const radius = Math.sqrt(blob.area / Math.PI);
    if (aspect < 0.52 || aspect > 1.92 || radius < minRadius || radius > maxRadius) continue;
    if (computeCircularity(blob.area, blob.perimeter) < 0.20) continue;
    for (let y = blob.minY; y <= blob.maxY; y++) {
      for (let x = blob.minX; x <= blob.maxX; x++) {
        const index = y * width + x;
        if (raw[index]) mask[index] = 1;
      }
    }
  }
  return mask;
}

/**
 * Separates neutral ivory/white domino faces from coloured backgrounds. Otsu
 * plus a small offset adapts to exposure while retaining the complete tile
 * face, rather than clipping shadowed edges at a high percentile.
 */
export function buildNeutralDominoBodyMask(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  gray: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (width <= 0 || height <= 0 || gray.length !== width * height || rgbaPixels.length !== width * height * 4) {
    throw new Error('Invalid frame dimensions');
  }
  const threshold = Math.max(40, computeOtsuThreshold(gray) + 8);
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < threshold) continue;
    const offset = i * 4;
    const r = rgbaPixels[offset], g = rgbaPixels[offset + 1], b = rgbaPixels[offset + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma <= Math.max(28, gray[i] * 0.16)) mask[i] = 1;
  }
  return mask;
}

/**
 * Main Offline Detection Pipeline:
 * Analyzes pixel data from HTML5 Canvas / Camera frame without any external server or API.
 * Detects multiple dominoes and catalogs each piece individually.
 */

interface PipGroupCandidate {
  axis: 0 | 1;
  count: number;
  clusters: DetectedPip[][];
  score: number;
}

/** Deterministic 1-D k-means used to separate spatially distinct domino bodies. */
/** Globally optimal 1-D clustering via dynamic programming on sorted coordinates. */
function clusterPipsOnAxis(pips: DetectedPip[], axis: 0 | 1, k: number): DetectedPip[][] {
  const sorted = [...pips].sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));
  const n = sorted.length;
  if (k < 1 || k > n) return [];

  const prefix = new Float64Array(n + 1);
  const prefixSquares = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const value = axis === 0 ? sorted[i].x : sorted[i].y;
    prefix[i + 1] = prefix[i] + value;
    prefixSquares[i + 1] = prefixSquares[i] + value * value;
  }

  const columns = n + 1;
  const dp = new Float64Array((k + 1) * columns);
  const back = new Int16Array((k + 1) * columns);
  dp.fill(Number.POSITIVE_INFINITY);
  back.fill(-1);
  dp[0] = 0;

  const intervalCost = (from: number, to: number): number => {
    const count = to - from;
    if (count <= 0) return Number.POSITIVE_INFINITY;
    const sum = prefix[to] - prefix[from];
    const sumSquares = prefixSquares[to] - prefixSquares[from];
    return Math.max(0, sumSquares - (sum * sum) / count);
  };

  for (let groups = 1; groups <= k; groups++) {
    for (let end = groups; end <= n; end++) {
      const row = groups * columns + end;
      for (let split = groups - 1; split < end; split++) {
        const candidate = dp[(groups - 1) * columns + split] + intervalCost(split, end);
        if (candidate < dp[row]) {
          dp[row] = candidate;
          back[row] = split;
        }
      }
    }
  }

  const groups: DetectedPip[][] = [];
  let end = n;
  for (let groupCount = k; groupCount >= 1; groupCount--) {
    const split = back[groupCount * columns + end];
    if (split < 0) return [];
    groups.push(sorted.slice(split, end));
    end = split;
  }
  return groups.reverse();
}

function findPlausiblePipGrouping(
  pips: DetectedPip[],
  width: number,
  height: number
): PipGroupCandidate | null {
  if (pips.length < 8) return null;
  const frameShort = Math.min(width, height);

  // Estimate the local pip spacing from nearest-neighbour distances. A gap
  // significantly larger than this is a stronger separator than a global
  // one-axis clustering when the tray contains several rows of dominoes.
  const nearestDistances = pips.map((pip, i) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (let j = 0; j < pips.length; j++) {
      if (i === j) continue;
      nearest = Math.min(nearest, Math.hypot(pip.x - pips[j].x, pip.y - pips[j].y));
    }
    return nearest;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  const medianNearest = nearestDistances[Math.floor(nearestDistances.length / 2)] || frameShort * 0.03;
  const splitFloor = Math.max(frameShort * 0.014, medianNearest * 1.5);

  const recurse = (group: DetectedPip[], depth: number): DetectedPip[][] => {
    if (group.length < 4) return [];
    const xs = group.map((p) => p.x);
    const ys = group.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const shortSpan = Math.min(spanX, spanY);
    const longSpan = Math.max(spanX, spanY);
    const aspect = longSpan / Math.max(1, shortSpan);
    const looksLikeTile =
      group.length <= 24 &&
      shortSpan >= Math.max(8, frameShort * 0.018) &&
      longSpan >= frameShort * 0.045 &&
      aspect >= 1.05 && aspect <= 3.8;

    if (looksLikeTile) return [group];
    if (depth >= 8 || group.length < 8) return [];

    let best: { axis: 0 | 1; index: number; gap: number; left: DetectedPip[]; right: DetectedPip[] } | null = null;
    for (const axis of [0, 1] as const) {
      const sorted = [...group].sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));
      for (let i = 1; i < sorted.length - 1; i++) {
        const previous = axis === 0 ? sorted[i - 1].x : sorted[i - 1].y;
        const next = axis === 0 ? sorted[i].x : sorted[i].y;
        const gap = next - previous;
        if (gap <= splitFloor) continue;
        const left = sorted.slice(0, i);
        const right = sorted.slice(i);
        if (left.length < 4 || right.length < 4) continue;
        if (!best || gap > best.gap) best = { axis, index: i, gap, left, right };
      }
    }
    if (!best) return [];

    const leftGroups = recurse(best.left, depth + 1);
    const rightGroups = recurse(best.right, depth + 1);
    if (leftGroups.length === 0 || rightGroups.length === 0) return [];
    return [...leftGroups, ...rightGroups];
  };

  const clusters = recurse(pips, 0);
  if (clusters.length >= 2 && clusters.length <= 12 &&
      clusters.every((group) => group.length >= 4 && group.length <= 24)) {
    let score = 0;
    for (const group of clusters) {
      const xs = group.map((p) => p.x);
      const ys = group.map((p) => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      const aspect = Math.max(spanX, spanY) / Math.max(1, Math.min(spanX, spanY));
      score += 10 - Math.abs(Math.log(aspect / 2.0));
    }
    return { axis: 0, count: clusters.length, clusters, score };
  }

  // Exact 1-D partition fallback for a single-row or single-column tray.
  let best: PipGroupCandidate | null = null;
  const maxGroups = Math.min(12, Math.floor(pips.length / 4));
  for (const axis of [0, 1] as const) {
    for (let count = 2; count <= maxGroups; count++) {
      const groups = clusterPipsOnAxis(pips, axis, count);
      if (groups.length !== count) continue;
      let valid = true;
      let score = count * 10;
      for (const group of groups) {
        if (group.length < 4 || group.length > 24) { valid = false; break; }
        const xs = group.map((p) => p.x);
        const ys = group.map((p) => p.y);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);
        const shortSpan = Math.min(spanX, spanY);
        const longSpan = Math.max(spanX, spanY);
        const aspect = longSpan / Math.max(1, shortSpan);
        if (shortSpan < Math.max(12, frameShort * 0.025) ||
            longSpan < frameShort * 0.05 || aspect < 1.05 || aspect > 3.8) {
          valid = false;
          break;
        }
        score -= Math.abs(Math.log(aspect / 2.0));
      }
      if (valid && (!best || score > best.score)) {
        best = { axis, count, clusters: groups, score };
      }
    }
  }
  return best;
}

/**
 * Gradient-based radial voting for shiny/low-contrast pips.
 * It votes for circle centres from edge normals, rather than requiring a dark
 * filled blob. This keeps yellow and grey pips visible under exposure changes.
 */
export function detectPipsByRadialVoting(
  gray: Uint8Array,
  width: number,
  height: number
): DetectedPip[] {
  if (width < 24 || height < 24 || gray.length !== width * height) return [];

  const smooth = new Float32Array(gray.length);
  const gx = new Float32Array(gray.length);
  const gy = new Float32Array(gray.length);
  const magnitude = new Float32Array(gray.length);
  const histogram = new Uint32Array(2048);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      smooth[i] = (
        gray[i - width - 1] + 2 * gray[i - width] + gray[i - width + 1] +
        2 * gray[i - 1] + 4 * gray[i] + 2 * gray[i + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1]
      ) / 16;
    }
  }

  let edgeCount = 0;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      const p00 = smooth[i - width - 1], p01 = smooth[i - width], p02 = smooth[i - width + 1];
      const p10 = smooth[i - 1], p12 = smooth[i + 1];
      const p20 = smooth[i + width - 1], p21 = smooth[i + width], p22 = smooth[i + width + 1];
      const sx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;
      const sy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
      gx[i] = sx;
      gy[i] = sy;
      const mag = Math.hypot(sx, sy);
      magnitude[i] = mag;
      histogram[Math.min(2047, Math.round(mag))]++;
      edgeCount++;
    }
  }

  let thresholdCount = Math.ceil(edgeCount * 0.78);
  let accumulated = 0;
  let edgeThreshold = 0;
  for (let i = 0; i < histogram.length; i++) {
    accumulated += histogram[i];
    if (accumulated >= thresholdCount) {
      edgeThreshold = i;
      break;
    }
  }

  const shortSide = Math.min(width, height);
  // Reference photos show pip radii around 2–4% of the frame short side.
  // The wider band recovers pale and glossy dots without counting them as
  // independent pieces: centres are accepted only inside a confirmed body.
  const minRadius = Math.max(4, Math.round(shortSide * 0.012));
  const maxRadius = Math.max(minRadius + 1, Math.round(shortSide * 0.046));
  const accumulator = new Uint16Array(gray.length);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      const mag = magnitude[i];
      if (mag <= edgeThreshold || mag < 1) continue;
      const ux = gx[i] / mag;
      const uy = gy[i] / mag;
      for (let radius = minRadius; radius <= maxRadius; radius++) {
        const dx = ux * radius;
        const dy = uy * radius;
        const x1 = Math.round(x - dx), y1 = Math.round(y - dy);
        const x2 = Math.round(x + dx), y2 = Math.round(y + dy);
        if (x1 >= 0 && x1 < width && y1 >= 0 && y1 < height) {
          const at = y1 * width + x1;
          if (accumulator[at] < 65535) accumulator[at]++;
        }
        if (x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
          const at = y2 * width + x2;
          if (accumulator[at] < 65535) accumulator[at]++;
        }
      }
    }
  }

  let maximumVotes = 0;
  for (let i = 0; i < accumulator.length; i++) {
    if (accumulator[i] > maximumVotes) maximumVotes = accumulator[i];
  }
  if (maximumVotes < 8) return [];
  const minVotes = 7;
  const voteThreshold = Math.max(minVotes, maximumVotes * 0.16);
  const candidates: Array<{ x: number; y: number; votes: number }> = [];

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      const votes = accumulator[i];
      if (votes < voteThreshold) continue;
      let isMaximum = true;
      for (let dy = -2; dy <= 2 && isMaximum; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if ((dx !== 0 || dy !== 0) && accumulator[(y + dy) * width + x + dx] > votes) {
            isMaximum = false;
            break;
          }
        }
      }
      if (isMaximum) candidates.push({ x, y, votes });
    }
  }

  candidates.sort((a, b) => b.votes - a.votes);
  const minDistance = Math.max(6, Math.round(shortSide * 0.029));
  const minDistanceSquared = minDistance * minDistance;
  const selected: DetectedPip[] = [];
  const radius = (minRadius + maxRadius) / 2;
  for (const candidate of candidates) {
    if (selected.some((other) => {
      const dx = candidate.x - other.x;
      const dy = candidate.y - other.y;
      return dx * dx + dy * dy < minDistanceSquared;
    })) continue;
    selected.push({
      x: candidate.x,
      y: candidate.y,
      radius: Math.round(radius),
      area: Math.PI * radius * radius,
      circularity: 0.82,
    });
  }
  return selected;
}

function tilesFromRadialPips(
  pips: DetectedPip[],
  gray: Uint8Array,
  width: number,
  height: number
): DetectedTileCV[] {
  const grouping = findPlausiblePipGrouping(pips, width, height);
  if (!grouping) return [];
  const frameShort = Math.min(width, height);
  const medianRadius = [...pips].map((p) => p.radius).sort((a, b) => a - b)[Math.floor(pips.length / 2)] || 6;
  const tiles: DetectedTileCV[] = [];

  grouping.clusters.forEach((group, index) => {
    const xs = group.map((p) => p.x);
    const ys = group.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const orientation: 'vertical' | 'horizontal' = spanY >= spanX ? 'vertical' : 'horizontal';
    const pad = Math.max(10, Math.round(medianRadius * 1.5), Math.round(Math.min(spanX, spanY) * 0.12));
    const bbox = {
      x: Math.max(0, minX - pad),
      y: Math.max(0, minY - pad),
      width: Math.min(width - Math.max(0, minX - pad), spanX + 1 + pad * 2),
      height: Math.min(height - Math.max(0, minY - pad), spanY + 1 + pad * 2),
    };
    if (!isPlausibleDominoBox(bbox, width, height)) return;

    let divider = 0;
    if (orientation === 'vertical') {
      const scanStart = Math.max(0, Math.floor(minY + spanY * 0.32));
      const scanEnd = Math.min(height - 1, Math.ceil(minY + spanY * 0.68));
      let darkest = Number.POSITIVE_INFINITY;
      for (let y = scanStart; y <= scanEnd; y++) {
        let sum = 0;
        for (let x = minX; x <= maxX; x++) sum += gray[y * width + x];
        const mean = sum / Math.max(1, maxX - minX + 1);
        if (mean < darkest) {
          darkest = mean;
          divider = y;
        }
      }
      // Use the divider stripe only when it is visibly darker than the local tile.
      const localMean = group.reduce((sum, pip) => sum + gray[Math.max(0, Math.min(height - 1, pip.y)) * width + Math.max(0, Math.min(width - 1, pip.x))], 0) / group.length;
      if (!Number.isFinite(darkest) || darkest > localMean * 0.78) divider = Math.round((minY + maxY) / 2);
    } else {
      const scanStart = Math.max(0, Math.floor(minX + spanX * 0.32));
      const scanEnd = Math.min(width - 1, Math.ceil(minX + spanX * 0.68));
      let darkest = Number.POSITIVE_INFINITY;
      for (let x = scanStart; x <= scanEnd; x++) {
        let sum = 0;
        for (let y = minY; y <= maxY; y++) sum += gray[y * width + x];
        const mean = sum / Math.max(1, maxY - minY + 1);
        if (mean < darkest) {
          darkest = mean;
          divider = x;
        }
      }
      const localMean = group.reduce((sum, pip) => sum + gray[Math.max(0, Math.min(height - 1, pip.y)) * width + Math.max(0, Math.min(width - 1, pip.x))], 0) / group.length;
      if (!Number.isFinite(darkest) || darkest > localMean * 0.78) divider = Math.round((minX + maxX) / 2);
    }

    const pipsA = orientation === 'vertical'
      ? group.filter((p) => p.y < divider)
      : group.filter((p) => p.x < divider);
    const pipsB = orientation === 'vertical'
      ? group.filter((p) => p.y > divider)
      : group.filter((p) => p.x > divider);
    if (pipsA.length > 12 || pipsB.length > 12 || pipsA.length + pipsB.length < 4) return;

    const { halfA, halfB } = splitTileHalves(bbox, orientation);
    const sideA = pipsA.length;
    const sideB = pipsB.length;
    tiles.push({
      id: `tile-hough-${index + 1}`,
      bbox,
      orientation,
      halfA: { bbox: halfA, pips: pipsA, count: sideA },
      halfB: { bbox: halfB, pips: pipsB, count: sideB },
      sideA,
      sideB,
      points: sideA + sideB,
      confidence: 0.88,
      label: `[${sideA}|${sideB}]`,
    });
  });

  return tiles;
}

/** Full-frame domino cataloguing from circular pip centres and the centre divider. */
export function detectDominoesByRadialVoting(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DetectedTileCV[] {
  const gray = rgbToGrayscale(rgbaPixels, width, height);
  const pips = detectPipsByRadialVoting(gray, width, height);
  return tilesFromRadialPips(pips, gray, width, height);
}


export function detectDominoesOffline(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: CVOptions = {}
): OfflineCVResult {
  const startTime = performance.now();

  const gray = rgbToGrayscale(rgbaPixels, width, height);

  // Determine threshold
  let threshold: number;
  if (options.thresholdMode === 'manual' && options.manualThreshold !== undefined) {
    threshold = options.manualThreshold;
  } else {
    threshold = computeOtsuThreshold(gray);
  }

  // Reuse radial pip centres both as an independent proposal source and
  // as in-box evidence for body candidates whose pips are pale, glossy or dark.
  const radialPips = detectPipsByRadialVoting(gray, width, height);
  const radialTiles = tilesFromRadialPips(radialPips, gray, width, height);

  // 1. Detect Pips with both adaptive local contrast and the classic threshold.
  // The adaptive mask retains glossy yellow/grey pips when their luminance is
  // close to the tile face; the local-brightness gate rejects dark table texture.
  const pipThreshold = Math.min(220, Math.max(105, threshold + 12));
  const classicPips = binarize(gray, pipThreshold, options.invertColors ?? false);
  const adaptivePips = buildAdaptivePipMask(gray, width, height, options.invertColors ?? false);
  const yellowPips = buildYellowPipMask(rgbaPixels, width, height);
  const chromaticPips = buildChromaticPipMask(rgbaPixels, width, height);
  const binPips = new Uint8Array(gray.length);
  for (let i = 0; i < binPips.length; i++) {
    binPips[i] = classicPips[i] || adaptivePips[i] || yellowPips[i] || chromaticPips[i] ? 1 : 0;
  }

  // 2. Detect neutral ivory/white bodies and add all chromatic yellow surface
  // pixels only to the body mask. Yellow pip counting above keeps only round
  // yellow components, so a yellow tile face cannot become one giant pip.
  const binTiles = buildNeutralDominoBodyMask(rgbaPixels, gray, width, height);
  for (let i = 0; i < binTiles.length; i++) {
    const offset = i * 4;
    if (isYellowTilePixel(rgbaPixels[offset], rgbaPixels[offset + 1], rgbaPixels[offset + 2])) {
      binTiles[i] = 1;
    }
  }

  // Reject tiny specks and oversized regions at the connected-component stage.
  const minTileArea = (width * height) * 0.00035;
  const maxTileArea = (width * height) * 0.45;
  const tileBlobs = findConnectedComponents(binTiles, width, height, minTileArea, maxTileArea);

  // Dominoes are elongated rectangles; allow perspective, but reject irregular blobs.
  const mergedBodyBlobs = mergeAdjacentBodyComponents(tileBlobs, width, height);
  const candidateBlobs = mergedBodyBlobs.filter((b) => {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const bbox = { x: b.minX, y: b.minY, width: bw, height: bh };
    const rectangularity = b.area / Math.max(1, bw * bh);
    return isPlausibleDominoBodyBox(bbox, width, height) && rectangularity >= 0.24;
  });

  const detectedTiles: DetectedTileCV[] = [];

  // Phase A: Analyze distinct domino body blobs
  if (candidateBlobs.length > 0) {
    candidateBlobs.forEach((blob, idx) => {
      const bw = blob.maxX - blob.minX + 1;
      const bh = blob.maxY - blob.minY + 1;
      const orientation: 'vertical' | 'horizontal' = bh > bw ? 'vertical' : 'horizontal';
      const bbox = { x: blob.minX, y: blob.minY, width: bw, height: bh };

      const { halfA, halfB } = splitTileHalves(bbox, orientation);
      const minPipRadius = Math.max(3, Math.min(bw, bh) * 0.04);
      const maxPipRadius = Math.max(minPipRadius + 1, Math.min(40, Math.min(bw, bh) * 0.24));
      const maskPipsA = detectPipsInHalf(binPips, width, halfA, minPipRadius, maxPipRadius, 0.36);
      const maskPipsB = detectPipsInHalf(binPips, width, halfB, minPipRadius, maxPipRadius, 0.36);
      const mergeRadialCentres = (
        maskPips: DetectedPip[],
        half: { x: number; y: number; width: number; height: number }
      ): DetectedPip[] => {
        const combined = [...maskPips];
        for (const radial of radialPips) {
          if (radial.radius < minPipRadius * 0.72 || radial.radius > maxPipRadius * 0.95) continue;
          if (radial.x < half.x || radial.x >= half.x + half.width ||
              radial.y < half.y || radial.y >= half.y + half.height) continue;
          const duplicate = combined.some((pip) =>
            Math.hypot(pip.x - radial.x, pip.y - radial.y) <
              Math.max(pip.radius, radial.radius) * 1.25
          );
          if (!duplicate) combined.push(radial);
        }
        return combined;
      };
      const pipsA = mergeRadialCentres(maskPipsA, halfA);
      const pipsB = mergeRadialCentres(maskPipsB, halfB);

      const countA = pipsA.length;
      const countB = pipsB.length;
      // A body candidate needs a real centre separator and at least one
      // circular pip; this prevents bright boards, trays and large objects
      // from becoming dominoes solely because of their rectangular shape.
      if (countA > 12 || countB > 12 || countA + countB === 0 ||
          !hasDominoDivider(gray, width, height, bbox, orientation)) return;

      // Preserve physical orientation: A is left/top, B is right/bottom.
      const sideA = countA;
      const sideB = countB;

      const confidence = Math.min(
        0.98,
        0.80 + (pipsA.length > 0 ? 0.09 : 0) + (pipsB.length > 0 ? 0.09 : 0)
      );

      detectedTiles.push({
        id: `tile-cv-${idx + 1}`,
        bbox,
        orientation,
        halfA: { bbox: halfA, pips: pipsA, count: countA },
        halfB: { bbox: halfB, pips: pipsB, count: countB },
        sideA,
        sideB,
        points: sideA + sideB,
        confidence: Number(confidence.toFixed(2)),
        label: `[${sideA}|${sideB}]`,
      });
    });
  }

  // Phase B: Global Pip Spatial Clustering
  // Detect all pips across the entire image to discover tiles that weren't segmented by tileBlobs
  // (e.g. low background contrast, tiles touching each other, wood grain table)
  const allGlobalPips = detectAllPips(binPips, width, height);

  if (allGlobalPips.length > 0) {
    // Filter out pips that are already accounted for by Phase A
    const unaccountedPips = allGlobalPips.filter((pip) => {
      return !detectedTiles.some((t) => {
        const { x, y, width: tw, height: th } = t.bbox;
        return pip.x >= x && pip.x <= x + tw && pip.y >= y && pip.y <= y + th;
      });
    });

    if (unaccountedPips.length > 0) {
      const clusteredTiles = clusterPipsIntoDominoes(unaccountedPips, width, height);
      for (const cTile of clusteredTiles) {
        cTile.id = `tile-cv-${detectedTiles.length + 1}`;
        detectedTiles.push(cTile);
      }
    }
  }

  // Merge independent detectors by physical-box overlap. Keep the candidate
  // with the stronger point evidence for each tile; retain non-overlapping
  // proposals from either path so one incomplete detector cannot suppress pieces.
  const mergedTiles = [...detectedTiles];
  const intersectionOverUnion = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ) => {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
  };

  for (const radial of radialTiles) {
    let bestIndex = -1;
    let bestOverlap = 0;
    for (let i = 0; i < mergedTiles.length; i++) {
      const overlap = intersectionOverUnion(mergedTiles[i].bbox, radial.bbox);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = i;
      }
    }

    if (bestIndex < 0 || bestOverlap < 0.28) {
      mergedTiles.push(radial);
      continue;
    }

    const current = mergedTiles[bestIndex];
    const currentPips = current.halfA.pips.length + current.halfB.pips.length;
    const radialPips = radial.halfA.pips.length + radial.halfB.pips.length;
    const currentEvidence = currentPips + current.confidence * 2;
    const radialEvidence = radialPips + radial.confidence * 2;
    if (radialEvidence > currentEvidence) mergedTiles[bestIndex] = radial;
  }

  detectedTiles.splice(0, detectedTiles.length, ...mergedTiles);

  // Sort tiles from highest score to lowest (standard domino cataloging order)
  detectedTiles.sort((a, b) => b.points - a.points);

  const pieces: DetectedPiece[] = detectedTiles.map((tile) => ({
    id: tile.id,
    sideA: tile.sideA,
    sideB: tile.sideB,
    points: tile.points,
    label: tile.label,
    confidence: tile.confidence,
    box2d: [
      Math.round((tile.bbox.y / height) * 1000),
      Math.round((tile.bbox.x / width) * 1000),
      Math.round(((tile.bbox.y + tile.bbox.height) / height) * 1000),
      Math.round(((tile.bbox.x + tile.bbox.width) / width) * 1000),
    ],
  }));

  const totalPoints = pieces.reduce((sum, p) => sum + p.points, 0);
  const pipsTotal = detectedTiles.reduce(
    (sum, t) => sum + t.halfA.pips.length + t.halfB.pips.length,
    0
  );
  const endTime = performance.now();

  return {
    pieces,
    tiles: detectedTiles,
    totalPoints,
    source: 'offline_cv',
    processingTimeMs: Math.round(endTime - startTime),
    tilesCount: detectedTiles.length,
    pipsTotal,
    thresholdUsed: threshold,
    warning:
      detectedTiles.length === 0
        ? 'Nenhuma peça identificada com clareza. Use as amostras ou capture com contraste.'
        : undefined,
  };
}

/**
 * Renders the Double-Double-Dominoes classical CV visual overlay onto an HTML5 canvas.
 * Draws bounding boxes and pip indicators for EVERY detected piece individually.
 */
export function drawDominoCVOverlay(
  ctx: CanvasRenderingContext2D,
  cvResult: OfflineCVResult,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.save();

  // Draw overlay for EACH detected domino piece individually
  for (const tile of cvResult.tiles) {
    const { bbox, halfA, halfB } = tile;

    // 1. Tile Bounding Box (Emerald Green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

    // Semi-transparent background tint
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);

    // 2. Halves Bounding Box (Cyan / Sky)
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(halfA.bbox.x, halfA.bbox.y, halfA.bbox.width, halfA.bbox.height);
    ctx.strokeRect(halfB.bbox.x, halfB.bbox.y, halfB.bbox.width, halfB.bbox.height);

    // 3. Central Divider Marker (Dashed Yellow)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    if (tile.orientation === 'vertical') {
      const midY = halfA.bbox.y + halfA.bbox.height + Math.floor((halfB.bbox.y - (halfA.bbox.y + halfA.bbox.height)) / 2);
      ctx.beginPath();
      ctx.moveTo(bbox.x, midY);
      ctx.lineTo(bbox.x + bbox.width, midY);
      ctx.stroke();
    } else {
      const midX = halfA.bbox.x + halfA.bbox.width + Math.floor((halfB.bbox.x - (halfA.bbox.x + halfA.bbox.width)) / 2);
      ctx.beginPath();
      ctx.moveTo(midX, bbox.y);
      ctx.lineTo(midX, bbox.y + bbox.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 4. Highlight detected pips (Double-Double-Dominoes circle style)
    const drawPip = (pip: DetectedPip, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pip.x, pip.y, Math.max(pip.radius + 2, 5), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pip.x, pip.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    halfA.pips.forEach((p) => drawPip(p, '#34d399')); // light emerald
    halfB.pips.forEach((p) => drawPip(p, '#38bdf8')); // light sky blue

  }

  ctx.restore();
}
