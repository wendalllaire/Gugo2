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
      if (sub.length === 0) continue;

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
      const sideA = Math.min(countA, countB);
      const sideB = Math.max(countA, countB);

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

/**
 * Main Offline Detection Pipeline:
 * Analyzes pixel data from HTML5 Canvas / Camera frame without any external server or API.
 * Detects multiple dominoes and catalogs each piece individually.
 */
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

  // 1. Detect Pips: Pips are dark circular marks
  const pipThreshold = Math.max(20, threshold - 15);
  const binPips = binarize(gray, pipThreshold, options.invertColors ?? false);

  // 2. Detect Domino Bodies: Light ivory surfaces
  const tileThreshold = Math.min(235, threshold + 18);
  const binTiles = binarize(gray, tileThreshold, true);

  // Find candidate tile blobs
  const minTileArea = (width * height) * 0.005; // 0.5% of frame
  const maxTileArea = (width * height) * 0.75;
  const tileBlobs = findConnectedComponents(binTiles, width, height, minTileArea, maxTileArea);

  // Filter blobs with domino-like aspect ratios (~1:2 or 2:1)
  const candidateBlobs = tileBlobs.filter((b) => {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const aspect = bw / Math.max(1, bh);
    const isVertical = aspect >= 0.35 && aspect <= 0.85;
    const isHorizontal = aspect >= 1.20 && aspect <= 2.85;
    return isVertical || isHorizontal;
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
      const pipsA = detectPipsInHalf(binPips, width, halfA);
      const pipsB = detectPipsInHalf(binPips, width, halfB);

      const countA = pipsA.length;
      const countB = pipsB.length;
      const sideA = Math.min(countA, countB);
      const sideB = Math.max(countA, countB);

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

  // Global CV Watermark / Metrics Badge
  const cvBadgeText = `⚡ Visão Multi-Peças (${cvResult.tilesCount} catalogadas) • ${cvResult.processingTimeMs}ms`;
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  const badgeW = ctx.measureText(cvBadgeText).width + 16;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(10, 10, badgeW, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#34d399';
  ctx.fillText(cvBadgeText, 18, 25, Math.max(0, canvasWidth - 26));

  ctx.restore();
}
