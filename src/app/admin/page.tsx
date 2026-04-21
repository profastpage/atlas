'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import {
  ArrowLeft, Users, MessageSquare, DollarSign, Activity,
  ShieldCheck, Settings, BarChart3, RefreshCw, LogOut, X, Eye, EyeOff,
  Gift, Clock, CheckCircle2, MoreVertical, Zap, FileText,
  Bell, Brain, ShieldAlert, Save, Key
} from 'lucide-react';
import Link from 'next/link';

// ========================================
// INTERFACES
// ========================================

interface DashboardMetrics {
  totalUsers: number;
  newToday: number;
  mrr: number;
  messages24h: number;
  apiCost30d: { total: number; calls: number };
  planDistribution: Array<{ name: string; count: number; color: string }>;
}

interface UserData {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  tenantId: string;
  createdAt: string;
  sessionCount: number;
  isGoogle: boolean;
  planType: string | null;
  trialPlan: string | null;
  trialEndsAt: string | null;
}

interface SessionData {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
}

interface PlanFeature {
  featureKey: string;
  basico: boolean;
  pro: boolean;
  executive: boolean;
}

interface SettingsData {
  [key: string]: string | number | boolean;
}

type Tab = 'dashboard' | 'users' | 'plans' | 'config';

// ========================================
// CONSTANTS
// ========================================

const PLAN_COLORS: Record<string, string> = {
  free: '#374151',
  basico: '#6b7280',
  pro: '#3b82f6',
  executive: '#f59e0b',
  suspended: '#ef4444',
};

const FEATURE_LABELS: Record<string, string> = {
  memoria_a_largo_plazo: 'Memoria a largo plazo',
  analisis_pdf: 'Análisis de PDFs',
  toque_diario: 'Toque de atención diario',
  anti_postergacion: 'Anti-Postergación y Alarmas',
  expandido: 'Respuestas expandidas',
};

const PLAN_BADGE_CONFIG: Record<string, { classes: string; label: string }> = {
  executive: { classes: 'bg-amber-500/20 text-amber-400', label: 'Ejecutivo' },
  pro: { classes: 'bg-blue-500/20 text-blue-400', label: 'Pro' },
  basico: { classes: 'bg-gray-500/20 text-gray-400', label: 'Basico' },
  suspended: { classes: 'bg-red-500/20 text-red-400', label: 'Suspendido' },
};

// ========================================
// CUSTOM TOOLTIP FOR PIE CHART
// ========================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}

function CustomPieTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  return (
    <div className="bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-white font-medium">{item.name}</p>
      <p className="text-xs text-gray-400">{item.value} usuarios</p>
    </div>
  );
}

// ========================================
// CUSTOM LABEL FOR PIE (center)
// ========================================

