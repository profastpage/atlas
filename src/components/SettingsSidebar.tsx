'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, LogOut, Edit3, Check,
  Crown, Zap, CheckCircle2, Bell, Star, Trash2, Clock, Camera, Loader2, Infinity,
  Smartphone, Download, Share2, ExternalLink, CheckCircle
} from 'lucide-react';
import { trackPlanSelected } from '@/lib/analytics';
import QRPaymentModal from './QRPaymentModal';

// ========================================
// SETTINGS SIDEBAR — Premium Brand, Dynamic Plans
// Mobile First, Dark Theme, NO "Hecho con IA"
// ========================================

interface AlarmItem {
  id: string;
  content: string;
  scheduled_for: string;
  created_at: string;
}

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; email: string; name: string; tenantId: string; isAdmin?: boolean; avatarUrl?: string } | null;
  token: string;
  forcePaywall?: boolean;
  userPlanType?: string;
  remainingMessages?: number;
  messageLimit?: number;
  userHasPlan?: boolean;
  onRequestInstall?: () => void;
}

interface UserPlan {
  planName: string;
  status: string;
  price: number;
  maxMessages: number;
  features: string[];
}

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

// ========================================
// PLAN DEFINITIONS — Static UI (Stripe later)
// ========================================

const PLANS = [
  {
    id: 'basico',
    name: 'Plan Básico',
    price: 20,
    icon: Zap,
    color: 'emerald',
    features: [
      'Chat de voz y texto 24/7',
      'Memoria a largo plazo',
      'Modo Expandido',
    ],
  },
  {
    id: 'pro',
    name: 'Plan Pro',
    price: 40,
    icon: Star,
    color: 'blue',
    features: [
      'Todo lo del Básico',
      'Auditoría inteligente de documentos',
      'Toque de atención diario',
    ],
  },
  {
    id: 'ejecutivo',
    name: 'Plan Ejecutivo',
    price: 60,
    icon: Crown,
    color: 'amber',
    features: [
      'Todo lo del Pro',
      'Sistema Anti-Postergación y Alarmas',
      'Prioridad de servidores',
    ],
  },
];

const PLAN_LABELS: Record<string, string> = {
  basico: 'Básico',
  profesional: 'Pro',
  pro: 'Pro',
  elite: 'Ejecutivo',
  ejecutivo: 'Ejecutivo',
};

const PLAN_PRICES: Record<string, number> = {
  basico: 20,
  profesional: 40,
  pro: 40,
  elite: 60,
  ejecutivo: 60,
};

// ========================================
// COMPONENT
// ========================================

