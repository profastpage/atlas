export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';
import { supabase } from '@/lib/supabase';

// ========================================
// HEALTH CHECK + ADMIN API
// Single route, no extra bundle size
// ========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // ---- ADMIN ENDPOINTS ----
  if (action) {
    return handleAdminAction(request, action);
  }

  // ---- HEALTH CHECK ----
  let dbOk = false;
  try {
    await db.execute('SELECT 1 as ok');
    dbOk = true;
  } catch {}

  return NextResponse.json({ status: dbOk ? 'ok' : 'degraded', service: 'Atlas Coach v1.2' });
}

async function handleAdminAction(request: NextRequest, action: string) {
  try {
    switch (action) {
      // --- Legacy Turso-based metrics (backward compat) ---
      case 'metrics': return handleMetrics();
      // --- Enhanced Supabase+Turso dashboard ---
      case 'dashboard_metrics': return handleDashboardMetrics();
      // --- User list (enhanced with Supabase profiles) ---
      case 'users': return handleUsers();
      // --- User sessions ---
      case 'user_sessions': return handleUserSessions(request);
      // --- Subscription plans (Turso) ---
      case 'plans': return handlePlans();
      // --- App config (Turso) ---
      case 'config': return handleConfig();
      // --- User subscription info (Turso) ---
      case 'subscription': return handleSubscription(request);
      // --- Trial status (Supabase) ---
      case 'trial_status': return handleTrialStatus(request);
      // --- Plan features (Supabase) ---
      case 'plan_features': return handlePlanFeatures();
      // --- System settings (Supabase) ---
      case 'settings': return handleSettings();
      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('[ADMIN]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ========================================
// LEGACY DASHBOARD METRICS (Turso only)
// ========================================
async function handleMetrics() {
  const [users, sessions, messages, costs] = await Promise.all([
    db.execute('SELECT COUNT(*) as total FROM AuthUser'),
    db.execute('SELECT COUNT(*) as total FROM Session'),
    db.execute('SELECT COUNT(*) as total FROM Message'),
    db.execute(`
      SELECT COALESCE(SUM(costUsd), 0) as total, COUNT(*) as calls
      FROM ApiUsage WHERE createdAt >= datetime('now', '-30 days')
    `),
  ]);

  const [recentUsers, recentMessages] = await Promise.all([
    db.execute(`SELECT COUNT(*) as total FROM AuthUser WHERE createdAt >= datetime('now', '-7 days')`),
    db.execute(`SELECT COUNT(*) as total FROM Message WHERE timestamp >= datetime('now', '-24 hours')`),
  ]);

  const [planStats] = await db.execute(`
    SELECT p.name, COUNT(s.id) as subscribers
    FROM SubscriptionPlan p
    LEFT JOIN Subscription s ON s.planId = p.id AND s.status = 'active'
    GROUP BY p.id
  `);

  return NextResponse.json({
    totalUsers: Number(users.rows[0]?.total || 0),
    totalSessions: Number(sessions.rows[0]?.total || 0),
    totalMessages: Number(messages.rows[0]?.total || 0),
    recentUsers: Number(recentUsers.rows[0]?.total || 0),
    messagesLast24h: Number(recentMessages.rows[0]?.total || 0),
    apiCosts30d: {
      total: Number(costs.rows[0]?.total || 0),
      calls: Number(costs.rows[0]?.calls || 0),
    },
    planDistribution: planStats.rows.map((r: any) => ({
      name: r.name,
      subscribers: Number(r.subscribers),
    })),
  });
}

// ========================================
// ENHANCED DASHBOARD METRICS (Supabase + Turso)
// ========================================
const PLAN_COLORS: Record<string, string> = {
  free: '#94a3b8',
  basico: '#22c55e',
  pro: '#3b82f6',
  executive: '#a855f7',
  suspended: '#ef4444',
};

const PLAN_PRICES: Record<string, number> = {
  basico: 20,
  pro: 40,
  executive: 60,
};

async function handleDashboardMetrics() {
  // Default zeroed result
  const zeroResult = {
    totalUsers: 0,
    newToday: 0,
    mrr: 0,
    messages24h: 0,
    apiCost30d: { total: 0, calls: 0 },
    planDistribution: [] as { name: string; count: number; color: string }[],
  };

  // --- Supabase queries ---
  let supabaseData: {
    totalUsers: number;
    newToday: number;
    planDistribution: { name: string; count: number; color: string }[];
  } | null = null;

  if (supabase) {
    try {
      // Total profiles count
      const { count: totalCount, error: countErr } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (countErr) throw countErr;

      // New today: created_at >= today
      const todayISO = new Date().toISOString().slice(0, 10);
      const { count: newTodayCount, error: todayErr } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO);

      if (todayErr) throw todayErr;

      // Plan distribution
      const { data: planRows, error: planErr } = await supabase
        .from('profiles')
        .select('plan_type');

      if (planErr) throw planErr;

      const planCounts: Record<string, number> = {
        free: 0,
        basico: 0,
        pro: 0,
        executive: 0,
        suspended: 0,
      };

      for (const row of planRows || []) {
        const p = (row.plan_type as string) || 'free';
        if (p in planCounts) {
          planCounts[p]++;
        } else {
          planCounts.free++;
        }
      }

      const planDistribution = Object.entries(planCounts).map(([name, count]) => ({
        name,
        count,
        color: PLAN_COLORS[name] || '#94a3b8',
      }));

      supabaseData = {
        totalUsers: totalCount || 0,
        newToday: newTodayCount || 0,
        planDistribution,
      };
    } catch (err) {
      console.error('[DASHBOARD_METRICS] Supabase error:', err);
      supabaseData = null;
    }
  }

  // --- Turso queries ---
  let tursoData: {
    messages24h: number;
    apiCost30d: { total: number; calls: number };
  } | null = null;

  try {
    const [messages, costs] = await Promise.all([
      db.execute(`SELECT COUNT(*) as total FROM Message WHERE timestamp >= datetime('now', '-24 hours')`),
      db.execute(`
        SELECT COALESCE(SUM(costUsd), 0) as total, COUNT(*) as calls
        FROM ApiUsage WHERE createdAt >= datetime('now', '-30 days')
      `),
    ]);

    tursoData = {
      messages24h: Number(messages.rows[0]?.total || 0),
      apiCost30d: {
        total: Number(costs.rows[0]?.total || 0),
        calls: Number(costs.rows[0]?.calls || 0),
      },
    };
  } catch (err) {
    console.error('[DASHBOARD_METRICS] Turso error:', err);
    tursoData = null;
  }

  // --- Merge results ---
  const planDist = supabaseData?.planDistribution || zeroResult.planDistribution;

  // Calculate MRR from plan distribution
  let mrr = 0;
  for (const p of planDist) {
    mrr += (p.count * (PLAN_PRICES[p.name] || 0));
  }

  return NextResponse.json({
    totalUsers: supabaseData?.totalUsers ?? zeroResult.totalUsers,
    newToday: supabaseData?.newToday ?? zeroResult.newToday,
    mrr,
    messages24h: tursoData?.messages24h ?? zeroResult.messages24h,
    apiCost30d: tursoData?.apiCost30d ?? zeroResult.apiCost30d,
    planDistribution: planDist,
  });
}

// ========================================
// USER LIST (Enhanced with Supabase profiles)
// ========================================
const PLAN_BADGES: Record<string, { label: string; variant: string }> = {
  free: { label: 'Free', variant: 'secondary' },
  basico: { label: 'Básico', variant: 'default' },
  pro: { label: 'Pro', variant: 'default' },
  executive: { label: 'Executive', variant: 'default' },
  suspended: { label: 'Suspendido', variant: 'destructive' },
};

async function handleUsers() {
  // Turso: AuthUser with session count
  const result = await db.execute(`
    SELECT u.id, u.email, u.name, u.isAdmin, u.tenantId, u.createdAt,
           COUNT(s.id) as sessionCount, u.googleId
    FROM AuthUser u
    LEFT JOIN Session s ON s.tenantId = u.tenantId
    GROUP BY u.id
    ORDER BY u.createdAt DESC
    LIMIT 100
  `);

  // Supabase: profiles (plan_type, trial_plan, trial_ends_at)
  let profilesMap: Record<string, { plan_type: string | null; trial_plan: string | null; trial_ends_at: string | null }> = {};
  if (supabase) {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, plan_type, trial_plan, trial_ends_at');

      if (!error && profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = {
            plan_type: p.plan_type,
            trial_plan: p.trial_plan,
            trial_ends_at: p.trial_ends_at,
          };
        }
      }
    } catch (err) {
      console.error('[USERS] Supabase error:', err);
    }
  }

  const users = result.rows.map((r: any) => {
    const profile = profilesMap[r.tenantId] || {};
    const planType = (profile.plan_type as string) || 'free';
    const badge = PLAN_BADGES[planType] || PLAN_BADGES.free;

    return {
      id: r.id,
      email: r.email,
      name: r.name,
      isAdmin: Boolean(r.isAdmin),
      tenantId: r.tenantId,
      createdAt: r.createdAt,
      sessionCount: Number(r.sessionCount || 0),
      isGoogle: Boolean(r.googleId),
      // Supabase enrichment
      planType,
      trialPlan: profile.trial_plan || null,
      trialEndsAt: profile.trial_ends_at || null,
      planBadge: badge,
    };
  });

  return NextResponse.json({ users });
}

// ========================================
// USER SESSIONS
// ========================================
async function handleUserSessions(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
  }

  const result = await db.execute(
    `SELECT id, title, createdAt, updatedAt FROM Session WHERE tenantId = ? ORDER BY createdAt DESC LIMIT 50`,
    [tenantId]
  );

  const sessions = result.rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ sessions });
}

