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
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [roundActionIndex, setRoundActionIndex] = useState<number | null>(null);
  const [roundMoveTarget, setRoundMoveTarget] = useState<number>(0);

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

  const handleSavePlayerIdentity = () => {
    if (!editingPlayer) return;
    onUpdatePlayers(players.map((p) => p.id === editingPlayer.id ? { ...p, name: editingPlayer.name.trim() || p.name, avatar: editingPlayer.avatar.trim() || '👤' } : p));
    setEditingPlayer(null);
  };

  const handleDeleteRound = (roundIndex: number) => {
    if (settings.maxRounds <= 1) return;
    const updatedPlayers = players.map((p) => {
      const scores = [...p.scores]; scores.splice(roundIndex, 1);
      const roundPieces: Record<number, DominoTile[]> = {};
      Object.entries(p.roundPieces || {}).forEach(([key, value]) => { const i = Number(key); if (i < roundIndex) roundPieces[i] = value; else if (i > roundIndex) roundPieces[i - 1] = value; });
      return { ...p, scores, roundPieces };
    });
    const nextMax = settings.maxRounds - 1;
    onUpdatePlayers(updatedPlayers);
    onUpdateSettings({ ...settings, maxRounds: nextMax, currentRound: Math.max(1, Math.min(settings.currentRound > roundIndex + 1 ? settings.currentRound - 1 : settings.currentRound, nextMax)) });
    setRoundActionIndex(null);
  };

  const handleMoveRound = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) { setRoundActionIndex(null); return; }
    const moveItem = <T,>(items: T[], from: number, to: number) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };
    onUpdatePlayers(players.map((p) => {
      const scores = moveItem(p.scores, fromIndex, toIndex);
      const pieces = Array.from({ length: settings.maxRounds }, (_, i) => p.roundPieces?.[i] || []);
      const roundPieces: Record<number, DominoTile[]> = {};
      moveItem(pieces, fromIndex, toIndex).forEach((value, index) => { if (value.length) roundPieces[index] = value; });
      return { ...p, scores, roundPieces };
    }));
    const ci = settings.currentRound - 1;
    const next = ci === fromIndex ? toIndex : fromIndex < ci && toIndex >= ci ? ci - 1 : fromIndex > ci && toIndex <= ci ? ci + 1 : ci;
    onUpdateSettings({ ...settings, currentRound: next + 1 });
    setRoundActionIndex(null);
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
    setShowShareOptions(true);
  };

  const handleShareText = async () => {
    setShowShareOptions(false);
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

  const handleShareImage = async () => {
    setShowShareOptions(false);
    const winner = rankedPlayers[0];
    if (!winner) return;
    const escapeXml = (value: string) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char));
    const width = 1000;
    const rowHeight = 58;
    const tableTop = 430;
    const height = tableTop + 110 + rankedPlayers.length * rowHeight;
    const podium = rankedPlayers.slice(0, 3).map((p, i) => {
      const x = [170, 500, 830][i];
      const rank = i + 1;
      const color = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : '#b45309';
      return `<g><circle cx="${x}" cy="180" r="62" fill="${color}"/><text x="${x}" y="195" text-anchor="middle" font-size="54">${escapeXml(p.avatar)}</text><text x="${x}" y="280" text-anchor="middle" font-size="30" font-weight="700" fill="#18181b">${rank}º ${escapeXml(p.name)}</text><text x="${x}" y="320" text-anchor="middle" font-size="26" fill="#52525b">${p.totalScore} pontos</text></g>`;
    }).join('');
    const header = `<rect x="40" y="${tableTop}" width="920" height="62" rx="12" fill="#27272a"/><text x="65" y="${tableTop + 40}" fill="white" font-size="24" font-weight="700">#</text><text x="130" y="${tableTop + 40}" fill="white" font-size="24" font-weight="700">Jogador</text><text x="900" y="${tableTop + 40}" text-anchor="end" fill="white" font-size="24" font-weight="700">Total</text>`;
    const rows = rankedPlayers.map((p, i) => {
      const y = tableTop + 62 + i * rowHeight;
      return `<rect x="40" y="${y}" width="920" height="${rowHeight}" fill="${i % 2 ? '#f4f4f5' : '#ffffff'}"/><text x="65" y="${y + 38}" font-size="22" fill="#18181b">${p.rank}</text><text x="130" y="${y + 38}" font-size="22" fill="#18181b">${escapeXml(p.avatar)} ${escapeXml(p.name)}</text><text x="900" y="${y + 38}" text-anchor="end" font-size="24" font-weight="700" fill="#18181b">${p.totalScore}</text>`;
    }).join('');
    const message = `🎉 Parabéns, ${winner.name}! És o grande vencedor do Dominó Mexicano com ${winner.totalScore} pontos! Obrigado a todos pela partida! 🏆`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff7ed"/><text x="500" y="65" text-anchor="middle" font-size="38" font-weight="800" fill="#9a3412">🏆 DOMINÓ MEXICANO</text><text x="500" y="115" text-anchor="middle" font-size="28" font-weight="700" fill="#18181b">Pódio da partida</text>${podium}<text x="500" y="390" text-anchor="middle" font-size="25" font-weight="700" fill="#9a3412">🎉 Parabéns, ${escapeXml(winner.name)}! Grande vencedor! 🎉</text>${header}${rows}</svg>`;
    try {
      const image = new Image();
      const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = imageUrl; });
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; canvas.height = height * 2;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponível');
      context.scale(2, 2); context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(imageUrl);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao criar imagem')), 'image/png'));
      const file = new File([blob], 'ranking-domino-mexicano.png', { type: 'image/png' });
      if (Capacitor.isNativePlatform()) {
        // In Android WebView, navigator.share(files) is not reliably implemented.
        // Persist the PNG in the app cache and invoke Android's native Sharesheet.
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            if (comma < 0) reject(new Error('Não foi possível preparar a imagem'));
            else resolve(result.slice(comma + 1));
          };
          reader.onerror = () => reject(new Error('Não foi possível ler a imagem'));
          reader.readAsDataURL(blob);
        });
        const saved = await Filesystem.writeFile({
          path: 'ranking-domino-mexicano.png',
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        });
        await Share.share({
          title: 'Ranking Dominó Mexicano',
          text: message,
          files: [saved.uri],
          dialogTitle: 'Partilhar pódio e tabela',
        });
        setShareSuccessToast('Imagem e mensagem prontas para partilhar!');
      } else if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: 'Ranking Dominó Mexicano',
          text: message,
          files: [file],
        });
        setShareSuccessToast('Imagem e mensagem prontas para partilhar!');
      } else {
        const imageUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
        await copyToClipboard(message);
        setShareSuccessToast('Imagem guardada e mensagem copiada. Anexe a imagem na aplicação de destino.');
      }
      setTimeout(() => setShareSuccessToast(null), 4000);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setShareSuccessToast('Não foi possível gerar a imagem para partilhar.');
      setTimeout(() => setShareSuccessToast(null), 4000);
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
              <h2 className="text-base font-black leading-tight">Ranking</h2>
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
                  <span onDoubleClick={() => setEditingPlayer({ id: p.id, name: p.name, avatar: p.avatar })} title="Toque duas vezes para editar nome e emoji" className="font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer">{p.name}</span>
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

      {/* Full Leaderboard Table & Scores Matrix */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2.5 px-3 font-bold"># Pos</th>
                <th className="py-2.5 px-3 font-bold">Jogador</th>
                {Array.from({ length: settings.maxRounds }).map((_, i) => (
                  <th
                    key={i}
                    onDoubleClick={() => { setRoundActionIndex(i); setRoundMoveTarget(i); }}
                    title="Toque duas vezes para excluir ou mover esta rodada"
                    className={`py-2.5 px-2 text-center font-bold whitespace-nowrap cursor-pointer select-none ${
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
                      <span onDoubleClick={() => setEditingPlayer({ id: player.id, name: player.name, avatar: player.avatar })} title="Toque duas vezes para editar nome e emoji" className="truncate max-w-[90px] cursor-pointer">{player.name}</span>
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

      {/* Quick Action: Open Piece Editor for Current Round */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
        <div className="flex items-center gap-2">
          <Edit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
            Editar Rodada {settings.currentRound}:
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

      {showShareOptions && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 space-y-3 shadow-2xl">
            <h3 className="font-black text-sm text-zinc-900 dark:text-white">Partilhar resultados</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Escolhe como queres enviar o resultado da partida.</p>
            <button onClick={handleShareImage} className="w-full px-3 py-3 rounded-xl bg-emerald-600 text-white text-xs font-bold text-left">🏆 Pódio + tabela em imagem com parabéns ao vencedor (WhatsApp)</button>
            <button onClick={handleShareText} className="w-full px-3 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold text-left">Partilhar apenas texto</button>
            <button onClick={() => setShowShareOptions(false)} className="w-full px-3 py-2 rounded-xl text-xs font-bold text-zinc-500">Cancelar</button>
          </div>
        </div>
      )}

      {editingPlayer && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 space-y-3 shadow-2xl">
            <h3 className="font-black text-sm text-zinc-900 dark:text-white">Editar jogador</h3>
            <label className="block text-xs font-bold text-zinc-500">Nome</label>
            <input autoFocus value={editingPlayer.name} onChange={(e) => setEditingPlayer({ ...editingPlayer, name: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm" />
            <label className="block text-xs font-bold text-zinc-500">Emoji</label>
            <input value={editingPlayer.avatar} onChange={(e) => setEditingPlayer({ ...editingPlayer, avatar: e.target.value })} maxLength={8} className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xl" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditingPlayer(null)} className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800">Cancelar</button>
              <button onClick={handleSavePlayerIdentity} className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {roundActionIndex !== null && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 space-y-3 shadow-2xl">
            <h3 className="font-black text-sm text-zinc-900 dark:text-white">Opções da Rodada {roundActionIndex + 1}</h3>
            <button onClick={() => handleDeleteRound(roundActionIndex)} disabled={settings.maxRounds <= 1} className="w-full px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40">Excluir rodada e os pontos de todos os jogadores</button>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-500">Mover rodada para a posição</label>
              <select value={roundMoveTarget} onChange={(e) => setRoundMoveTarget(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm">
                {Array.from({ length: settings.maxRounds }, (_, i) => <option key={i} value={i}>R{i + 1}</option>)}
              </select>
              <button onClick={() => handleMoveRound(roundActionIndex, roundMoveTarget)} className="w-full px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">Mover sem substituir (inserir nesta posição)</button>
            </div>
            <button onClick={() => setRoundActionIndex(null)} className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold">Cancelar</button>
          </div>
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
