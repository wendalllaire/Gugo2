import React from 'react';
import { TabType } from '../types';
import {
  Camera,
  Trophy,
  Moon,
  Sun,
  Share2,
} from 'lucide-react';

interface AndroidFrameProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onShare: () => void;
  currentRound: number;
  maxRounds: number;
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({
  currentTab,
  onTabChange,
  isDarkMode,
  onToggleDarkMode,
  onShare,
  currentRound,
  maxRounds,
  children,
}) => {

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-start transition-colors duration-200 ${
        isDarkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-slate-100 text-zinc-900'
      } p-0 sm:py-6 sm:px-4`}
    >
      {/* Android Device Shell */}
      <div
        className="w-full max-w-full sm:max-w-[430px] transition-all duration-300 flex flex-col relative overflow-hidden h-screen sm:h-[840px] sm:max-h-[92vh] rounded-none sm:rounded-[42px] border-0 sm:border-[8px] border-zinc-800 dark:border-zinc-800 shadow-none sm:shadow-2xl bg-white dark:bg-zinc-950"
      >
        {/* Android Punch Hole Camera (desktop mockup only) */}
        <div className="hidden sm:block absolute top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-black z-30 ring-1 ring-zinc-700" />

        {/* Android Material 3 TopAppBar */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚂</span>
            <div>
              <h1 className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
                Dominó Mexicano
              </h1>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Rodada {currentRound}/{maxRounds} • Visão Offline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={isDarkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-700" />
              )}
            </button>

            {/* Quick Share Action */}
            <button
              type="button"
              onClick={onShare}
              aria-label="Compartilhar resultado"
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Screen View (Tabs Content) */}
        <main className="flex-1 overflow-y-auto px-4 py-3.5 relative scrollbar-thin">
          {children}
        </main>

        {/* Material 3 Bottom NavigationBar (2 tabs with icons: Câmera and Ranking) */}
        <nav
          aria-label="Navegação Principal do Aplicativo"
          className="w-full bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-6 py-2 flex items-center justify-around z-20 shrink-0"
        >
          {/* Tab 1: Câmera / Contagem de Pontos */}
          <button
            type="button"
            onClick={() => onTabChange('camera')}
            className={`flex flex-col items-center gap-1 transition-all ${
              currentTab === 'camera'
                ? 'text-emerald-600 dark:text-emerald-400 scale-105'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <div
              className={`p-1.5 rounded-full transition-colors ${
                currentTab === 'camera' ? 'bg-emerald-500/15' : 'bg-transparent'
              }`}
            >
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold">Câmera / Contar</span>
          </button>

          {/* Tab 2: Ranking em Tempo Real */}
          <button
            type="button"
            onClick={() => onTabChange('ranking')}
            className={`flex flex-col items-center gap-1 transition-all ${
              currentTab === 'ranking'
                ? 'text-emerald-600 dark:text-emerald-400 scale-105'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <div
              className={`p-1.5 rounded-full transition-colors ${
                currentTab === 'ranking' ? 'bg-emerald-500/15' : 'bg-transparent'
              }`}
            >
              <Trophy className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold">Ranking</span>
          </button>
        </nav>

        {/* Android Gesture Bar / Navigation Pill */}
        <div className="w-full py-1.5 flex justify-center bg-zinc-50 dark:bg-zinc-900 shrink-0">
          <div className="w-32 h-1 bg-zinc-400 dark:bg-zinc-600 rounded-full" />
        </div>
      </div>
    </div>
  );
};
