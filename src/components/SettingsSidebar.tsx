'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  User,
  CreditCard,
  MessageSquare,
  Zap,
  ShieldCheck,
  LogOut,
  Check,
  Loader2,
  Crown,
  Clock,
  Activity,
  Calendar,
  ChevronRight,
  Eye,
  Edit3,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Coins,
} from 'lucide-react';

// ========================================
// SETTINGS SIDEBAR - ChatGPT-style slide-in panel
// Mobile First, Dark Theme, Emerald Accent
// ========================================

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; email: string; name: string; tenantId: string } | null;
  token: string;
  onOpenAdmin: () => void;
}

interface SubscriptionData {
  planId: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string;
  messagesUsed: number;
  maxMessages: number;
  paymentHistory: PaymentRecord[];
}

interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  status: string;
  method: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  maxMessages: number;
  features: string[];
}

// ---------- helpers ----------

function formatCurrency(amount: number): string {
  return `S/${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  let color = 'bg-gray-500/20 text-gray-400';
  let Icon = AlertCircle;

  if (lower === 'completed' || lower === 'active' || lower === 'paid') {
    color = 'bg-emerald-500/20 text-emerald-400';
    Icon = CheckCircle2;
  } else if (lower === 'pending') {
    color = 'bg-yellow-500/20 text-yellow-400';
    Icon = AlertCircle;
  } else if (lower === 'failed' || lower === 'cancelled') {
    color = 'bg-red-500/20 text-red-400';
    Icon = XCircle;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ---------- section wrapper ----------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
      {children}
    </h3>
  );
}

function SectionDivider() {
  return <div className="border-t border-gray-800/40 my-5" />;
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function SettingsSidebar({
  isOpen,
  onClose,
  user,
  token,
  onOpenAdmin,
}: SettingsSidebarProps) {
  // --- state ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const isAdmin = user?.email?.toLowerCase().includes('admin') ?? false;

  // --- fetch subscription via TanStack Query ---
  const {
    data: subscription,
    isLoading: loadingSub,
  } = useQuery<SubscriptionData | null>({
    queryKey: ['subscription', token],
    queryFn: async () => {
      if (!token) return null;
      const res = await fetch('/api/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isOpen && !!token,
    staleTime: 60_000,
  });

  // --- fetch plans via TanStack Query ---
  const {
    data: plans,
    isLoading: loadingPlans,
  } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.plans ?? [];
    },
    enabled: isOpen,
    staleTime: 300_000,
  });

  // --- name editing ---
  const startEditName = () => {
    if (user) {
      setEditName(user.name);
      setIsEditingName(true);
    }
  };

  const saveEditName = () => {
    setIsEditingName(false);
    // In a real app this would call PUT /api/user with the new name
    // For now we just close editing
  };

  // --- handle plan select ---
  const handleSelectPlan = (plan: Plan) => {
    if (subscription?.planId === plan.id) return;
    // In a real app this would navigate to checkout / call an API
    // For now, show an alert
    alert(`Plan "${plan.name}" seleccionado. Redirigiendo al checkout...`);
  };

  // --- usage stats (derived from subscription or defaults) ---
  const usageStats = {
    messagesThisMonth: subscription?.messagesUsed ?? 0,
    maxMessages: subscription?.maxMessages ?? 50,
    tokensConsumed: subscription?.messagesUsed ? Math.round(subscription.messagesUsed * 820) : 0,
    sessions: Math.max(1, Math.floor((subscription?.messagesUsed ?? 0) / 3)),
    memberSince: user?.id ? new Date(parseInt(user.id.slice(0, 8), 16) * 1000).getFullYear() : new Date().getFullYear(),
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ---------- BACKDROP ---------- */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ---------- PANEL ---------- */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-[70] w-full sm:w-80 bg-gray-900 rounded-l-2xl shadow-2xl shadow-black/40 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Settings panel"
          >
            {/* ---- Header ---- */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Configuracion</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ---- Scrollable Content ---- */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 min-h-0 overscroll-contain">
              {/* Custom scrollbar via inline style */}
              <style>{`
                .settings-scroll::-webkit-scrollbar { width: 4px; }
                .settings-scroll::-webkit-scrollbar-track { background: transparent; }
                .settings-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }
                .settings-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
              `}</style>

              <div className="settings-scroll h-full">

                {/* ============================
                    1. USER PROFILE SECTION
                    ============================ */}
                <section aria-label="User profile">
                  <div className="flex items-center gap-3.5">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20">
                      <span className="text-xl font-bold text-white">
                        {user ? getInitial(user.name) : '?'}
                      </span>
                    </div>

                    {/* Name & Email */}
                    <div className="flex-1 min-w-0">
                      {isEditingName ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                            autoFocus
                            className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/30"
                          />
                          <button
                            onClick={saveEditName}
                            className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                            aria-label="Save name"
                          >
                            <Check className="w-3.5 h-3.5" />
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
                          <Edit3 className="w-3 h-3 text-gray-600 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                        </button>
                      )}
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {user?.email || 'email@example.com'}
                      </p>
                    </div>
                  </div>
                </section>

                <SectionDivider />

                {/* ============================
                    2. SUBSCRIPTION PLAN SECTION
                    ============================ */}
                <section aria-label="Subscription plan">
                  <SectionTitle>Tu Plan</SectionTitle>

                  {loadingSub ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando suscripcion...
                    </div>
                  ) : subscription ? (
                    <div className="bg-gray-800/40 rounded-xl p-4 space-y-3 border border-gray-700/30">
                      {/* Plan name & status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-semibold text-white">
                            {subscription.planName}
                          </span>
                        </div>
                        <StatusBadge status={subscription.status} />
                      </div>

                      {/* End date */}
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Vence: {formatDate(subscription.endDate)}</span>
                      </div>

                      {/* Usage progress */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Mensajes usados</span>
                          <span className="text-gray-300 font-medium">
                            {subscription.messagesUsed} / {subscription.maxMessages}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-700/60 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min((subscription.messagesUsed / subscription.maxMessages) * 100, 100)}%`,
                            }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                          />
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {subscription.maxMessages - subscription.messagesUsed} mensajes restantes
                        </p>
                      </div>

                      {/* Upgrade button */}
                      <button
                        onClick={() => {
                          const el = document.getElementById('available-plans');
                          el?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="w-full mt-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <CreditCard className="w-4 h-4" />
                        Cambiar Plan
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 py-3 text-center">
                      No se encontro informacion de suscripcion
                    </div>
                  )}
                </section>

                <SectionDivider />

                {/* ============================
                    3. AVAILABLE PLANS
                    ============================ */}
                <section id="available-plans" aria-label="Available plans">
                  <SectionTitle>Planes Disponibles</SectionTitle>

                  {loadingPlans ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando planes...
                    </div>
                  ) : plans.length > 0 ? (
                    <div className="space-y-3">
                      {plans.map((plan, idx) => {
                        const isCurrent = subscription?.planId === plan.id;
                        const features: string[] = Array.isArray(plan.features)
                          ? plan.features
                          : (() => {
                              try {
                                return JSON.parse(plan.features);
                              } catch {
                                return typeof plan.features === 'string'
                                  ? plan.features.split(',').map((f) => f.trim())
                                  : [];
                              }
                            })();

                        const planIcons = [Zap, CreditCard, Crown];
                        const PlanIcon = planIcons[idx % planIcons.length];

                        return (
                          <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.08 }}
                            className={`relative rounded-xl p-4 border transition-colors ${
                              isCurrent
                                ? 'border-emerald-500/60 bg-emerald-500/5'
                                : 'border-gray-700/40 bg-gray-800/30 hover:border-gray-600/50'
                            }`}
                          >
                            {/* Current badge */}
                            {isCurrent && (
                              <span className="absolute -top-2 right-3 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                                Actual
                              </span>
                            )}

                            {/* Plan header */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <PlanIcon className={`w-4.5 h-4.5 ${isCurrent ? 'text-emerald-400' : 'text-gray-400'}`} />
                                <span className="text-sm font-semibold text-white">{plan.name}</span>
                              </div>
                              <span className="text-base font-bold text-white">{formatCurrency(plan.price)}</span>
                            </div>

                            {/* Features */}
                            <ul className="space-y-1 mb-3">
                              {features.map((feat, fi) => (
                                <li key={fi} className="flex items-start gap-2 text-xs text-gray-400">
                                  <Check className={`w-3 h-3 mt-0.5 flex-shrink-0 ${isCurrent ? 'text-emerald-400' : 'text-gray-600'}`} />
                                  <span>{feat}</span>
                                </li>
                              ))}
                            </ul>

                            {/* Max messages */}
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-3">
                              <MessageSquare className="w-3 h-3" />
                              <span>{plan.maxMessages} mensajes por mes</span>
                            </div>

                            {/* Select button */}
                            {isCurrent ? (
                              <div className="w-full py-2 rounded-xl bg-emerald-600/20 text-emerald-400 text-xs font-semibold text-center">
                                Plan Actual
                              </div>
                            ) : (
                              <button
                                onClick={() => handleSelectPlan(plan)}
                                className="w-full py-2 rounded-xl bg-gray-700/50 hover:bg-gray-600/50 text-white text-xs font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                              >
                                Seleccionar
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 py-3 text-center">
                      No hay planes disponibles
                    </div>
                  )}
                </section>

                <SectionDivider />

                {/* ============================
                    4. USAGE STATISTICS
                    ============================ */}
                <section aria-label="Usage statistics">
                  <SectionTitle>Estadisticas de Uso</SectionTitle>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Messages */}
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                      <MessageSquare className="w-4 h-4 text-emerald-400 mb-2" />
                      <p className="text-lg font-bold text-white">{usageStats.messagesThisMonth}</p>
                      <p className="text-[11px] text-gray-500">Mensajes este mes</p>
                    </div>

                    {/* Tokens */}
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                      <Coins className="w-4 h-4 text-yellow-400 mb-2" />
                      <p className="text-lg font-bold text-white">
                        {usageStats.tokensConsumed.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-gray-500">Tokens API</p>
                    </div>

                    {/* Sessions */}
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                      <Activity className="w-4 h-4 text-blue-400 mb-2" />
                      <p className="text-lg font-bold text-white">{usageStats.sessions}</p>
                      <p className="text-[11px] text-gray-500">Sesiones</p>
                    </div>

                    {/* Member since */}
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                      <Calendar className="w-4 h-4 text-purple-400 mb-2" />
                      <p className="text-lg font-bold text-white">{usageStats.memberSince}</p>
                      <p className="text-[11px] text-gray-500">Miembro desde</p>
                    </div>
                  </div>
                </section>

                <SectionDivider />

                {/* ============================
                    5. BILLING HISTORY
                    ============================ */}
                <section aria-label="Billing history">
                  <SectionTitle>Historial de Pagos</SectionTitle>

                  {loadingSub ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando historial...
                    </div>
                  ) : subscription?.paymentHistory && subscription.paymentHistory.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto settings-scroll">
                      {subscription.paymentHistory.slice(0, 5).map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-3 border border-gray-700/20"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gray-700/40 flex items-center justify-center flex-shrink-0">
                            <CreditCard className="w-4 h-4 text-gray-400" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-white truncate">
                                {formatCurrency(payment.amount)}
                              </span>
                              <StatusBadge status={payment.status} />
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[11px] text-gray-500">
                                {formatDate(payment.date)}
                              </span>
                              <span className="text-[11px] text-gray-500 capitalize">
                                {payment.method}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 py-3 text-center">
                      No hay pagos registrados
                    </div>
                  )}
                </section>

                {/* ============================
                    6. ADMIN ACCESS
                    ============================ */}
                {isAdmin && (
                  <>
                    <SectionDivider />
                    <section aria-label="Admin access">
                      <SectionTitle>Administracion</SectionTitle>

                      <button
                        onClick={onOpenAdmin}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-all active:scale-[0.98] group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                          <ShieldCheck className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-sm font-semibold text-amber-300">
                            Panel de Administracion
                          </p>
                          <p className="text-[11px] text-amber-400/60">
                            Acceso elevado requerido
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400/40 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                      </button>

                      <div className="mt-2.5 flex items-start gap-2 bg-amber-500/5 rounded-lg p-2.5 border border-amber-500/10">
                        <Eye className="w-3.5 h-3.5 text-amber-400/60 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-amber-400/50 leading-relaxed">
                          Las funciones de administracion requieren acceso elevado. Solo personal autorizado debe ingresar.
                        </p>
                      </div>
                    </section>
                  </>
                )}

                <SectionDivider />

                {/* ============================
                    7. LOGOUT
                    ============================ */}
                <section aria-label="Logout">
                  <button
                    onClick={() => {
                      localStorage.removeItem('atlas_token');
                      localStorage.removeItem('atlas_tenant_id');
                      localStorage.removeItem('atlas_user');
                      window.location.reload();
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-all active:scale-[0.98]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <LogOut className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-red-400">Cerrar Sesion</p>
                      <p className="text-[11px] text-red-400/60">
                        Salir de tu cuenta
                      </p>
                    </div>
                  </button>
                </section>

                {/* ============================
                    8. APP INFO FOOTER
                    ============================ */}
                <SectionDivider />

                <div className="text-center py-2">
                  <p className="text-xs font-semibold text-gray-500">Atlas Coach v1.0</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">Hecho con IA</p>
                </div>

                {/* iOS safe area bottom */}
                <div className="h-[env(safe-area-inset-bottom,0px)]" />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
