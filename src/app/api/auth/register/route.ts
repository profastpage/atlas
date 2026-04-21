export const runtime = 'edge';

// ========================================
// REGISTER — Crear cuenta nueva
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son obligatorios' },
        { status: 400 }
      );
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    // Validar password (mínimo 6 chars)
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Verificar si el email ya existe
    const existingUser = await db.authUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Este email ya está registrado' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Crear Tenant + AuthUser + UserMemory en una transacción
    const user = await db.authUser.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        name: (name || '').trim(),
        tenant: {
          create: {},
        },
      },
      include: { tenant: { include: { userMemory: true } } },
    });

    // Crear UserMemory vacío
    if (user.tenant) {
      await db.userMemory.create({
        data: {
          tenantId: user.tenant.id,
          userName: (name || '').trim(),
        },
      });
    }

    // Crear token de sesión (7 días)
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

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
      },
      token,
      tenantId: user.tenantId,
    });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    return NextResponse.json(
      { error: 'Error al crear cuenta' },
      { status: 500 }
    );
  }
}
