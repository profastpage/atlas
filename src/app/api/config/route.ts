export const runtime = 'edge';

// ========================================
// APP CONFIG — Global configuration
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
// GET /api/config — Get all config (public for basic keys)
// ========================================

export async function GET() {
  try {
    const configs = await db.appConfig.findMany({
      orderBy: { key: 'asc' },
    });

    // Build a key-value map, but hide sensitive keys for public access
    const publicKeys = [
      'app_name',
      'app_description',
      'maintenance_mode',
      'max_free_messages',
      'welcome_message',
    ];

    const publicConfig: Record<string, string> = {};
    for (const c of configs) {
      if (publicKeys.includes(c.key)) {
        publicConfig[c.key] = c.value;
      }
    }

    return NextResponse.json({ config: publicConfig });
  } catch (error) {
    console.error('[CONFIG] Get error:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

// ========================================
// PUT /api/config — Update config (admin only)
// ========================================

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const admin = await getAdminUser(authHeader);

    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { configs } = body as { configs: Record<string, string> };

    if (!configs || typeof configs !== 'object') {
      return NextResponse.json(
        { error: 'configs es obligatorio (objeto clave-valor)' },
        { status: 400 }
      );
    }

    const updatedConfigs: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(configs)) {
      // Upsert each config entry
      const existing = await db.appConfig.findUnique({
        where: { key },
      });

      if (existing) {
        await db.appConfig.update({
          where: { key },
          data: { value },
        });
      } else {
        await db.appConfig.create({
          data: { key, value },
        });
      }

      updatedConfigs.push({ key, value });
    }

    return NextResponse.json({
      success: true,
      updated: updatedConfigs.length,
      configs: updatedConfigs,
    });
  } catch (error) {
    console.error('[CONFIG] Update error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
