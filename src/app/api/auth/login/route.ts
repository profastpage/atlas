export const runtime = 'edge';

// ========================================
// LOGIN — Direct SQL via libsql
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';
import { verifyPassword, generateToken } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son obligatorios' },
        { status: 400 }
      );
    }

    // Buscar usuario
    const result = await db.execute(
      `SELECT u.id, u.email, u.passwordHash, u.name, u.avatarUrl, u.googleId, u.tenantId
       FROM AuthUser u WHERE u.email = ?`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Email o contraseña incorrectos' },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    // Si es cuenta de Google y no tiene password
    if (!user.passwordHash && user.googleId) {
      return NextResponse.json(
        { error: 'Esta cuenta se registró con Google. Usa el botón de Google para iniciar sesión.' },
        { status: 400 }
      );
    }

    // Verificar password
    const isValid = await verifyPassword(password, user.passwordHash as string);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Email o contraseña incorrectos' },
        { status: 401 }
      );
    }

    // Crear token de sesión (7 días)
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO AuthToken (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [tokenId, user.id, token, expiresAt.toISOString(), new Date().toISOString()]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      token,
      tenantId: user.tenantId,
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    // Return detailed error for debugging (remove after fixing)
    return NextResponse.json(
      { error: 'Error al iniciar sesión', detail: msg, stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined },
      { status: 500 }
    );
  }
}
