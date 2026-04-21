export const runtime = 'edge';

// ========================================
// UPDATE PASSWORD — Update via Supabase Auth + Turso sync
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/sql';
import { hashPassword, verifyPassword } from '@/lib/password';

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Servicio no disponible' },
      { status: 503 }
    );
  }

  try {
    const { password, confirmPassword } = await request.json();

    if (!password || !confirmPassword) {
      return NextResponse.json(
        { error: 'Ambos campos son obligatorios' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Las contrasenas no coinciden' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contrasena debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // 1. Update in Supabase Auth
    const { data, error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('[UPDATE_PASSWORD] Supabase error:', error);
      return NextResponse.json(
        { error: error.message || 'Error al actualizar la contrasena' },
        { status: 400 }
      );
    }

    // 2. Sync password in Turso (for login fallback)
    const email = data.user?.email?.toLowerCase().trim();
    if (email) {
      try {
        const newHash = await hashPassword(password);
        await db.execute(
          `UPDATE AuthUser SET passwordHash = ?, updatedAt = ? WHERE email = ?`,
          [newHash, new Date().toISOString(), email]
        );
      } catch (err) {
        console.error('[UPDATE_PASSWORD] Turso sync error:', err);
        // Non-critical — Supabase Auth is primary for this user
      }
    }

    // 3. Sign out Supabase session
    await supabase.auth.signOut();

    return NextResponse.json({
      success: true,
      message: 'Contrasena actualizada correctamente'
    });
  } catch (error) {
    console.error('[UPDATE_PASSWORD]', error);
    return NextResponse.json(
      { error: 'Error interno. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
