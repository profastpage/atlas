export const runtime = 'edge';

// ========================================
// FIREBASE SYNC — Exchange Firebase ID token for Turso auth
// Used by client-side Firebase Google Auth (signInWithPopup)
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';
import { generateToken, hashPassword } from '@/lib/password';

// Firebase project ID for token verification
const FIREBASE_PROJECT_ID = 'asistente-ia-atlas-23dac';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Firebase ID token requerido' }, { status: 400 });
    }

    // ---- VERIFY FIREBASE ID TOKEN ----
    // Use Firebase's public key certificate endpoint to verify the token
    // This avoids needing firebase-admin on Edge runtime
    let decodedToken: any;
    try {
      // Fetch Firebase public keys
      const keysResponse = await fetch(
        `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      const keys = await keysResponse.json();
      const headerB64 = idToken.split('.')[0];
      const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
      const publicKey = keys[header.kid];

      if (!publicKey) {
        return NextResponse.json({ error: 'Token de Firebase invalido: clave no encontrada' }, { status: 401 });
      }

      // Simple verification using Firebase's tokeninfo API (works on Edge)
      const verifyResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyA3INDSDZ7Ab5SsG4Uu9YHG7cCMG1mpcLg`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      const verifyData = await verifyResponse.json();

      if (!verifyData.users || verifyData.users.length === 0) {
        return NextResponse.json({ error: 'Token de Firebase invalido' }, { status: 401 });
      }

      const firebaseUser = verifyData.users[0];
      decodedToken = {
        uid: firebaseUser.localId,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
        picture: firebaseUser.photoUrl || null,
        emailVerified: firebaseUser.emailVerified,
      };
    } catch (err) {
      console.error('[FIREBASE_SYNC] Token verification failed:', err);
      return NextResponse.json({ error: 'Error al verificar token de Firebase' }, { status: 401 });
    }

    const email = decodedToken.email?.toLowerCase().trim();
    const name = decodedToken.name;
    const googleId = decodedToken.uid;
    const avatarUrl = decodedToken.picture;

    if (!email) {
      return NextResponse.json({ error: 'No se pudo obtener el email de Firebase' }, { status: 400 });
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
      } catch {}
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
