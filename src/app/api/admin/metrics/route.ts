export const runtime = 'edge';

// ========================================
// ADMIN METRICS — Dashboard statistics
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Helper: get authenticated admin from token
async function getAdminUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const authToken = await db.authToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!authToken || new Date() > authToken.expiresAt) return null;
  if (!authToken.user.isAdmin) return null;
  return authToken.user;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const admin = await getAdminUser(authHeader);

    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // ---- USER METRICS ----
    const totalUsers = await db.authUser.count();
    const newUsersThisMonth = await db.authUser.count({
      where: {
        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    });

    // ---- SUBSCRIPTION METRICS ----
    const activeSubscriptions = await db.subscription.count({
      where: {
        status: { in: ['active', 'trialing'] },
      },
    });

    const allSubscriptions = await db.subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      include: { plan: true },
    });

    const revenueThisMonth = allSubscriptions.reduce((sum, sub) => sum + sub.plan.price, 0);

    // Plan breakdown
    const planBreakdown: Record<string, number> = {};
    for (const sub of allSubscriptions) {
      const planName = sub.plan.name;
      planBreakdown[planName] = (planBreakdown[planName] || 0) + 1;
    }

    // ---- MESSAGE METRICS ----
    const totalMessages = await db.message.count();

    // ---- API USAGE / COSTS ----
    const apiUsageThisMonth = await db.apiUsage.aggregate({
      _sum: { costUsd: true, tokensIn: true, tokensOut: true },
      where: {
        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    });

    const totalApiCost = apiUsageThisMonth._sum.costUsd || 0;
    const totalTokensIn = apiUsageThisMonth._sum.tokensIn || 0;
    const totalTokensOut = apiUsageThisMonth._sum.tokensOut || 0;

    // Monthly cost history (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyApiCosts = await db.apiUsage.groupBy({
      by: ['type'],
      _sum: { costUsd: true },
      where: {
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
    });

    // Cost metrics from admin entries
    const costMetrics = await db.costMetric.findMany({
      where: { month: currentMonth },
    });

    const hostingCost = costMetrics.find((c) => c.category === 'hosting')?.amountUsd || 0;
    const adsCost = costMetrics.find((c) => c.category === 'ads')?.amountUsd || 0;
    const totalCosts = hostingCost + totalApiCost + adsCost;

    // ---- SESSION METRICS ----
    const totalSessions = await db.session.count();
    const activeSessions = await db.session.count({
      where: { isActive: true },
    });

    return NextResponse.json({
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
      },
      subscriptions: {
        active: activeSubscriptions,
        revenueThisMonth,
        revenueCurrency: 'PEN',
        planBreakdown,
      },
      messages: {
        total: totalMessages,
      },
      sessions: {
        total: totalSessions,
        active: activeSessions,
      },
      apiUsage: {
        currentMonth: {
          costUsd: totalApiCost,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
        },
        byType: monthlyApiCosts.map((m) => ({
          type: m.type,
          costUsd: m._sum.costUsd || 0,
        })),
      },
      costs: {
        hostingUsd: hostingCost,
        apiUsd: totalApiCost,
        adsUsd: adsCost,
        totalUsd: totalCosts,
        month: currentMonth,
      },
      period: {
        currentMonth,
        fetchedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('[ADMIN] Metrics error:', error);
    return NextResponse.json(
      { error: 'Error al obtener métricas' },
      { status: 500 }
    );
  }
}
