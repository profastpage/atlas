'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, X, Bell, Zap, Shield, Smartphone,
  ChevronRight, Sparkles, ExternalLink, CheckCircle, Share2, Copy
} from 'lucide-react';

// ========================================
// ATLAS PWA INSTALL PROMPT — Premium Bottom Sheet
// - Shows when triggered externally (after N responses or after login)
// - Works on Android (beforeinstallprompt) AND iOS (manual guide)
// - Compelling benefits, professional design
// - Dismiss → shows again after 7 days
// - Registers push notifications after install
// ========================================

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'atlas_pwa_dismissed';
const DISMISSED_TIME_KEY = 'atlas_pwa_dismissed_at';
const INSTALLED_KEY = 'atlas_pwa_installed';
const NOTIFICATION_GRANTED_KEY = 'atlas_notification_granted';

// Show again 7 days after dismiss
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const BENEFITS = [
  {
    icon: Bell,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    title: 'Notificaciones exclusivas',
    desc: 'Recibe alertas, consejos y recordatorios directamente en tu celular',
  },
  {
    icon: Zap,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Acceso instantáneo',
    desc: 'Abre Atlas desde tu pantalla principal como una app nativa',
  },
  {
    icon: Shield,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Funciona sin internet',
    desc: 'Tus chats favoritos y destacados siempre disponibles offline',
  },
  {
    icon: Smartphone,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    title: 'Experiencia premium',
    desc: 'Pantalla completa, sin barras del navegador, diseño optimizado',
  },
];

interface InstallPromptProps {
  trigger: boolean;
}

