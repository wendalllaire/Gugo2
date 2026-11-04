import { Player, GameSettings, DominoTile } from '../types';

export const INITIAL_SETTINGS: GameSettings = {
  playerCount: 4,
  maxRounds: 8,
  currentRound: 3,
  startEngine: 12,
  doubleBlankFifty: false,
};

export const INITIAL_PLAYERS: Player[] = [
  {
    id: 'p-1',
    name: 'Mariana',
    avatar: '👩',
    color: '#8b5cf6', // Violet
    scores: [0, 14, 8, null, null, null, null, null],
    roundPieces: {
      0: [], // Won round with 0
      1: [
        { id: 'm-1-1', sideA: 6, sideB: 8 }, // 14
      ],
      2: [
        { id: 'm-2-1', sideA: 3, sideB: 5 }, // 8
      ],
    },
  },
  {
    id: 'p-2',
    name: 'Carlos',
    avatar: '👨',
    color: '#10b981', // Emerald
    scores: [28, 0, 15, null, null, null, null, null],
    roundPieces: {
      0: [
        { id: 'c-0-1', sideA: 12, sideB: 9 }, // 21
        { id: 'c-0-2', sideA: 3, sideB: 4 },  // 7 => 28
      ],
      1: [], // Won round with 0
      2: [
        { id: 'c-2-1', sideA: 7, sideB: 8 },  // 15
      ],
    },
  },
  {
    id: 'p-3',
    name: 'Lucas',
    avatar: '🧔',
    color: '#f59e0b', // Amber
    scores: [35, 22, 0, null, null, null, null, null],
    roundPieces: {
      0: [
        { id: 'l-0-1', sideA: 11, sideB: 12 }, // 23
        { id: 'l-0-2', sideA: 6, sideB: 6 },   // 12 => 35
      ],
      1: [
        { id: 'l-1-1', sideA: 10, sideB: 12 }, // 22
      ],
      2: [], // Won round with 0
    },
  },
  {
    id: 'p-4',
    name: 'Ana',
    avatar: '👱‍♀️',
    color: '#ec4899', // Pink
    scores: [18, 31, 24, null, null, null, null, null],
    roundPieces: {
      0: [
        { id: 'a-0-1', sideA: 9, sideB: 9 }, // 18
      ],
      1: [
        { id: 'a-1-1', sideA: 12, sideB: 12 }, // 24
        { id: 'a-1-2', sideA: 3, sideB: 4 },   // 7 => 31
      ],
      2: [
        { id: 'a-2-1', sideA: 12, sideB: 12 }, // 24
      ],
    },
  },
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
