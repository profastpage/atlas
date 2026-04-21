export const runtime = 'edge';

// ========================================
// SESSION MANAGEMENT — Direct SQL via libsql
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';

// ========================================
// POST /api/session — Create session
// ========================================

export async function POST(request: NextRequest) {
  try {
    const { tenantId: providedTenantId } = await request.json();

    let tenantId = providedTenantId;

    // If no tenantId, create a new tenant
    if (!tenantId) {
      tenantId = crypto.randomUUID();
      await db.execute(
        `INSERT INTO Tenant (id, createdAt, updatedAt) VALUES (?, ?, ?)`,
        [tenantId, new Date().toISOString(), new Date().toISOString()]
      );
    }

    // Create session
    const sessionId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO Session (id, tenantId, title, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, tenantId, 'Sesión Atlas', 1, new Date().toISOString(), new Date().toISOString()]
    );

    // Check for existing user memory
    let isNewUser = true;
    let userName = '';
    let contextSummary = '';

    try {
      const memResult = await db.execute(
        `SELECT userName, contextSummary FROM UserMemory WHERE tenantId = ?`,
        [tenantId]
      );
      if (memResult.rows.length > 0) {
        isNewUser = false;
        userName = (memResult.rows[0].userName as string) || '';
        contextSummary = (memResult.rows[0].contextSummary as string) || '';
      }
    } catch {}

    // Create UserMemory if new user
    if (isNewUser) {
      try {
        const memId = crypto.randomUUID();
        await db.execute(
          `INSERT INTO UserMemory (id, tenantId, userName, contextSummary, updatedAt) VALUES (?, ?, ?, ?, ?)`,
          [memId, tenantId, '', '', new Date().toISOString()]
        );
      } catch {}
    }

    return NextResponse.json({
      sessionId,
      tenantId,
      isNewUser,
      userName,
      contextSummary,
    });
  } catch (error) {
    console.error('[SESION] Error al crear:', error);
    return NextResponse.json(
      { error: 'Error al crear sesión' },
      { status: 500 }
    );
  }
}

// ========================================
// GET /api/session — List sessions
// ========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId requerido' },
        { status: 400 }
      );
    }

    const result = await db.execute(
      `SELECT s.id, s.title, s.isActive, s.createdAt, COUNT(m.id) as messageCount
       FROM Session s
       LEFT JOIN Message m ON m.sessionId = s.id
       WHERE s.tenantId = ?
       GROUP BY s.id
       ORDER BY s.updatedAt DESC`,
      [tenantId]
    );

    const sessions = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      _count: { messages: Number(row.messageCount || 0) },
    }));

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[SESION] Error al listar:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
