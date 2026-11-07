import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');
const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
const isProduction = process.env.NODE_ENV === 'production' || (process.env.NODE_ENV !== 'development' && hasDist);

// Initialize Gemini SDK with telemetry header when a valid non-placeholder API key is set
const rawApiKey = process.env.GEMINI_API_KEY;
const hasValidGeminiKey = Boolean(rawApiKey && rawApiKey !== 'MY_GEMINI_API_KEY' && rawApiKey.trim().length > 10);
const ai = hasValidGeminiKey
  ? new GoogleGenAI({
      apiKey: rawApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Track quota cooldown to prevent spamming Google API when free tier limit is reached
let geminiQuotaExceededUntil = 0;

// Support JSON payloads up to 15MB for camera image transfers
app.use(express.json({ limit: '15mb' }));

// Serve static assets from public
app.use(express.static(path.join(__dirname, 'public')));

interface DetectedPiece {
  id: string;
  sideA: number;
  sideB: number;
  points: number;
  label: string;
  box2d?: [number, number, number, number];
  confidence?: number;
}

// APK and Source Code Download Endpoints
app.get('/api/download/apk', (_req: Request, res: Response): void => {
  const apkPath = path.join(__dirname, 'public', 'downloads', 'DominoMexicano-v1.0-debug.apk');
  if (fs.existsSync(apkPath)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="DominoMexicano-v1.0-debug.apk"');
    res.sendFile(apkPath);
  } else {
    res.status(404).json({ error: 'Arquivo APK de teste ainda não gerado.' });
  }
});

app.get('/api/download/source', (_req: Request, res: Response): void => {
  const zipPath = path.join(__dirname, 'public', 'downloads', 'DominoMexicano-SourceCode.zip');
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="DominoMexicano-SourceCode.zip"');
    res.sendFile(zipPath);
  } else {
    res.status(404).json({ error: 'Arquivo do projeto ainda não gerado.' });
  }
});

// Dual-Engine Domino Recognition Endpoint
app.post('/api/analyze-dominoes', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { imageBase64, mode = 'auto' } = req.body;
    const frameWidth = Math.max(1, Number(req.body.width) || 1000);
    const frameHeight = Math.max(1, Number(req.body.height) || 1000);

    if (!imageBase64) {
      res.status(400).json({ error: 'Nenhuma imagem foi fornecida.' });
      return;
    }

    const isQuotaInCooldown = Date.now() < geminiQuotaExceededUntil;

    // Call Gemini AI Vision if active, configured, not in cooldown, and not forced offline
    if (mode !== 'offline' && ai && !isQuotaInCooldown) {
      try {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const mimeTypeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

        const prompt = `Você é um árbitro especialista de Dominó Mexicano (Double-12 Mexican Train).
Analise a imagem da mesa e identifique e CATALOGUE TODAS AS PEÇAS DE DOMINÓ PRESENTES NA FOTO, UMA A UMA.

REGRAS:
1. Um conjunto Double-12 contém valores de 0 a 12 pontos em cada metade ([0|0] até [12|12]).
2. As peças podem ser brancas, marfim, cinzentas ou amarelas. Não exclua uma peça por causa da cor, de reflexos ou de sombras.
3. Os pontos podem ser pretos, cinzentos/prateados, amarelos, laranja, vermelhos, azuis, roxos ou verdes. Conte cada ponto físico uma única vez, pelo seu contorno circular e posição; um brilho dentro do mesmo ponto não é outro ponto.
4. Conte os pontos de CADA metade separadamente. Use a disposição regular dos pontos para distinguir 6, 8, 9, 10, 11 e 12; não estime a quantidade pela área escura total.
5. Catalogue apenas peças físicas: cada uma é um retângulo alongado, aproximadamente 2:1, com duas metades separadas por uma linha central. As peças encostadas continuam a ser peças distintas.
6. NÃO catalogue mãos, dedos, caixas, cartas, pratos, manchas, reflexos, sombras, padrões da mesa ou objetos fora da escala de uma peça.
7. Devolva uma entrada por peça, sem fundir peças vizinhas. sideA e sideB devem ser inteiros entre 0 e 12; points é a soma; label é "[sideA|sideB]". Preserve a orientação da fotografia: A é esquerda/topo e B é direita/fundo.
8. box2d=[ymin,xmin,ymax,xmax] normalizado entre 0 e 1000 deve envolver apenas uma peça. Não use uma caixa para duas peças.
9. Se não existir evidência visual suficiente para uma peça, não invente essa peça. Devolva pieces vazio se não houver peças fiáveis.
10. totalPoints é a soma exata de todos os pontos de todas as peças devolvidas.`;

        // Camera still photos can be larger and take longer to upload/infer.
        // Allow a little more time before falling back to the on-device detector.
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000)
        );

        const geminiCall = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: prompt,
              },
            ],
          },
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                pieces: {
                  type: Type.ARRAY,
                  description: 'Lista de todas as peças individuais de dominó catalogadas na imagem',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sideA: { type: Type.INTEGER },
                      sideB: { type: Type.INTEGER },
                      points: { type: Type.INTEGER },
                      label: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                      box2d: {
                        type: Type.ARRAY,
                        description: 'Coordenadas [ymin,xmin,ymax,xmax] normalizadas entre 0 e 1000, para UMA peça',
                        minItems: 4,
                        maxItems: 4,
                        items: { type: Type.INTEGER },
                      },
                    },
                    required: ['sideA', 'sideB', 'points', 'label', 'confidence', 'box2d'],
                  },
                },
                totalPoints: { type: Type.INTEGER },
                notes: { type: Type.STRING },
              },
              required: ['pieces', 'totalPoints'],
            },
          },
        });

        const response: any = await Promise.race([geminiCall, timeoutPromise]);
        const rawText = response.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const pieces: DetectedPiece[] = (parsed.pieces || []).flatMap((p: any, idx: number) => {
            const rawA = Number(p.sideA);
            const rawB = Number(p.sideB);
            const box = Array.isArray(p.box2d) && p.box2d.length === 4 ? p.box2d.map(Number) : null;
            if (!Number.isInteger(rawA) || !Number.isInteger(rawB) ||
                rawA < 0 || rawA > 12 || rawB < 0 || rawB > 12 ||
                !box || box.some((v: number) => !Number.isInteger(v) || v < 0 || v > 1000)) return [];

            const [yMin, xMin, yMax, xMax] = box;
            const boxWidth = xMax - xMin;
            const boxHeight = yMax - yMin;
            const pixelX = xMin * frameWidth / 1000;
            const pixelY = yMin * frameHeight / 1000;
            const pixelWidth = boxWidth * frameWidth / 1000;
            const pixelHeight = boxHeight * frameHeight / 1000;
            const shortSide = Math.min(pixelWidth, pixelHeight);
            const longSide = Math.max(pixelWidth, pixelHeight);
            const areaFraction = (boxWidth * boxHeight) / 1000000;
            const aspect = longSide / Math.max(1, shortSide);
            const minFrameSide = Math.min(frameWidth, frameHeight);
            const maxFrameSide = Math.max(frameWidth, frameHeight);
            const frameMargin = Math.max(2, minFrameSide * 0.006);
            const staysInsideFrame =
              pixelX >= frameMargin && pixelY >= frameMargin &&
              pixelX + pixelWidth <= frameWidth - frameMargin &&
              pixelY + pixelHeight <= frameHeight - frameMargin;
            const confidence = Number(p.confidence ?? 0.8);
            // Filter tiny reflections, edge-clipped regions and oversized objects.
            if (xMax <= xMin || yMax <= yMin || !staysInsideFrame ||
                shortSide < Math.max(16, minFrameSide * 0.032) ||
                longSide < Math.max(32, minFrameSide * 0.06) ||
                longSide > maxFrameSide * 0.42 ||
                areaFraction < 0.002 || areaFraction > 0.06 ||
                aspect < 1.35 || aspect > 2.75 || confidence < 0.55) return [];

            return [{
              id: `gemini-tile-${Date.now()}-${idx}`,
              sideA: rawA,
              sideB: rawB,
              points: rawA + rawB,
              label: `[${rawA}|${rawB}]`,
              confidence: Math.min(1, confidence),
              box2d: box,
            }];
          });

          pieces.sort((a, b) => b.points - a.points);
          const totalPoints = pieces.reduce((sum, p) => sum + p.points, 0);

          res.json({
            success: true,
            source: 'gemini_vision',
            algorithm: 'Gemini 3.8 Flash Vision (Catálogo individual peça a peça)',
            pieces,
            totalPoints,
            timingMs: Date.now() - startTime,
            notes: parsed.notes,
          });
          return;
        }
      } catch (geminiError: any) {
        const errorMsg = String(geminiError?.message || '');
        const isQuota =
          geminiError?.status === 429 ||
          errorMsg.includes('429') ||
          errorMsg.includes('RESOURCE_EXHAUSTED') ||
          errorMsg.includes('Quota exceeded');

        if (isQuota) {
          // Put Gemini in cooldown for 30 minutes to avoid repetitive 429 calls
          geminiQuotaExceededUntil = Date.now() + 30 * 60 * 1000;
        }

        // Return clean fallback instruction to the client without throwing unhandled server errors
        res.json({
          success: false,
          fallbackToClientCV: true,
          quotaExceeded: isQuota,
          reason: isQuota ? 'quota_exceeded' : 'timeout_or_network',
          message: isQuota
            ? 'Cota diária da API Gemini atingida. Ativando reconhecimento 100% offline no dispositivo.'
            : 'Gemini indisponível. Executando reconhecimento offline local.',
          timingMs: Date.now() - startTime,
        });
        return;
      }
    }

    // Default offline fallback response instructing the client to run its local CV on the actual photo
    res.json({
      success: false,
      fallbackToClientCV: true,
      quotaExceeded: isQuotaInCooldown,
      message: 'Processamento 100% offline no dispositivo (Double-Double-Dominoes).',
      timingMs: Date.now() - startTime,
    });
  } catch (error: any) {
    res.json({
      success: false,
      fallbackToClientCV: true,
      message: 'Executando reconhecimento offline local.',
      timingMs: Date.now() - startTime,
    });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'domino-mexicano',
    geminiConfigured: hasValidGeminiKey && Date.now() >= geminiQuotaExceededUntil,
    quotaExceeded: Date.now() < geminiQuotaExceededUntil,
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true' || Boolean(process.env.APP_URL);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚂 Dominó Mexicano Server running on http://localhost:${PORT}`);
  });
}

startServer();