// ========================================
// SUBSCRIPTION PLANS (Turso)
// ========================================
async function handlePlans() {
  const result = await db.execute(
    'SELECT * FROM SubscriptionPlan WHERE isActive = 1 ORDER BY sortOrder ASC'
  );

  const plans = result.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    currency: r.currency || 'PEN',
    maxMessages: Number(r.maxMessages),
    features: JSON.parse((r.features || '[]') as string),
    sortOrder: Number(r.sortOrder),
  }));

  return NextResponse.json({ plans });
}

// ========================================
// APP CONFIG (Turso)
// ========================================
async function handleConfig() {
  const result = await db.execute('SELECT key, value FROM AppConfig');
  const config: Record<string, string> = {};
  result.rows.forEach((r: any) => { config[r.key] = r.value; });
  return NextResponse.json({ config });
}

// ========================================
// USER SUBSCRIPTION INFO (Turso)
// ========================================
async function handleSubscription(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
  }

  const [sub, usage] = await Promise.all([
    db.execute(
      `SELECT s.*, p.name as planName, p.maxMessages, p.price, p.features
       FROM Subscription s
       JOIN SubscriptionPlan p ON p.id = s.planId
       WHERE s.tenantId = ?`,
      [tenantId]
    ),
    db.execute(
      `SELECT COUNT(*) as total FROM Message m
       JOIN Session s ON s.id = m.sessionId
       WHERE s.tenantId = ? AND m.timestamp >= datetime('now', 'start of month')`,
      [tenantId]
    ),
  ]);

  const subscription = sub.rows.length > 0 ? {
    planName: (sub.rows[0] as any).planName,
    maxMessages: Number((sub.rows[0] as any).maxMessages),
    messagesUsed: Number(usage.rows[0]?.total || 0),
    price: Number((sub.rows[0] as any).price),
    features: JSON.parse(((sub.rows[0] as any).features || '[]') as string),
    status: (sub.rows[0] as any).status,
  } : null;

  return NextResponse.json({
    subscription,
    messagesUsed: Number(usage.rows[0]?.total || 0),
  });
}

