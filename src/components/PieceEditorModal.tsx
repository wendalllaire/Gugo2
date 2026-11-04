import React, { useState, useEffect } from 'react';
import { DominoTile } from '../types';
import { DominoPiece } from './DominoPiece';
import { normalizeTile, getTilePoints } from '../utils/dominoRules';
import {
  X,
  Plus,
  Trash2,
  Check,
  Edit2,
  Sparkles,
  Calculator,
  RotateCcw,
} from 'lucide-react';

interface PieceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  playerAvatar: string;
  roundNumber: number;
  initialPieces?: DominoTile[];
  initialScore?: number | null;
  onSave: (updatedPieces: DominoTile[], finalScore: number) => void;
}

export const PieceEditorModal: React.FC<PieceEditorModalProps> = ({
  isOpen,
  onClose,
  playerName,
  playerAvatar,
  roundNumber,
  initialPieces = [],
  initialScore = null,
  onSave,
}) => {
  const [pieces, setPieces] = useState<DominoTile[]>([]);
  const [editingPieceId, setEditingPieceId] = useState<string | null>(null);
  const [editSideA, setEditSideA] = useState(6);
  const [editSideB, setEditSideB] = useState(6);

  // New piece input
  const [newSideA, setNewSideA] = useState(12);
  const [newSideB, setNewSideB] = useState(9);
  const [showAddNew, setShowAddNew] = useState(false);

  // Direct manual score mode option
  const [manualScoreOverride, setManualScoreOverride] = useState<string>('');
  const [useDirectScore, setUseDirectScore] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPieces([...initialPieces]);
      setEditingPieceId(null);
      setShowAddNew(false);
      if (initialPieces.length === 0 && initialScore !== null) {
        setUseDirectScore(true);
        setManualScoreOverride(String(initialScore));
      } else {
        setUseDirectScore(false);
        const sum = initialPieces.reduce((acc, p) => acc + getTilePoints(p), 0);
        setManualScoreOverride(initialScore !== null ? String(initialScore) : String(sum));
      }
    }
  }, [isOpen, initialPieces, initialScore]);

  if (!isOpen) return null;

  // Calculate live sum of pieces
  const piecesSum = pieces.reduce((sum, p) => sum + getTilePoints(p), 0);
  const currentTotal = useDirectScore
    ? Math.max(0, parseInt(manualScoreOverride, 10) || 0)
    : piecesSum;

  const handleStartEdit = (piece: DominoTile) => {
    setEditingPieceId(piece.id);
    setEditSideA(piece.sideA);
    setEditSideB(piece.sideB);
  };

  const handleSavePieceEdit = (pieceId: string) => {
    const min = Math.min(editSideA, editSideB);
    const max = Math.max(editSideA, editSideB);
    setPieces((prev) =>
      prev.map((p) => (p.id === pieceId ? { ...p, sideA: min, sideB: max } : p))
    );
    setEditingPieceId(null);
    setUseDirectScore(false);
  };

  const handleAddPiece = () => {
    const tile = normalizeTile(newSideA, newSideB);
    const newPiece: DominoTile = {
      ...tile,
      id: `manual-p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    setPieces((prev) => [...prev, newPiece]);
    setShowAddNew(false);
    setUseDirectScore(false);
  };

  const handleRemovePiece = (id: string) => {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    if (editingPieceId === id) setEditingPieceId(null);
  };

  const handleConfirmSave = () => {
    const finalScore = useDirectScore
      ? Math.max(0, parseInt(manualScoreOverride, 10) || 0)
      : piecesSum;
    onSave(pieces, finalScore);
    onClose();
  };

  const handleSetZeroWinner = () => {
    setPieces([]);
    setUseDirectScore(true);
    setManualScoreOverride('0');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-2xl flex items-center justify-center shadow-xs">
              {playerAvatar}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight">
                Editar Peças e Pontuação
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {playerName} • Rodada {roundNumber}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Total Points Header Card */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-linear-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-500/30">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                Pontuação Total da Rodada {roundNumber}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {useDirectScore
                  ? 'Modo: Pontuação manual direta'
                  : `${pieces.length} ${pieces.length === 1 ? 'peça somada' : 'peças somadas'}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-black text-xl shadow-xs">
                {currentTotal} pts
              </span>
              <button
                type="button"
                onClick={handleSetZeroWinner}
                title="Bateu / Venceu com 0 pontos"
                className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-lg shadow-xs transition-colors"
              >
                0 🎯 (Bateu)
              </button>
            </div>
          </div>

          {/* Toggle between Piece Breakdown vs Direct Manual Score */}
          <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800/60 p-1.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setUseDirectScore(false)}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                !useDirectScore
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Peças Individuais ({pieces.length})
            </button>
            <button
              type="button"
              onClick={() => setUseDirectScore(true)}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                useDirectScore
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Pontuação Manual Direta
            </button>
          </div>

          {/* Direct Manual Score Input view */}
          {useDirectScore ? (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
              <label htmlFor="modal-manual-score" className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                Digite a pontuação manual desta rodada:
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="modal-manual-score"
                  type="number"
                  min="0"
                  value={manualScoreOverride}
                  onChange={(e) => setManualScoreOverride(e.target.value)}
                  placeholder="Ex: 25"
                  className="flex-1 px-3 py-2 text-base font-black bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-center"
                />
                <span className="text-sm font-bold text-zinc-500">pontos</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Dica: Você também pode alternar para a aba "Peças Individuais" para listar e somar cada dominó separadamente.
              </p>
            </div>
          ) : (
            /* Pieces List & Individual Editing */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Pedras Restantes na Mão:
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddNew(!showAddNew)}
                  className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Peça</span>
                </button>
              </div>

              {/* Add New Piece Form */}
              {showAddNew && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-emerald-500/40 space-y-2">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                    Nova Peça (Double-12):
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5">
                      <label htmlFor="new-modal-side-a" className="text-[11px] text-zinc-400">Lado A:</label>
                      <select
                        id="new-modal-side-a"
                        aria-label="Lado A da nova pedra"
                        value={newSideA}
                        onChange={(e) => setNewSideA(Number(e.target.value))}
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
                      <label htmlFor="new-modal-side-b" className="text-[11px] text-zinc-400">Lado B:</label>
                      <select
                        id="new-modal-side-b"
                        aria-label="Lado B da nova pedra"
                        value={newSideB}
                        onChange={(e) => setNewSideB(Number(e.target.value))}
                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-1.5 text-xs font-bold"
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
                      onClick={handleAddPiece}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      Inserir
                    </button>
                  </div>
                </div>
              )}

              {/* Pieces list */}
              {pieces.length === 0 ? (
                <div className="p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 text-xs">
                  <Calculator className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
                  <p>Nenhuma peça registrada nesta rodada (0 pontos).</p>
                  <button
                    type="button"
                    onClick={() => setShowAddNew(true)}
                    className="mt-2 text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                  >
                    + Adicionar peças da mão
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {pieces.map((piece) => {
                    const isEditing = editingPieceId === piece.id;
                    const pts = getTilePoints(piece);

                    return (
                      <div
                        key={piece.id}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isEditing
                            ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-500'
                            : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                        }`}
                      >
                        {isEditing ? (
                          /* Edit Mode for This Piece */
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                                Editando Peça [{editSideA}|{editSideB}] ({editSideA + editSideB} pts):
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSavePieceEdit(piece.id)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-700"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Salvar Peça</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1 flex items-center gap-1.5">
                                <span className="text-[11px] text-zinc-500">Lado A:</span>
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
                                <span className="text-[11px] text-zinc-500">Lado B:</span>
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
                          /* View Mode with Edit & Delete actions */
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <DominoPiece sideA={piece.sideA} sideB={piece.sideB} size="sm" />
                              <div>
                                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                                  [{piece.sideA}|{piece.sideB}]
                                </span>
                                <span className="text-[10px] text-zinc-400">
                                  {piece.sideA === piece.sideB ? 'Duplo' : `${piece.sideA} + ${piece.sideB}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                                {pts} pts
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(piece)}
                                aria-label={`Editar peça [${piece.sideA}|${piece.sideB}]`}
                                className="p-1.5 text-zinc-400 hover:text-amber-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemovePiece(piece.id)}
                                aria-label={`Remover peça [${piece.sideA}|${piece.sideB}]`}
                                className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
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
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Salvar {currentTotal} Pontos no Ranking</span>
          </button>
        </div>
      </div>
    </div>
  );
};
