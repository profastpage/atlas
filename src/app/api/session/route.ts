export const runtime = 'edge';

// ========================================
// SESSION MANAGEMENT — Direct SQL via libsql
// POST  = Create session
// GET   = List sessions (filter by archived)
// PATCH = Rename / Archive / Unarchive session
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
      `INSERT INTO Session (id, tenantId, title, isActive, createdAt, updatedAt, is_archived) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [sessionId, tenantId, 'Sesión Atlas', 1, new Date().toISOString(), new Date().toISOString()]
    );

    // Check for existing user memory
    let isNewUser = true;
    let userName = '';
    let contextSummary = '';
    let userCity = '';

    try {
      const memResult = await db.execute(
        `SELECT userName, contextSummary FROM UserMemory WHERE tenantId = ?`,
        [tenantId]
      );
      if (memResult.rows.length > 0) {
        isNewUser = false;
        userName = (memResult.rows[0].userName as string) || '';
        contextSummary = (memResult.rows[0].contextSummary as string) || '';
        // Extract city from context summary
        const ubicMatch = contextSummary.match(/\[Ubicaci[oó]n\]\s*([^|]+)/);
        if (ubicMatch?.[1]?.trim()) {
          userCity = ubicMatch[1].trim();
        }
      }
    } catch {}

    // Also try to get city from Supabase profiles
    if (!userCity) {
      try {
        const { getSupabaseServer } = await import('@/lib/supabase');
        const supabase = getSupabaseServer();
        if (supabase) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('city')
            .eq('id', tenantId)
            .single();
          if (profile?.city) userCity = profile.city;
        }
      } catch {}
    }

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
      userCity,
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
// ?tenantId=xxx&archived=true  → archivados
// ?tenantId=xxx                → activos (default)
// ========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const showArchived = searchParams.get('archived') === 'true';

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId requerido' },
        { status: 400 }
      );
    }

    const archivedFilter = showArchived ? '1' : '0';

    const result = await db.execute(
      `SELECT s.id, s.title, s.isActive, s.createdAt, s.is_archived, COUNT(m.id) as messageCount
       FROM Session s
       LEFT JOIN Message m ON m.sessionId = s.id
       WHERE s.tenantId = ? AND s.is_archived = ?
       GROUP BY s.id
       ORDER BY s.updatedAt DESC`,
      [tenantId, archivedFilter]
    );

    const sessions = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      isActive: Boolean(row.isActive),
      isArchived: Boolean(row.is_archived),
      createdAt: row.createdAt,
      _count: { messages: Number(row.messageCount || 0) },
    }));

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[SESION] Error al listar:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ========================================
// PATCH /api/session — Rename / Archive / Unarchive
// Body: { action: 'rename'|'archive'|'unarchive', sessionId, title? }
// ========================================

export async function PATCH(request: NextRequest) {
  try {
    const { action, sessionId, title } = await request.json();

    if (!sessionId || !action) {
      return NextResponse.json(
        { error: 'sessionId y action son obligatorios' },
        { status: 400 }
      );
    }

    if (action === 'rename') {
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'title es obligatorio para renombrar' },
          { status: 400 }
        );
      }
      await db.execute(
        `UPDATE Session SET title = ?, updatedAt = ? WHERE id = ?`,
        [title.trim(), new Date().toISOString(), sessionId]
      );
      return NextResponse.json({ success: true, action: 'rename', title: title.trim() });
    }

    if (action === 'archive') {
      await db.execute(
        `UPDATE Session SET is_archived = 1, updatedAt = ? WHERE id = ?`,
        [new Date().toISOString(), sessionId]
      );
      return NextResponse.json({ success: true, action: 'archive' });
    }

    if (action === 'unarchive') {
      await db.execute(
        `UPDATE Session SET is_archived = 0, updatedAt = ? WHERE id = ?`,
        [new Date().toISOString(), sessionId]
      );
      return NextResponse.json({ success: true, action: 'unarchive' });
    }

    return NextResponse.json(
      { error: 'action no válida. Usa: rename, archive, unarchive' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[SESION] Error al actualizar:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
