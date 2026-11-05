import React, { useState, useRef, useEffect } from 'react';
import { Player, DetectedPiece, VisionResult, DominoTile } from '../types';
import { DominoPiece } from './DominoPiece';
import {
  detectDominoesOffline,
  drawDominoCVOverlay,
  CVOptions,
  OfflineCVResult,
} from '../utils/dominoDetectorCV';
import {
  Camera,
  Upload,
  RefreshCw,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Calculator,
  Eye,
  SlidersHorizontal,
  Cpu,
  Bot,
  Zap,
} from 'lucide-react';

interface CameraTabProps {
  players: Player[];
  currentRound: number;
  onAssignScore: (playerId: string, score: number, pieces?: DominoTile[]) => void;
}

export const CameraTab: React.FC<CameraTabProps> = ({
  players,
  currentRound,
  onAssignScore,
}) => {
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(players[0]?.id || '');
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [offlineProcessingNotice, setOfflineProcessingNotice] = useState(false);
  const [isPieceEditorPopupOpen, setIsPieceEditorPopupOpen] = useState(false);

  // Engine selection: 'auto' (Try Gemini -> fallback Offline), 'gemini' (Online AI), 'offline' (Double-Double-Dominoes)
  const [engineMode, setEngineMode] = useState<'auto' | 'gemini' | 'offline'>('auto');

  // Computer Vision Controls & Tuning
  const [showCvSettings, setShowCvSettings] = useState(false);
  const [thresholdMode, setThresholdMode] = useState<'otsu' | 'manual'>('otsu');
  const [manualThreshold, setManualThreshold] = useState<number>(128);
  const [invertColors, setInvertColors] = useState<boolean>(false);
  const [lastRawImageData, setLastRawImageData] = useState<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
  } | null>(null);

  // Individual Piece Editing State
  const [editingPieceId, setEditingPieceId] = useState<string | null>(null);
  const [editSideA, setEditSideA] = useState(6);
  const [editSideB, setEditSideB] = useState(6);

  // Manual Add Piece state
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualA, setManualA] = useState(12);
  const [manualB, setManualB] = useState(9);

  // Direct Manual Score mode state
  const [showDirectScoreInput, setShowDirectScoreInput] = useState(false);
  const [directScoreValue, setDirectScoreValue] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [livePieces, setLivePieces] = useState<DetectedPiece[]>([]);
  const [liveScanBusy, setLiveScanBusy] = useState(false);

  // Lightweight, on-device preview recognition while the viewfinder is open.
  // It deliberately uses offline CV (not Gemini/network) and samples a reduced frame
  // periodically so it does not compete with the camera preview or shutter.
  useEffect(() => {
    if (!streamActive) {
      setLivePieces([]);
      setLiveScanBusy(false);
      return;
    }

    let animationFrame = 0;
    let lastScanAt = 0;
    let cancelled = false;
    const previewCanvas = document.createElement('canvas');
    const previewContext = previewCanvas.getContext('2d', { willReadFrequently: true });

    const scanFrame = (now: number) => {
      if (cancelled) return;
      animationFrame = window.requestAnimationFrame(scanFrame);

      const video = videoRef.current;
      if (!video || !previewContext || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          !video.videoWidth || now - lastScanAt < 900) return;

      lastScanAt = now;
      const scale = Math.min(1, 640 / video.videoWidth);
      previewCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      previewCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));

      try {
        previewContext.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
        const frame = previewContext.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
        const result = detectDominoesOffline(frame.data, previewCanvas.width, previewCanvas.height, {
          thresholdMode,
          manualThreshold,
          invertColors,
        });
        if (!cancelled) setLivePieces(result.pieces);
      } catch (error) {
        // A transient frame/camera error must never interrupt the live preview.
        console.debug('Live domino preview skipped:', error);
      }
    };

    animationFrame = window.requestAnimationFrame(scanFrame);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [streamActive, thresholdMode, manualThreshold, invertColors]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreamActive(true);
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(
        'Não foi possível acessar a câmera do dispositivo. Você pode fazer upload de foto, adicionar peças manualmente ou usar as amostras predefinidas.'
      );
      setStreamActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
    setCapturedImage(dataUrl);
    stopCamera();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setLastRawImageData({ width: canvas.width, height: canvas.height, data: imageData.data });

    processImage(dataUrl, imageData.data, canvas.width, canvas.height);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    // Reset immediately so the same photo can be selected again after tuning.
    input.value = '';

    if (!file.type.startsWith('image/')) {
      setCameraError('Selecione um ficheiro de imagem válido.');
      return;
    }

    setCameraError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      stopCamera();

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(1280, img.width);
        canvas.height = Math.round((canvas.width / img.width) * img.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setLastRawImageData({ width: canvas.width, height: canvas.height, data: imageData.data });
        processImage(dataUrl, imageData.data, canvas.width, canvas.height);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  /**
   * Dispatches image recognition based on user selection:
   * - 'auto': Tries Gemini AI Vision first. If offline/unavailable, runs local CV.
   * - 'gemini': Online Gemini AI Vision with individual piece cataloging.
   * - 'offline': 100% offline Double-Double-Dominoes multi-piece segmentation.
   */
  const processImage = async (
    dataUrl: string,
    pixelData: Uint8ClampedArray,
    width: number,
    height: number
  ) => {
    setIsAnalyzing(true);
    setVisionResult(null);
    setAssignSuccess(false);
    setOfflineProcessingNotice(false);

    if (engineMode === 'offline') {
      runOfflineCV(pixelData, width, height, dataUrl);
      return;
    }

    try {
      // Call server-side API with Gemini AI vision
      const res = await fetch('/api/analyze-dominoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mode: engineMode,
          width,
          height,
        }),
      });

      if (!res.ok) {
        throw new Error(`Servidor retornou status ${res.status}`);
      }

      const data = await res.json();

      if (data.success && Array.isArray(data.pieces) && data.pieces.length > 0) {
        // Draw overlay for Gemini-detected pieces
        drawGeminiOverlay(dataUrl, data.pieces, width, height);

        setVisionResult({
          pieces: data.pieces,
          totalPoints: data.totalPoints,
          source: data.source || 'gemini_vision',
          warning: data.warning,
          imageUrl: dataUrl,
          timingMs: data.timingMs,
        });
        setIsAnalyzing(false);
        return;
      }

      // When Gemini API has quota exhausted or is unavailable, run local offline CV on the actual photo
      runOfflineCV(pixelData, width, height, dataUrl, {
        warning: data.message || (data.quotaExceeded ? 'Cota da IA Gemini atingida. Ativado motor offline no aparelho.' : undefined),
      });
    } catch (_err: any) {
      // Fallback seamlessly to offline CV without user-facing error interruption
      runOfflineCV(pixelData, width, height, dataUrl, {
        warning: 'Processamento 100% offline ativo no dispositivo.',
      });
    }
  };

  /**
   * Generates overlay canvas for Gemini detected pieces with 2D bounding boxes.
   */
  const drawGeminiOverlay = (
    originalDataUrl: string,
    _pieces: DetectedPiece[],
    width: number,
    height: number
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImg = new Image();
    baseImg.onload = () => {
      ctx.drawImage(baseImg, 0, 0, width, height);

      // The SVG layer draws a separate contour and value for each half.
      // Keep this canvas for the Gemini watermark only, avoiding a duplicate
      // full-domino rectangle underneath the individual half-boxes.

      // Gemini Watermark
      const badgeText = `🤖 IA Gemini Vision • ${_pieces.length} peças catalogadas`;
      ctx.font = '11px system-ui, sans-serif';
      const badgeW = ctx.measureText(badgeText).width + 16;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(10, 10, badgeW, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(badgeText, 18, 25);

      setOverlayImage(canvas.toDataURL('image/jpeg', 0.90));
    };
    baseImg.src = originalDataUrl;
  };

  /**
   * Executes 100% offline computer vision based on Double-Double-Dominoes.
   * Clusters all pips across the frame into multiple discrete domino pieces.
   */
  const runOfflineCV = (
    pixelData: Uint8ClampedArray,
    width: number,
    height: number,
    originalDataUrl: string,
    optionsOverride?: Partial<CVOptions> & { warning?: string }
  ) => {
    setIsAnalyzing(true);
    setVisionResult(null);
    setAssignSuccess(false);
    setOfflineProcessingNotice(true);

    try {
      const cvOptions: CVOptions = {
        thresholdMode,
        manualThreshold,
        invertColors,
        ...optionsOverride,
      };

      const cvResult = detectDominoesOffline(pixelData, width, height, cvOptions);

      // Generate CV visualization overlay canvas
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = width;
      overlayCanvas.height = height;
      const overlayCtx = overlayCanvas.getContext('2d');

      if (overlayCtx) {
        const baseImg = new Image();
        baseImg.onload = () => {
          overlayCtx.drawImage(baseImg, 0, 0, width, height);
          drawDominoCVOverlay(overlayCtx, cvResult, width, height);
          const overlayUrl = overlayCanvas.toDataURL('image/jpeg', 0.90);
          setOverlayImage(overlayUrl);
        };
        baseImg.src = originalDataUrl;
      }

      // Never invent dominoes when the detector finds no reliable pieces.
      // An empty result is safer than silently assigning a fabricated score.
      const finalPieces = cvResult.pieces;
      const noPiecesWarning =
        finalPieces.length === 0
          ? 'Nenhuma peça foi identificada com confiança. Tente melhorar a iluminação, enquadrar as peças ou adicionar os dominós manualmente.'
          : undefined;
      const totalPts = finalPieces.reduce((sum, p) => sum + p.points, 0);

      setVisionResult({
        pieces: finalPieces,
        totalPoints: totalPts,
        source: 'offline_cv',
        warning: [optionsOverride?.warning, cvResult.warning, noPiecesWarning]
          .filter(Boolean)
          .join(' ') || undefined,
        imageUrl: originalDataUrl,
        timingMs: cvResult.processingTimeMs,
        thresholdUsed: cvResult.thresholdUsed,
        pipsTotal: cvResult.pipsTotal,
      });
    } catch (err: any) {
      console.error('Offline CV Error:', err);
      setVisionResult({
        pieces: [],
        totalPoints: 0,
        source: 'offline_cv',
        warning: 'Não foi possível analisar esta imagem. Nenhuma pontuação foi inventada; tente outra foto ou adicione as peças manualmente.',
        imageUrl: originalDataUrl,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReprocessWithNewSettings = () => {
    if (lastRawImageData && capturedImage) {
      if (engineMode === 'offline') {
        runOfflineCV(
          lastRawImageData.data,
          lastRawImageData.width,
          lastRawImageData.height,
          capturedImage,
          {
            thresholdMode,
            manualThreshold,
            invertColors,
          }
        );
      } else {
        processImage(
          capturedImage,
          lastRawImageData.data,
          lastRawImageData.width,
          lastRawImageData.height
        );
      }
    }
  };

  // Start individual piece editing
  const handleStartPieceEdit = (piece: DetectedPiece) => {
    setEditingPieceId(piece.id);
    setEditSideA(piece.sideA);
    setEditSideB(piece.sideB);
  };

  const handleOpenPieceEditorPopup = (piece: DetectedPiece) => {
    setEditingPieceId(piece.id);
    setEditSideA(piece.sideA);
    setEditSideB(piece.sideB);
    setIsPieceEditorPopupOpen(true);
  };

  // Add a piece without depending on a previously detected result.
  const handleAddManualPiece = () => {
    // Keep the entered order; side A and side B are not interchangeable.
    const sideA = manualA;
    const sideB = manualB;
    const newPiece: DetectedPiece = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sideA,
      sideB,
      points: sideA + sideB,
      label: `[${sideA}|${sideB}]`,
    };

    setVisionResult((previous) => {
      const pieces = [...(previous?.pieces ?? []), newPiece];
      return {
        pieces,
        totalPoints: pieces.reduce((sum, piece) => sum + piece.points, 0),
        source: previous?.source ?? 'manual',
        imageUrl: previous?.imageUrl ?? capturedImage ?? undefined,
        warning: previous?.warning?.includes('Nenhuma peça foi identificada') ? undefined : previous?.warning,
        timingMs: previous?.timingMs,
        thresholdUsed: previous?.thresholdUsed,
        pipsTotal: previous?.pipsTotal,
      };
    });
    setShowManualAdd(false);
    setEditingPieceId(null);
  };

  // Save individual piece editing
  const handleSavePieceEdit = (pieceId: string) => {
    if (!visionResult) return;
    // Preserve the exact A/B order selected by the user.
    const a = editSideA;
    const b = editSideB;

    const updated = visionResult.pieces.map((p) => {
      if (p.id === pieceId) {
        return {
          ...p,
          sideA: a,
          sideB: b,
          points: a + b,
          label: `[${a}|${b}]`,
        };
      }
      return p;
    });

    const total = updated.reduce((sum, p) => sum + p.points, 0);
    setVisionResult({
      ...visionResult,
      pieces: updated,
      totalPoints: total,
    });
    setEditingPieceId(null);
  };

  // Remove individual piece
  const handleRemovePiece = (id: string) => {
    if (!visionResult) return;
    const updated = visionResult.pieces.filter((p) => p.id !== id);
    const total = updated.reduce((sum, p) => sum + p.points, 0);
    setVisionResult({
      ...visionResult,
      pieces: updated,
      totalPoints: total,
    });
    if (editingPieceId === id) setEditingPieceId(null);
  };

  // Direct manual score submit
  const handleApplyDirectManualScore = () => {
    const scoreNum = Math.max(0, parseInt(directScoreValue, 10) || 0);
    if (!selectedPlayerId) return;
    onAssignScore(selectedPlayerId, scoreNum, []);
    setAssignSuccess(true);
    setTimeout(() => setAssignSuccess(false), 3000);
    setShowDirectScoreInput(false);
  };

  // Assign vision/piece score to player
  const handleConfirmAssign = () => {
    if (!visionResult || visionResult.pieces.length === 0 || !selectedPlayerId) return;
    const tiles: DominoTile[] = visionResult.pieces.map((p) => ({
      id: `${p.sideA}-${p.sideB}-${p.id}`,
      sideA: p.sideA,
      sideB: p.sideB,
    }));
    onAssignScore(selectedPlayerId, visionResult.totalPoints, tiles);
    setAssignSuccess(true);
    setTimeout(() => setAssignSuccess(false), 3000);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Camera / Viewfinder Box */}
      <div className={streamActive ? "fixed inset-0 z-[100] h-[100dvh] w-screen overflow-hidden bg-black flex flex-col items-center justify-center" : capturedImage ? "relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm aspect-4/3 flex flex-col items-center justify-center" : "hidden"}>
        {/* Live Video Feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full ${streamActive ? 'object-cover block' : 'object-cover hidden'}`}
        />
        {streamActive && (
          <>
            <button
              type="button"
              onClick={stopCamera}
              aria-label="Fechar câmara"
              className="absolute top-5 left-5 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm border border-white/30"
            >
              <span aria-hidden="true" className="text-2xl leading-none">×</span>
            </button>
            <div className="absolute bottom-8 left-0 right-0 z-30 flex justify-center">
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                aria-label="Tirar fotografia"
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white bg-white/25 shadow-xl active:scale-95 transition-transform"
              >
                <span className="h-[56px] w-[56px] rounded-full bg-white" />
              </button>
            </div>
            <div className="absolute top-6 right-5 z-30 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              Câmara ativa
            </div>
            <div
              className="absolute top-20 left-1/2 z-30 -translate-x-1/2 max-w-[90vw] rounded-2xl border border-white/25 bg-black/70 px-4 py-2 text-center text-white shadow-lg backdrop-blur-sm"
              aria-live="polite"
              aria-label={`Pré-contagem: ${livePieces.length} peças, ${livePieces.reduce((sum, piece) => sum + piece.points, 0)} pontos`}
            >
              <div className="text-sm font-black">
                {livePieces.length} {livePieces.length === 1 ? 'peça' : 'peças'} · {livePieces.reduce((sum, piece) => sum + piece.points, 0)} pts
              </div>
              <div className="mt-0.5 max-w-full truncate text-[11px] font-semibold text-emerald-200">
                {livePieces.length
                  ? livePieces.map((piece) => `[${piece.sideA}|${piece.sideB}]`).join('  ')
                  : 'A procurar dominós…'}
              </div>
              <div className="mt-0.5 text-[9px] text-white/65">Pré-contagem offline · confirma após fotografar</div>
            </div>
            {livePieces.length > 0 && videoRef.current?.videoWidth && videoRef.current?.videoHeight && (
              <svg
                aria-label="Pré-contagem visual: cada metade do dominó está contornada e identificada"
                viewBox={`0 0 ${videoRef.current.videoWidth} ${videoRef.current.videoHeight}`}
                preserveAspectRatio="xMidYMid slice"
                className="absolute inset-0 z-20 h-full w-full pointer-events-none"
              >
                {livePieces.map((piece) => {
                  if (!piece.box2d) return null;
                  const [yMin, xMin, yMax, xMax] = piece.box2d;
                  const px = (xMin / 1000) * videoRef.current!.videoWidth;
                  const py = (yMin / 1000) * videoRef.current!.videoHeight;
                  const pw = ((xMax - xMin) / 1000) * videoRef.current!.videoWidth;
                  const ph = ((yMax - yMin) / 1000) * videoRef.current!.videoHeight;
                  const horizontal = pw >= ph;
                  return [piece.sideA, piece.sideB].map((value, index) => {
                    const hx = horizontal ? px + (index * pw) / 2 : px;
                    const hy = horizontal ? py : py + (index * ph) / 2;
                    const hw = horizontal ? pw / 2 : pw;
                    const hh = horizontal ? ph : ph / 2;
                    const fontSize = Math.max(16, Math.min(34, Math.min(hw, hh) * 0.24));
                    const pad = Math.max(5, fontSize * 0.22);
                    const labelWidth = Math.max(fontSize * 1.05, String(value).length * fontSize * 0.68 + pad * 2);
                    const labelHeight = fontSize * 1.35;
                    return (
                      <g key={`${piece.id}-half-${index}`}>
                        <rect
                          x={hx + 1}
                          y={hy + 1}
                          width={Math.max(0, hw - 2)}
                          height={Math.max(0, hh - 2)}
                          rx={Math.max(4, Math.min(hw, hh) * 0.045)}
                          fill="rgba(16, 185, 129, 0.07)"
                          stroke="#4faaa7"
                          strokeWidth="4"
                          vectorEffect="non-scaling-stroke"
                        />
                        <rect
                          x={hx + pad}
                          y={hy + pad}
                          width={labelWidth}
                          height={labelHeight}
                          rx={Math.max(4, fontSize * 0.2)}
                          fill="rgba(20, 20, 20, 0.72)"
                        />
                        <text
                          x={hx + pad * 2}
                          y={hy + pad + fontSize * 0.98}
                          textAnchor="start"
                          fontSize={fontSize}
                          fontFamily="Georgia, serif"
                          fontWeight="bold"
                          fill="#fff8e8"
                        >
                          {value}
                        </text>
                      </g>
                    );
                  });
                })}
              </svg>
            )}
          </>
        )}

        {/* Captured Image / CV Overlay View */}
        {capturedImage && !streamActive && (
          <>
            <img
              src={showOverlay && overlayImage ? overlayImage : capturedImage}
              alt="Foto do conjunto de dominós processada"
              className="absolute inset-0 w-full h-full object-contain bg-zinc-950"
            />
            {visionResult && lastRawImageData && visionResult.pieces.some((piece) => piece.box2d) && (
              <svg
                aria-label="Peças detetadas. Toque duas vezes numa peça para abrir o editor."
                role="group"
                viewBox={`0 0 ${lastRawImageData.width} ${lastRawImageData.height}`}
                preserveAspectRatio="xMidYMid meet"
                className="absolute inset-0 z-[5] w-full h-full"
              >
                {visionResult.pieces.map((piece) => {
                  if (!piece.box2d) return null;
                  const [yMin, xMin, yMax, xMax] = piece.box2d;
                  const x = (xMin / 1000) * lastRawImageData.width;
                  const y = (yMin / 1000) * lastRawImageData.height;
                  const width = ((xMax - xMin) / 1000) * lastRawImageData.width;
                  const height = ((yMax - yMin) / 1000) * lastRawImageData.height;
                  const isEditing = editingPieceId === piece.id;
                  const isHorizontal = width >= height;
                  const halfCenters = isHorizontal
                    ? [
                        { x: x + width * 0.25, y: y + height * 0.5, value: piece.sideA },
                        { x: x + width * 0.75, y: y + height * 0.5, value: piece.sideB },
                      ]
                    : [
                        { x: x + width * 0.5, y: y + height * 0.25, value: piece.sideA },
                        { x: x + width * 0.5, y: y + height * 0.75, value: piece.sideB },
                      ];
                  return (
                    <g key={piece.id}>
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={Math.max(4, Math.min(width, height) * 0.04)}
                        fill="transparent"
                        stroke="transparent"
                        strokeWidth={Math.max(3, lastRawImageData.width * 0.004)}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="all"
                        role="button"
                        tabIndex={0}
                        aria-label={`Editar peça ${piece.label}: lado A ${piece.sideA}, lado B ${piece.sideB}`}
                        aria-pressed={isEditing}
                        className="cursor-pointer"
                        onClick={() => handleStartPieceEdit(piece)}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleOpenPieceEditorPopup(piece);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleStartPieceEdit(piece);
                          }
                        }}
                      >
                        <title>{`Editar ${piece.label}: ${piece.sideA} e ${piece.sideB}`}</title>
                      </rect>
                      {halfCenters.map((half, halfIndex) => {
                        const halfX = isHorizontal
                          ? (halfIndex === 0 ? x : x + width / 2)
                          : x;
                        const halfY = isHorizontal
                          ? y
                          : (halfIndex === 0 ? y : y + height / 2);
                        const halfWidth = isHorizontal ? width / 2 : width;
                        const halfHeight = isHorizontal ? height : height / 2;
                        const labelFontSize = Math.max(16, Math.min(34, Math.min(halfWidth, halfHeight) * 0.24));
                        const labelPadding = Math.max(5, labelFontSize * 0.22);
                        const labelWidth = Math.max(labelFontSize * 1.05, String(half.value).length * labelFontSize * 0.68 + labelPadding * 2);
                        const labelHeight = labelFontSize * 1.35;
                        const stroke = isEditing ? "#f59e0b" : "#4faaa7";
                        return (
                          <g key={halfIndex} pointerEvents="none">
                            <rect
                              x={halfX + 1}
                              y={halfY + 1}
                              width={Math.max(0, halfWidth - 2)}
                              height={Math.max(0, halfHeight - 2)}
                              rx={Math.max(4, Math.min(halfWidth, halfHeight) * 0.045)}
                              fill={isEditing ? "rgba(245, 158, 11, 0.20)" : "rgba(16, 185, 129, 0.07)"}
                              stroke={stroke}
                              strokeWidth={Math.max(3, lastRawImageData.width * 0.004)}
                              vectorEffect="non-scaling-stroke"
                            />
                            <rect
                              x={halfX + labelPadding}
                              y={halfY + labelPadding}
                              width={labelWidth}
                              height={labelHeight}
                              rx={Math.max(4, labelFontSize * 0.2)}
                              fill="rgba(20, 20, 20, 0.72)"
                            />
                            <text
                              x={halfX + labelPadding * 2}
                              y={halfY + labelPadding + labelFontSize * 0.98}
                              textAnchor="start"
                              fontSize={labelFontSize}
                              fontFamily="Georgia, serif"
                              fontWeight="bold"
                              fill="#fff8e8"
                            >
                              {half.value}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                <text
                  x={lastRawImageData.width / 2}
                  y={lastRawImageData.height * 0.12}
                  textAnchor="middle"
                  fontSize={Math.max(36, Math.min(72, lastRawImageData.width * 0.06))}
                  fontFamily="Georgia, serif"
                  fill="#f5e8c2"
                  stroke="rgba(0, 0, 0, 0.72)"
                  strokeWidth="5"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  Soma: {visionResult.totalPoints}
                </text>
              </svg>
            )}
          </>
        )}

        {/* Toggle overlay badge when image is available */}
        {capturedImage && overlayImage && !streamActive && (
          <div className="absolute bottom-3 right-3 z-10">
            <button
              type="button"
              onClick={() => setShowOverlay(!showOverlay)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white text-xs font-bold backdrop-blur-xs border border-white/20 shadow-md transition-all"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>{showOverlay ? 'Ver Foto Limpa' : 'Ver Caixas e Pips'}</span>
            </button>
          </div>
        )}

        {/* Viewfinder Target Guidelines */}
        {(streamActive || capturedImage) && (
          <div className="absolute inset-4 pointer-events-none border-2 border-white/20 rounded-xl flex flex-col justify-between p-2">
            <div className="flex justify-between">
              <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
              <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
            </div>
            <div className="flex justify-between">
              <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
              <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
            </div>
          </div>
        )}

        {/* Analyzing Overlay Spinner */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center z-20 space-y-3">
            <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="text-sm font-bold text-white">
                {engineMode === 'offline'
                  ? 'Processando Visão Offline Multi-Peças...'
                  : 'Catalogando Peças com IA Gemini...'}
              </p>
              <p className="text-xs text-emerald-300">
                Segmentando e catalogando dominós um a um
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Camera Error Notice if any */}
      {cameraError && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Action Buttons Bar */}
      <div className={`grid grid-cols-2 sm:grid-cols-2 gap-2 ${streamActive ? 'hidden' : ''}`}>
        {!streamActive ? (
          <button
            type="button"
            onClick={startCamera}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>Abrir Câmera</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition-all animate-pulse"
          >
            <Check className="w-4 h-4" />
            <span>Tirar Foto</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold text-xs border border-zinc-200 dark:border-zinc-700 transition-all"
        >
          <Upload className="w-4 h-4" />
          <span>Escolher da Galeria</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          aria-label="Selecionar fotografia da galeria"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Manual Add Piece Panel */}
      {showManualAdd && (
        <div className="p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-emerald-500/40 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Adicionar Peça de Dominó Manualmente:
            </span>
            <button
              type="button"
              onClick={() => setShowManualAdd(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Cancelar
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-1.5">
              <label htmlFor="cam-manual-side-a" className="text-xs text-zinc-500">Lado A:</label>
              <select
                id="cam-manual-side-a"
                aria-label="Lado A do dominó"
                value={manualA}
                onChange={(e) => setManualA(Number(e.target.value))}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg p-1.5 text-xs font-bold"
              >
                {Array.from({ length: 13 }).map((_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 flex items-center gap-1.5">
              <label htmlFor="cam-manual-side-b" className="text-xs text-zinc-500">Lado B:</label>
              <select
                id="cam-manual-side-b"
                aria-label="Lado B do dominó"
                value={manualB}
                onChange={(e) => setManualB(Number(e.target.value))}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg p-1.5 text-xs font-bold"
              >
                {Array.from({ length: 13 }).map((_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddManualPiece}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
            >
              Inserir [{Math.min(manualA, manualB)}|{Math.max(manualA, manualB)}]
            </button>
          </div>
        </div>
      )}

      {/* Detection Results & Scores Breakdown with Individual Editing */}
      {visionResult && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-4">
          {/* Piece count stays outside the unchanged total-score indicator. */}
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <span className="text-xl font-black text-zinc-600 dark:text-zinc-300">
              {visionResult.pieces.length} {visionResult.pieces.length === 1 ? 'Peça' : 'Peças'} com total de:
            </span>
            <div className="px-3.5 py-1 rounded-xl bg-linear-to-r from-red-500 to-rose-600 text-white font-black text-xl shadow-sm">
              {visionResult.totalPoints} pts
            </div>
          </div>

          {visionResult.warning && !visionResult.warning.includes('Processamento 100% offline ativo no dispositivo') && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
              {visionResult.warning}
            </div>
          )}

          {/* List of Detected Pieces with individual scores and INLINE EDITING */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              <span>Toque duas vezes na peça para editar</span>
              <button
                type="button"
                onClick={() => setShowManualAdd(true)}
                className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visionResult.pieces.map((piece, index) => {
                const isEditing = editingPieceId === piece.id;

                return (
                  <div
                    key={piece.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isEditing
                        ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-500 shadow-xs'
                        : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    {isEditing ? (
                      /* Inline Editor for this piece */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                            Peça #{index + 1}: [{editSideA}|{editSideB}] ({editSideA + editSideB} pts):
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSavePieceEdit(piece.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Gravar</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex-1 flex items-center gap-1.5">
                            <span className="text-[11px] text-zinc-500 font-semibold">Lado A:</span>
                            <select
                              aria-label="Editar Lado A da peça"
                              value={editSideA}
                              onChange={(e) => setEditSideA(Number(e.target.value))}
                              className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-1.5 text-xs font-bold"
                            >
                              {Array.from({ length: 13 }).map((_, i) => (
                                <option key={i} value={i}>
                                  {i}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex-1 flex items-center gap-1.5">
                            <span className="text-[11px] text-zinc-500 font-semibold">Lado B:</span>
                            <select
                              aria-label="Editar Lado B da peça"
                              value={editSideB}
                              onChange={(e) => setEditSideB(Number(e.target.value))}
                              className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-1.5 text-xs font-bold"
                            >
                              {Array.from({ length: 13 }).map((_, i) => (
                                <option key={i} value={i}>
                                  {i}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Normal View with Edit/Remove buttons */
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                                className="cursor-pointer"
                                title="Toque duas vezes para abrir o editor"
                                onDoubleClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleOpenPieceEditorPopup(piece);
                                }}
                              >
                                <DominoPiece sideA={piece.sideA} sideB={piece.sideB} size="sm" />
                              </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-black text-zinc-400">#{index + 1}</span>
                              <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                                {piece.label}
                              </p>
                            </div>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                              {piece.sideA === piece.sideB
                                ? `Duplo de ${piece.sideA}`
                                : `${piece.sideA} + ${piece.sideB} = ${piece.points} pts`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                            {piece.points} pts
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartPieceEdit(piece)}
                            aria-label={`Editar peça ${piece.label}`}
                            className="p-1.5 text-zinc-400 hover:text-amber-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            title="Editar valores desta peça"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePiece(piece.id)}
                            aria-label={`Excluir peça ${piece.label}`}
                            className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            title="Remover peça da contagem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Row: Assign to Player */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                  Atribuir a:
                </span>
                <select
                  aria-label="Selecionar jogador para atribuir pontuação"
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.avatar} {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleConfirmAssign}
                disabled={visionResult.pieces.length === 0}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition-all"
              >
                {assignSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-200" />
                    <span>Pontos e {visionResult.pieces.length} Peças Salvas!</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Gravar {visionResult.totalPoints} pts na Rodada {currentRound}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="rounded-2xl bg-linear-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 shadow-sm">
        {/* Engine Selector Segmented Control */}
        <div className="pt-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-emerald-100 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              Motor de Visão:
            </span>

            <div className="flex bg-black/20 p-1 rounded-xl backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setEngineMode('auto')}
                className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  engineMode === 'auto'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Automático</span>
              </button>

              <button
                type="button"
                onClick={() => setEngineMode('gemini')}
                className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  engineMode === 'gemini'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                <Bot className="w-3 h-3" />
                <span>IA Gemini</span>
              </button>

              <button
                type="button"
                onClick={() => setEngineMode('offline')}
                className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  engineMode === 'offline'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                <Cpu className="w-3 h-3" />
                <span>100% Offline</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick action buttons in header */}
        <div className="mt-3 pt-2.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDirectScoreInput(!showDirectScoreInput)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Inserir Pontuação Direta</span>
            </button>

            <button
              type="button"
              onClick={() => setShowManualAdd(!showManualAdd)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Peça</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCvSettings(!showCvSettings)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              showCvSettings
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'bg-white/20 hover:bg-white/30 text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Ajustes CV</span>
          </button>
        </div>
      </div>

      {/* CV Offline Parameter Tuning Panel */}
      {showCvSettings && (
        <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-emerald-500/40 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Ajustes de Segmentação Offline (Double-Double-Dominoes)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowCvSettings(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-600 dark:text-zinc-400 font-semibold">
                Modo de Limiar:
              </label>
              <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
                <button
                  type="button"
                  onClick={() => setThresholdMode('otsu')}
                  className={`flex-1 py-1 rounded text-center font-bold ${
                    thresholdMode === 'otsu'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Otsu Automático
                </button>
                <button
                  type="button"
                  onClick={() => setThresholdMode('manual')}
                  className={`flex-1 py-1 rounded text-center font-bold ${
                    thresholdMode === 'manual'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Manual
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-zinc-600 dark:text-zinc-400 font-semibold">
                  Limiar: {manualThreshold}
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">0-255</span>
              </div>
              <input
                type="range"
                min="30"
                max="225"
                disabled={thresholdMode === 'otsu'}
                value={manualThreshold}
                onChange={(e) => setManualThreshold(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between sm:justify-center gap-2 pt-2 sm:pt-0">
              <label className="text-zinc-600 dark:text-zinc-400 font-semibold cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={invertColors}
                  onChange={(e) => setInvertColors(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Peças com fundo escuro (inverter)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleReprocessWithNewSettings}
              disabled={!capturedImage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reprocessar Imagem</span>
            </button>
          </div>
        </div>
      )}

      {/* Direct Manual Score Drawer */}
      {showDirectScoreInput && (
        <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border-2 border-emerald-500 shadow-md space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Lançamento Manual Direto (Sem Peças)
            </h3>
            <button
              type="button"
              onClick={() => setShowDirectScoreInput(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Fechar
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-bold whitespace-nowrap">Jogador:</span>
              <select
                aria-label="Jogador para pontuação manual"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.avatar} {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                placeholder="Pts"
                value={directScoreValue}
                onChange={(e) => setDirectScoreValue(e.target.value)}
                className="w-24 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl text-center text-sm font-black"
              />
              <button
                type="button"
                onClick={handleApplyDirectManualScore}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                Gravar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectScoreValue('0');
                  onAssignScore(selectedPlayerId, 0, []);
                  setAssignSuccess(true);
                  setTimeout(() => setAssignSuccess(false), 3000);
                  setShowDirectScoreInput(false);
                }}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-xl text-xs font-black shadow-xs transition-all"
                title="Bateu com 0 pontos"
              >
                0 (Bateu)
              </button>
            </div>
          </div>
        </div>
      )}

      {offlineProcessingNotice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
        >
          <Cpu className="h-4 w-4 shrink-0" />
          <span>Processamento 100% offline ativo no dispositivo.</span>
        </div>
      )}



      {isPieceEditorPopupOpen && editingPieceId && visionResult && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsPieceEditorPopupOpen(false);
              setEditingPieceId(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detected-piece-editor-title"
            className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id="detected-piece-editor-title" className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                  Editar peça selecionada
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Altera os valores dos dois lados do dominó.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar editor da peça"
                onClick={() => {
                  setIsPieceEditorPopupOpen(false);
                  setEditingPieceId(null);
                }}
                className="rounded-lg px-2 py-1 text-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Lado A
                <select
                  aria-label="Lado A da peça selecionada"
                  value={editSideA}
                  onChange={(event) => setEditSideA(Number(event.target.value))}
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-base font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  {Array.from({ length: 13 }).map((_, index) => (
                    <option key={index} value={index}>{index}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Lado B
                <select
                  aria-label="Lado B da peça selecionada"
                  value={editSideB}
                  onChange={(event) => setEditSideB(Number(event.target.value))}
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-base font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  {Array.from({ length: 13 }).map((_, index) => (
                    <option key={index} value={index}>{index}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Nova pontuação</span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{editSideA + editSideB} pts</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPieceEditorPopupOpen(false);
                  setEditingPieceId(null);
                }}
                className="flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-xs font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSavePieceEdit(editingPieceId);
                  setIsPieceEditorPopupOpen(false);
                }}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Guardar peça
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
