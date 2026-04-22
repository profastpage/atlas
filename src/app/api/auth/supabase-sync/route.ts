export const runtime = 'edge';

// ========================================
// SUPABASE SYNC — Exchange Supabase session for Turso token
// Used by client-side OAuth flow (Google sign-in via Supabase client)
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase';
import { db } from '@/lib/sql';
import { generateToken, hashPassword } from '@/lib/password';

const APP_URL = 'https://atlas-9mv.pages.dev';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'AccessToken requerido' }, { status: 400 });
    }

    // Create a Supabase client with the user's access token
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[SUPABASE_SYNC] Missing Supabase env vars');
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const userClient: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });

    // Get user info from Supabase
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error('[SUPABASE_SYNC] Invalid token:', userError?.message);
      return NextResponse.json({ error: 'Token de Supabase invalido' }, { status: 401 });
    }

    const email = user.email?.toLowerCase().trim();
    const name = user.user_metadata?.full_name || user.user_metadata?.name || email?.split('@')[0] || 'Usuario';
    const googleId = user.user_metadata?.sub || user.id;
    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

    if (!email) {
      return NextResponse.json({ error: 'No se pudo obtener el email' }, { status: 400 });
    }

    // Check/create user in Turso
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

      // Update Google ID and avatar
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

      // Create profile in Supabase
      try {
        const supabaseAdmin = getSupabaseServer();
        if (supabaseAdmin) {
          await supabaseAdmin.from('profiles').upsert(
            { id: tenantId, plan_type: 'free' },
            { onConflict: 'id' }
          );
        }
      } catch (err) {
        console.error('[SUPABASE_SYNC] Profile upsert:', err);
      }
    }

    // Create Turso auth token (7 days)
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.execute(
      `INSERT INTO AuthToken (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, token, expiresAt.toISOString(), new Date().toISOString()]
    );

    // Create UserMemory if not exists (so Atlas uses the name immediately)
    try {
      const memExisting = await db.execute(`SELECT id FROM UserMemory WHERE tenantId = ?`, [tenantId]);
      if (memExisting.rows.length === 0) {
        await db.execute(
          `INSERT INTO UserMemory (id, tenantId, userName, contextSummary, updatedAt) VALUES (?, ?, ?, '', ?)`,
          [crypto.randomUUID(), tenantId, name, new Date().toISOString()]
        );
      } else {
        // Update name if empty
        await db.execute(
          `UPDATE UserMemory SET userName = COALESCE(NULLIF(userName, ''), ?), updatedAt = ? WHERE tenantId = ? AND (userName IS NULL OR userName = '')`,
          [name, new Date().toISOString(), tenantId]
        );
      }
    } catch {}

    const userData = { id: userId, email, name, avatarUrl, isAdmin };

    return NextResponse.json({
      success: true,
      token,
      tenantId,
      user: userData,
    });
  } catch (error) {
    console.error('[SUPABASE_SYNC] Fatal error:', error);
    const msg = error instanceof Error ? error.message : 'internal_error';
    return NextResponse.json({ error: `Error interno: ${msg}` }, { status: 500 });
  }
}
