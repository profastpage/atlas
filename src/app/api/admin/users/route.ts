export const runtime = 'edge';

// ========================================
// ADMIN USERS — User management
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
// GET /api/admin/users — List all users
// ========================================

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const admin = await getAdminUser(authHeader);

    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const users = await db.authUser.findMany({
      include: {
        tenant: {
          include: {
            subscriptions: {
              include: { plan: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const usersWithSubscription = users.map((user) => {
      const subscription = user.tenant.subscriptions[0] || null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        googleId: user.googleId,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                price: subscription.plan.price,
                currency: subscription.plan.currency,
              },
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              autoRenew: subscription.autoRenew,
            }
          : null,
        messageCount: 0, // Will be populated client-side or via separate query
      };
    });

    return NextResponse.json({ users: usersWithSubscription });
  } catch (error) {
    console.error('[ADMIN] Users list error:', error);
    return NextResponse.json(
      { error: 'Error al obtener usuarios' },
      { status: 500 }
    );
  }
}

// ========================================
// PATCH /api/admin/users — Update user
// ========================================

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const admin = await getAdminUser(authHeader);

    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, isAdmin, subscriptionStatus, planId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId es obligatorio' },
        { status: 400 }
      );
    }

    // Prevent admins from removing their own admin status
    if (userId === admin.id && isAdmin === false) {
      return NextResponse.json(
        { error: 'No puedes revocar tu propio acceso de administrador' },
        { status: 400 }
      );
    }

    // Update isAdmin flag
    if (typeof isAdmin === 'boolean') {
      await db.authUser.update({
        where: { id: userId },
        data: { isAdmin },
      });
    }

    // Update subscription status or plan
    if (subscriptionStatus || planId) {
      const user = await db.authUser.findUnique({
        where: { id: userId },
        include: { tenant: { include: { subscriptions: true } } },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'Usuario no encontrado' },
          { status: 404 }
        );
      }

      const existingSub = user.tenant.subscriptions[0];

      if (existingSub) {
        const updateData: Record<string, unknown> = {};
        if (subscriptionStatus) updateData.status = subscriptionStatus;
        if (planId) updateData.planId = planId;
        await db.subscription.update({
          where: { id: existingSub.id },
          data: updateData,
        });
      } else if (planId) {
        // Create subscription if none exists
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);

        await db.subscription.create({
          data: {
            tenantId: user.tenantId,
            planId,
            status: subscriptionStatus || 'active',
            startDate: now,
            endDate,
          },
        });
      }
    }

    // Return updated user
    const updatedUser = await db.authUser.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          include: {
            subscriptions: { include: { plan: true } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('[ADMIN] User update error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar usuario' },
      { status: 500 }
    );
  }
}

// ========================================
// DELETE /api/admin/users — Delete user
// ========================================

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const admin = await getAdminUser(authHeader);

    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId es obligatorio' },
        { status: 400 }
      );
    }

    // Prevent self-deletion
    if (userId === admin.id) {
      return NextResponse.json(
        { error: 'No puedes eliminar tu propia cuenta de administrador' },
        { status: 400 }
      );
    }

    // Delete all auth tokens for the user
    await db.authToken.deleteMany({ where: { userId } });

    // Delete the user (cascades to tenant, subscriptions, etc.)
    await db.authUser.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ADMIN] User delete error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar usuario' },
      { status: 500 }
    );
  }
}
