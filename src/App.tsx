/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TabType, Player, GameSettings, DominoTile } from './types';
import { INITIAL_PLAYERS, INITIAL_SETTINGS } from './data/sampleData';
import { AndroidFrame } from './components/AndroidFrame';
import { CameraTab } from './components/CameraTab';
import { RankingTab } from './components/RankingTab';
import { KotlinCodeModal } from './components/KotlinCodeModal';
import { ApkDownloadModal } from './components/ApkDownloadModal';
import { calculateRanking, formatSocialShare } from './utils/dominoRules';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('camera');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [settings, setSettings] = useState<GameSettings>(INITIAL_SETTINGS);
  const [isKotlinModalOpen, setIsKotlinModalOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Sync dark mode class on HTML document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // When a score is assigned from Camera/Counting vision or manual addition to a player
  const handleAssignScore = (playerId: string, score: number, pieces?: DominoTile[]) => {
    const roundIdx = settings.currentRound - 1;
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p;
        const newScores = [...p.scores];
        newScores[roundIdx] = score;
        const newRoundPieces = { ...(p.roundPieces || {}) };
        if (pieces) {
          newRoundPieces[roundIdx] = pieces;
        }
        return {
          ...p,
          scores: newScores,
          roundPieces: newRoundPieces,
        };
      })
    );
    const targetPlayer = players.find((p) => p.id === playerId);
    showToast(`Gravado ${score} pts para ${targetPlayer?.name || 'jogador'} na Rodada ${settings.currentRound}!`);
  };

  // Social share intent handler
  const handleShare = async () => {
    const ranked = calculateRanking(players);
    const text = formatSocialShare(ranked, settings.currentRound, settings.maxRounds);

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Classificação Dominó Mexicano',
          text,
        });
        showToast('Compartilhado com sucesso!');
      } catch {
        // Fallback copy to clipboard
        await copyToClipboard(text);
      }
    } else {
      await copyToClipboard(text);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Placar copiado para a área de transferência!');
    } catch {
      showToast('Compartilhamento acionado!');
    }
  };

  const showToast = (message: string) => {
    setFeedbackToast(message);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  return (
    <>
      <AndroidFrame
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onOpenKotlinModal={() => setIsKotlinModalOpen(true)}
        onOpenApkModal={() => setIsApkModalOpen(true)}
        onShare={handleShare}
        currentRound={settings.currentRound}
        maxRounds={settings.maxRounds}
      >
        {/* Floating toast notification */}
        {feedbackToast && (
          <div className="sticky top-2 z-40 mb-3 p-2.5 rounded-xl bg-zinc-900/90 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-bold shadow-lg text-center backdrop-blur-xs animate-in fade-in slide-in-from-top-2">
            {feedbackToast}
          </div>
        )}

        {/* Tab 1: Câmera / Contar Pontos */}
        {currentTab === 'camera' && (
          <CameraTab
            players={players}
            currentRound={settings.currentRound}
            onAssignScore={handleAssignScore}
            onOpenApkModal={() => setIsApkModalOpen(true)}
          />
        )}

        {/* Tab 2: Ranking em Tempo Real */}
        {currentTab === 'ranking' && (
          <RankingTab
            players={players}
            settings={settings}
            onUpdatePlayers={setPlayers}
            onUpdateSettings={setSettings}
          />
        )}
      </AndroidFrame>

      {/* Standalone Kotlin Jetpack Compose Code Inspector Modal */}
      <KotlinCodeModal
        isOpen={isKotlinModalOpen}
        onClose={() => setIsKotlinModalOpen(false)}
      />

      {/* APK & Source Code Download Modal */}
      <ApkDownloadModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
      />
    </>
  );
}