function PieCenterLabel({ viewBox }: { viewBox?: { cx: number; cy: number } }) {
  if (!viewBox) return null;
  return (
    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="central">
      <tspan className="fill-white text-lg font-bold" fontSize={16} fontWeight={700}>Planes</tspan>
      <tspan className="fill-gray-500 text-[10px]" fontSize={10} x={viewBox.cx} dy={18}>Activos</tspan>
    </text>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminPage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [token, setToken] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Data states
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([]);
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(false);

  // UI States
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modal states
  const [changePlanUser, setChangePlanUser] = useState<UserData | null>(null);
  const [sessionsUser, setSessionsUser] = useState<UserData | null>(null);
  const [userSessions, setUserSessions] = useState<SessionData[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('free');
  const [actionLoading, setActionLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Config editing states
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptSaved, setSystemPromptSaved] = useState(false);
  const [limitsForm, setLimitsForm] = useState({
    free_messages_limit: '',
    max_tokens_normal: '',
    max_tokens_expanded: '',
    max_pdf_tokens: '',
  });
  const [limitsSaved, setLimitsSaved] = useState(false);

  // ========================================
  // TOAST HELPER
  // ========================================

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ========================================
  // FETCH HELPERS
  // ========================================

  const adminFetch = useCallback(async (action: string) => {
    const res = await fetch(`/api?action=${action}`);
    if (!res.ok) throw new Error(`Error ${action}`);
    return res.json();
  }, []);

  const adminPost = useCallback(async (action: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${action}`);
    }
    return res.json();
  }, []);

  // ========================================
  // AUTH HANDLERS
  // ========================================

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Error al iniciar sesion');
        return;
      }
      if (!data.user?.isAdmin) {
        setLoginError('Acceso denegado. No eres administrador.');
        return;
      }
      setToken(data.token);
      setIsAuthenticated(true);
      localStorage.setItem('atlas_admin_token', data.token);
    } catch {
      setLoginError('Error de conexion');
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('atlas_admin_token');
    setIsAuthenticated(false);
    setToken('');
    setDashboardMetrics(null);
    setUsers([]);
    setPlanFeatures([]);
    setSettings({});
  };

  // ========================================
  // TAB LOADERS
  // ========================================

  const loadDashboard = useCallback(async () => {
    try {
      const data = await adminFetch('dashboard_metrics');
      setDashboardMetrics(data);
    } catch (err) {
      console.error('[ADMIN] Dashboard error:', err);
    }
  }, [adminFetch]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await adminFetch('users');
      setUsers(data.users || data);
    } catch (err) {
      console.error('[ADMIN] Users error:', err);
    }
  }, [adminFetch]);

  const loadPlans = useCallback(async () => {
    try {
      const data = await adminFetch('plan_features');
      setPlanFeatures(data.features || data);
    } catch (err) {
      console.error('[ADMIN] Plans error:', err);
    }
  }, [adminFetch]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await adminFetch('settings');
      const s = data.settings || data;
      setSettings(s);
      if (s.system_prompt) setSystemPrompt(String(s.system_prompt));
      setLimitsForm({
        free_messages_limit: s.free_messages_limit ? String(s.free_messages_limit) : '',
        max_tokens_normal: s.max_tokens_normal ? String(s.max_tokens_normal) : '',
        max_tokens_expanded: s.max_tokens_expanded ? String(s.max_tokens_expanded) : '',
        max_pdf_tokens: s.max_pdf_tokens ? String(s.max_pdf_tokens) : '',
      });
    } catch (err) {
      console.error('[ADMIN] Settings error:', err);
    }
  }, [adminFetch]);

  const loadTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      switch (tab) {
        case 'dashboard':
          await loadDashboard();
          break;
        case 'users':
          await loadUsers();
          break;
        case 'plans':
          await loadPlans();
          break;
        case 'config':
          await loadSettings();
          break;
      }
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, loadUsers, loadPlans, loadSettings]);

  // ========================================
  // EFFECTS
  // ========================================

  useEffect(() => {
    const saved = localStorage.getItem('atlas_admin_token');
    if (saved) {
      setToken(saved);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadTab(activeTab);
  }, [isAuthenticated, activeTab, loadTab]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeDropdown) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown-trigger]')) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeDropdown]);

  // ========================================
  // ACTION HANDLERS
  // ========================================

  const handleGrantTrial = async (user: UserData) => {
    setActionLoading(true);
    try {
      await adminPost('grant_trial', {
        tenantId: user.tenantId,
        trialPlan: 'pro',
        durationHours: 24,
      });
      showToast(`Prueba 24h activada para ${user.name || user.email}`);
      setActiveDropdown(null);
      loadUsers();
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (!changePlanUser) return;
    setActionLoading(true);
    try {
      await adminPost('change_plan', {
        tenantId: changePlanUser.tenantId,
        planType: selectedPlan,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.tenantId === changePlanUser.tenantId ? { ...u, planType: selectedPlan } : u
        )
      );
      showToast(`Plan cambiado a ${PLAN_BADGE_CONFIG[selectedPlan]?.label || selectedPlan}`);
      setChangePlanUser(null);
      setSelectedPlan('free');
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendUser = async (user: UserData) => {
    setActionLoading(true);
    try {
      await adminPost('suspend_user', { tenantId: user.tenantId });
      setUsers((prev) =>
        prev.map((u) =>
          u.tenantId === user.tenantId ? { ...u, planType: 'suspended' } : u
        )
      );
      showToast(`Cuenta suspendida: ${user.name || user.email}`);
      setActiveDropdown(null);
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoadSessions = async (user: UserData) => {
    setSessionsUser(user);
    setUserSessions([]);
    setSelectedSession(null);
    setSessionMessages([]);
    setSessionsLoading(true);
    setActiveDropdown(null);
    try {
      const data = await adminFetch(`user_sessions&tenantId=${user.tenantId}`);
      setUserSessions(data.sessions || data || []);
    } catch {
      setUserSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleLoadMessages = async (session: SessionData) => {
    setSelectedSession(session);
    setSessionMessages([]);
    setMessagesLoading(true);
    try {
      const data = await adminFetch(`session_messages&sessionId=${session.id}`);
      setSessionMessages(data.messages || []);
    } catch {
      setSessionMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleBackToSessions = () => {
    setSelectedSession(null);
    setSessionMessages([]);
  };

  const handleToggleFeature = async (featureKey: string, plan: string, currentVal: boolean) => {
    setPlanFeatures((prev) =>
      prev.map((f) =>
        f.featureKey === featureKey ? { ...f, [plan]: !currentVal } : f
      )
    );
    try {
      const feature = planFeatures.find((f) => f.featureKey === featureKey);
      const newVal = !currentVal;
      await adminPost('toggle_feature', {
        featureKey,
        plan,
        value: newVal,
      });
    } catch (err) {
      showToast(String(err), 'error');
      setPlanFeatures((prev) =>
        prev.map((f) =>
          f.featureKey === featureKey ? { ...f, [plan]: currentVal } : f
        )
      );
    }
  };

  const handleSaveSystemPrompt = async () => {
    setActionLoading(true);
    try {
      await adminPost('save_settings', {
        settings: { system_prompt: systemPrompt },
      });
      setSystemPromptSaved(true);
      showToast('Prompt guardado exitosamente');
      setTimeout(() => setSystemPromptSaved(false), 3000);
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveLimits = async () => {
    setActionLoading(true);
    try {
      await adminPost('save_settings', {
        settings: {
          free_messages_limit: Number(limitsForm.free_messages_limit) || 0,
          max_tokens_normal: Number(limitsForm.max_tokens_normal) || 0,
          max_tokens_expanded: Number(limitsForm.max_tokens_expanded) || 0,
          max_pdf_tokens: Number(limitsForm.max_pdf_tokens) || 0,
        },
      });
      setLimitsSaved(true);
      showToast('Limites guardados exitosamente');
      setTimeout(() => setLimitsSaved(false), 3000);
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const getPlanBadge = (planType: string | null) => {
    const config = PLAN_BADGE_CONFIG[planType || ''] || PLAN_BADGE_CONFIG['free'];
    if (planType && PLAN_BADGE_CONFIG[planType]) {
      return { classes: config.classes, label: config.label };
    }
    return { classes: 'bg-gray-800/50 text-gray-600', label: 'Gratis' };
  };

  const getTrialRemaining = (endsAt: string | null) => {
    if (!endsAt) return null;
    const end = new Date(endsAt).getTime();
    const now = Date.now();
    const diffMs = end - now;
    if (diffMs <= 0) return null;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  const maskApiKey = (value: string | number | boolean | undefined | null) => {
    if (!value) return '';
    const str = String(value);
    if (str.length <= 12) return str.slice(0, 4) + '***';
    return str.slice(0, 7) + '***...***' + str.slice(-3);
  };

  const maskUrl = (value: string | number | boolean | undefined | null) => {
    if (!value) return '';
    const str = String(value);
    return str.slice(0, 30) + '***';
  };

  // ========================================
  // LOGIN SCREEN
  // ========================================

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-950 px-6">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-30%] left-[-10%] w-[60%] h-[60%] rounded-full bg-amber-500/5 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-sm"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al chat
          </Link>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
              <ShieldCheck className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Super Admin Panel</h1>
            <p className="text-sm text-gray-500 mt-1">Atlas — Acceso administrativo</p>
          </div>
          <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-800/50 p-6 shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  required
                />
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contrasena"
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 pr-11 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {loginError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {loginError}
                </p>
              )}
              <button
                type="submit"
                disabled={loginLoading || !email || !password}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:opacity-40 text-white text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Acceder'}
              </button>
            </form>
          </div>
          <p className="text-center text-[10px] text-gray-700 mt-4">
            Solo administradores autorizados
          </p>
        </motion.div>
      </div>
    );
  }

  // ========================================
  // TAB DEFINITIONS
  // ========================================

  const tabs: Array<{ id: Tab; label: string; sublabel: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', sublabel: 'Radar de Negocio', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Usuarios', sublabel: 'Control Total', icon: <Users className="w-4 h-4" /> },
    { id: 'plans', label: 'Planes', sublabel: 'Gestión de Producto', icon: <Activity className="w-4 h-4" /> },
    { id: 'config', label: 'Config', sublabel: 'El Cerebro del Sistema', icon: <Settings className="w-4 h-4" /> },
  ];

  // ========================================
  // RENDER: ADMIN PANEL
  // ========================================

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900/90 backdrop-blur-md border-b border-gray-800/40 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full hover:bg-gray-800/60">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-white">Super Admin Panel</h1>
            <p className="text-[10px] text-amber-400/60 uppercase tracking-wider">Atlas Coach</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 text-xs transition-all"
        >
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-800/40 px-2 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.id
                ? 'text-amber-400 border-amber-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-16 right-4 z-[60] px-4 py-2.5 rounded-xl border text-xs font-medium shadow-xl ${
              toast.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/15 border-red-500/30 text-red-400'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" /> : <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* =============================== */}
          {/* TAB 1: DASHBOARD               */}
          {/* =============================== */}
          {!loading && activeTab === 'dashboard' && dashboardMetrics && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4 max-w-2xl mx-auto"
            >
              <div>
                <h2 className="text-lg font-bold text-white">Radar de Negocio</h2>
                <p className="text-xs text-gray-500 mt-0.5">Vision general del sistema</p>
              </div>

              {/* Metric Cards 2x2 */}
              <div className="grid grid-cols-2 gap-3">
                {/* Users Card */}
                <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-emerald-400"><Users className="w-5 h-5" /></span>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Usuarios</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{dashboardMetrics.totalUsers.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Nuevos hoy: <span className="text-emerald-400 font-medium">{dashboardMetrics.newToday}</span></p>
                </div>

                {/* MRR Card */}
                <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-amber-400"><DollarSign className="w-5 h-5" /></span>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">MRR</span>
                  </div>
                  <p className="text-2xl font-bold text-white">S/ {dashboardMetrics.mrr.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Ingresos mensuales estimados</p>
                </div>

                {/* Messages 24h Card */}
                <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-blue-400"><MessageSquare className="w-5 h-5" /></span>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Mensajes</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{dashboardMetrics.messages24h.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">En las últimas 24 horas</p>
                </div>

                {/* API Cost 30d Card */}
                <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-purple-400"><Activity className="w-5 h-5" /></span>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">API Cost</span>
                  </div>
                  <p className="text-2xl font-bold text-white">${dashboardMetrics.apiCost30d.total.toFixed(4)}</p>
                  <p className="text-xs text-gray-500 mt-1">{dashboardMetrics.apiCost30d.calls.toLocaleString()} llamadas</p>
                </div>
              </div>

              {/* Donut Chart: Plan Distribution */}
              {dashboardMetrics.planDistribution && dashboardMetrics.planDistribution.length > 0 && (
                <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-4">Distribución de Planes</h3>
                  <div className="flex flex-col items-center">
                    <div className="w-full max-w-[280px]">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={dashboardMetrics.planDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="count"
                            nameKey="name"
                            strokeWidth={0}
                          >
                            {dashboardMetrics.planDistribution.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.color || PLAN_COLORS[entry.name.toLowerCase()] || '#374151'}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2">
                      {dashboardMetrics.planDistribution.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-1.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: entry.color || PLAN_COLORS[entry.name.toLowerCase()] || '#374151' }}
                          />
                          <span className="text-xs text-gray-400">{entry.name}</span>
                          <span className="text-xs font-semibold text-white">{entry.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* =============================== */}
          {/* TAB 2: USERS                   */}
          {/* =============================== */}
          {!loading && activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Control Total</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{users.length} usuarios registrados</p>
                </div>
                <button
                  onClick={() => loadTab('users')}
                  className="p-2 rounded-lg hover:bg-gray-800/60 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {users.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">Sin usuarios registrados</p>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => {
                    const badge = getPlanBadge(user.planType);
                    const trialRemaining = getTrialRemaining(user.trialEndsAt);

                    return (
                      <div
                        key={user.id}
                        className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-3.5 flex items-center justify-between group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                              {(user.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-white truncate">
                                {user.name || 'Sin nombre'}
                              </span>
                              {/* Plan Badge */}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${badge.classes}`}>
                                {badge.label}
                              </span>
                              {/* Trial Badge */}
                              {trialRemaining && user.trialPlan && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 shrink-0">
                                  Prueba {user.trialPlan} — {trialRemaining}
                                </span>
                              )}
                              {/* Admin Badge */}
                              {user.isAdmin && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 font-semibold shrink-0">ADMIN</span>
                              )}
                              {/* Google Badge */}
                              {user.isGoogle && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/15 text-blue-400 font-semibold shrink-0">G</span>
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5 ml-10">{user.email}</p>
                          <div className="flex items-center gap-3 mt-1.5 ml-10">
                            <span className="text-[10px] text-gray-600">{user.sessionCount} sesiones</span>
                            <span className="text-[10px] text-gray-600">{formatDate(user.createdAt)}</span>
                          </div>
                        </div>

                        {/* Actions Dropdown */}
                        <div className="relative shrink-0 ml-2">
                          <button
                            data-dropdown-trigger
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === user.id ? null : user.id);
                            }}
                            className="p-2 rounded-lg hover:bg-gray-800/60 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </button>

                          <AnimatePresence>
                            {activeDropdown === user.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700/50 rounded-xl shadow-2xl overflow-hidden z-40"
                              >
                                <button
                                  onClick={() => handleGrantTrial(user)}
                                  disabled={actionLoading}
                                  className="w-full text-left px-3.5 py-2.5 text-xs text-gray-300 hover:bg-gray-800/60 transition-colors flex items-center gap-2.5 disabled:opacity-50"
                                >
                                  <Gift className="w-3.5 h-3.5 text-amber-400" />
                                  Otorgar Prueba 24h
                                </button>
                                <button
                                  onClick={() => {
                                    setChangePlanUser(user);
                                    setSelectedPlan(user.planType || 'free');
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 text-xs text-gray-300 hover:bg-gray-800/60 transition-colors flex items-center gap-2.5"
                                >
                                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                                  Cambiar Plan
                                </button>
                                <button
                                  onClick={() => handleLoadSessions(user)}
                                  className="w-full text-left px-3.5 py-2.5 text-xs text-gray-300 hover:bg-gray-800/60 transition-colors flex items-center gap-2.5"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                                  Ver Conversaciones
                                </button>
                                <div className="border-t border-gray-800/50" />
                                <button
                                  onClick={() => handleSuspendUser(user)}
                                  disabled={actionLoading}
                                  className="w-full text-left px-3.5 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2.5 disabled:opacity-50"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Suspender Cuenta
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* =============================== */}
          {/* TAB 3: PLANS                   */}
          {/* =============================== */}
          {!loading && activeTab === 'plans' && (
            <motion.div
              key="plans"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Gestión de Producto</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Matriz de funcionalidades por plan</p>
                </div>
                <button
                  onClick={() => loadTab('plans')}
                  className="p-2 rounded-lg hover:bg-gray-800/60 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Feature Matrix Table */}
              <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-4 gap-0">
                  <div className="px-4 py-3 border-b border-gray-800/50">
                    <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Funcionalidad</span>
                  </div>
                  <div className="px-4 py-3 border-b border-gray-800/50 text-center">
                    <span className="text-xs font-bold text-gray-400">Basico</span>
                    <span className="text-[10px] text-gray-600 block">S/20</span>
                  </div>
                  <div className="px-4 py-3 border-b border-gray-800/50 text-center">
                    <span className="text-xs font-bold text-blue-400">Pro</span>
                    <span className="text-[10px] text-gray-600 block">S/40</span>
                  </div>
                  <div className="px-4 py-3 border-b border-gray-800/50 text-center">
                    <span className="text-xs font-bold text-amber-400">Ejecutivo</span>
                    <span className="text-[10px] text-gray-600 block">S/60</span>
                  </div>
                </div>

                {/* Feature Rows */}
                {planFeatures.map((feature, idx) => (
                  <div
                    key={feature.featureKey}
                    className={`grid grid-cols-4 gap-0 ${idx < planFeatures.length - 1 ? 'border-b border-gray-800/30' : ''}`}
                  >
                    <div className="px-4 py-3 flex items-center gap-2">
                      {feature.featureKey === 'memoria_a_largo_plazo' && <Brain className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                      {feature.featureKey === 'analisis_pdf' && <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                      {feature.featureKey === 'toque_diario' && <Bell className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                      {feature.featureKey === 'anti_postergacion' && <Zap className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                      {feature.featureKey === 'expandido' && <MessageSquare className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                      <span className="text-xs text-gray-300">{FEATURE_LABELS[feature.featureKey] || feature.featureKey}</span>
                    </div>
                    {(['basico', 'pro', 'executive'] as const).map((plan) => (
                      <div key={plan} className="px-4 py-3 flex items-center justify-center">
                        <button
                          onClick={() => handleToggleFeature(feature.featureKey, plan, feature[plan])}
                          className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${
                            feature[plan] ? 'bg-amber-500' : 'bg-gray-700'
                          }`}
                          aria-label={`Toggle ${FEATURE_LABELS[feature.featureKey]} for ${plan}`}
                        >
                          <div
                            className={`absolute top-[3px] w-4 h-4 rounded-full transition-all duration-200 ${
                              feature[plan]
                                ? 'right-[3px] bg-white'
                                : 'left-[3px] bg-gray-400'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    showToast('Cambios guardados automáticamente por toggle');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-all active:scale-[0.98]"
                >
                  <Save className="w-4 h-4" />
                  Guardar Cambios
                </button>
              </div>
            </motion.div>
          )}

          {/* =============================== */}
          {/* TAB 4: CONFIG                  */}
          {/* =============================== */}
          {!loading && activeTab === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">El Cerebro del Sistema</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Configuración global y claves API</p>
                </div>
                <button
                  onClick={() => loadTab('config')}
                  className="p-2 rounded-lg hover:bg-gray-800/60 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Section 1: System Prompt */}
              <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">System Prompt</h3>
                </div>
                <textarea
                  rows={8}
                  value={systemPrompt}
                  onChange={(e) => {
                    setSystemPrompt(e.target.value);
                    setSystemPromptSaved(false);
                  }}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 font-mono resize-none"
                  placeholder="Ingresa el system prompt..."
                />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    {systemPromptSaved && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Guardado
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveSystemPrompt}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:opacity-40 text-white text-xs font-semibold transition-all active:scale-[0.98]"
                  >
                    {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar Prompt
                  </button>
                </div>
              </div>

              {/* Section 2: System Limits */}
              <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">System Limits</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Mensajes de prueba gratuitos</label>
                    <input
                      type="number"
                      value={limitsForm.free_messages_limit}
                      onChange={(e) => {
                        setLimitsForm((p) => ({ ...p, free_messages_limit: e.target.value }));
                        setLimitsSaved(false);
                      }}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Límite de tokens normal</label>
                    <input
                      type="number"
                      value={limitsForm.max_tokens_normal}
                      onChange={(e) => {
                        setLimitsForm((p) => ({ ...p, max_tokens_normal: e.target.value }));
                        setLimitsSaved(false);
                      }}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Límite de tokens expandidos</label>
                    <input
                      type="number"
                      value={limitsForm.max_tokens_expanded}
                      onChange={(e) => {
                        setLimitsForm((p) => ({ ...p, max_tokens_expanded: e.target.value }));
                        setLimitsSaved(false);
                      }}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Límite de tamaño de PDFs (tokens)</label>
                    <input
                      type="number"
                      value={limitsForm.max_pdf_tokens}
                      onChange={(e) => {
                        setLimitsForm((p) => ({ ...p, max_pdf_tokens: e.target.value }));
                        setLimitsSaved(false);
                      }}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    {limitsSaved && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Guardado
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveLimits}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:opacity-40 text-white text-xs font-semibold transition-all active:scale-[0.98]"
                  >
                    {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar Límites
                  </button>
                </div>
              </div>

              {/* Section 3: API Keys (Read-only) */}
              <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">API Keys</h3>
                  <span className="text-[9px] text-gray-600 ml-auto">Solo lectura</span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: 'OPENROUTER_API_KEY', value: settings.OPENROUTER_API_KEY, isUrl: false },
                    { name: 'OPENAI_API_KEY', value: settings.OPENAI_API_KEY, isUrl: false },
                    { name: 'NEXT_PUBLIC_SUPABASE_URL', value: settings.NEXT_PUBLIC_SUPABASE_URL, isUrl: true },
                    { name: 'SUPABASE_SERVICE_ROLE_KEY', value: settings.SUPABASE_SERVICE_ROLE_KEY, isUrl: false },
                  ].map((item) => {
                    const isConfigured = !!item.value && String(item.value).length > 0;
                    const maskedValue = item.isUrl
                      ? maskUrl(item.value)
                      : maskApiKey(item.value);

                    return (
                      <div
                        key={item.name}
                        className="flex items-center justify-between px-3 py-2.5 bg-gray-800/30 rounded-lg border border-gray-800/30"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isConfigured ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <span className="text-[11px] text-gray-400 font-mono truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[10px] text-gray-600 font-mono truncate max-w-[140px]">
                            {isConfigured ? maskedValue : '(vacía)'}
                          </span>
                          <span className={`text-[10px] font-medium ${isConfigured ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isConfigured ? 'Activa' : 'No configurada'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ======================================== */}
      {/* MODAL: Change Plan                      */}
      {/* ======================================== */}
      <AnimatePresence>
        {changePlanUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => !actionLoading && setChangePlanUser(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    Cambiar Plan
                  </h3>
                  <button
                    onClick={() => !actionLoading && setChangePlanUser(null)}
                    className="p-1 rounded-full hover:bg-gray-800/60"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <p className="text-xs text-gray-400 mb-4">
                  Usuario: <span className="text-white font-medium">{changePlanUser.name || changePlanUser.email}</span>
                </p>

                <div className="space-y-2 mb-4">
                  {[
                    { value: 'free', label: 'Gratis', price: 'S/0', color: 'text-gray-400' },
                    { value: 'basico', label: 'Basico', price: 'S/20', color: 'text-gray-400' },
                    { value: 'pro', label: 'Pro', price: 'S/40', color: 'text-blue-400' },
                    { value: 'executive', label: 'Ejecutivo', price: 'S/60', color: 'text-amber-400' },
                  ].map((plan) => (
                    <label
                      key={plan.value}
                      className={`flex items-center justify-between cursor-pointer rounded-xl border p-3 transition-all ${
                        selectedPlan === plan.value
                          ? 'bg-gray-800/60 border-amber-500/40'
                          : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedPlan === plan.value ? 'border-amber-500' : 'border-gray-600'
                        }`}>
                          {selectedPlan === plan.value && (
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                          )}
                        </div>
                        <span className={`text-sm font-medium ${plan.color}`}>{plan.label}</span>
                      </div>
                      <span className="text-xs text-gray-500">{plan.price}</span>
                      <input
                        type="radio"
                        name="changePlan"
                        value={plan.value}
                        className="sr-only"
                        checked={selectedPlan === plan.value}
                        onChange={() => setSelectedPlan(plan.value)}
                      />
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleChangePlan}
                  disabled={actionLoading}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 text-white text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {actionLoading ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ======================================== */}
      {/* MODAL: Sessions (Conversations)          */}
      {/* ======================================== */}
      <AnimatePresence>
        {sessionsUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setSessionsUser(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto max-h-[70vh] flex flex-col"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-5 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    Conversaciones
                  </h3>
                  <button
                    onClick={() => setSessionsUser(null)}
                    className="p-1 rounded-full hover:bg-gray-800/60"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <p className="text-xs text-gray-400 mb-3 shrink-0">
                  <span className="text-white font-medium">{sessionsUser.name || sessionsUser.email}</span>
                  {selectedSession && (
                    <button
                      onClick={handleBackToSessions}
                      className="ml-2 text-amber-400 hover:text-amber-300 underline"
                    >
                      ← Volver a sesiones
                    </button>
                  )}
                </p>

                {/* MESSAGES VIEW */}
                {selectedSession ? (
                  messagesLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                    </div>
                  ) : sessionMessages.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-10">Sin mensajes en esta sesion</p>
                  ) : (
                    <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-3 max-h-[55vh]">
                      {sessionMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-blue-500/15 text-blue-100 border border-blue-500/20'
                                : 'bg-gray-800/50 text-gray-300 border border-gray-700/30'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`text-[9px] font-semibold uppercase ${
                                msg.role === 'user' ? 'text-blue-400' : 'text-emerald-400'
                              }`}>
                                {msg.role === 'user' ? 'Usuario' : 'Atlas'}
                              </span>
                              <span className="text-[9px] text-gray-600">
                                {new Date(msg.timestamp).toLocaleString('es-PE', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <>
                  {/* SESSIONS LIST VIEW */}
                  {sessionsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                  </div>
                ) : userSessions.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-10">Sin sesiones registradas</p>
                ) : (
                  <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-1.5 max-h-64">
                    {userSessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => handleLoadMessages(session)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-800/30 border border-gray-800/30 hover:bg-gray-800/50 hover:border-gray-700/50 transition-colors text-left"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-300 truncate">
                            {session.title || 'Sesion Atlas'}
                          </p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            {formatDate(session.createdAt)}
                          </p>
                        </div>
                        <span className="text-gray-600 text-[10px] shrink-0">›</span>
                      </button>
                    ))}
                  </div>
                )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