// ========================================
// TRIAL STATUS (Supabase)
// ========================================
async function handleTrialStatus(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
  }

  if (!supabase) {
    return NextResponse.json({ trial: null });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('trial_plan, trial_ends_at, plan_type')
      .eq('id', tenantId)
      .single();

    if (!profile) {
      return NextResponse.json({ trial: null });
    }

    // Check if trial is still active
    const now = new Date();
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const isTrialActive = profile.trial_plan && trialEnds && trialEnds > now;

    if (isTrialActive) {
      const hoursLeft = Math.max(0, Math.round((trialEnds!.getTime() - now.getTime()) / (1000 * 60 * 60)));
      return NextResponse.json({
        trial: {
          plan: profile.trial_plan,
          endsAt: profile.trial_ends_at,
          hoursLeft,
          isActive: true,
        },
      });
    }

    return NextResponse.json({ trial: null });
  } catch {
    return NextResponse.json({ trial: null });
  }
}

// ========================================
// PLAN FEATURES (Supabase)
// ========================================
async function handlePlanFeatures() {
  if (!supabase) {
    return NextResponse.json({ features: [] });
  }

  const { data, error } = await supabase
    .from('plan_features')
    .select('*')
    .order('plan_id')
    .order('feature_name');

  if (error) {
    console.error('[PLAN_FEATURES]', error);
    return NextResponse.json({ error: 'Error al obtener features' }, { status: 500 });
  }

  const features = (data || []).map((r: any) => ({
    id: r.id,
    plan_id: r.plan_id,
    feature_name: r.feature_name,
    is_enabled: Boolean(r.is_enabled),
  }));

  return NextResponse.json({ features });
}

