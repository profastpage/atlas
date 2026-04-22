export const runtime = 'edge';

// ========================================
// FIREBASE SYNC — Exchange Firebase ID token for Turso auth
// Used by client-side Firebase Google Auth (signInWithPopup)
//
// VERIFICATION METHOD: Firebase Identity Toolkit REST API
// - 100% Edge compatible
// - Uses POST https://identitytoolkit.googleapis.com/v1/accounts:lookup
// - Designed specifically for Firebase ID tokens (unlike tokeninfo which is for Google OAuth2)
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';
import { generateToken, hashPassword } from '@/lib/password';

const FIREBASE_API_KEY = 'AIzaSyA3INDSDZ7Ab5SsG4Uu9YHG7cCMG1mpcLg';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Firebase ID token requerido' }, { status: 400 });
    }

    // ---- VERIFY FIREBASE ID TOKEN ----
    // Use Firebase Identity Toolkit REST API — the official way to verify Firebase tokens on Edge
    // https://identitytoolkit.googleapis.com/v1/accounts:lookup
    let email: string;
    let name: string;
    let googleId: string;
    let avatarUrl: string | null;

    try {
      const verifyResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      if (!verifyResponse.ok) {
        const errData = await verifyResponse.json().catch(() => ({}));
        console.error('[FIREBASE_SYNC] identitytoolkit error:', verifyResponse.status, errData);
        return NextResponse.json(
          { error: 'Token de Firebase invalido o expirado' },
          { status: 401 }
        );
      }

      const verifyData = await verifyResponse.json();

      if (!verifyData.users || verifyData.users.length === 0) {
        console.error('[FIREBASE_SYNC] No users returned for token');
        return NextResponse.json(
          { error: 'Token no corresponde a un usuario valido' },
          { status: 401 }
        );
      }

      const firebaseUser = verifyData.users[0];

      // Validate the token's provider info — must be a Google sign-in
      const providerInfo = firebaseUser.providerUserInfo || [];
      const hasGoogleProvider = providerInfo.some(
        (p: { providerId: string }) => p.providerId === 'google.com'
      );

      if (!hasGoogleProvider && !firebaseUser.email) {
        console.error('[FIREBASE_SYNC] User has no Google provider and no email');
        return NextResponse.json(
          { error: 'Se requiere autenticacion con Google' },
          { status: 401 }
        );
      }

      email = (firebaseUser.email || '').toLowerCase().trim();
      name = firebaseUser.displayName || email.split('@')[0] || 'Usuario';
      googleId = firebaseUser.localId || '';
      avatarUrl = firebaseUser.photoUrl || null;

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

      // ---- CREATE TENANT FIRST (FK requirement) ----
      // AuthUser.tenantId has a FOREIGN KEY to Tenant.id
      // Must insert Tenant before AuthUser to avoid SQLITE_CONSTRAINT
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO Tenant (id, createdAt, updatedAt) VALUES (?, ?, ?)`,
        [tenantId, now, now]
      );

      const randomPwd = crypto.randomUUID();
      const passwordHash = await hashPassword(randomPwd);

      await db.execute(
        `INSERT INTO AuthUser (id, email, passwordHash, name, avatarUrl, googleId, tenantId, createdAt, updatedAt, isAdmin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [userId, email, passwordHash, name, avatarUrl, googleId, tenantId, now, now]
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
