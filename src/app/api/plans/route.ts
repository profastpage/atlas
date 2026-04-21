export const runtime = 'edge';

// ========================================
// SUBSCRIPTION PLANS — Public listing + Admin CRUD
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

// ========================================
// GET /api/plans — List active plans (public)
// ========================================

export async function GET() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        maxMessages: p.maxMessages,
        features: JSON.parse(p.features),
        sortOrder: p.sortOrder,
      })),
    });
  } catch (error) {
    console.error('[PLANS] List error:', error);
    return NextResponse.json(
      { error: 'Error al obtener planes' },
      { status: 500 }
    );
  }
}

// ========================================
// POST /api/plans — Create/Update plan (admin only)
// ========================================

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const admin = await getAdminUser(authHeader);

    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, price, currency, maxMessages, features, isActive, sortOrder } = body;

    if (!name || price === undefined) {
      return NextResponse.json(
        { error: 'name y price son obligatorios' },
        { status: 400 }
      );
    }

    const planData = {
      name,
      price,
      currency: currency || 'PEN',
      maxMessages: maxMessages ?? -1,
      features: JSON.stringify(features || []),
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
    };

    // If id provided, update; otherwise create
    if (id) {
      const plan = await db.subscriptionPlan.update({
        where: { id },
        data: planData,
      });
      return NextResponse.json({ success: true, plan });
    } else {
      const plan = await db.subscriptionPlan.create({
        data: planData,
      });
      return NextResponse.json({ success: true, plan }, { status: 201 });
    }
  } catch (error) {
    console.error('[PLANS] Create/Update error:', error);
    return NextResponse.json(
      { error: 'Error al gestionar plan' },
      { status: 500 }
    );
  }
}
