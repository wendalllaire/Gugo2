import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CameraTab.tsx', import.meta.url), 'utf8');
const detectorSource = readFileSync(new URL('../src/utils/dominoDetectorCV.ts', import.meta.url), 'utf8');

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

test('result summary keeps the total score without redundant engine and piece-count labels', () => {
  assert.doesNotMatch(source, /Visão Offline Double-Double/);
  assert.doesNotMatch(source, /Peças Catalogadas Individualmente/);
  assert.doesNotMatch(source, /Total da Mão/);
  assert.match(source, /\{visionResult\.totalPoints\} pts/);
});


test('detected pieces on the captured image can be tapped to open the existing editor', () => {
  assert.match(source, /Peças Identificadas \(toque na peça na imagem ou no lápis para editar\)/);
  assert.match(source, /visionResult\.pieces\.some\(\(piece\) => piece\.box2d\)/);
  assert.match(source, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(source, /onClick=\{\(\) => handleStartPieceEdit\(piece\)\}/);
  assert.match(source, /onKeyDown=\{\(event\) =>/);
  assert.match(source, /aria-label=/);
  assert.match(source, /const handleStartPieceEdit = \(piece: DetectedPiece\)/);
});

test('image hit areas use normalized detected bounding boxes and highlight the active piece', () => {
  assert.match(source, /const \[yMin, xMin, yMax, xMax\] = piece\.box2d/);
  assert.match(source, /const x = \(xMin \/ 1000\) \* lastRawImageData\.width/);
  assert.match(source, /const y = \(yMin \/ 1000\) \* lastRawImageData\.height/);
  assert.match(source, /editingPieceId === piece\.id/);
  assert.match(source, /isEditing \? "#f59e0b" : "#4faaa7"/);
});


test('live camera opens as a fullscreen viewfinder with capture and close controls', () => {
  assert.match(source, /fixed inset-0 z-\[100\] h-\[100dvh\] w-screen/);
  assert.match(source, /aria-label="Fechar câmara"/);
  assert.match(source, /aria-label="Tirar fotografia"/);
  assert.match(source, /streamActive \? 'hidden' : ''/);
});

test('captured domino overlay outlines and labels each individual half', () => {
  assert.match(source, /value: piece\.sideA/);
  assert.match(source, /value: piece\.sideB/);
  assert.match(source, /const halfWidth = isHorizontal \? width \/ 2 : width/);
  assert.match(source, /const halfHeight = isHorizontal \? height : height \/ 2/);
  assert.match(source, /x={halfX \+ 1}/);
  assert.match(source, /y={halfY \+ 1}/);
  assert.match(source, /x={halfX \+ labelPadding}/);
  assert.match(source, /\{half\.value\}/);
  assert.match(source, /Soma: \{visionResult\.totalPoints\}/);
  assert.doesNotMatch(source, /\{piece\.points\}/, 'the image must not show the per-piece sum badge');
  assert.match(source, /stroke="#4faaa7"/);
});

test('live camera keeps the summary badge and adds a contour and value to each half', () => {
  assert.match(source, /Pré-contagem offline · confirma após fotografar/);
  assert.match(source, /aria-label="Pré-contagem visual: cada metade do dominó está contornada e identificada"/);
  assert.match(source, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(source, /livePieces\.map\(\(piece\) =>/);
  assert.match(source, /\[piece\.sideA, piece\.sideB\]/);
  assert.match(source, /stroke="#4faaa7"/);
  assert.match(source, /\{value\}/);
});


test('offline image overlay does not draw a duplicate per-piece total label', () => {
  assert.doesNotMatch(detectorSource, /const labelText = `\$\{label\} • \$\{points\} pts`/);
  assert.match(detectorSource, /halfA\.pips\.forEach/);
  assert.match(detectorSource, /halfB\.pips\.forEach/);
});

test('live camera performs throttled on-device CV and displays a provisional count', () => {
  assert.ok(source.includes('const [livePieces, setLivePieces] = useState<DetectedPiece[]>([])'));
  assert.ok(source.includes('detectDominoesOffline(frame.data, previewCanvas.width, previewCanvas.height'));
  assert.ok(source.includes('now - lastScanAt < 900'));
  assert.ok(source.includes('window.requestAnimationFrame(scanFrame)'));
  assert.ok(source.includes('window.cancelAnimationFrame(animationFrame)'));
  assert.ok(source.includes('Pré-contagem offline · confirma após fotografar'));
  assert.ok(source.includes('aria-live="polite"'));
  assert.ok(source.includes('livePieces.map((piece) => `[${piece.sideA}|${piece.sideB}]`)'));
});
