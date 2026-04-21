'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';

// ========================================
// PWA INSTALL PROMPT
// Detects beforeinstallprompt, shows floating bar on mobile
// Persists dismissed state in localStorage
// ========================================

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'atlas_pwa_dismissed';
const INSTALLED_KEY = 'atlas_pwa_installed';

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if already dismissed or installed
    if (localStorage.getItem(INSTALLED_KEY) === 'true') return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Detect mobile
    const mobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    setIsMobile(mobile);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show on mobile always, on desktop only if standalone-like
      if (mobile || !window.matchMedia('(display-mode: standalone)').matches) {
        setShow(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    window.addEventListener('appinstalled', () => {
      localStorage.setItem(INSTALLED_KEY, 'true');
      setShow(false);
      setDeferredPrompt(null);
    });

    // If already in standalone mode, user already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      localStorage.setItem(INSTALLED_KEY, 'true');
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, 'true');
    }
    setDeferredPrompt(null);
    setShow(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }, []);

  if (!show || !isMobile) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 animate-slide-up-safe">
      <div className="max-w-lg mx-auto bg-gray-900/95 backdrop-blur-lg border border-emerald-500/20 rounded-2xl p-3.5 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3">
          {/* App icon */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/15 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-emerald-400" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-white leading-tight">
              Instala Atlas para una experiencia premium
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Accountability en tiempo real y acceso rápido
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-all active:scale-95"
            >
              Instalar App
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-full hover:bg-gray-800/60 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
