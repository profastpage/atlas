export const runtime = 'edge';

// ========================================
// OAUTH CALLBACK — Bridge Supabase Auth → Turso AuthUser
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/sql';
import { generateToken, hashPassword } from '@/lib/password';

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=oauth_unavailable', request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url));
  }

  try {
    // 1. Exchange code for Supabase session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error('[OAUTH_CALLBACK] exchange error:', error);
      return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
    }

    const sbUser = data.session.user;
    const email = sbUser.email?.toLowerCase().trim();
    const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email?.split('@')[0] || 'Usuario';
    const googleId = sbUser.user_metadata?.sub || sbUser.id;
    const avatarUrl = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || null;

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', request.url));
    }

    // 2. Check if user exists in Turso
    const existing = await db.execute(
      `SELECT id, email, tenantId, isAdmin FROM AuthUser WHERE email = ?`,
      [email]
    );

    let userId: string;
    let tenantId: string;
    let isAdmin = false;

    if (existing.rows.length > 0) {
      // Existing user — update Google ID if missing
      userId = existing.rows[0].id as string;
      tenantId = existing.rows[0].tenantId as string;
      isAdmin = Boolean(existing.rows[0].isAdmin);

      await db.execute(
        `UPDATE AuthUser SET googleId = ?, avatarUrl = COALESCE(?, avatarUrl), updatedAt = ? WHERE id = ?`,
        [googleId, avatarUrl, new Date().toISOString(), userId]
      );
    } else {
      // New user — create in Turso
      userId = crypto.randomUUID();
      tenantId = crypto.randomUUID();

      // Create a random password for Turso (Google users don't need it)
      const randomPwd = crypto.randomUUID();
      const passwordHash = await hashPassword(randomPwd);

      await db.execute(
        `INSERT INTO AuthUser (id, email, passwordHash, name, avatarUrl, googleId, tenantId, createdAt, updatedAt, isAdmin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [userId, email, passwordHash, name, avatarUrl, googleId, tenantId, new Date().toISOString(), new Date().toISOString()]
      );

      // Create Supabase profile
      if (supabase) {
        try {
          await supabase.from('profiles').upsert(
            { id: tenantId, plan_type: 'free' },
            { onConflict: 'id' }
          );
        } catch (err) {
          console.error('[OAUTH_CALLBACK] profile upsert:', err);
        }
      }
    }

    // 3. Create Turso auth token (7 days)
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.execute(
      `INSERT INTO AuthToken (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, token, expiresAt.toISOString(), new Date().toISOString()]
    );

    // 4. Redirect to main page with auth data (URL fragment — not sent to server)
    const userData = JSON.stringify({ id: userId, email, name, avatarUrl, isAdmin });
    const encodedUser = encodeURIComponent(userData);
    const redirectTo = `${origin}/?_auth=1&token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}&user=${encodedUser}`;

    return NextResponse.redirect(redirectTo);
  } catch (error) {
    console.error('[OAUTH_CALLBACK]', error);
    return NextResponse.redirect(new URL('/login?error=internal', request.url));
  }
}
