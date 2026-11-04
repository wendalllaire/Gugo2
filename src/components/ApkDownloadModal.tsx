import React, { useState } from 'react';
import {
  X,
  Download,
  Smartphone,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  FolderArchive,
  ArrowRight,
  ExternalLink,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface ApkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkDownloadModal: React.FC<ApkDownloadModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'apk' | 'pwa' | 'instructions'>('apk');
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  if (!isOpen) return null;

  const handleDownloadApk = () => {
    setDownloadTriggered(true);
    const link = document.createElement('a');
    link.href = '/api/download/apk';
    link.download = 'DominoMexicano-v1.0-debug.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloadTriggered(false), 5000);
  };

  const handleDownloadSource = () => {
    const link = document.createElement('a');
    link.href = '/api/download/source';
    link.download = 'DominoMexicano-SourceCode.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                Instalar no Android
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  APK / WebAPK
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Versão de teste 100% offline com visão computacional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-4 bg-zinc-100/50 dark:bg-zinc-900/50 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('apk')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'apk'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar APK (.apk)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pwa')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'pwa'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Instalar Direto (WebAPK)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('instructions')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'instructions'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Como Instalar</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {activeTab === 'apk' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                      Pacote de Testes Android (Debug APK)
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                      Arquivo instalável standalone para dispositivos Android 8.0+ (API 26+)
                    </p>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    v1.0.0
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] py-1 border-t border-b border-emerald-500/10">
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Motor CV: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Offline (OpenCV)</span>
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Dependência Cloud: <span className="text-zinc-800 dark:text-zinc-200 font-semibold">Nenhuma (0 API)</span>
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Pacote: <span className="font-mono text-zinc-700 dark:text-zinc-300">com.example.dominomexicano</span>
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Permissões: <span className="text-zinc-800 dark:text-zinc-200">Câmera (Local)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadApk}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar APK de Testes (.apk)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSource}
                    className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold text-xs transition-colors"
                    title="Baixar projeto completo para compilar no Android Studio"
                  >
                    <FolderArchive className="w-4 h-4 text-zinc-500" />
                    <span>Código Fonte (.zip)</span>
                  </button>
                </div>

                {downloadTriggered && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Download iniciado! Verifique a pasta de downloads do seu aparelho.</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-xs text-zinc-600 dark:text-zinc-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-800 dark:text-zinc-100">Instalação sem riscos:</strong> Como se trata de um pacote de teste gerado para desenvolvimento, o Android pode exibir a mensagem padrão <em>"O arquivo pode ser nocivo"</em>. Toque em <strong>"Fazer o download mesmo assim"</strong>.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                      Instalação WebAPK (1 Toque)
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Instala o app diretamente na gaveta de aplicativos do seu Android sem precisar ativar fontes desconhecidas!
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  {isInstalled ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle className="w-4 h-4" />
                      <span>O aplicativo já está instalado como app nativo no dispositivo!</span>
                    </div>
                  ) : isInstallable ? (
                    <button
                      type="button"
                      onClick={install}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98]"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Instalar no Celular Agora</span>
                    </button>
                  ) : isIOS ? (
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                      <p className="font-semibold">No iPhone / iPad (Safari):</p>
                      <p>1. Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta para cima).</p>
                      <p>2. Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.</p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-zinc-200/60 dark:bg-zinc-900/60 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">No navegador do seu Android (Chrome/Edge):</p>
                      <p>1. Abra o menu ⋮ (três pontinhos) no topo direito do navegador.</p>
                      <p>2. Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-zinc-400 text-[10px]">Funcionamento Offline</div>
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">100% sem internet</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-zinc-400 text-[10px]">Armazenamento</div>
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">&lt; 3 MB no aparelho</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'instructions' && (
            <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                Passo a Passo para Instalar o APK no Android:
              </h3>

              <div className="space-y-2.5">
                <div className="flex gap-3 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    1
                  </span>
                  <div>
                    <strong className="text-zinc-900 dark:text-zinc-100">Baixar o arquivo .apk:</strong>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Toque no botão <strong>"Baixar APK de Testes"</strong> para salvar o arquivo no seu smartphone.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    2
                  </span>
                  <div>
                    <strong className="text-zinc-900 dark:text-zinc-100">Autorizar fontes desconhecidas:</strong>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Se o Android solicitar, vá em <em>Configurações → Segurança / Aplicativos</em> e marque <strong>"Permitir desta fonte"</strong> para o navegador ou gerenciador de arquivos.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    3
                  </span>
                  <div>
                    <strong className="text-zinc-900 dark:text-zinc-100">Concluir Instalação:</strong>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Toque em <strong>"Instalar"</strong>. O ícone do Dominó Mexicano surgirá pronto para jogar offline!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
            <span>Motor Double-Double-Dominoes</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