export default function SettingsSidebar({
  isOpen,
  onClose,
  user,
  forcePaywall = false,
  userPlanType = '',
  remainingMessages = 20,
  messageLimit = 20,
  userHasPlan = false,
  onRequestInstall,
}: SettingsSidebarProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const isAdmin = user?.isAdmin === true;

  // ---- Alarms state ----
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ---- City state ----
  const [userCity, setUserCity] = useState('');
  const [savingCity, setSavingCity] = useState(false);
  const [citySaved, setCitySaved] = useState(false);

  // ---- PWA Install state ----
  const [canInstallPWA, setCanInstallPWA] = useState(false);
  const [pwaInstalling, setPwaInstalling] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  const isEjecutivo = userPlanType === 'ejecutivo';

  // ---- Listen for PWA install prompt ----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Don't show install button if already installed as PWA
    if (localStorage.getItem('atlas_pwa_installed') === 'true') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Detect iOS and browser
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);
    // Safari: has 'Safari' in UA but NOT CriOS/FxiOS/WhatsApp/Facebook/Line
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|WhatsApp|FBAN|FB_IAB|Line|Twitter/i.test(ua);
    setIsSafari(safari);
    // Auto-show install guide for iOS (non-Safari needs the warning)
    if (ios) setShowInstallGuide(true);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanInstallPWA(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const handleInstalled = () => {
      setCanInstallPWA(false);
      localStorage.setItem('atlas_pwa_installed', 'true');
      deferredPromptRef.current = null;
    };
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallPWA = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (prompt) {
      // Native install prompt available (Android/Chrome) — trigger directly
      setPwaInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          localStorage.setItem('atlas_pwa_installed', 'true');
          setCanInstallPWA(false);
        }
      } catch {}
      deferredPromptRef.current = null;
      setPwaInstalling(false);
    } else if (onRequestInstall) {
      // No native prompt — request parent to re-show InstallPrompt bottom sheet
      // This handles the case where beforeinstallprompt hasn't fired yet or was consumed
      onRequestInstall();
    }
  }, [onRequestInstall]);

  // ---- QR Payment Modal state ----
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    planName: string;
    planPrice: number;
    planFeatures: string[];
  }>({ isOpen: false, planName: '', planPrice: 0, planFeatures: [] });

  const openPayment = (planId: string, planName: string, planPrice: number, planFeatures: string[]) => {
    trackPlanSelected({
      planId,
      planName,
      price: planPrice,
      source: forcePaywall ? 'paywall' : 'settings',
    });
    setPaymentModal({ isOpen: true, planName, planPrice, planFeatures });
  };

  // ---- Fetch user city on open ----
  useEffect(() => {
    if (isOpen && user?.tenantId) {
      fetch(`/api?action=get_city&tenantId=${user.tenantId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.city) setUserCity(data.city);
        })
        .catch(() => {});
    }
  }, [isOpen, user?.tenantId]);

  const saveCity = useCallback(async () => {
    if (!user?.tenantId || savingCity) return;
    setSavingCity(true);
    try {
      await fetch(`/api?action=save_city&tenantId=${user.tenantId}&city=${encodeURIComponent(userCity.trim())}`);
      setCitySaved(true);
      setTimeout(() => setCitySaved(false), 2000);
    } catch {}
    setSavingCity(false);
  }, [user?.tenantId, userCity, savingCity]);

  // ---- Fetch user subscription on open ----
  useEffect(() => {
    if (isOpen && user?.tenantId) {
      setLoadingPlan(true);
      fetch(`/api?action=subscription&tenantId=${user.tenantId}`)
        .then((res) => res.json())
        .then((data) => {
          const sub = data.subscription;
          if (sub && sub.status && sub.status !== 'free') {
            setUserPlan(sub);
          } else {
            setUserPlan(null);
          }
        })
        .catch(() => setUserPlan(null))
        .finally(() => setLoadingPlan(false));
    }
  }, [isOpen, user?.tenantId]);

  // ---- Fetch alarms on open (executive only) ----
  const fetchAlarms = useCallback(async () => {
    if (!user?.tenantId) return;
    setLoadingAlarms(true);
    try {
      const res = await fetch(`/api?action=list_alarms&tenantId=${user.tenantId}`);
      const data = await res.json();
      setAlarms(data.alarms || []);
    } catch {
      setAlarms([]);
    } finally {
      setLoadingAlarms(false);
    }
  }, [user?.tenantId]);

  useEffect(() => {
    if (isOpen && isEjecutivo) {
      fetchAlarms();
    }
  }, [isOpen, isEjecutivo, fetchAlarms]);

  const cancelAlarm = useCallback(async (alarmId: string) => {
    if (!user?.tenantId) return;
    setCancellingId(alarmId);
    try {
      const res = await fetch('/api?action=cancel_alarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alarmId, tenantId: user.tenantId }),
      });
      const data = await res.json();
      if (data.success) {
        setAlarms((prev) => prev.filter((a) => a.id !== alarmId));
      }
    } catch {
      // silent fail
    } finally {
      setCancellingId(null);
    }
  }, [user?.tenantId]);

  const formatAlarmDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const time = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy, ${time}`;
    if (isTomorrow) return `Manana, ${time}`;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) + `, ${time}`;
  };

  const startEditName = () => {
    if (user) {
      setEditName(user.name);
      setNameSaved(false);
      setIsEditingName(true);
    }
  };

  const saveEditName = useCallback(async () => {
    if (!user?.tenantId || !editName.trim()) return;
    setSavingName(true);
    try {
      await fetch(`/api?action=save_profile&tenantId=${user.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
      // Update localStorage user name
      try {
        const saved = localStorage.getItem('atlas_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.name = editName.trim();
          localStorage.setItem('atlas_user', JSON.stringify(parsed));
        }
      } catch {}
    } catch {}
    setIsEditingName(false);
    setSavingName(false);
  }, [user?.tenantId, editName]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        setAvatarUrl(dataUrl);
        if (user?.tenantId) {
          try {
            await fetch(`/api?action=save_profile&tenantId=${user.tenantId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ avatarUrl: dataUrl }),
            });
          } catch {}
        }
        // Update localStorage
        try {
          const saved = localStorage.getItem('atlas_user');
          if (saved) {
            const parsed = JSON.parse(saved);
            parsed.avatarUrl = dataUrl;
            localStorage.setItem('atlas_user', JSON.stringify(parsed));
          }
        } catch {}
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingAvatar(false);
    }
  }, [user?.tenantId]);

  const hasActivePlan = userPlan && userPlan.status !== 'free';

  const getPlanDisplayName = (planName: string) => {
    return PLAN_LABELS[planName.toLowerCase()] || planName;
  };

  const getPlanPrice = (planName: string) => {
    return PLAN_PRICES[planName.toLowerCase()] || 0;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />

          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-[70] w-full sm:w-[380px] bg-gray-900 rounded-l-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {forcePaywall ? 'Elige tu Plan' : 'Configuracion'}
                </h2>
                {forcePaywall && (
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    Selecciona un plan para desbloquear el chat
                  </p>
                )}
              </div>
              {!forcePaywall && (
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 min-h-0 overscroll-contain">
              {/* ===== USER PROFILE ===== */}
              <section aria-label="Perfil de usuario">
                <div className="flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="w-14 h-14 rounded-full object-cover shadow-lg shadow-emerald-500/20"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <span className="text-xl font-bold text-white">
                          {user ? getInitial(user.name) : '?'}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => document.getElementById('avatar-upload-input')?.click()}
                      className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-gray-800 border-2 border-gray-900 flex items-center justify-center text-gray-300 hover:text-emerald-400 transition-colors"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Camera className="w-3 h-3" />
                      )}
                    </button>
                    <input
                      id="avatar-upload-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditingName ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                          placeholder="Tu nombre, como quieres que te llame Atlas"
                          autoFocus
                          className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                        <button
                          onClick={saveEditName}
                          disabled={savingName}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {savingName ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startEditName}
                        className="group flex items-center gap-1.5 w-full text-left"
                      >
                        <span className="text-sm font-semibold text-white truncate">
                          {user?.name || 'Usuario'}
                        </span>
                        {nameSaved ? (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <Edit3 className="w-3 h-3 text-gray-600 group-hover:text-emerald-400 shrink-0" />
                        )}
                      </button>
                    )}
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {user?.email || 'email@example.com'}
                    </p>
                  </div>
                </div>
              </section>

              {/* ===== MESSAGE USAGE ===== */}
              {!userHasPlan && (
                <section aria-label="Uso de mensajes" className="mt-5">
                  <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-gray-400">
                        Te quedan
                      </span>
                      <button
                        onClick={() => document.getElementById('plan-section-target')?.scrollIntoView({ behavior: 'smooth' })}
                        className="flex items-center gap-1 text-[11px]"
                      >
                        <span className="text-base font-black text-emerald-400">{remainingMessages}</span>
                        <span className="text-[11px] text-gray-400">de</span>
                        <span className="text-base font-black text-emerald-400">{messageLimit}</span>
                        <span className="text-[11px] text-gray-400">respuestas</span>
                        <Infinity className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />
                      </button>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-gray-700/50 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(0, Math.min(100, (remainingMessages / messageLimit) * 100))}%`,
                          background: remainingMessages > messageLimit * 0.3
                            ? 'linear-gradient(to right, #059669, #10b981)'
                            : remainingMessages > messageLimit * 0.1
                              ? 'linear-gradient(to right, #f59e0b, #fbbf24)'
                              : 'linear-gradient(to right, #ef4444, #f87171)',
                        }}
                      />
                    </div>
                    <button
                      onClick={() => document.getElementById('plan-section-target')?.scrollIntoView({ behavior: 'smooth' })}
                      className="w-full mt-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
                    >
                      Desbloquea el chat ilimitado
                      <Infinity className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </section>
              )}

              {/* ===== LOCATION ===== */}
              <section aria-label="Ubicacion">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3 mt-5">
                  Tu Ciudad
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={userCity}
                    onChange={(e) => setUserCity(e.target.value)}
                    onBlur={saveCity}
                    onKeyDown={(e) => e.key === 'Enter' && saveCity()}
                    placeholder="Ej: Lima, Cusco, Bogota..."
                    className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
                  />
                  {savingCity ? (
                    <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
                  ) : citySaved ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : null}
                </div>
                <p className="text-[10px] text-gray-600 mt-1.5">
                  Para consultas de clima y contexto local
                </p>
              </section>

              {/* ===== INSTALL APP MOBILE (PWA) — Direct Button ===== */}
              <section aria-label="Instalar App">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3 mt-5">
                  App Movil
                </h3>

                {isIOS ? (
                  /* iOS — compact: one button to open install prompt (InstallPrompt bottom sheet) */
                  <button
                    onClick={() => {
                      if (onRequestInstall) onRequestInstall();
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15 transition-all active:scale-[0.98] group/pwa"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0 group-hover/pwa:bg-blue-500/30 transition-colors">
                      <Download className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Instalar App Atlas</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Toca para instalar en tu iPhone</p>
                    </div>
                    <Smartphone className="w-4 h-4 text-gray-600 group-hover/pwa:text-blue-400 transition-colors shrink-0" />
                  </button>
                ) : (
                  /* Android / Desktop — one direct install button */
                  <button
                    onClick={handleInstallPWA}
                    disabled={pwaInstalling}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 transition-all active:scale-[0.98] group/pwa disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover/pwa:bg-emerald-500/30 transition-colors">
                      {pwaInstalling ? (
                        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5 text-emerald-400" />
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {pwaInstalling ? 'Instalando...' : 'Instalar App Atlas'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Toca para instalar en tu dispositivo</p>
                    </div>
                    <Smartphone className="w-4 h-4 text-gray-600 group-hover/pwa:text-emerald-400 transition-colors shrink-0" />
                  </button>
                )}

                {isIOS && !isSafari && (
                  <p className="text-[10px] text-amber-400/70 mt-1.5 px-1">
                    Si estas en WhatsApp o Chrome, abre esta pagina en Safari primero
                  </p>
                )}
              </section>

              <div className="border-t border-gray-800/40 my-5" />

              {/* ===== PLAN SECTION ===== */}
              <section id="plan-section-target" aria-label="Plan">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                  Tu Plan
                </h3>

                {loadingPlan ? (
                  <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30 animate-pulse">
                    <div className="h-4 bg-gray-700/50 rounded w-24 mb-2" />
                    <div className="h-3 bg-gray-700/50 rounded w-40" />
                  </div>
                ) : hasActivePlan ? (
                  /* ---- ACTIVE PLAN BADGE ---- */
                  <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl p-4 border border-emerald-500/20">
                    <div className="flex items-center gap-2.5 mb-1">
                      <Crown className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-bold text-white">
                        Plan {getPlanDisplayName(userPlan.planName)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-[30px]">
                      <span className="text-xs text-gray-300 font-medium">
                        S/ {getPlanPrice(userPlan.planName)}/mes
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Activo
                      </span>
                    </div>
                  </div>
                ) : (
                  /* ---- NO PLAN — SHOW PLANS DIRECTLY ---- */
                  <>
                    {/* Upgrade CTA */}
                    <div className="text-center mb-4">
                      <p className="text-sm font-bold text-white">
                        Desbloquea el chat ilimitado
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Elige tu plan y chatea sin limites con Atlas
                      </p>
                    </div>

                    {/* Plan Cards */}
                    <div className="space-y-2.5">
                      {PLANS.map((plan) => {
                        const PlanIcon = plan.icon;
                        return (
                          <div
                            key={plan.id}
                            className={`rounded-xl p-3.5 border transition-all ${
                              plan.id === 'ejecutivo'
                                ? 'bg-gradient-to-br from-amber-500/5 to-amber-600/5 border-amber-500/20'
                                : plan.id === 'pro'
                                  ? 'bg-gradient-to-br from-blue-500/5 to-blue-600/5 border-blue-500/20'
                                  : 'bg-gray-800/30 border-gray-700/30'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <PlanIcon className={`w-4 h-4 ${
                                  plan.id === 'ejecutivo' ? 'text-amber-400' :
                                  plan.id === 'pro' ? 'text-blue-400' : 'text-emerald-400'
                                }`} />
                                <span className="text-xs font-bold text-white">
                                  {plan.name}
                                </span>
                              </div>
                              <span className="text-xs font-bold text-white">
                                S/ {plan.price}
                                <span className="text-[9px] text-gray-500 font-normal">/mes</span>
                              </span>
                            </div>

                            {/* Features */}
                            <ul className="space-y-1 mb-3">
                              {plan.features.map((feat) => (
                                <li
                                  key={feat}
                                  className="flex items-start gap-1.5 text-[11px] text-gray-400"
                                >
                                  <span className={`mt-0.5 shrink-0 ${
                                    plan.id === 'ejecutivo' ? 'text-amber-400' :
                                    plan.id === 'pro' ? 'text-blue-400' : 'text-emerald-400'
                                  }`}>
                                    {'\u2022'}
                                  </span>
                                  {feat}
                                </li>
                              ))}
                            </ul>

                            {/* CTA Button */}
                            <button
                              onClick={() => openPayment(plan.id, plan.name, plan.price, plan.features)}
                              className={`w-full py-2 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 ${
                                plan.id === 'ejecutivo'
                                  ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/20'
                                  : plan.id === 'pro'
                                    ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border border-blue-500/20'
                                    : 'bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 border border-emerald-500/20'
                              }`}
                            >
                              <Zap className="w-3 h-3" />
                              Elegir Plan
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              {/* ===== MIS ALARMAS (Executive only) ===== */}
              {isEjecutivo && !forcePaywall && (
                <>
                  <div className="border-t border-gray-800/40 my-5" />
                  <section aria-label="Mis Alarmas">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                        Mis Alarmas
                      </h3>
                      {alarms.length > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold">
                          {alarms.length}
                        </span>
                      )}
                    </div>

                    {loadingAlarms ? (
                      <div className="space-y-2">
                        {[1, 2].map((i) => (
                          <div key={i} className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/20 animate-pulse">
                            <div className="h-3 bg-gray-700/40 rounded w-3/4 mb-2" />
                            <div className="h-2.5 bg-gray-700/40 rounded w-1/3" />
                          </div>
                        ))}
                      </div>
                    ) : alarms.length === 0 ? (
                      <div className="bg-gray-800/20 rounded-xl p-4 border border-gray-700/20 text-center">
                        <Bell className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">
                          Sin alarmas programadas
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Programa una alarma desde cualquier respuesta del asistente
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {alarms.map((alarm) => (
                          <div
                            key={alarm.id}
                            className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/20 group/alarm"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                                <Clock className="w-3.5 h-3.5 text-amber-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-gray-300 leading-relaxed line-clamp-2">
                                  {alarm.content}
                                </p>
                                <p className="text-[10px] text-amber-400/70 mt-1.5 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatAlarmDate(alarm.scheduled_for)}
                                </p>
                              </div>
                              <button
                                onClick={() => cancelAlarm(alarm.id)}
                                disabled={cancellingId === alarm.id}
                                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0 opacity-0 group-hover/alarm:opacity-100"
                                title="Cancelar alarma"
                              >
                                {cancellingId === alarm.id ? (
                                  <div className="w-3.5 h-3.5 border-2 border-red-400/50 border-t-red-400 rounded-full animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* Admin panel: hidden, accessible only via /admin URL */}

              <div className="border-t border-gray-800/40 my-5" />

              {/* ===== LOGOUT ===== */}
              <button
                onClick={() => {
                  localStorage.removeItem('atlas_token');
                  localStorage.removeItem('atlas_tenant_id');
                  localStorage.removeItem('atlas_user');
                  window.location.reload();
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-all active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                  <LogOut className="w-5 h-5 text-red-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-red-400">Cerrar Sesion</p>
                  <p className="text-[11px] text-red-400/60">Salir de tu cuenta</p>
                </div>
              </button>

              {/* ===== FOOTER — Clean brand, no experiment vibes ===== */}
              <div className="border-t border-gray-800/40 mt-5 pt-4">
                <p className="text-center text-[10px] text-gray-700">
                  &copy; Atlas Coach
                </p>
              </div>

              <div className="h-[env(safe-area-inset-bottom,0px)]" />
            </div>
          </motion.aside>

          {/* QR Payment Modal */}
          <QRPaymentModal
            isOpen={paymentModal.isOpen}
            onClose={() => setPaymentModal({ isOpen: false, planName: '', planPrice: 0, planFeatures: [] })}
            planName={paymentModal.planName}
            planPrice={paymentModal.planPrice}
            planFeatures={paymentModal.planFeatures}
          />
        </>
      )}
    </AnimatePresence>
  );
}
