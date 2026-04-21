'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, MessageSquare, DollarSign, Activity,
  ShieldCheck, Settings, BarChart3, ChevronRight, RefreshCw, LogOut, X, Eye, EyeOff
} from 'lucide-react';
import Link from 'next/link';

// ========================================
// ADMIN PANEL — Lightweight, no heavy deps
// ========================================

interface MetricData {
  totalUsers: number;
  totalSessions: number;
  totalMessages: number;
  recentUsers: number;
  messagesLast24h: number;
  apiCosts30d: { total: number; calls: number };
  planDistribution: Array<{ name: string; subscribers: number }>;
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
}

interface PlanData {
  id: string;
  name: string;
  price: number;
  currency: string;
  maxMessages: number;
  features: string[];
  sortOrder: number;
}

interface ConfigData {
  [key: string]: string;
}

type Tab = 'dashboard' | 'users' | 'plans' | 'config';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [config, setConfig] = useState<ConfigData>({});
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState<UserData | null>(null);

  const adminFetch = useCallback(async (action: string) => {
    const res = await fetch(`/api?action=${action}`);
    if (!res.ok) throw new Error(`Error ${action}`);
    return res.json();
  }, []);

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

  const loadTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      switch (tab) {
        case 'dashboard': {
          const data = await adminFetch('metrics');
          setMetrics(data);
          break;
        }
        case 'users': {
          const data = await adminFetch('users');
          setUsers(data.users);
          break;
        }
        case 'plans': {
          const data = await adminFetch('plans');
          setPlans(data.plans);
          break;
        }
        case 'config': {
          const data = await adminFetch('config');
          setConfig(data.config);
          break;
        }
      }
    } catch (err) {
      console.error('[ADMIN] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

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

  const logout = () => {
    localStorage.removeItem('atlas_admin_token');
    setIsAuthenticated(false);
    setToken('');
    setMetrics(null);
    setUsers([]);
    setPlans([]);
    setConfig({});
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 mb-8">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al chat
          </Link>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
              <ShieldCheck className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-sm text-gray-500 mt-1">Atlas — Acceso administrativo</p>
          </div>
          <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-800/50 p-6 shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30" required />
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contrasena"
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 pr-11 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {loginError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loginError}</p>
              )}
              <button type="submit" disabled={loginLoading || !email || !password}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:opacity-40 text-white text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Acceder'}
              </button>
            </form>
          </div>
          <p className="text-center text-[10px] text-gray-700 mt-4">Solo administradores autorizados</p>
        </motion.div>
      </div>
    );
  }

  // ========================================
  // ADMIN DASHBOARD
  // ========================================
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Usuarios', icon: <Users className="w-4 h-4" /> },
    { id: 'plans', label: 'Planes', icon: <Activity className="w-4 h-4" /> },
    { id: 'config', label: 'Config', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900/90 backdrop-blur-md border-b border-gray-800/40 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full hover:bg-gray-800/60">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-white">Admin Panel</h1>
            <p className="text-[10px] text-amber-400/60 uppercase tracking-wider">Atlas Coach</p>
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 text-xs transition-all">
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-800/40 px-2 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.id
                ? 'text-amber-400 border-amber-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* DASHBOARD TAB */}
          {!loading && activeTab === 'dashboard' && metrics && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4 max-w-2xl mx-auto">
              <h2 className="text-lg font-bold text-white mb-4">Metricas Generales</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Usuarios Totales', value: metrics.totalUsers, icon: <Users className="w-5 h-5" />, color: 'emerald' },
                  { label: 'Sesiones', value: metrics.totalSessions, icon: <MessageSquare className="w-5 h-5" />, color: 'blue' },
                  { label: 'Mensajes Totales', value: metrics.totalMessages, icon: <Activity className="w-5 h-5" />, color: 'purple' },
                  { label: 'Usuarios Nuevos (7d)', value: metrics.recentUsers, icon: <Users className="w-5 h-5" />, color: 'amber' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-${stat.color}-400`}>{stat.icon}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{stat.value.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">API Costs (30 dias)</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-400">${metrics.apiCosts30d.total.toFixed(4)}</span>
                  <span className="text-xs text-gray-500">({metrics.apiCosts30d.calls} llamadas)</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">Mensajes en las ultimas 24h: {metrics.messagesLast24h}</p>
              </div>
              {metrics.planDistribution.length > 0 && (
                <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-4">
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Distribucion de Planes</h3>
                  <div className="space-y-2">
                    {metrics.planDistribution.map((p) => (
                      <div key={p.name} className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{p.name}</span>
                        <span className="text-sm font-semibold text-amber-400">{p.subscribers}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* USERS TAB */}
          {!loading && activeTab === 'users' && (
            <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Usuarios ({users.length})</h2>
                <button onClick={() => loadTab('users')} className="p-2 rounded-lg hover:bg-gray-800/60">
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {users.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">Sin usuarios registrados</p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="bg-gray-900/80 border border-gray-800/50 rounded-xl p-3.5 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {(u.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                              {u.name || 'Sin nombre'}
                              {u.isAdmin && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 font-semibold">ADMIN</span>}
                              {u.isGoogle && <span className="text-[9px] text-blue-400">G</span>}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 ml-10">
                          <span className="text-[10px] text-gray-600">{u.sessionCount} sesiones</span>
                          <span className="text-[10px] text-gray-600">{formatDate(u.createdAt)}</span>
                        </div>
                      </div>
                      <button onClick={() => setShowPasswordModal(u)} className="p-2 rounded-lg hover:bg-gray-800/60">
                        <Eye className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* PLANS TAB */}
          {!loading && activeTab === 'plans' && (
            <motion.div key="plans" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Planes de Suscripcion</h2>
                <button onClick={() => loadTab('plans')} className="p-2 rounded-lg hover:bg-gray-800/60">
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {plans.map((plan, i) => (
                  <div key={plan.id} className={`rounded-xl border p-4 ${
                    i === 2 ? 'bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30' : 'bg-gray-900/80 border-gray-800/50'
                  }`}>
                    <h3 className={`text-sm font-bold ${i === 2 ? 'text-amber-400' : 'text-white'}`}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-2xl font-bold text-white">S/ {plan.price}</span>
                      <span className="text-[10px] text-gray-500">/mes</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {plan.maxMessages === -1 ? 'Ilimitados' : `${plan.maxMessages} mensajes/mes`}
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {plan.features.map((f, fi) => (
                        <li key={fi} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">{'\u2713'}</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* CONFIG TAB */}
          {!loading && activeTab === 'config' && (
            <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Configuracion</h2>
                <button onClick={() => loadTab('config')} className="p-2 rounded-lg hover:bg-gray-800/60">
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="bg-gray-900/80 border border-gray-800/50 rounded-xl overflow-hidden">
                {Object.entries(config).map(([key, value], i) => (
                  <div key={key} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-800/40' : ''}`}>
                    <span className="text-xs text-gray-500 font-medium">{key}</span>
                    <span className={`text-xs max-w-[200px] truncate ${
                      key.includes('key') || key.includes('secret') || key.includes('token') ? 'text-gray-600' : 'text-gray-300'
                    }`}>
                      {key.includes('key') || key.includes('secret') || key.includes('token')
                        ? value ? '****' : '(vacío)'
                        : value || '(vacío)'}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User Detail Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowPasswordModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Detalle de Usuario</h3>
                  <button onClick={() => setShowPasswordModal(null)} className="p-1 rounded-full hover:bg-gray-800/60">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    ['ID', showPasswordModal.id],
                    ['Nombre', showPasswordModal.name],
                    ['Email', showPasswordModal.email],
                    ['Admin', showPasswordModal.isAdmin ? 'Si' : 'No'],
                    ['Google', showPasswordModal.isGoogle ? 'Si' : 'No'],
                    ['Tenant ID', showPasswordModal.tenantId],
                    ['Sesiones', String(showPasswordModal.sessionCount)],
                    ['Registro', formatDate(showPasswordModal.createdAt)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-300 font-mono text-[11px] max-w-[200px] truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
