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

    if (action === 'auto_title') {
      // Generate a short title from the first user message
      const { firstMessage } = await request.json();
      if (!firstMessage || typeof firstMessage !== 'string') {
        return NextResponse.json({ error: 'firstMessage requerido' }, { status: 400 });
      }

      // Use AI to generate a concise title (max 40 chars)
      const title = await generateTitleFromMessage(firstMessage);
      if (title) {
        await db.execute(
          `UPDATE Session SET title = ?, updatedAt = ? WHERE id = ?`,
          [title, new Date().toISOString(), sessionId]
        );
        return NextResponse.json({ success: true, action: 'auto_title', title });
      }
      return NextResponse.json({ success: false, action: 'auto_title' });
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

// ========================================
// AUTO-TITLE GENERATION
// Generates a short session title from the first user message using AI.
// Falls back to truncation if AI fails.
// ========================================

async function generateTitleFromMessage(firstMessage: string): Promise<string | null> {
  // Fallback: truncate the first message to 40 chars
  const fallback = () => {
    const clean = firstMessage.replace(/\n/g, ' ').trim();
    return clean.length > 40 ? clean.substring(0, 37) + '...' : clean;
  };

  try {
    const aiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '';
    if (!aiKey) return fallback();

    const isGroq = !!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY;
    const baseUrl = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const model = isGroq ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `Genera un titulo corto y descriptivo para una conversacion de consultoria estrategica basandote en el primer mensaje del usuario. REGLAS:
- Maximo 40 caracteres
- Sin comillas, sin puntos al final
- En espanol
- Conciso y especifico (ej: "Estrategia de Trading", "Plan de Marketing", "Curso de 7 dias")
- Si es una pregunta generica, usa el tema principal
Responde SOLO con el titulo, nada mas.`,
          },
          {
            role: 'user',
            content: firstMessage.substring(0, 300),
          },
        ],
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return fallback();

    const data = await res.json();
    let title = data.choices?.[0]?.message?.content?.trim() || '';
    // Clean up: remove quotes if the AI wrapped them
    title = title.replace(/^["'|«]|["'|»]$/g, '').trim();
    // Truncate if still too long
    if (title.length > 40) title = title.substring(0, 37) + '...';
    return title || fallback();
  } catch {
    return fallback();
  }
}
