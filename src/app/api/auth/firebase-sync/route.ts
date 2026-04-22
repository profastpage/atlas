export const runtime = 'edge';

// ========================================
// FIREBASE SYNC — Exchange Firebase ID token for Turso auth
// Used by client-side Firebase Google Auth (signInWithPopup)
//
// VERIFICATION METHOD: Google tokeninfo endpoint
// - 100% Edge compatible (no Buffer, no crypto imports)
// - Simple fetch to https://oauth2.googleapis.com/tokeninfo?id_token=XXX
// - Returns email, name, picture, sub directly
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';
import { generateToken, hashPassword } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Firebase ID token requerido' }, { status: 400 });
    }

    // ---- VERIFY FIREBASE ID TOKEN ----
    // Use Google's tokeninfo endpoint — simple, reliable, Edge compatible
    let email: string;
    let name: string;
    let googleId: string;
    let avatarUrl: string | null;

    try {
      const verifyResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );

      if (!verifyResponse.ok) {
        const errData = await verifyResponse.json().catch(() => ({}));
        console.error('[FIREBASE_SYNC] tokeninfo error:', verifyResponse.status, errData);
        return NextResponse.json(
          { error: 'Token de Firebase invalido o expirado' },
          { status: 401 }
        );
      }

      const tokenInfo = await verifyResponse.json();

      // Validate audience matches our Firebase project
      if (tokenInfo.aud !== 'asistente-ia-atlas-23dac') {
        console.error('[FIREBASE_SYNC] Wrong audience:', tokenInfo.aud);
        return NextResponse.json(
          { error: 'Token no pertenece a este proyecto' },
          { status: 401 }
        );
      }

      email = tokenInfo.email?.toLowerCase().trim() || '';
      name = tokenInfo.name || tokenInfo.given_name || email.split('@')[0] || 'Usuario';
      googleId = tokenInfo.sub || '';
      avatarUrl = tokenInfo.picture || null;

      if (!email) {
        return NextResponse.json({ error: 'No se pudo obtener el email de Firebase' }, { status: 400 });
      }
    } catch (err) {
      console.error('[FIREBASE_SYNC] Token verification failed:', err);
      return NextResponse.json({ error: 'Error al verificar token de Firebase' }, { status: 401 });
    }

    // ---- CHECK/CREATE USER IN TURSO ----
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

      // Create UserMemory for immediate personalization
      try {
        const memExisting = await db.execute(`SELECT id FROM UserMemory WHERE tenantId = ?`, [tenantId]);
        if (memExisting.rows.length === 0) {
          await db.execute(
            `INSERT INTO UserMemory (id, tenantId, userName, contextSummary, updatedAt) VALUES (?, ?, ?, '', ?)`,
            [crypto.randomUUID(), tenantId, name, new Date().toISOString()]
          );
        }
      } catch (memErr) {
        console.error('[FIREBASE_SYNC] UserMemory creation failed:', memErr);
      }
    }

    // ---- CREATE TURSO AUTH TOKEN (7 days) ----
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.execute(
      `INSERT INTO AuthToken (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, token, expiresAt.toISOString(), new Date().toISOString()]
    );

    const userData = { id: userId, email, name, avatarUrl, isAdmin };

    return NextResponse.json({
      success: true,
      token,
      tenantId,
      user: userData,
    });
  } catch (error) {
    console.error('[FIREBASE_SYNC] Fatal error:', error);
    const msg = error instanceof Error ? error.message : 'internal_error';
    return NextResponse.json({ error: `Error interno: ${msg}` }, { status: 500 });
  }
}