export default function InstallPrompt({ trigger }: InstallPromptProps) {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    // If already installed, never show
    if (localStorage.getItem(INSTALLED_KEY) === 'true') {
      setIsInstalled(true);
      return;
    }

    // Check if in standalone mode (already installed as PWA)
    if (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true) {
      localStorage.setItem(INSTALLED_KEY, 'true');
      setIsInstalled(true);
      return;
    }

    // Check dismiss cooldown — show again after 7 days
    const dismissedAt = localStorage.getItem(DISMISSED_TIME_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_COOLDOWN_MS) return;
    }

    // Detect OS and browser
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|WhatsApp|FBAN|FB_IAB|Line|Twitter/i.test(ua);
    setIsIOS(ios);
    setIsSafari(safari);
    setIsAndroid(android);
    // On iOS + not Safari, show the guide immediately when triggered
    if (ios && !safari) {
      setShowIOSGuide(true);
    }

    // Listen for beforeinstallprompt (Android/Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      localStorage.setItem(INSTALLED_KEY, 'true');
      setIsInstalled(true);
      setShow(false);
      setDeferredPrompt(null);
      // Request notification permission after install
      requestNotifications();
    });

    // Show when triggered externally (after N responses or after login)
    // The parent controls when to trigger

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // Watch external trigger — always show when parent requests (no cooldown for manual clicks)
  useEffect(() => {
    if (!trigger) return;
    if (isInstalled) return;
    setShow(true);
  }, [trigger, isInstalled]);

  const requestNotifications = useCallback(async () => {
    if (localStorage.getItem(NOTIFICATION_GRANTED_KEY) === 'true') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      localStorage.setItem(NOTIFICATION_GRANTED_KEY, 'true');
      // Subscribe to push
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              process.env.NEXT_PUBLIC_VAPID_KEY || ''
            ),
          });
          // Send subscription to server
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub }),
          }).catch(() => {});
        } catch {}
      }
      return;
    }
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        localStorage.setItem(NOTIFICATION_GRANTED_KEY, 'true');
      }
    }
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {}
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          localStorage.setItem(INSTALLED_KEY, 'true');
        }
      } catch {}
      setDeferredPrompt(null);
      setInstalling(false);
      setShow(false);
    } else {
      // No deferred prompt — show platform-specific guide
      setShowIOSGuide(true);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    setShowIOSGuide(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
    localStorage.setItem(DISMISSED_TIME_KEY, String(Date.now()));
  }, []);

  const canInstall = deferredPrompt || !isIOS;
  const isIOSNotSafari = isIOS && !isSafari;

  return (
    <>
      <AnimatePresence>
        {show && !isInstalled && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80]"
              onClick={handleDismiss}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[85] max-h-[90vh] overflow-y-auto overscroll-contain"
            >
              <div className="bg-[#111111] border-t border-gray-700/40 rounded-t-3xl shadow-2xl">
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-gray-700" />
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-800/60 transition-colors z-10"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>

                {/* Header */}
                <div className="px-6 pt-4 pb-5">
                  <div className="flex items-center gap-4">
                    {/* App icon */}
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-emerald-500/20 shrink-0 border border-gray-700/30">
                      <img
                        src="/icons/icon-192x192.png"
                        alt="Atlas"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-bold text-white leading-tight">
                        Lleva Atlas a tu celular
                      </h2>
                      <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                        Instala la app y desbloquea funciones exclusivas
                      </p>
                    </div>
                  </div>
                </div>

                {/* Benefits — compact (2 items only) */}
                <div className="px-6 pb-4">
                  <div className="grid grid-cols-1 gap-2">
                    {BENEFITS.slice(0, 2).map((b, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl ${b.bg} border ${b.border}`}
                      >
                        <b.icon className={`w-4 h-4 ${b.color} shrink-0 mt-0.5`} />
                        <p className="text-[11px] text-gray-400 leading-relaxed">{b.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Install CTA */}
                <div className="px-6 pb-3">
                  {isIOSNotSafari && showIOSGuide ? (
                    /* iOS NOT in Safari — must open in Safari first */
                    <div className="space-y-3 pb-2">
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <ExternalLink className="w-5 h-5 text-amber-400 shrink-0" />
                        <p className="text-[12px] text-amber-200 leading-relaxed">
                          <span className="font-semibold">Apple solo permite instalar apps desde Safari.</span> Si estas en WhatsApp, Chrome u otro navegador, abre esta pagina en Safari primero.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700/30">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 text-[11px] font-bold text-amber-400">1</div>
                        <p className="text-[12px] text-gray-300">Copia el enlace de esta pagina</p>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700/30">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 text-[11px] font-bold text-amber-400">2</div>
                        <p className="text-[12px] text-gray-300">Abre <span className="font-semibold text-amber-400">Safari</span> y pega el enlace</p>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700/30">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 text-[11px] font-bold text-amber-400">3</div>
                        <p className="text-[12px] text-gray-300">En Safari: Compartir → Agregar a pantalla de inicio</p>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </div>
                      <button
                        onClick={copyLink}
                        className="w-full py-3 rounded-xl bg-amber-500/15 text-amber-300 font-bold text-[14px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-amber-500/20 hover:bg-amber-500/25 cursor-pointer"
                      >
                        {linkCopied ? (
                          <><CheckCircle className="w-5 h-5" /> Enlace copiado</>
                        ) : (
                          <><Share2 className="w-5 h-5" /> Copiar enlace de Atlas</>
                        )}
                      </button>
                    </div>
                  ) : isIOS && showIOSGuide ? (
                    /* iOS in Safari — Add to Home Screen guide */
                    <div className="space-y-3 pb-2">
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
                        <p className="text-[12px] text-blue-200 leading-relaxed">
                          <span className="font-semibold">Para instalar en iPhone o iPad:</span> toca el boton de compartir en Safari y selecciona &quot;Agregar a pantalla de inicio&quot;
                        </p>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700/30">
                        <div className="w-8 h-8 rounded-lg bg-gray-700/50 flex items-center justify-center shrink-0">
                          <Share2 className="w-4 h-4 text-blue-400" />
                        </div>
                        <p className="text-[12px] text-gray-300">
                          Toca el icono de <span className="font-semibold text-blue-400">Compartir</span> en la barra inferior de Safari
                        </p>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700/30">
                        <div className="w-8 h-8 rounded-lg bg-gray-700/50 flex items-center justify-center shrink-0 text-[14px] font-bold text-emerald-400">
                          +
                        </div>
                        <p className="text-[12px] text-gray-300">
                          Selecciona <span className="font-semibold text-emerald-400">&quot;Agregar a pantalla de inicio&quot;</span>
                        </p>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700/30">
                        <div className="w-8 h-8 rounded-lg bg-gray-700/50 flex items-center justify-center shrink-0">
                          <Download className="w-4 h-4 text-emerald-400" />
                        </div>
                        <p className="text-[12px] text-gray-300">
                          Toca <span className="font-semibold text-emerald-400">&quot;Agregar&quot;</span> y listo
                        </p>
                      </div>
                    </div>
                  ) : !showIOSGuide ? (
                    <button
                      onClick={handleInstall}
                      disabled={installing || !canInstall}
                      className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-[15px] transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {installing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Instalando...
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          {isAndroid
                            ? 'Instalar App'
                            : isIOS
                              ? 'Ver Instrucciones para iPhone'
                              : 'Instalar App'
                          }
                        </>
                      )}
                    </button>
                  ) : null}
                </div>

                {/* Footer */}
                {!showIOSGuide && (
                  <div className="px-6 pb-6 pt-1">
                    <p className="text-center text-[10.5px] text-gray-600">
                      Gratis y seguro. Puedes desinstalar en cualquier momento.
                    </p>
                  </div>
                )}

                {showIOSGuide && (
                  <div className="px-6 pb-6">
                    <button
                      onClick={handleDismiss}
                      className="w-full py-2.5 rounded-xl text-[13px] text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all cursor-pointer"
                    >
                      Entendido, lo haré después
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Helper: VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
