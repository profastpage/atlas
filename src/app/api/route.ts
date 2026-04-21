export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';

// ========================================
// HEALTH CHECK + ADMIN API
// Single route, no extra bundle size
// ========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // ---- DEBUG ENDPOINT (remove after verifying env vars) ----
  if (action === 'debug-env') {
    return NextResponse.json({
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasLlmModel: !!process.env.LLM_MODEL,
      hasQwenKey: !!process.env.QWEN_API_KEY,
      hasQwenUrl: !!process.env.QWEN_BASE_URL,
      nodeEnv: process.env.NODE_ENV || 'not set',
      databaseUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'MISSING',
    });
  }

  // ---- ADMIN ENDPOINTS ----
  if (action) {
    return handleAdminAction(request, action);
  }

  // ---- HEALTH CHECK ----
  return NextResponse.json({ status: 'ok', service: 'Atlas Coach v1.2' });
}

async function handleAdminAction(request: NextRequest, action: string) {
  try {
    switch (action) {
      case 'metrics': return handleMetrics();
      case 'users': return handleUsers();
      case 'plans': return handlePlans();
      case 'config': return handleConfig();
      case 'subscription': return handleSubscription(request);
      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('[ADMIN]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ========================================
// DASHBOARD METRICS
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
// USER LIST
// ========================================
async function handleUsers() {
  const result = await db.execute(`
    SELECT u.id, u.email, u.name, u.isAdmin, u.tenantId, u.createdAt,
           COUNT(s.id) as sessionCount, u.googleId
    FROM AuthUser u
    LEFT JOIN Session s ON s.tenantId = u.tenantId
    GROUP BY u.id
    ORDER BY u.createdAt DESC
    LIMIT 100
  `);

  const users = result.rows.map((r: any) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    isAdmin: Boolean(r.isAdmin),
    tenantId: r.tenantId,
    createdAt: r.createdAt,
    sessionCount: Number(r.sessionCount || 0),
    isGoogle: Boolean(r.googleId),
  }));

  return NextResponse.json({ users });
}

// ========================================
// SUBSCRIPTION PLANS
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
// APP CONFIG
// ========================================
async function handleConfig() {
  const result = await db.execute('SELECT key, value FROM AppConfig');
  const config: Record<string, string> = {};
  result.rows.forEach((r: any) => { config[r.key] = r.value; });
  return NextResponse.json({ config });
}

// ========================================
// USER SUBSCRIPTION INFO
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