// ========================================
// SYSTEM SETTINGS (Supabase)
// ========================================
async function handleSettings() {
  if (!supabase) {
    return NextResponse.json({ settings: [] });
  }

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .order('key');

  if (error) {
    console.error('[SETTINGS]', error);
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 });
  }

  const settings = (data || []).map((r: any) => ({
    key: r.key,
    value: r.value,
    updated_at: r.updated_at,
  }));

  return NextResponse.json({ settings });
}

// ========================================
// POST — Admin Actions
// ========================================
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (!action) {
    return NextResponse.json({ error: 'Acción no especificada' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'grant_trial': return handleGrantTrial(request);
      case 'change_plan': return handleChangePlan(request);
      case 'suspend_user': return handleSuspendUser(request);
      case 'toggle_feature': return handleToggleFeature(request);
      case 'save_settings': return handleSaveSettings(request);
      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('[ADMIN POST]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ========================================
// GRANT TRIAL — Admin gives premium trial
// ========================================
async function handleGrantTrial(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  const { tenantId, trialPlan, durationHours } = body;

  if (!tenantId || !trialPlan || !durationHours) {
    return NextResponse.json(
      { error: 'tenantId, trialPlan y durationHours son obligatorios' },
      { status: 400 }
    );
  }

  const validPlans = ['pro', 'executive'];
  if (!validPlans.includes(trialPlan)) {
    return NextResponse.json(
      { error: 'trialPlan debe ser "pro" o "executive"' },
      { status: 400 }
    );
  }

  const trialEndsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: tenantId,
      trial_plan: trialPlan,
      trial_ends_at: trialEndsAt,
    }, { onConflict: 'id' });

  if (error) {
    console.error('[TRIAL] Supabase error:', error);
    return NextResponse.json({ error: 'Error al otorgar prueba' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    trialPlan,
    trialEndsAt,
    message: `Prueba ${trialPlan} activada por ${durationHours} horas`,
  });
}

// ========================================
// CHANGE PLAN — Force change user's plan
// ========================================
async function handleChangePlan(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  const { tenantId, planType } = body;

  if (!tenantId || !planType) {
    return NextResponse.json(
      { error: 'tenantId y planType son obligatorios' },
      { status: 400 }
    );
  }

  const validPlans = ['free', 'basico', 'pro', 'executive', 'suspended'];
  if (!validPlans.includes(planType)) {
    return NextResponse.json(
      { error: `planType debe ser uno de: ${validPlans.join(', ')}` },
      { status: 400 }
    );
  }

  // Fetch existing profile to preserve trial and is_admin values
  const { data: existing } = await supabase
    .from('profiles')
    .select('trial_plan, trial_ends_at, is_admin')
    .eq('id', tenantId)
    .single();

  const upsertData: Record<string, unknown> = {
    id: tenantId,
    plan_type: planType,
  };

  // Preserve existing fields
  if (existing) {
    if (existing.trial_plan) upsertData.trial_plan = existing.trial_plan;
    if (existing.trial_ends_at) upsertData.trial_ends_at = existing.trial_ends_at;
    if (existing.is_admin !== undefined && existing.is_admin !== null) {
      upsertData.is_admin = existing.is_admin;
    }
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(upsertData, { onConflict: 'id' });

  if (error) {
    console.error('[CHANGE_PLAN] Supabase error:', error);
    return NextResponse.json({ error: 'Error al cambiar plan' }, { status: 500 });
  }

  return NextResponse.json({ success: true, planType });
}

// ========================================
// SUSPEND USER
// ========================================
async function handleSuspendUser(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  const { tenantId } = body;

  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenantId es obligatorio' },
      { status: 400 }
    );
  }

  // Fetch existing profile to preserve other values
  const { data: existing } = await supabase
    .from('profiles')
    .select('trial_plan, trial_ends_at, is_admin')
    .eq('id', tenantId)
    .single();

  const upsertData: Record<string, unknown> = {
    id: tenantId,
    plan_type: 'suspended',
  };

  // Preserve existing fields
  if (existing) {
    if (existing.trial_plan) upsertData.trial_plan = existing.trial_plan;
    if (existing.trial_ends_at) upsertData.trial_ends_at = existing.trial_ends_at;
    if (existing.is_admin !== undefined && existing.is_admin !== null) {
      upsertData.is_admin = existing.is_admin;
    }
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(upsertData, { onConflict: 'id' });

  if (error) {
    console.error('[SUSPEND_USER] Supabase error:', error);
    return NextResponse.json({ error: 'Error al suspender usuario' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Cuenta suspendida' });
}

// ========================================
// TOGGLE FEATURE — Enable/disable a feature for a plan
// ========================================
async function handleToggleFeature(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  const { planId, featureName, isEnabled } = body;

  if (!planId || !featureName || isEnabled === undefined) {
    return NextResponse.json(
      { error: 'planId, featureName e isEnabled son obligatorios' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('plan_features')
    .upsert({
      plan_id: planId,
      feature_name: featureName,
      is_enabled: isEnabled,
    }, { onConflict: 'plan_id,feature_name' });

  if (error) {
    console.error('[TOGGLE_FEATURE] Supabase error:', error);
    return NextResponse.json({ error: 'Error al cambiar feature' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ========================================
// SAVE SETTINGS — Upsert system settings
// ========================================
async function handleSaveSettings(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  const { settings } = body;

  if (!settings || typeof settings !== 'object') {
    return NextResponse.json(
      { error: 'settings (objeto) es obligatorio' },
      { status: 400 }
    );
  }

  const entries = Object.entries(settings);

  if (entries.length === 0) {
    return NextResponse.json({ success: true });
  }

  // Build upsert rows: each setting keyed by "key" column
  const rows = entries.map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    console.error('[SAVE_SETTINGS] Supabase error:', error);
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
