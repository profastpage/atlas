'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Shield,
  Users,
  DollarSign,
  Activity,
  CreditCard,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Save,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Settings,
  Crown,
  Zap,
  Star,
  Check,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  Server,
  Megaphone,
  Globe,
  Power,
  MessageSquare,
  Calendar,
  Filter,
  MoreVertical,
  Download,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminPanelProps {
  adminToken: string;
  onBack: () => void;
}

interface Metrics {
  totalUsers: number;
  monthlyRevenue: number;
  apiCosts: number;
  activePayments: number;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: 'active' | 'inactive' | 'suspended';
  messagesCount: number;
  createdAt: string;
}

interface PlanRecord {
  id: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  maxMessages: number;
  activeSubscribers: number;
  isActive: boolean;
}

interface AppConfig {
  maintenance_mode: boolean;
  max_free_messages: number;
  welcome_message: string;
  hosting_cost: number;
  facebook_ads_cost: number;
  google_ads_cost: number;
  other_ads_cost: number;
}

interface RevenueMonth {
  month: string;
  amount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  Basico: 'from-gray-600 to-gray-700',
  Profesional: 'from-emerald-700 to-emerald-800',
  Elite: 'from-amber-600 to-amber-700',
};

const PLAN_ACCENT: Record<string, string> = {
  Basico: 'text-gray-300',
  Profesional: 'text-emerald-400',
  Elite: 'text-amber-400',
};

const PLAN_BORDER: Record<string, string> = {
  Basico: 'border-gray-600/40',
  Profesional: 'border-emerald-500/40',
  Elite: 'border-amber-500/40',
};

const PLAN_BADGE: Record<string, string> = {
  Basico: 'bg-gray-700 text-gray-300 border-gray-600',
  Profesional: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  Elite: 'bg-amber-900/60 text-amber-300 border-amber-700',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  inactive: 'bg-gray-800 text-gray-400 border-gray-700',
  suspended: 'bg-red-900/60 text-red-300 border-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  suspended: 'Suspendido',
};

const MONTH_NAMES_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const ITEMS_PER_PAGE = 10;

const FETCH_HEADERS = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const FALLBACK_PLANS: PlanRecord[] = [
  {
    id: '1',
    name: 'Basico',
    price: 20,
    currency: 'PEN',
    features: ['50 mensajes/mes', 'Soporte por email', '1 modelo de IA'],
    maxMessages: 50,
    activeSubscribers: 0,
    isActive: true,
  },
  {
    id: '2',
    name: 'Profesional',
    price: 40,
    currency: 'PEN',
    features: ['200 mensajes/mes', 'Soporte prioritario', 'Todos los modelos', 'Analisis avanzado'],
    maxMessages: 200,
    activeSubscribers: 0,
    isActive: true,
  },
  {
    id: '3',
    name: 'Elite',
    price: 60,
    currency: 'PEN',
    features: ['Mensajes ilimitados', 'Soporte 24/7', 'API Access', 'Personalizacion', 'Analisis premium'],
    maxMessages: 999999,
    activeSubscribers: 0,
    isActive: true,
  },
];

const FALLBACK_CONFIG: AppConfig = {
  maintenance_mode: false,
  max_free_messages: 5,
  welcome_message: 'Hola! Soy tu asistente Atlas. En que puedo ayudarte?',
  hosting_cost: 15,
  facebook_ads_cost: 0,
  google_ads_cost: 0,
  other_ads_cost: 0,
};

const FALLBACK_REVENUE: RevenueMonth[] = [
  { month: 'Ene', amount: 1200 },
  { month: 'Feb', amount: 1580 },
  { month: 'Mar', amount: 2100 },
  { month: 'Abr', amount: 1890 },
  { month: 'May', amount: 2450 },
  { month: 'Jun', amount: 2780 },
];

// ─── Animation variants ─────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.35 } },
};

