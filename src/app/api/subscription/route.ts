export const runtime = 'edge';

// ========================================
// SUBSCRIPTION — Current user's subscription
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Helper: get authenticated user from token
async function getAuthUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const authToken = await db.authToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!authToken || new Date() > authToken.expiresAt) return null;
  return authToken.user;
}

// ========================================
// GET /api/subscription — Get user's subscription
// ========================================

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const user = await getAuthUser(authHeader);

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const subscription = await db.subscription.findUnique({
      where: { tenantId: user.tenantId },
      include: {
        plan: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    // If no subscription exists, return default free plan info
    if (!subscription) {
      return NextResponse.json({
        subscription: {
          status: 'free',
          plan: {
            name: 'Gratis',
            price: 0,
            currency: 'PEN',
            maxMessages: 50,
            features: ['Acceso básico', '50 mensajes/mes'],
          },
          messagesUsed: 0,
          messagesLimit: 50,
          endDate: null,
          autoRenew: false,
          payments: [],
        },
      });
    }

    // Count messages for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const messagesUsed = await db.message.count({
      where: {
        session: {
          tenantId: user.tenantId,
        },
        timestamp: {
          gte: monthStart,
        },
        role: 'user',
      },
    });

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          price: subscription.plan.price,
          currency: subscription.plan.currency,
          maxMessages: subscription.plan.maxMessages,
          features: JSON.parse(subscription.plan.features),
        },
        messagesUsed,
        messagesLimit: subscription.plan.maxMessages === -1 ? -1 : subscription.plan.maxMessages,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        autoRenew: subscription.autoRenew,
        payments: subscription.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          method: p.method,
          reference: p.reference,
          createdAt: p.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Get error:', error);
    return NextResponse.json(
      { error: 'Error al obtener suscripción' },
      { status: 500 }
    );
  }
}
