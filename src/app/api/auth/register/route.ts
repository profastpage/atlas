export const runtime = 'edge';

// ========================================
// REGISTER — Direct SQL via libsql
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';
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

    // Validar password
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // Verificar si ya existe
    const existing = await db.execute(
      `SELECT id FROM AuthUser WHERE email = ?`,
      [emailLower]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'Este email ya está registrado' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Crear Tenant
    const tenantId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO Tenant (id, createdAt, updatedAt) VALUES (?, ?, ?)`,
      [tenantId, now, now]
    );

    // Crear AuthUser
    const userId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO AuthUser (id, email, passwordHash, name, googleId, avatarUrl, createdAt, updatedAt, isAdmin, tenantId)
       VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?)`,
      [userId, emailLower, passwordHash, (name || '').trim(), now, now, 0, tenantId]
    );

    // Crear UserMemory vacío
    const memId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO UserMemory (id, tenantId, userName, contextSummary, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      [memId, tenantId, (name || '').trim(), '', now]
    );

    // Crear token de sesión (7 días)
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO AuthToken (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [tokenId, userId, token, expiresAt.toISOString(), now]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: emailLower,
        name: (name || '').trim(),
        avatarUrl: '',
        isAdmin: false,
      },
      token,
      tenantId,
    });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    return NextResponse.json(
      { error: 'Error al crear cuenta' },
      { status: 500 }
    );
  }
}
