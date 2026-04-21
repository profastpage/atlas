export const runtime = 'edge';

// ========================================
// ME — Validar token / Obtener usuario actual
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    // Buscar token
    const authToken = await db.authToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!authToken) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Verificar expiración
    if (new Date() > authToken.expiresAt) {
      await db.authToken.delete({ where: { id: authToken.id } });
      return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 });
    }

    const user = authToken.user;

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        tenantId: user.tenantId,
        googleId: user.googleId,
      },
    });
  } catch (error) {
    console.error('[AUTH] Me error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
