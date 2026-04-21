export const runtime = 'edge';

// ========================================
// ADMIN LOGIN — Authenticate admin users
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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

    // Find admin user
    const user = await db.authUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: 'Credenciales de administrador inválidas' },
        { status: 401 }
      );
    }

    // Verify password
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'Esta cuenta no tiene contraseña configurada' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Credenciales de administrador inválidas' },
        { status: 401 }
      );
    }

    // Create admin session token (24 hours)
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    await db.authToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
      },
      token,
      tenantId: user.tenantId,
    });
  } catch (error) {
    console.error('[ADMIN] Login error:', error);
    return NextResponse.json(
      { error: 'Error al iniciar sesión como administrador' },
      { status: 500 }
    );
  }
}
