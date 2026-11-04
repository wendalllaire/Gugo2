import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTilePoints,
  calculateHandPoints,
  normalizeTile,
  findBestTrainSequence,
  calculateRanking,
  formatSocialShare,
  getEngineForRound,
} from './dominoRules.ts';
import type { DominoTile, Player } from './dominoRules.ts';

test('getTilePoints calculates points correctly', () => {
  assert.equal(getTilePoints({ id: '12-9', sideA: 12, sideB: 9 }), 21);
  assert.equal(getTilePoints({ id: '0-0', sideA: 0, sideB: 0 }, false), 0);
  assert.equal(getTilePoints({ id: '0-0', sideA: 0, sideB: 0 }, true), 50);
});

test('calculateHandPoints sums all tiles in hand', () => {
  const hand: DominoTile[] = [
    { id: '12-9', sideA: 12, sideB: 9 }, // 21
    { id: '5-5', sideA: 5, sideB: 5 },   // 10
    { id: '3-0', sideA: 0, sideB: 3 },   // 3
  ];
  assert.equal(calculateHandPoints(hand), 34);
});

test('normalizeTile handles order of sides', () => {
  const tile1 = normalizeTile(9, 12);
  const tile2 = normalizeTile(12, 9);
  assert.equal(tile1.id, '9-12');
  assert.equal(tile2.id, '9-12');
  assert.equal(tile1.sideA, 9);
  assert.equal(tile1.sideB, 12);
});

test('getEngineForRound computes descending double engines', () => {
  assert.equal(getEngineForRound(1, 12), 12); // Round 1 starts with 12
  assert.equal(getEngineForRound(2, 12), 11); // Round 2 starts with 11
  assert.equal(getEngineForRound(10, 12), 3);  // Round 10 starts with 3
});

test('findBestTrainSequence constructs valid train starting at engine', () => {
  const hand: DominoTile[] = [
    { id: '12-7', sideA: 12, sideB: 7 },
    { id: '7-3', sideA: 7, sideB: 3 },
    { id: '3-3', sideA: 3, sideB: 3 },
    { id: '3-1', sideA: 3, sideB: 1 },
    { id: '8-9', sideA: 8, sideB: 9 }, // orphan!
  ];

  // Engine is 12
  const result = findBestTrainSequence(hand, 12, 'longest');
  assert.equal(result.sequence.length, 4); // 12-7 -> 7-3 -> 3-3 -> 3-1
  assert.equal(result.unused.length, 1);
  assert.equal(result.unused[0].id, '8-9');
  assert.equal(result.sequence[0].left, 12);
  assert.equal(result.sequence[0].right, 7);
  assert.equal(result.sequence[1].left, 7);
  assert.equal(result.sequence[1].right, 3);
  assert.equal(result.sequence[2].left, 3);
  assert.equal(result.sequence[2].right, 3);
  assert.equal(result.sequence[3].left, 3);
  assert.equal(result.sequence[3].right, 1);
});

test('calculateRanking sorts by lowest score (Mexican Train rule) and computes stats', () => {
  const players: Player[] = [
    { id: '1', name: 'Carlos', avatar: '👨', color: '#10b981', scores: [25, 10, 5] },  // Total: 40
    { id: '2', name: 'Mariana', avatar: '👩', color: '#6366f1', scores: [0, 12, 15] },  // Total: 27 (Winner!)
    { id: '3', name: 'Lucas', avatar: '🧔', color: '#f59e0b', scores: [45, 30, 20] },  // Total: 95
  ];

  const ranked = calculateRanking(players);
  assert.equal(ranked[0].name, 'Mariana');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].totalScore, 27);
  assert.equal(ranked[0].isLeader, true);

  assert.equal(ranked[1].name, 'Carlos');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[1].totalScore, 40);

  assert.equal(ranked[2].name, 'Lucas');
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[2].totalScore, 95);
});

test('formatSocialShare produces readable WhatsApp share text', () => {
  const players: Player[] = [
    { id: '1', name: 'Mariana', avatar: '👩', color: '#6366f1', scores: [27] },
    { id: '2', name: 'Carlos', avatar: '👨', color: '#10b981', scores: [40] },
  ];
  const ranked = calculateRanking(players);
  const text = formatSocialShare(ranked, 1, 8);
  assert.match(text, /DOMINÓ MEXICANO/);
  assert.match(text, /Mariana/);
  assert.match(text, /Carlos/);
  assert.match(text, /27 pts/);
});
