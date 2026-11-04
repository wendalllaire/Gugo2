import React, { useState, useEffect } from 'react';
import { TabType } from '../types';
import {
  Camera,
  Trophy,
  Moon,
  Sun,
  Code,
  Share2,
  Wifi,
  WifiOff,
  BatteryCharging,
  Maximize2,
  Minimize2,
  Smartphone,
  Download,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface AndroidFrameProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenKotlinModal: () => void;
  onOpenApkModal: () => void;
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
  onOpenKotlinModal,
  onOpenApkModal,
  onShare,
  currentRound,
  maxRounds,
  children,
}) => {
  const [currentTime, setCurrentTime] = useState('09:41');
  const [isFullWidth, setIsFullWidth] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-start transition-colors duration-200 ${
        isDarkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-slate-100 text-zinc-900'
      } p-0 sm:py-6 sm:px-4`}
    >
      {/* Top Desktop Controls Bar */}
      <header className="hidden sm:flex w-full max-w-md sm:max-w-xl items-center justify-between mb-3 px-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-zinc-700 dark:text-zinc-300">
            Android Jetpack Compose
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
            API 34 / OpenCV 4.9 Offline
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* APK Download Button */}
          <button
            type="button"
            onClick={onOpenApkModal}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar APK (.apk)</span>
          </button>

          {/* Kotlin Code Viewer Button */}
          <button
            type="button"
            onClick={onOpenKotlinModal}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors"
          >
            <Code className="w-3.5 h-3.5 text-emerald-400" />
            <span>Código Kotlin</span>
          </button>

          {/* Toggle Mobile Phone Mockup Frame vs Full Width */}
          <button
            type="button"
            onClick={() => setIsFullWidth(!isFullWidth)}
            className="p-1 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            title={isFullWidth ? 'Modo Smartphone' : 'Modo Expandido'}
          >
            {isFullWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Android Device Shell */}
      <div
        className={`w-full transition-all duration-300 flex flex-col relative overflow-hidden h-screen sm:h-[840px] sm:max-h-[92vh] ${
          isFullWidth
            ? 'sm:max-w-3xl sm:rounded-3xl border-0 sm:border border-zinc-300 dark:border-zinc-800 shadow-2xl bg-white dark:bg-zinc-950'
            : 'max-w-full sm:max-w-[430px] rounded-none sm:rounded-[42px] border-0 sm:border-[8px] border-zinc-800 dark:border-zinc-800 shadow-none sm:shadow-2xl bg-white dark:bg-zinc-950'
        }`}
      >
        {/* Android Punch Hole Camera (desktop mockup only) */}
        {!isFullWidth && (
          <div className="hidden sm:block absolute top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-black z-30 ring-1 ring-zinc-700" />
        )}

        {/* Android Status Bar */}
        <div className="w-full h-8 px-6 pt-1 flex items-center justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-300 select-none z-20">
          <span className="font-mono text-[11px] tracking-tight">{currentTime}</span>

          <div className="flex items-center gap-2">
            {!isOnline ? (
              <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </span>
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] font-bold">5G</span>
            <div className="flex items-center gap-0.5">
              <span className="text-[10px]">98%</span>
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
        </div>

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
            {/* APK Download Button for Mobile */}
            <button
              type="button"
              onClick={onOpenApkModal}
              title="Baixar APK de Testes"
              aria-label="Baixar APK de Testes"
              className="p-2 rounded-xl text-emerald-600 dark:text-emerald-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Kotlin Code Button for Mobile */}
            <button
              type="button"
              onClick={onOpenKotlinModal}
              title="Ver Código Kotlin Jetpack Compose"
              aria-label="Ver Código Kotlin Jetpack Compose"
              className="sm:hidden p-2 rounded-xl text-emerald-600 dark:text-emerald-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <Code className="w-4 h-4" />
            </button>

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
