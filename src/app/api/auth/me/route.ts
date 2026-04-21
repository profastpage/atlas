export const runtime = 'edge';

// ========================================
// ME — Token validation — Direct SQL via libsql
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    // Buscar token + usuario (incluyendo isAdmin)
    const result = await db.execute(
      `SELECT t.id as tokenId, t.expiresAt, u.id as userId, u.email, u.name, u.avatarUrl, u.tenantId, u.googleId, u.isAdmin
       FROM AuthToken t
       JOIN AuthUser u ON u.id = t.userId
       WHERE t.token = ?`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const row = result.rows[0];

    // Verificar expiración
    const expiresAt = new Date(row.expiresAt as string);
    if (new Date() > expiresAt) {
      await db.execute(`DELETE FROM AuthToken WHERE id = ?`, [row.tokenId]);
      return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: row.userId,
        email: row.email,
        name: row.name,
        avatarUrl: row.avatarUrl,
        tenantId: row.tenantId,
        googleId: row.googleId,
        isAdmin: Boolean(row.isAdmin),
      },
    });
  } catch (error) {
    console.error('[AUTH] Me error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
