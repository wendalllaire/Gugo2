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
  scores: (number | null)[]; // round-by-round score
  roundPieces?: Record<number, DominoTile[]>;
}

export interface RankedPlayer extends Player {
  rank: number;
  totalScore: number;
  playedRoundsCount: number;
  averageScore: number;
  isLeader: boolean;
}

export interface GameSettings {
  playerCount: number;
  maxRounds: number;
  engineMax: number; // e.g. 12 for double-12
  doubleBlankFifty: boolean; // standard is 0, optional house rule is 50
}

/**
 * Calculates point value of a single domino tile.
 */
export function getTilePoints(tile: DominoTile, doubleBlankFifty: boolean = false): number {
  if (tile.sideA === 0 && tile.sideB === 0 && doubleBlankFifty) {
    return 50;
  }
  return tile.sideA + tile.sideB;
}

/**
 * Calculates sum of points for a collection of domino tiles.
 */
export function calculateHandPoints(tiles: DominoTile[], doubleBlankFifty: boolean = false): number {
  return tiles.reduce((sum, tile) => sum + getTilePoints(tile, doubleBlankFifty), 0);
}

/**
 * Normalizes tile representation so sideA <= sideB for consistent ID/comparison.
 */
export function normalizeTile(sideA: number, sideB: number): DominoTile {
  const min = Math.min(sideA, sideB);
  const max = Math.max(sideA, sideB);
  return {
    id: `${min}-${max}`,
    sideA: min,
    sideB: max,
  };
}

/**
 * Standard Double-12 set has 91 tiles (0-0 to 12-12).
 */
export function generateDouble12Set(): DominoTile[] {
  const tiles: DominoTile[] = [];
  for (let i = 0; i <= 12; i++) {
    for (let j = i; j <= 12; j++) {
      tiles.push(normalizeTile(i, j));
    }
  }
  return tiles;
}

/**
 * Mexican Train engine for round index (0-indexed).
 * Round 1: 12-12
 * Round 2: 11-11
 * ...
 * Round 10: 3-3 (or down to 0-0 in 13-round games)
 */
export function getEngineForRound(roundNumber: number, startEngine: number = 12): number {
  const engine = startEngine - (roundNumber - 1);
  return Math.max(0, engine);
}

/**
 * Finds the optimal continuous sequence of dominoes starting from a given engine value.
 * Uses depth-first backtracking to find either:
 * - 'longest': maximize the number of dominoes in the continuous train
 * - 'max_points': maximize the total points discarded in the train
 */
export function findBestTrainSequence(
  hand: DominoTile[],
  startValue: number,
  strategy: 'longest' | 'max_points' = 'longest',
  doubleBlankFifty: boolean = false
): {
  sequence: OrientedTile[];
  unused: DominoTile[];
  sequencePoints: number;
  unusedPoints: number;
} {
  if (!hand || hand.length === 0) {
    return { sequence: [], unused: [], sequencePoints: 0, unusedPoints: 0 };
  }

  let bestSequence: OrientedTile[] = [];
  let bestMetric = -1;

  function evaluate(chain: OrientedTile[]): number {
    if (strategy === 'longest') {
      // primary: length, secondary: points
      const points = chain.reduce((acc, t) => acc + t.points, 0);
      return chain.length * 1000 + points;
    } else {
      // primary: points, secondary: length
      const points = chain.reduce((acc, t) => acc + t.points, 0);
      return points * 1000 + chain.length;
    }
  }

  function backtrack(
    currentEnd: number,
    currentChain: OrientedTile[],
    availableMask: boolean[]
  ) {
    const currentScore = evaluate(currentChain);
    if (currentScore > bestMetric) {
      bestMetric = currentScore;
      bestSequence = [...currentChain];
    }

    for (let i = 0; i < hand.length; i++) {
      if (!availableMask[i]) continue;
      const tile = hand[i];
      const points = getTilePoints(tile, doubleBlankFifty);

      let matchingSide: 'A' | 'B' | null = null;
      if (tile.sideA === currentEnd) {
        matchingSide = 'A';
      } else if (tile.sideB === currentEnd) {
        matchingSide = 'B';
      }

      if (matchingSide !== null) {
        availableMask[i] = false;
        const left = currentEnd;
        const right = matchingSide === 'A' ? tile.sideB : tile.sideA;
        const isDouble = tile.sideA === tile.sideB;

        currentChain.push({
          id: tile.id,
          left,
          right,
          isDouble,
          points,
        });

        backtrack(right, currentChain, availableMask);

        currentChain.pop();
        availableMask[i] = true;
      }
    }
  }

  const mask = new Array(hand.length).fill(true);
  backtrack(startValue, [], mask);

  const usedIds = new Set(bestSequence.map((t) => t.id));
  const unused = hand.filter((t) => !usedIds.has(t.id));

  const sequencePoints = bestSequence.reduce((sum, t) => sum + t.points, 0);
  const unusedPoints = unused.reduce((sum, t) => sum + getTilePoints(t, doubleBlankFifty), 0);

  return {
    sequence: bestSequence,
    unused,
    sequencePoints,
    unusedPoints,
  };
}

/**
 * Calculates total and ranking for all players.
 * In Mexican Train Dominoes, the player with the LOWEST score wins.
 */
export function calculateRanking(players: Player[]): RankedPlayer[] {
  const ranked = players.map((player) => {
    let totalScore = 0;
    let playedRoundsCount = 0;

    for (const score of player.scores) {
      if (score !== null && !isNaN(score)) {
        totalScore += score;
        playedRoundsCount++;
      }
    }

    const averageScore = playedRoundsCount > 0 ? Number((totalScore / playedRoundsCount).toFixed(1)) : 0;

    return {
      ...player,
      rank: 1,
      totalScore,
      playedRoundsCount,
      averageScore,
      isLeader: false,
    };
  });

  // Sort by lowest total score first (standard Mexican Train rule)
  ranked.sort((a, b) => {
    if (a.totalScore !== b.totalScore) {
      return a.totalScore - b.totalScore;
    }
    return a.name.localeCompare(b.name);
  });

  // Assign ranks (handle ties)
  let currentRank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].totalScore > ranked[i - 1].totalScore) {
      currentRank = i + 1;
    }
    ranked[i].rank = currentRank;
    ranked[i].isLeader = currentRank === 1;
  }

  return ranked;
}

/**
 * Generates formatted text for social sharing via WhatsApp, Telegram, etc.
 */
export function formatSocialShare(
  rankedPlayers: RankedPlayer[],
  currentRound: number,
  totalRounds: number
): string {
  const medals = ['🥇', '🥈', '🥉'];
  const leader = rankedPlayers[0];

  let text = `🚂 *DOMINÓ MEXICANO - PLACAR OFICIAL* 🁓\n`;
  text += `📊 Rodada ${currentRound} de ${totalRounds}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  rankedPlayers.forEach((p, idx) => {
    const medal = idx < 3 ? medals[idx] : ` ${p.rank}º`;
    const crown = idx === 0 ? ' 👑' : '';
    text += `${medal} *${p.name}*: ${p.totalScore} pts (Média: ${p.averageScore})${crown}\n`;
  });

  text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  if (leader) {
    text += `🏆 Líder da mesa: *${leader.name}* com ${leader.totalScore} pontos!\n`;
  }
  text += `📱 Gerado pelo app Dominó Mexicano`;

  return text;
}
