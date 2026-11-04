import React, { useState, useMemo } from 'react';
import { Player, RankedPlayer, GameSettings, DominoTile } from '../types';
import {
  calculateRanking,
  formatSocialShare,
  getEngineForRound,
  getTilePoints,
} from '../utils/dominoRules';
import { AVATAR_OPTIONS, COLOR_OPTIONS } from '../data/sampleData';
import { PieceEditorModal } from './PieceEditorModal';
import { DominoPiece } from './DominoPiece';
import {
  Trophy,
  Share2,
  Users,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Check,
  Crown,
  Medal,
  Award,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  Copy,
  Layers,
  Calculator,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface RankingTabProps {
  players: Player[];
  settings: GameSettings;
  onUpdatePlayers: (players: Player[]) => void;
  onUpdateSettings: (settings: GameSettings) => void;
}

export const RankingTab: React.FC<RankingTabProps> = ({
  players,
  settings,
  onUpdatePlayers,
  onUpdateSettings,
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [shareSuccessToast, setShareSuccessToast] = useState<string | null>(null);

  // Piece Editor Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    playerId: string;
    roundIndex: number;
  }>({
    isOpen: false,
    playerId: '',
    roundIndex: 0,
  });

  // Quick Inline Score Edit State
  const [editingScore, setEditingScore] = useState<{
    playerId: string;
    roundIndex: number;
    value: string;
  } | null>(null);

  // Compute real-time rankings (lowest points wins in Mexican Train)
  const rankedPlayers = useMemo(() => calculateRanking(players), [players]);

  const currentEngine = useMemo(
    () => getEngineForRound(settings.currentRound, settings.startEngine),
    [settings.currentRound, settings.startEngine]
  );

  const isMatchComplete = useMemo(() => {
    return players.every((p) =>
      p.scores.slice(0, settings.maxRounds).every((s) => s !== null)
    );
  }, [players, settings.maxRounds]);

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleAddPlayer = () => {
    if (players.length >= 10) return;
    const name = newPlayerName.trim() || `Jogador ${players.length + 1}`;
    const avatar = AVATAR_OPTIONS[players.length % AVATAR_OPTIONS.length];
    const color = COLOR_OPTIONS[players.length % COLOR_OPTIONS.length];
    const newPlayer: Player = {
      id: `p-${Date.now()}`,
      name,
      avatar,
      color,
      scores: new Array(settings.maxRounds).fill(null),
      roundPieces: {},
    };
    onUpdatePlayers([...players, newPlayer]);
    setNewPlayerName('');
  };

  const handleRemovePlayer = (id: string) => {
    if (players.length <= 2) return;
    onUpdatePlayers(players.filter((p) => p.id !== id));
  };

  const handleUpdateRoundsCount = (rounds: number) => {
    const clamped = Math.max(1, Math.min(10, rounds));
    const updatedPlayers = players.map((p) => {
      const newScores = [...p.scores];
      while (newScores.length < clamped) newScores.push(null);
      return { ...p, scores: newScores.slice(0, clamped) };
    });
    onUpdatePlayers(updatedPlayers);
    onUpdateSettings({
      ...settings,
      maxRounds: clamped,
      currentRound: Math.min(settings.currentRound, clamped),
    });
  };

  // Quick inline save score
  const handleSaveScoreDirect = (playerId: string, roundIndex: number, val: string) => {
    const num = val === '' ? null : Math.max(0, parseInt(val, 10) || 0);
    const updatedPlayers = players.map((p) => {
      if (p.id !== playerId) return p;
      const newScores = [...p.scores];
      newScores[roundIndex] = num;
      return { ...p, scores: newScores };
    });
    onUpdatePlayers(updatedPlayers);
    setEditingScore(null);
  };

  // Open modal to edit individual pieces or manual score for a player and round
  const handleOpenPieceEditor = (playerId: string, roundIndex: number) => {
    setModalState({
      isOpen: true,
      playerId,
      roundIndex,
    });
  };

  // Save pieces & score from modal
  const handleSaveFromModal = (updatedPieces: DominoTile[], finalScore: number) => {
    const { playerId, roundIndex } = modalState;
    const updatedPlayers = players.map((p) => {
      if (p.id !== playerId) return p;
      const newScores = [...p.scores];
      newScores[roundIndex] = finalScore;
      const newRoundPieces = { ...(p.roundPieces || {}) };
      newRoundPieces[roundIndex] = updatedPieces;
      return {
        ...p,
        scores: newScores,
        roundPieces: newRoundPieces,
      };
    });
    onUpdatePlayers(updatedPlayers);
  };

  // Social Share Intent / Web Share API
  const handleShareResults = async () => {
    const shareText = formatSocialShare(
      rankedPlayers,
      settings.currentRound,
      settings.maxRounds
    );

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Classificação Dominó Mexicano',
          text: shareText,
        });
        setShareSuccessToast('Compartilhado com sucesso!');
        setTimeout(() => setShareSuccessToast(null), 3000);
      } catch {
        await copyToClipboard(shareText);
      }
    } else {
      await copyToClipboard(shareText);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setShareSuccessToast('Placar copiado para a área de transferência!');
      setTimeout(() => setShareSuccessToast(null), 3500);
    } catch {
      setShareSuccessToast('Resultado formatado pronto para compartilhar!');
      setTimeout(() => setShareSuccessToast(null), 3000);
    }
  };

  // Active player in modal
  const modalPlayer = players.find((p) => p.id === modalState.playerId);
  const modalPieces = modalPlayer?.roundPieces?.[modalState.roundIndex] || [];
  const modalScore = modalPlayer?.scores?.[modalState.roundIndex] ?? null;

  return (
    <div className="space-y-4 pb-20">
      {/* Header Banner */}
      <div className="rounded-2xl bg-linear-to-r from-amber-500 via-orange-500 to-amber-600 text-zinc-950 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shadow-xs">
              🏆
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">Ranking em Tempo Real</h2>
              <p className="text-xs text-amber-950/80 font-semibold">
                Dominó Mexicano • Menos pontos vence!
              </p>
            </div>
          </div>

          {/* Social Share Button (Intent) */}
          <button
            type="button"
            onClick={handleShareResults}
            aria-label="Compartilhar resultado do ranking"
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartilhar</span>
          </button>
        </div>

        {/* Round Progress & Controls */}
        <div className="mt-3 pt-3 border-t border-amber-600/30 flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/30 text-amber-950">
              Rodada {settings.currentRound} de {settings.maxRounds}
            </span>
            <span className="text-amber-950">
              Motor: [{currentEngine}|{currentEngine}]
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-amber-950 hover:underline flex items-center gap-1 text-[11px]"
          >
            <Users className="w-3 h-3" />
            <span>{showConfig ? 'Fechar Ajustes' : 'Configurar Partida'}</span>
          </button>
        </div>
      </div>

      {/* Share Toast Notification */}
      {shareSuccessToast && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold text-center shadow-lg animate-bounce flex items-center justify-center gap-2">
          <Check className="w-4 h-4" />
          <span>{shareSuccessToast}</span>
        </div>
      )}

      {/* Config Drawer / Settings (2-10 players, 1-10 rounds) */}
      {showConfig && (
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Ajustes da Mesa (2 a 10 Jogadores • 1 a 10 Partidas)
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Quantidade de Rodadas:</p>
              <p className="text-[11px] text-zinc-400">Padrão de 1 a 10 partidas</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={settings.maxRounds <= 1}
                onClick={() => handleUpdateRoundsCount(settings.maxRounds - 1)}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-200 disabled:opacity-30"
              >
                -
              </button>
              <span className="w-8 text-center font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {settings.maxRounds}
              </span>
              <button
                type="button"
                disabled={settings.maxRounds >= 10}
                onClick={() => handleUpdateRoundsCount(settings.maxRounds + 1)}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-200 disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>

          {/* Add Player Input */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Jogadores ({players.length}/10):
              </span>
              {players.length >= 10 && (
                <span className="text-[11px] text-amber-500 font-medium">Limite máximo atingido</span>
              )}
            </div>

            {players.length < 10 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome do novo jogador..."
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                  className="flex-1 px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl"
                />
                <button
                  type="button"
                  onClick={handleAddPlayer}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-medium border border-zinc-200 dark:border-zinc-700"
                >
                  <span>{p.avatar}</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">{p.name}</span>
                  {players.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(p.id)}
                      className="text-zinc-400 hover:text-red-500 ml-1"
                      title="Remover jogador"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top 3 Podium Visual */}
      <div className="grid grid-cols-3 gap-2 pt-2 items-end">
        {/* 2nd Place */}
        {rankedPlayers[1] && (
          <div className="flex flex-col items-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 pt-4 relative shadow-xs order-1">
            <span className="absolute -top-3 w-6 h-6 rounded-full bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center shadow-xs">
              2
            </span>
            <span className="text-2xl">{rankedPlayers[1].avatar}</span>
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-full mt-1">
              {rankedPlayers[1].name}
            </p>
            <p className="text-sm font-black text-slate-600 dark:text-slate-400">
              {rankedPlayers[1].totalScore} pts
            </p>
            <span className="text-[10px] text-zinc-400">
              +{rankedPlayers[1].totalScore - rankedPlayers[0].totalScore}
            </span>
          </div>
        )}

        {/* 1st Place (Leader) */}
        {rankedPlayers[0] && (
          <div className="flex flex-col items-center bg-linear-to-b from-amber-50 to-white dark:from-amber-950/20 dark:to-zinc-900 rounded-2xl border-2 border-amber-400 dark:border-amber-500/60 p-3 pt-4 relative shadow-md order-2 -mt-2">
            <div className="absolute -top-4 flex items-center gap-1 bg-amber-400 text-zinc-950 px-2.5 py-0.5 rounded-full text-xs font-black shadow-xs">
              <Crown className="w-3.5 h-3.5 fill-zinc-950" />
              <span>1º</span>
            </div>
            <span className="text-3xl">{rankedPlayers[0].avatar}</span>
            <p className="text-xs font-extrabold text-amber-900 dark:text-amber-300 truncate max-w-full mt-1">
              {rankedPlayers[0].name}
            </p>
            <p className="text-base font-black text-amber-600 dark:text-amber-400">
              {rankedPlayers[0].totalScore} pts
            </p>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              Líder da Mesa
            </span>
          </div>
        )}

        {/* 3rd Place */}
        {rankedPlayers[2] && (
          <div className="flex flex-col items-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 pt-4 relative shadow-xs order-3">
            <span className="absolute -top-3 w-6 h-6 rounded-full bg-amber-700 text-amber-100 text-xs font-black flex items-center justify-center shadow-xs">
              3
            </span>
            <span className="text-2xl">{rankedPlayers[2].avatar}</span>
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-full mt-1">
              {rankedPlayers[2].name}
            </p>
            <p className="text-sm font-black text-amber-800 dark:text-amber-600">
              {rankedPlayers[2].totalScore} pts
            </p>
            <span className="text-[10px] text-zinc-400">
              +{rankedPlayers[2].totalScore - rankedPlayers[0].totalScore}
            </span>
          </div>
        )}
      </div>

      {/* Quick Action: Open Piece Editor for Current Round */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
        <div className="flex items-center gap-2">
          <Edit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
            Editar Peças ou Pontos da Rodada {settings.currentRound}:
          </span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleOpenPieceEditor(p.id, settings.currentRound - 1)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-bold border border-zinc-200 dark:border-zinc-700 shadow-xs"
              title={`Editar peças de ${p.name}`}
            >
              <span>{p.avatar}</span>
              <span className="truncate max-w-[60px]">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Full Leaderboard Table & Scores Matrix */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Tabela de Pontos e Peças por Rodada
            </h3>
            <p className="text-[10px] text-zinc-400">
              Toque em qualquer célula para editar o valor direto ou abrir o detalhamento das peças
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2.5 px-3 font-bold"># Pos</th>
                <th className="py-2.5 px-3 font-bold">Jogador</th>
                {Array.from({ length: settings.maxRounds }).map((_, i) => (
                  <th
                    key={i}
                    className={`py-2.5 px-2 text-center font-bold whitespace-nowrap ${
                      settings.currentRound === i + 1
                        ? 'bg-amber-100/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300'
                        : ''
                    }`}
                  >
                    R{i + 1}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right font-black text-zinc-900 dark:text-zinc-100">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rankedPlayers.map((player) => (
                <tr
                  key={player.id}
                  className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors ${
                    player.isLeader ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                  }`}
                >
                  {/* Rank Badge */}
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black ${
                        player.rank === 1
                          ? 'bg-amber-400 text-zinc-950'
                          : player.rank === 2
                          ? 'bg-slate-300 text-slate-900'
                          : player.rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {player.rank}
                    </span>
                  </td>

                  {/* Player Info */}
                  <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <span>{player.avatar}</span>
                      <span className="truncate max-w-[90px]">{player.name}</span>
                    </div>
                  </td>

                  {/* Round Scores & Piece Edit Triggers */}
                  {Array.from({ length: settings.maxRounds }).map((_, rIdx) => {
                    const score = player.scores[rIdx];
                    const piecesForRound = player.roundPieces?.[rIdx] || [];
                    const isCurrent = settings.currentRound === rIdx + 1;
                    const isEditing =
                      editingScore?.playerId === player.id &&
                      editingScore?.roundIndex === rIdx;

                    return (
                      <td
                        key={rIdx}
                        className={`py-2 px-1 text-center font-bold relative group ${
                          isCurrent ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <input
                              type="number"
                              min="0"
                              autoFocus
                              value={editingScore.value}
                              onChange={(e) =>
                                setEditingScore({
                                  ...editingScore,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() =>
                                handleSaveScoreDirect(
                                  player.id,
                                  rIdx,
                                  editingScore.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveScoreDirect(
                                    player.id,
                                    rIdx,
                                    editingScore.value
                                  );
                                }
                              }}
                              className="w-12 text-center py-1 text-xs bg-white dark:bg-zinc-800 border-2 border-emerald-500 rounded font-bold"
                            />
                          </div>
                        ) : (
                          <div
                            onClick={() => handleOpenPieceEditor(player.id, rIdx)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Editar peças e pontuação da Rodada ${rIdx + 1} para ${player.name}`}
                            className={`py-1 px-1.5 rounded cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex flex-col items-center justify-center ${
                              score === 0
                                ? 'text-emerald-600 dark:text-emerald-400 font-extrabold'
                                : score !== null
                                ? 'text-zinc-800 dark:text-zinc-200'
                                : 'text-zinc-300 dark:text-zinc-600'
                            }`}
                          >
                            <span>{score === 0 ? '0 🎯' : score !== null ? score : '-'}</span>
                            {piecesForRound.length > 0 && (
                              <span className="text-[9px] text-zinc-400 font-normal">
                                {piecesForRound.length}p
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Total Score */}
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`font-black text-sm ${
                        player.isLeader
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {player.totalScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Round Controller Bar */}
      <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800/60 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-700/60">
        <button
          type="button"
          disabled={settings.currentRound <= 1}
          onClick={() =>
            onUpdateSettings({
              ...settings,
              currentRound: Math.max(1, settings.currentRound - 1),
            })
          }
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Rodada Anterior</span>
        </button>

        <div className="text-center">
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
            Rodada em Jogo
          </span>
          <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
            {settings.currentRound} de {settings.maxRounds} (Pedra [{currentEngine}|{currentEngine}])
          </span>
        </div>

        <button
          type="button"
          disabled={settings.currentRound >= settings.maxRounds}
          onClick={() =>
            onUpdateSettings({
              ...settings,
              currentRound: Math.min(settings.maxRounds, settings.currentRound + 1),
            })
          }
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40"
        >
          <span>Próxima Rodada</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Match Completed Banner / Victory Trigger */}
      {isMatchComplete && (
        <div className="p-4 rounded-2xl bg-linear-to-r from-emerald-600 to-teal-700 text-white shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <h4 className="font-extrabold text-sm">Partida Finalizada com Sucesso!</h4>
              <p className="text-xs text-emerald-100">
                Campeão: {rankedPlayers[0]?.name} com apenas {rankedPlayers[0]?.totalScore} pontos!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={triggerCelebration}
            className="px-3 py-1.5 bg-white text-emerald-900 rounded-xl font-bold text-xs shadow-xs"
          >
            Comemorar 🎊
          </button>
        </div>
      )}

      {/* Detailed Piece Editor Modal */}
      <PieceEditorModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        playerName={modalPlayer?.name || ''}
        playerAvatar={modalPlayer?.avatar || '👤'}
        roundNumber={modalState.roundIndex + 1}
        initialPieces={modalPieces}
        initialScore={modalScore}
        onSave={handleSaveFromModal}
      />
    </div>
  );
};
