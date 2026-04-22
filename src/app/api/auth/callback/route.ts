export const runtime = 'edge';

// ========================================
// OAUTH CALLBACK — Bridge Supabase Auth → Turso AuthUser
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { db } from '@/lib/sql';
import { generateToken, hashPassword } from '@/lib/password';

const APP_URL = 'https://atlas-9mv.pages.dev';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');

  // Log full URL for debugging OAuth issues
  console.log('[OAUTH_CALLBACK] Full URL:', request.url);
  console.log('[OAUTH_CALLBACK] Params:', Object.fromEntries(searchParams.entries()));

  // If Supabase itself returned an error in the callback
  if (errorParam) {
    console.error('[OAUTH_CALLBACK] Supabase error param:', errorParam);
    const desc = searchParams.get('error_description') || errorParam;
    return NextResponse.redirect(`${APP_URL}/?_auth_error=${encodeURIComponent(desc)}`);
  }

  if (!code) {
    // Log additional context to help diagnose
    console.warn('[OAUTH_CALLBACK] No code parameter received. Full searchParams:', request.url);
    console.warn('[OAUTH_CALLBACK] Possible causes: redirect URL not configured in Supabase, browser blocked cookies, or user directly accessed callback URL.');
    // Redirect with clear error message
    return NextResponse.redirect(`${APP_URL}/?_auth_error=no_code`);
  }

  let supabase;
  try {
    supabase = getSupabaseServer();
  } catch (err) {
    console.error('[OAUTH_CALLBACK] getSupabaseServer failed:', err);
    return NextResponse.redirect(`${APP_URL}/?_auth_error=supabase_init`);
  }

  if (!supabase) {
    return NextResponse.redirect(`${APP_URL}/?_auth_error=supabase_null`);
  }

  try {
    // 1. Exchange code for Supabase session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error('[OAUTH_CALLBACK] exchange error:', error);
      return NextResponse.redirect(`${APP_URL}/?_auth_error=exchange_failed:${encodeURIComponent(error?.message || 'unknown')}`);
    }

    const sbUser = data.session.user;
    const email = sbUser.email?.toLowerCase().trim();
    const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email?.split('@')[0] || 'Usuario';
    const googleId = sbUser.user_metadata?.sub || sbUser.id;
    const avatarUrl = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || null;

    if (!email) {
      return NextResponse.redirect(`${APP_URL}/?_auth_error=no_email`);
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
      userId = existing.rows[0].id as string;
      tenantId = existing.rows[0].tenantId as string;
      isAdmin = Boolean(existing.rows[0].isAdmin);

      await db.execute(
        `UPDATE AuthUser SET googleId = ?, avatarUrl = COALESCE(?, avatarUrl), updatedAt = ? WHERE id = ?`,
        [googleId, avatarUrl, new Date().toISOString(), userId]
      );
    } else {
      userId = crypto.randomUUID();
      tenantId = crypto.randomUUID();

      const randomPwd = crypto.randomUUID();
      const passwordHash = await hashPassword(randomPwd);

      await db.execute(
        `INSERT INTO AuthUser (id, email, passwordHash, name, avatarUrl, googleId, tenantId, createdAt, updatedAt, isAdmin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [userId, email, passwordHash, name, avatarUrl, googleId, tenantId, new Date().toISOString(), new Date().toISOString()]
      );

      try {
        await supabase.from('profiles').upsert(
          { id: tenantId, plan_type: 'free' },
          { onConflict: 'id' }
        );
      } catch (err) {
        console.error('[OAUTH_CALLBACK] profile upsert:', err);
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

    // 4. Redirect to main page with auth data
    const userData = JSON.stringify({ id: userId, email, name, avatarUrl, isAdmin });
    const encodedUser = encodeURIComponent(userData);
    const redirectTo = `${APP_URL}/?_auth=1&token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}&user=${encodedUser}`;

    return NextResponse.redirect(redirectTo);
  } catch (error) {
    console.error('[OAUTH_CALLBACK] fatal:', error);
    const msg = error instanceof Error ? error.message : 'internal_error';
    return NextResponse.redirect(`${APP_URL}/?_auth_error=catch:${encodeURIComponent(msg)}`);
  }
}
