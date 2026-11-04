export interface DominoTile {
  id: string;
  sideA: number;
  sideB: number;
}

export interface OrientedTile {
  id: string;
  left: number;
  right: number;
  isDouble: boolean;
  points: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  scores: (number | null)[]; // Index corresponds to round (0-indexed)
  roundPieces?: Record<number, DominoTile[]>; // Detailed domino tiles per round
}

export interface RankedPlayer extends Player {
  rank: number;
  totalScore: number;
  playedRoundsCount: number;
  averageScore: number;
  isLeader: boolean;
}

export interface GameSettings {
  playerCount: number; // 2 to 10
  maxRounds: number; // 1 to 10
  currentRound: number; // 1-indexed (1 to maxRounds)
  startEngine: number; // typically 12 for Double-12
  doubleBlankFifty: boolean; // default false
}

export interface DetectedPiece {
  id: string;
  sideA: number;
  sideB: number;
  points: number;
  label: string;
  box2d?: [number, number, number, number];
  confidence?: number;
}

export interface VisionResult {
  pieces: DetectedPiece[];
  totalPoints: number;
  source: 'offline_cv' | 'gemini_vision' | 'simulated_local' | 'fallback' | 'manual';
  warning?: string;
  imageUrl?: string;
  overlayDataUrl?: string;
  timingMs?: number;
  thresholdUsed?: number;
  pipsTotal?: number;
}

export type TabType = 'camera' | 'ranking';
