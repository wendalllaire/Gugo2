import React from 'react';

interface DominoPieceProps {
  sideA: number;
  sideB: number;
  orientation?: 'vertical' | 'horizontal';
  isDouble?: boolean;
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

// Color palette for Mexican Train double-12 pip numbers
const PIP_COLORS: Record<number, { bg: string; text: string; dot: string }> = {
  0: { bg: 'bg-zinc-200 dark:bg-zinc-700', text: 'text-zinc-500 dark:text-zinc-400', dot: 'bg-transparent' },
  1: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-600 dark:bg-blue-400' },
  2: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-600 dark:bg-emerald-400' },
  3: { bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-600 dark:bg-red-400' },
  4: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-600 dark:bg-amber-400' },
  5: { bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-600 dark:bg-orange-400' },
  6: { bg: 'bg-teal-100 dark:bg-teal-950/40', text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-600 dark:bg-teal-400' },
  7: { bg: 'bg-purple-100 dark:bg-purple-950/40', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-600 dark:bg-purple-400' },
  8: { bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-600 dark:bg-indigo-400' },
  9: { bg: 'bg-cyan-100 dark:bg-cyan-950/40', text: 'text-cyan-700 dark:text-cyan-400', dot: 'bg-cyan-600 dark:bg-cyan-400' },
  10: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-600 dark:bg-rose-400' },
  11: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/40', text: 'text-fuchsia-600 dark:text-fuchsia-400', dot: 'bg-fuchsia-600 dark:bg-fuchsia-400' },
  12: { bg: 'bg-yellow-100 dark:bg-yellow-950/40', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-600 dark:bg-yellow-400' },
};

export const DominoPiece: React.FC<DominoPieceProps> = ({
  sideA,
  sideB,
  orientation = 'horizontal',
  isDouble = sideA === sideB,
  size = 'md',
  highlight = false,
  onClick,
  onRemove,
  className = '',
}) => {
  const isHorizontal = orientation === 'horizontal';

  // Dimension classes
  const sizeClasses = {
    sm: isHorizontal ? 'w-16 h-8 text-xs' : 'w-8 h-16 text-xs',
    md: isHorizontal ? 'w-24 h-12 text-sm' : 'w-12 h-24 text-sm',
    lg: isHorizontal ? 'w-32 h-16 text-base' : 'w-16 h-32 text-base',
  }[size];

  const colorA = PIP_COLORS[sideA] || PIP_COLORS[0];
  const colorB = PIP_COLORS[sideB] || PIP_COLORS[0];

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Peça de dominó ${sideA} e ${sideB}`}
      className={`group relative select-none rounded-lg border border-zinc-300 dark:border-zinc-700/80 bg-linear-to-b from-stone-50 to-stone-100 dark:from-zinc-800 dark:to-zinc-900 shadow-xs transition-all duration-150 flex items-center justify-center p-0.5 ${sizeClasses} ${
        highlight
          ? 'ring-2 ring-emerald-500 shadow-md ring-offset-1 dark:ring-offset-zinc-950'
          : 'hover:shadow-md'
      } ${isDouble ? 'border-amber-400/70 dark:border-amber-500/50' : ''} ${
        onClick ? 'cursor-pointer active:scale-95' : ''
      } ${className}`}
    >
      {/* Remove button on hover if onRemove is provided */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remover peça ${sideA}-${sideB}`}
          className="absolute -top-1.5 -right-1.5 z-10 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold shadow-sm hover:bg-red-600"
        >
          ×
        </button>
      )}

      {/* Domino Body */}
      <div
        className={`w-full h-full flex ${
          isHorizontal ? 'flex-row' : 'flex-col'
        } rounded-md overflow-hidden bg-white/60 dark:bg-zinc-800/80`}
      >
        {/* Half A */}
        <div className="flex-1 flex flex-col items-center justify-center relative p-1">
          <span className={`font-black tracking-tighter ${colorA.text} text-sm md:text-base`}>
            {sideA}
          </span>
          {/* Subtle pip indicator dots (up to 4 mini-dots for flair) */}
          <div className="flex gap-0.5 mt-0.5">
            {Array.from({ length: Math.min(sideA, 4) }).map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full ${colorA.dot}`} />
            ))}
            {sideA > 4 && <span className="text-[8px] leading-none opacity-60">+</span>}
          </div>
        </div>

        {/* Divider bar with brass rivet */}
        <div
          className={`${
            isHorizontal ? 'w-[1.5px] h-full' : 'h-[1.5px] w-full'
          } bg-zinc-300 dark:bg-zinc-700 relative flex items-center justify-center`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500 shadow-xs z-1" />
        </div>

        {/* Half B */}
        <div className="flex-1 flex flex-col items-center justify-center relative p-1">
          <span className={`font-black tracking-tighter ${colorB.text} text-sm md:text-base`}>
            {sideB}
          </span>
          <div className="flex gap-0.5 mt-0.5">
            {Array.from({ length: Math.min(sideB, 4) }).map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full ${colorB.dot}`} />
            ))}
            {sideB > 4 && <span className="text-[8px] leading-none opacity-60">+</span>}
          </div>
        </div>
      </div>

      {/* Double Indicator Crown */}
      {isDouble && (
        <span
          title="Peça Dobrada (Duble)"
          className="absolute -bottom-1 -left-1 px-1 rounded text-[9px] font-bold bg-amber-500 text-zinc-950 uppercase tracking-widest shadow-xs"
        >
          2x
        </span>
      )}
    </div>
  );
};