const metricCardGradients = [
  'from-emerald-900/40 to-emerald-950/60',
  'from-emerald-800/40 to-teal-950/60',
  'from-teal-900/40 to-cyan-950/60',
  'from-green-900/40 to-emerald-950/60',
];

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatPEN(amount: number): string {
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUSD(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-PE');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-800/40 bg-gray-900/80 p-4">
      <Skeleton className="mb-3 h-4 w-24 rounded bg-gray-800" />
      <Skeleton className="mb-2 h-8 w-20 rounded bg-gray-800" />
      <Skeleton className="h-3 w-16 rounded bg-gray-800" />
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-5 w-5 text-emerald-400" />
      <h2 className="text-lg font-semibold text-gray-100 md:text-xl">{children}</h2>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function AdminPanel({ adminToken, onBack }: AdminPanelProps) {
  // ── State ────────────────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>(FALLBACK_PLANS);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [revenueData, setRevenueData] = useState<RevenueMonth[]>(FALLBACK_REVENUE);

  const [loading, setLoading] = useState({
    metrics: true,
    users: true,
    plans: true,
    config: true,
  });

  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');
  const [userPage, setUserPage] = useState(1);

  const [editUserDialog, setEditUserDialog] = useState<UserRecord | null>(null);
  const [editUserPlan, setEditUserPlan] = useState('');
  const [deleteUserDialog, setDeleteUserDialog] = useState<UserRecord | null>(null);

  const [configSaving, setConfigSaving] = useState(false);
  const [planToggling, setPlanToggling] = useState<string | null>(null);

  const [showRevenue, setShowRevenue] = useState(true);

  const headers = React.useMemo(() => FETCH_HEADERS(adminToken), [adminToken]);

  // ── Effects (data fetch) ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const h = headers;

    const loadAll = async () => {
      setLoading({ metrics: true, users: true, plans: true, config: true });

      // Metrics
      try {
        const res = await fetch('/api/admin/metrics', { headers: h });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (!cancelled) setMetrics(data);
        }
      } catch { /* keep null */ }
      if (!cancelled) setLoading((p) => ({ ...p, metrics: false }));

      // Users
      try {
        const res = await fetch('/api/admin/users', { headers: h });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (!cancelled) setUsers(Array.isArray(data) ? data : data.users ?? []);
        }
      } catch { /* keep empty */ }
      if (!cancelled) setLoading((p) => ({ ...p, users: false }));

      // Plans
      try {
        const res = await fetch('/api/plans', { headers: h });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setPlans(
              data.map((p: Record<string, unknown>) => ({
                id: String(p.id ?? ''),
                name: String(p.name ?? 'Plan'),
                price: Number(p.price ?? 0),
                currency: String(p.currency ?? 'PEN'),
                features: Array.isArray(p.features) ? p.features.map(String) : [],
                maxMessages: Number(p.maxMessages ?? 0),
                activeSubscribers: Number(p.activeSubscribers ?? 0),
                isActive: Boolean(p.isActive ?? true),
              }))
            );
          }
        }
      } catch { /* keep fallback */ }
      if (!cancelled) setLoading((p) => ({ ...p, plans: false }));

      // Config
      try {
        const res = await fetch('/api/config', { headers: h });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (!cancelled) {
            setConfig((prev) => ({
              maintenance_mode: data.maintenance_mode ?? prev.maintenance_mode,
              max_free_messages: data.max_free_messages ?? prev.max_free_messages,
              welcome_message: data.welcome_message ?? prev.welcome_message,
              hosting_cost: data.hosting_cost ?? prev.hosting_cost,
              facebook_ads_cost: data.facebook_ads_cost ?? prev.facebook_ads_cost,
              google_ads_cost: data.google_ads_cost ?? prev.google_ads_cost,
              other_ads_cost: data.other_ads_cost ?? prev.other_ads_cost,
            }));
          }
        }
      } catch { /* keep fallback */ }
      if (!cancelled) setLoading((p) => ({ ...p, config: false }));
    };

    loadAll();

    return () => { cancelled = true; };
  }, [headers]);

  // Refresh helper (for button)
  const refreshData = useCallback(async () => {
    const h = FETCH_HEADERS(adminToken);
    try {
      const res = await fetch('/api/admin/metrics', { headers: h });
      if (res.ok) setMetrics(await res.json());
    } catch { /* noop */ }
    try {
      const res = await fetch('/api/admin/users', { headers: h });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users ?? []);
      }
    } catch { /* noop */ }
    try {
      const res = await fetch('/api/plans', { headers: h });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPlans(
            data.map((p: Record<string, unknown>) => ({
              id: String(p.id ?? ''),
              name: String(p.name ?? 'Plan'),
              price: Number(p.price ?? 0),
              currency: String(p.currency ?? 'PEN'),
              features: Array.isArray(p.features) ? p.features.map(String) : [],
              maxMessages: Number(p.maxMessages ?? 0),
              activeSubscribers: Number(p.activeSubscribers ?? 0),
              isActive: Boolean(p.isActive ?? true),
            }))
          );
        }
      }
    } catch { /* noop */ }
    try {
      const res = await fetch('/api/config', { headers: h });
      if (res.ok) {
        const data = await res.json();
        setConfig((prev) => ({
          maintenance_mode: data.maintenance_mode ?? prev.maintenance_mode,
          max_free_messages: data.max_free_messages ?? prev.max_free_messages,
          welcome_message: data.welcome_message ?? prev.welcome_message,
          hosting_cost: data.hosting_cost ?? prev.hosting_cost,
          facebook_ads_cost: data.facebook_ads_cost ?? prev.facebook_ads_cost,
          google_ads_cost: data.google_ads_cost ?? prev.google_ads_cost,
          other_ads_cost: data.other_ads_cost ?? prev.other_ads_cost,
        }));
      }
    } catch { /* noop */ }
  }, [adminToken]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let result = users;
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.plan.toLowerCase().includes(q)
      );
    }
    if (userStatusFilter !== 'all') {
      result = result.filter((u) => u.status === userStatusFilter);
    }
    return result;
  }, [users, userSearch, userStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, userPage]);

  // reset page when filters change (handled in event handlers instead of effect)

  // cost analysis
  const totalAdCost = (config.facebook_ads_cost ?? 0) + (config.google_ads_cost ?? 0) + (config.other_ads_cost ?? 0);
  const totalCostsUSD = (metrics?.apiCosts ?? 0) + (config.hosting_cost ?? 0) + totalAdCost;
  const revenueUSD = (metrics?.monthlyRevenue ?? 0) / 3.7; // approximate PEN to USD
  const profitUSD = revenueUSD - totalCostsUSD;
  const isProfit = profitUSD >= 0;

  const maxRevenueForChart = Math.max(...revenueData.map((r) => r.amount), 1);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleRefreshAll = () => {
    refreshData();
    toast.success('Datos actualizados');
  };

  const handleToggleUserStatus = async (user: UserRecord) => {
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: FETCH_HEADERS(adminToken),
        body: JSON.stringify({ userId: user.id, status: newStatus }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u))
        );
        toast.success(`Estado de ${user.name} cambiado a ${STATUS_LABELS[newStatus]}`);
      } else {
        toast.error('Error al cambiar estado');
      }
    } catch {
      toast.error('Error de conexion');
    }
  };

  const handleEditUserSave = async () => {
    if (!editUserDialog || !editUserPlan) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: FETCH_HEADERS(adminToken),
        body: JSON.stringify({ userId: editUserDialog.id, plan: editUserPlan }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === editUserDialog.id ? { ...u, plan: editUserPlan } : u))
        );
        toast.success(`Plan de ${editUserDialog.name} actualizado`);
        setEditUserDialog(null);
      } else {
        toast.error('Error al actualizar plan');
      }
    } catch {
      toast.error('Error de conexion');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserDialog) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: FETCH_HEADERS(adminToken),
        body: JSON.stringify({ userId: deleteUserDialog.id }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteUserDialog.id));
        toast.success(`Usuario ${deleteUserDialog.name} eliminado`);
        setDeleteUserDialog(null);
      } else {
        toast.error('Error al eliminar usuario');
      }
    } catch {
      toast.error('Error de conexion');
    }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: FETCH_HEADERS(adminToken),
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success('Configuracion guardada correctamente');
      } else {
        toast.error('Error al guardar configuracion');
      }
    } catch {
      toast.error('Error de conexion');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleTogglePlan = async (planId: string, isActive: boolean) => {
    setPlanToggling(planId);
    try {
      // optimistic update
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, isActive: !isActive } : p))
      );
      toast.success(`Plan ${isActive ? 'desactivado' : 'activado'}`);
    } catch {
      toast.error('Error al cambiar plan');
    } finally {
      setPlanToggling(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── SCROLLABLE CONTENT ───────────────────────────────────────────────── */}
      <ScrollArea className="h-screen">
        <motion.div
          className="mx-auto max-w-7xl space-y-6 p-4 md:p-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* ════════════════════════════════════════════════════════════════════
              1. TOP BAR
              ════════════════════════════════════════════════════════════════════ */}
          <motion.header
            variants={itemVariants}
            className="sticky top-0 z-50 -mx-4 mb-2 flex items-center justify-between rounded-b-xl border border-gray-800/40 bg-gray-950/90 px-4 py-3 backdrop-blur-xl md:-mx-6 md:px-6"
          >
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-9 w-9 text-gray-400 hover:text-emerald-400"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/20">
                  <Shield className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-wider text-gray-100 md:text-lg">
                    ATLAS ADMIN
                  </h1>
                  <p className="hidden text-xs text-gray-500 sm:block">
                    Panel de Administracion
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshAll}
                className="gap-1.5 text-gray-400 hover:text-emerald-400"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Actualizar</span>
              </Button>
              <div className="hidden items-center gap-2 rounded-lg border border-gray-800/40 bg-gray-900/80 px-3 py-1.5 md:flex">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-gray-400">admin@atlas.ai</span>
              </div>
            </div>
          </motion.header>

          {/* ════════════════════════════════════════════════════════════════════
              2. METRICS CARDS
              ════════════════════════════════════════════════════════════════════ */}
          <motion.section variants={itemVariants}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {loading.metrics ? (
                <>
                  <MetricCardSkeleton />
                  <MetricCardSkeleton />
                  <MetricCardSkeleton />
                  <MetricCardSkeleton />
                </>
              ) : (
                <>
                  {/* Total Usuarios */}
                  <motion.div
                    variants={cardVariants}
                    className={`relative overflow-hidden rounded-xl border border-gray-800/40 bg-gradient-to-br ${metricCardGradients[0]} p-4 md:p-5`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20">
                        <Users className="h-5 w-5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/60">
                        Live
                      </span>
                    </div>
                    <p className="mb-1 text-2xl font-bold text-gray-100 md:text-3xl">
                      {formatNumber(metrics?.totalUsers ?? 0)}
                    </p>
                    <p className="text-xs text-gray-400">Total Usuarios</p>
                  </motion.div>

                  {/* Ingresos del Mes */}
                  <motion.div
                    variants={cardVariants}
                    className={`relative overflow-hidden rounded-xl border border-gray-800/40 bg-gradient-to-br ${metricCardGradients[1]} p-4 md:p-5`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20">
                        <DollarSign className="h-5 w-5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/60">
                        PEN
                      </span>
                    </div>
                    <p className="mb-1 text-2xl font-bold text-gray-100 md:text-3xl">
                      {formatPEN(metrics?.monthlyRevenue ?? 0)}
                    </p>
                    <p className="text-xs text-gray-400">Ingresos del Mes</p>
                  </motion.div>

                  {/* Costo APIs */}
                  <motion.div
                    variants={cardVariants}
                    className={`relative overflow-hidden rounded-xl border border-gray-800/40 bg-gradient-to-br ${metricCardGradients[2]} p-4 md:p-5`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20">
                        <Activity className="h-5 w-5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/60">
                        USD
                      </span>
                    </div>
                    <p className="mb-1 text-2xl font-bold text-gray-100 md:text-3xl">
                      {formatUSD(metrics?.apiCosts ?? 0)}
                    </p>
                    <p className="text-xs text-gray-400">Costo APIs</p>
                  </motion.div>

                  {/* Pagos Activos */}
                  <motion.div
                    variants={cardVariants}
                    className={`relative overflow-hidden rounded-xl border border-gray-800/40 bg-gradient-to-br ${metricCardGradients[3]} p-4 md:p-5`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20">
                        <CreditCard className="h-5 w-5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/60">
                        Activos
                      </span>
                    </div>
                    <p className="mb-1 text-2xl font-bold text-gray-100 md:text-3xl">
                      {formatNumber(metrics?.activePayments ?? 0)}
                    </p>
                    <p className="text-xs text-gray-400">Pagos Activos</p>
                  </motion.div>
                </>
              )}
            </div>
          </motion.section>

          {/* ════════════════════════════════════════════════════════════════════
              3. PLANS MANAGEMENT + 7. REVENUE CHART (side by side on lg)
              ════════════════════════════════════════════════════════════════════ */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* ── Plans ───────────────────────────────────────────────────────── */}
            <motion.section variants={itemVariants} className="lg:col-span-2">
              <SectionTitle icon={Crown}>Gestion de Planes</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-3">
                {plans.map((plan) => {
                  const PlanIcon =
                    plan.name === 'Elite' ? Star : plan.name === 'Profesional' ? Zap : Check;
                  return (
                    <motion.div
                      key={plan.id}
                      variants={cardVariants}
                      whileHover={{ y: -4 }}
                      className={`relative overflow-hidden rounded-xl border ${PLAN_BORDER[plan.name] ?? 'border-gray-800/40'} bg-gradient-to-br ${PLAN_COLORS[plan.name] ?? 'from-gray-800 to-gray-900'} p-4 transition-shadow hover:shadow-lg hover:shadow-emerald-900/20`}
                    >
                      {/* Plan badge */}
                      <div className="mb-3 flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={`${PLAN_BADGE[plan.name] ?? 'bg-gray-800 text-gray-300'} border text-[10px]`}
                        >
                          {plan.name}
                        </Badge>
                        <span className={`text-xs ${PLAN_ACCENT[plan.name] ?? 'text-gray-400'}`}>
                          {plan.maxMessages >= 999999 ? 'Ilimitado' : `${plan.maxMessages} msg`}
                        </span>
                      </div>

                      {/* Price */}
                      <p className={`mb-1 text-2xl font-bold ${PLAN_ACCENT[plan.name] ?? 'text-gray-100'}`}>
                        {formatPEN(plan.price)}
                        <span className="text-xs font-normal text-gray-400">/mes</span>
                      </p>

                      {/* Features */}
                      <ul className="mb-4 space-y-1.5">
                        {plan.features.slice(0, 4).map((feat, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs text-gray-300">
                            <PlanIcon className="h-3 w-3 flex-shrink-0 text-emerald-400/70" />
                            {feat}
                          </li>
                        ))}
                      </ul>

                      {/* Subscriber count */}
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Suscriptores activos</span>
                        <span className="text-sm font-semibold text-gray-200">
                          {plan.activeSubscribers}
                        </span>
                      </div>

                      {/* Toggle */}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={planToggling === plan.id}
                        onClick={() => handleTogglePlan(plan.id, plan.isActive)}
                        className={`w-full gap-2 border-gray-600/40 text-xs ${
                          plan.isActive
                            ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                            : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'
                        }`}
                      >
                        {plan.isActive ? (
                          <>
                            <ToggleRight className="h-4 w-4" /> Activo
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-4 w-4" /> Inactivo
                          </>
                        )}
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>

            {/* ── Revenue Chart ────────────────────────────────────────────────── */}
            <motion.section variants={itemVariants}>
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle icon={BarChart3}>Ingresos Mensual</SectionTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-500"
                  onClick={() => setShowRevenue(!showRevenue)}
                >
                  {showRevenue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="rounded-xl border border-gray-800/40 bg-gray-900/80 p-4 md:p-5">
                <AnimatePresence mode="wait">
                  {showRevenue ? (
                    <motion.div
                      key="chart"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      {revenueData.map((item, idx) => {
                        const heightPct = Math.max(
                          8,
                          (item.amount / maxRevenueForChart) * 100
                        );
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <span className="w-8 text-right text-[11px] text-gray-500">
                              {item.month}
                            </span>
                            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-gray-800/50">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${heightPct}%` }}
                                transition={{ duration: 0.6, delay: idx * 0.08, ease: 'easeOut' }}
                                className="flex h-full items-center rounded-md bg-gradient-to-r from-emerald-600 to-emerald-500"
                              >
                                <span className="ml-2 whitespace-nowrap text-[10px] font-medium text-white">
                                  {formatPEN(item.amount)}
                                </span>
                              </motion.div>
                            </div>
                          </div>
                        );
                      })}
                      <Separator className="bg-gray-800/40" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Total acumulado</span>
                        <span className="font-semibold text-emerald-400">
                          {formatPEN(revenueData.reduce((s, r) => s + r.amount, 0))}
                        </span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="hidden"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex h-40 items-center justify-center text-gray-500"
                    >
                      <span className="text-xs">Datos ocultos</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              4. USERS TABLE
              ════════════════════════════════════════════════════════════════════ */}
          <motion.section variants={itemVariants}>
            <SectionTitle icon={Users}>Usuarios Registrados</SectionTitle>

            <div className="overflow-hidden rounded-xl border border-gray-800/40 bg-gray-900/80">
              {/* Search & Filter Bar */}
              <div className="flex flex-col gap-3 border-b border-gray-800/40 p-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    placeholder="Buscar por nombre, email o plan..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    className="h-9 border-gray-700/50 bg-gray-800/50 pl-9 text-sm text-gray-200 placeholder:text-gray-500 focus:border-emerald-500/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={userStatusFilter} onValueChange={(v) => {
                    setUserStatusFilter(v);
                    setUserPage(1);
                  }}>
                    <SelectTrigger className="h-9 w-36 border-gray-700/50 bg-gray-800/50 text-sm text-gray-300">
                      <Filter className="mr-1.5 h-3.5 w-3.5 text-gray-500" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-gray-800 bg-gray-900">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="inactive">Inactivo</SelectItem>
                      <SelectItem value="suspended">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="border-gray-700 text-gray-400">
                    {filteredUsers.length} usuarios
                  </Badge>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800/40 text-left text-xs text-gray-500">
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="hidden px-4 py-3 font-medium md:table-cell">Plan</th>
                      <th className="hidden px-4 py-3 font-medium sm:table-cell">Estado</th>
                      <th className="hidden px-4 py-3 font-medium lg:table-cell">Mensajes</th>
                      <th className="hidden px-4 py-3 font-medium xl:table-cell">Registro</th>
                      <th className="px-4 py-3 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading.users ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-800/20">
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-24 rounded bg-gray-800" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-36 rounded bg-gray-800" />
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <Skeleton className="h-5 w-16 rounded-full bg-gray-800" />
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <Skeleton className="h-5 w-16 rounded-full bg-gray-800" />
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <Skeleton className="h-4 w-10 rounded bg-gray-800" />
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <Skeleton className="h-4 w-20 rounded bg-gray-800" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Skeleton className="ml-auto h-8 w-8 rounded bg-gray-800" />
                          </td>
                        </tr>
                      ))
                    ) : paginatedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                          <Users className="mx-auto mb-2 h-8 w-8 text-gray-700" />
                          <p>No se encontraron usuarios</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((user) => (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="border-b border-gray-800/20 transition-colors hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3 font-medium text-gray-200">{user.name}</td>
                          <td className="px-4 py-3 text-gray-400">{user.email}</td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <Badge
                              variant="outline"
                              className={`${PLAN_BADGE[user.plan] ?? 'bg-gray-800 text-gray-300'} border text-[10px]`}
                            >
                              {user.plan}
                            </Badge>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <Badge
                              variant="outline"
                              className={`${STATUS_STYLES[user.status]} border text-[10px]`}
                            >
                              <span
                                className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                                  user.status === 'active'
                                    ? 'bg-emerald-400'
                                    : user.status === 'suspended'
                                    ? 'bg-red-400'
                                    : 'bg-gray-500'
                                }`}
                              />
                              {STATUS_LABELS[user.status]}
                            </Badge>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-gray-300">{user.messagesCount}</span>
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <span className="text-gray-400">{formatDate(user.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-emerald-400"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-44 border-gray-800 bg-gray-900"
                              >
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditUserDialog(user);
                                    setEditUserPlan(user.plan);
                                  }}
                                  className="gap-2 text-gray-300 focus:bg-gray-800 focus:text-emerald-400"
                                >
                                  <Pencil className="h-4 w-4" /> Editar Plan
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleToggleUserStatus(user)}
                                  className="gap-2 text-gray-300 focus:bg-gray-800 focus:text-emerald-400"
                                >
                                  {user.status === 'active' ? (
                                    <>
                                      <ToggleLeft className="h-4 w-4" /> Desactivar
                                    </>
                                  ) : (
                                    <>
                                      <ToggleRight className="h-4 w-4" /> Activar
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setDeleteUserDialog(user)}
                                  className="gap-2 text-red-400 focus:bg-red-950/50 focus:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4" /> Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-800/40 px-4 py-3">
                  <span className="text-xs text-gray-500">
                    Mostrando {(userPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                    {Math.min(userPage * ITEMS_PER_PAGE, filteredUsers.length)} de{' '}
                    {filteredUsers.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-emerald-400"
                      disabled={userPage <= 1}
                      onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          Math.abs(p - userPage) <= 1
                      )
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                          acc.push('...');
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) =>
                        typeof item === 'string' ? (
                          <span key={`dots-${idx}`} className="px-1 text-xs text-gray-600">
                            ...
                          </span>
                        ) : (
                          <Button
                            key={item}
                            variant={item === userPage ? 'default' : 'ghost'}
                            size="icon"
                            className={`h-8 w-8 text-xs ${
                              item === userPage
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'text-gray-400 hover:text-emerald-400'
                            }`}
                            onClick={() => setUserPage(item)}
                          >
                            {item}
                          </Button>
                        )
                      )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-emerald-400"
                      disabled={userPage >= totalPages}
                      onClick={() => setUserPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.section>

          {/* ════════════════════════════════════════════════════════════════════
              5. COST ANALYSIS + 6. APP CONFIG (side by side on lg)
              ════════════════════════════════════════════════════════════════════ */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Cost Analysis ────────────────────────────────────────────────── */}
            <motion.section variants={itemVariants}>
              <SectionTitle icon={TrendingDown}>Analisis de Costos</SectionTitle>
              <div className="space-y-4 rounded-xl border border-gray-800/40 bg-gray-900/80 p-4 md:p-5">
                {/* Cost Items */}
                <div className="space-y-3">
                  <CostItemRow
                    icon={Activity}
                    label="Costo APIs (mes)"
                    value={formatUSD(metrics?.apiCosts ?? 0)}
                    color="text-blue-400"
                  />
                  <CostItemRow
                    icon={Server}
                    label="Hosting"
                    value={formatUSD(config.hosting_cost ?? 0)}
                    color="text-purple-400"
                  />
                  <CostItemRow
                    icon={Megaphone}
                    label="Facebook Ads"
                    value={formatUSD(config.facebook_ads_cost ?? 0)}
                    color="text-blue-400"
                  />
                  <CostItemRow
                    icon={Globe}
                    label="Google Ads"
                    value={formatUSD(config.google_ads_cost ?? 0)}
                    color="text-orange-400"
                  />
                  <CostItemRow
                    icon={Megaphone}
                    label="Otros Ads"
                    value={formatUSD(config.other_ads_cost ?? 0)}
                    color="text-yellow-400"
                  />
                </div>

                <Separator className="bg-gray-800/40" />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Costos Totales</span>
                    <span className="font-medium text-red-400">{formatUSD(totalCostsUSD)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Ingresos (est. USD)</span>
                    <span className="font-medium text-emerald-400">
                      {formatUSD(revenueUSD)}
                    </span>
                  </div>
                </div>

                <Separator className="bg-gray-800/40" />

                {/* Profit/Loss */}
                <div
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    isProfit
                      ? 'bg-emerald-900/20 border border-emerald-800/30'
                      : 'bg-red-900/20 border border-red-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isProfit ? (
                      <TrendingUp className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-400" />
                    )}
                    <span className="text-sm font-medium text-gray-200">
                      {isProfit ? 'Ganancia' : 'Perdida'}
                    </span>
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      isProfit ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {isProfit ? '+' : ''}
                    {formatUSD(profitUSD)}
                  </span>
                </div>

                {/* Visual Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>Ingresos vs Costos</span>
                    <span>
                      {totalCostsUSD > 0
                        ? `${Math.round((revenueUSD / totalCostsUSD) * 100)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex h-4 overflow-hidden rounded-full bg-gray-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${
                          revenueUSD + totalCostsUSD > 0
                            ? Math.min(
                                100,
                                (revenueUSD / (revenueUSD + totalCostsUSD)) * 100
                              )
                            : 0
                        }%`,
                      }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="bg-gradient-to-r from-emerald-600 to-emerald-500"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${
                          revenueUSD + totalCostsUSD > 0
                            ? Math.min(
                                100,
                                (totalCostsUSD / (revenueUSD + totalCostsUSD)) * 100
                              )
                            : 0
                        }%`,
                      }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                      className="bg-gradient-to-r from-red-600 to-red-500"
                    />
                  </div>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      Ingresos
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                      Costos
                    </span>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* ── App Configuration ────────────────────────────────────────────── */}
            <motion.section variants={itemVariants}>
              <SectionTitle icon={Settings}>Configuracion de la App</SectionTitle>
              <div className="space-y-5 rounded-xl border border-gray-800/40 bg-gray-900/80 p-4 md:p-5">
                {/* Maintenance Mode */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Power className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-300">Modo Mantenimiento</span>
                  </div>
                  <Switch
                    checked={config.maintenance_mode}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({ ...prev, maintenance_mode: checked }))
                    }
                    className="data-[state=checked]:bg-emerald-600"
                  />
                </div>

                <Separator className="bg-gray-800/40" />

                {/* Max Free Messages */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    Mensajes Gratis (max)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={config.max_free_messages}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        max_free_messages: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="h-9 border-gray-700/50 bg-gray-800/50 text-sm text-gray-200 focus:border-emerald-500/50"
                  />
                </div>

                {/* Welcome Message */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    Mensaje de Bienvenida
                  </label>
                  <Textarea
                    value={config.welcome_message}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        welcome_message: e.target.value,
                      }))
                    }
                    rows={3}
                    className="border-gray-700/50 bg-gray-800/50 text-sm text-gray-200 placeholder:text-gray-500 focus:border-emerald-500/50"
                  />
                </div>

                <Separator className="bg-gray-800/40" />

                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Costos Configurables
                </p>

                {/* Cost Inputs */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <ConfigNumberInput
                    icon={Server}
                    label="Hosting (USD/mes)"
                    value={config.hosting_cost}
                    onChange={(v) =>
                      setConfig((prev) => ({ ...prev, hosting_cost: v }))
                    }
                  />
                  <ConfigNumberInput
                    icon={Megaphone}
                    label="Facebook Ads (USD)"
                    value={config.facebook_ads_cost}
                    onChange={(v) =>
                      setConfig((prev) => ({ ...prev, facebook_ads_cost: v }))
                    }
                  />
                  <ConfigNumberInput
                    icon={Globe}
                    label="Google Ads (USD)"
                    value={config.google_ads_cost}
                    onChange={(v) =>
                      setConfig((prev) => ({ ...prev, google_ads_cost: v }))
                    }
                  />
                  <ConfigNumberInput
                    icon={Megaphone}
                    label="Otros Ads (USD)"
                    value={config.other_ads_cost}
                    onChange={(v) =>
                      setConfig((prev) => ({ ...prev, other_ads_cost: v }))
                    }
                  />
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {configSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Guardar Configuracion
                    </>
                  )}
                </Button>
              </div>
            </motion.section>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              FOOTER
              ════════════════════════════════════════════════════════════════════ */}
          <motion.footer
            variants={itemVariants}
            className="flex flex-col items-center gap-2 border-t border-gray-800/40 pt-6 text-center"
          >
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-500/50" />
              <span className="text-xs text-gray-600">Atlas Admin v1.0</span>
            </div>
            <p className="text-[10px] text-gray-700">
              Panel de administracion seguro. Acceso restringido.
            </p>
          </motion.footer>
        </motion.div>
      </ScrollArea>

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* Edit User Plan Dialog */}
      <Dialog
        open={!!editUserDialog}
        onOpenChange={(open) => !open && setEditUserDialog(null)}
      >
        <DialogContent className="border-gray-800 bg-gray-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-100">Editar Plan de Usuario</DialogTitle>
            <DialogDescription className="text-gray-400">
              Cambiar el plan de suscripcion para{' '}
              <span className="font-medium text-gray-300">
                {editUserDialog?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-gray-800/40 bg-gray-800/30 p-3">
              <p className="text-sm text-gray-400">Email</p>
              <p className="text-sm text-gray-200">{editUserDialog?.email}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Nuevo Plan</label>
              <Select value={editUserPlan} onValueChange={setEditUserPlan}>
                <SelectTrigger className="border-gray-700/50 bg-gray-800/50 text-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-gray-800 bg-gray-900">
                  <SelectItem value="Basico">Basico - S/20/mes</SelectItem>
                  <SelectItem value="Profesional">Profesional - S/40/mes</SelectItem>
                  <SelectItem value="Elite">Elite - S/60/mes</SelectItem>
                  <SelectItem value="Gratis">Gratis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setEditUserDialog(null)}
              className="text-gray-400 hover:text-gray-200"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditUserSave}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" /> Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog
        open={!!deleteUserDialog}
        onOpenChange={(open) => !open && setDeleteUserDialog(null)}
      >
        <DialogContent className="border-gray-800 bg-gray-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Eliminacion
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Esta accion no se puede deshacer. Se eliminaran todos los datos del
              usuario.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-3">
            <p className="text-sm text-gray-300">
              <span className="font-medium">{deleteUserDialog?.name}</span>
            </p>
            <p className="text-xs text-gray-500">{deleteUserDialog?.email}</p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteUserDialog(null)}
              className="text-gray-400 hover:text-gray-200"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" /> Eliminar Usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Small Sub-components ─────────────────────────────────────────────────────

function CostItemRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm text-gray-300">{label}</span>
      </div>
      <span className="text-sm font-medium text-gray-200">{value}</span>
    </div>
  );
}

function ConfigNumberInput({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <Input
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-9 border-gray-700/50 bg-gray-800/50 text-sm text-gray-200 focus:border-emerald-500/50"
      />
    </div>
  );
}
