import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CameraTab.tsx', import.meta.url), 'utf8');

test('gallery picker accepts images without forcing the camera', () => {
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
  assert.match(source, /Escolher da Galeria/);
  assert.match(source, /aria-label="Selecionar fotografia da galeria"/);
  const inputBlock = source.match(/<input\s+ref=\{fileInputRef\}[\s\S]*?\/>/)?.[0] ?? '';
  assert.ok(inputBlock, 'gallery file input exists');
  assert.doesNotMatch(inputBlock, /capture=/i, 'capture must not force camera capture');
});

test('camera remains a separate getUserMedia action', () => {
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /Abrir Câmera/);
});

test('offline CV never substitutes fabricated sample dominoes', () => {
  assert.match(source, /const finalPieces = cvResult\.pieces/);
  assert.match(source, /Nenhuma peça foi identificada com confiança/);
  assert.match(source, /pieces: \[\],\s*totalPoints: 0/);
  assert.match(source, /visionResult\.pieces\.length === 0 \|\| !selectedPlayerId/);
});

test('result summary exposes piece count and total hand score', () => {
  assert.match(source, /visionResult\.pieces\.length === 1 \? 'peça' : 'peças'/);
  assert.match(source, /\{visionResult\.totalPoints\} pts/);
});
