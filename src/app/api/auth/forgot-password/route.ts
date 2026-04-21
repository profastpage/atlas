export const runtime = 'edge';

// ========================================
// FORGOT PASSWORD — Send reset email via Supabase Auth
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/sql';

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Recuperacion no disponible: Supabase no configurado' },
      { status: 503 }
    );
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email es obligatorio' },
        { status: 400 }
      );
    }

    // 1. Check if user exists in Turso
    const result = await db.execute(
      `SELECT id, email, googleId FROM AuthUser WHERE email = ?`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists or not (security best practice)
      return NextResponse.json({
        success: true,
        message: 'Si el email existe, recibiras un enlace de recuperacion.'
      });
    }

    const user = result.rows[0];

    // Google users can't reset password
    if (user.googleId && !user.passwordHash) {
      return NextResponse.json({
        success: true,
        message: 'Si el email existe, recibiras un enlace de recuperacion.'
      });
    }

    // 2. Send reset email via Supabase Auth
    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/update-password`,
    });

    if (error) {
      console.error('[FORGOT_PASSWORD] Supabase error:', error);
      // Still return generic message (don't leak info)
      return NextResponse.json({
        success: true,
        message: 'Si el email existe, recibiras un enlace de recuperacion.'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Se envio el enlace a tu correo. Revisa tu bandeja de entrada o spam.'
    });
  } catch (error) {
    console.error('[FORGOT_PASSWORD]', error);
    return NextResponse.json(
      { error: 'Error interno. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
