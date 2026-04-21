export const runtime = 'edge';

// ========================================
// GOOGLE OAUTH — Generate Supabase OAuth URL
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'OAuth no disponible: Supabase no configurado' },
      { status: 503 }
    );
  }

  const origin = new URL(request.url).origin;

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error) {
      console.error('[GOOGLE_OAUTH]', error);
      return NextResponse.json(
        { error: 'Error al iniciar OAuth con Google' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.url });
  } catch (error) {
    console.error('[GOOGLE_OAUTH]', error);
    return NextResponse.json(
      { error: 'Error al conectar con Google' },
      { status: 500 }
    );
  }
}
