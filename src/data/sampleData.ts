import { Player, GameSettings, DominoTile } from '../types';

export const INITIAL_SETTINGS: GameSettings = {
  playerCount: 3, maxRounds: 8, currentRound: 1, startEngine: 12, doubleBlankFifty: false,
};

export const INITIAL_PLAYERS: Player[] = [
  { id: 'p-1', name: 'Jogador 1', avatar: '👤', color: '#8b5cf6', scores: new Array(8).fill(null), roundPieces: {} },
  { id: 'p-2', name: 'Jogador 2', avatar: '👤', color: '#10b981', scores: new Array(8).fill(null), roundPieces: {} },
  { id: 'p-3', name: 'Jogador 3', avatar: '👤', color: '#f59e0b', scores: new Array(8).fill(null), roundPieces: {} },
];

export const AVATAR_OPTIONS = ['👩', '👨', '🧔', '👱‍♀️', '🤠', '🎩', '🦊', '🐯', '🐼', '🤖'];
export const COLOR_OPTIONS = [
  '#8b5cf6', '#10b981', '#f59e0b', '#ec4899',
  '#3b82f6', '#06b6d4', '#f97316', '#ef4444',
  '#14b8a6', '#6366f1',
];

// Presets for hands to test sequencer
export const SAMPLE_HANDS: { name: string; tiles: DominoTile[] }[] = [
  {
    name: 'Mão Estratégica (8 pedras)',
    tiles: [
      { id: '12-9', sideA: 9, sideB: 12 },
      { id: '9-4', sideA: 4, sideB: 9 },
      { id: '4-4', sideA: 4, sideB: 4 },
      { id: '4-1', sideA: 1, sideB: 4 },
      { id: '1-7', sideA: 1, sideB: 7 },
      { id: '7-7', sideA: 7, sideB: 7 },
      { id: '10-3', sideA: 3, sideB: 10 },
      { id: '8-2', sideA: 2, sideB: 8 },
    ],
  },
  {
    name: 'Mão Reta Longa (6 pedras)',
    tiles: [
      { id: '12-8', sideA: 8, sideB: 12 },
      { id: '8-8', sideA: 8, sideB: 8 },
      { id: '8-3', sideA: 3, sideB: 8 },
      { id: '3-5', sideA: 3, sideB: 5 },
      { id: '5-0', sideA: 0, sideB: 5 },
      { id: '0-2', sideA: 0, sideB: 2 },
    ],
  },
  {
    name: 'Mão Final Pesada (4 pedras)',
    tiles: [
      { id: '12-11', sideA: 11, sideB: 12 },
      { id: '11-10', sideA: 10, sideB: 11 },
      { id: '12-12', sideA: 12, sideB: 12 },
      { id: '9-9', sideA: 9, sideB: 9 },
    ],
  },
];
