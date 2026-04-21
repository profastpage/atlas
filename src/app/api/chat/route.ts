export const runtime = 'edge';

// ========================================
// MÓDULO DE CEREBRO + MEMORIA + SEGURIDAD
// Direct SQL via libsql — Edge-compatible, ~30 KB
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createChatCompletion } from '@/lib/ai-client';
import {
  ATLAS_SYSTEM_PROMPT,
  WELCOME_MESSAGE_NEW,
  SAFETY_RESPONSE,
  SAFETY_KEYWORDS,
} from '@/lib/atlas';
import { db } from '@/lib/sql';

// ========================================
// POST /api/chat
// ========================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, tenantId } = body;

    if (!sessionId || !message || !tenantId) {
      return NextResponse.json(
        { error: 'sessionId, message y tenantId son obligatorios' },
        { status: 400 }
      );
    }

    // ---- PASO 0: GUARDAR MENSAJE DEL USUARIO ----
    try {
      const msgId = crypto.randomUUID();
      await db.execute(
        `INSERT INTO Message (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [msgId, sessionId, 'user', message, new Date().toISOString()]
      );
    } catch (dbError) {
      console.error('[CEREBRO] DB write error:', dbError);
    }

    // ---- PASO 1: PROTOCOLO DE SEGURIDAD ----
    const lowerMessage = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    for (const keyword of SAFETY_KEYWORDS) {
      const normalizedKw = keyword
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (lowerMessage.includes(normalizedKw)) {
        try {
          const msgId = crypto.randomUUID();
          await db.execute(
            `INSERT INTO Message (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [msgId, sessionId, 'assistant', SAFETY_RESPONSE, new Date().toISOString()]
          );
        } catch {}
        return NextResponse.json({ response: SAFETY_RESPONSE });
      }
    }

    // ---- PASO 2: MEMORIA (SELECT user_memory) ----
    let userName = '';
    let contextSummary = '';
    try {
      const result = await db.execute(
        `SELECT userName, contextSummary FROM UserMemory WHERE tenantId = ?`,
        [tenantId]
      );
      if (result.rows.length > 0) {
        userName = (result.rows[0].userName as string) || '';
        contextSummary = (result.rows[0].contextSummary as string) || '';
      }
    } catch (dbError) {
      console.error('[CEREBRO] Memory read error:', dbError);
    }

    // ---- PASO 3: CEREBRO (LLM) ----
    const systemPrompt = ATLAS_SYSTEM_PROMPT
      .replace('{user_name}', userName || 'Desconocido')
      .replace(
        '{context_summary}',
        contextSummary || 'Sin información previa. Es un nuevo usuario.'
      );

    // Obtener historial reciente (últimos 16 mensajes)
    let history: Array<{ role: string; content: string }> = [];
    try {
      const result = await db.execute(
        `SELECT role, content FROM Message WHERE sessionId = ? ORDER BY timestamp ASC LIMIT 16`,
        [sessionId]
      );
      history = result.rows.map((m) => ({
        role: m.role as string,
        content: m.content as string,
      }));
    } catch (dbError) {
      console.error('[CEREBRO] History read error:', dbError);
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const completion = await createChatCompletion({
      messages,
      temperature: 0.7,
      max_tokens: 150,
    });

    const responseText =
      completion.choices?.[0]?.message?.content?.trim() || '';

    // Guardar respuesta del asistente
    try {
      const msgId = crypto.randomUUID();
      await db.execute(
        `INSERT INTO Message (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [msgId, sessionId, 'assistant', responseText, new Date().toISOString()]
      );
      await db.execute(
        `UPDATE Session SET updatedAt = ? WHERE id = ?`,
        [new Date().toISOString(), sessionId]
      );
    } catch (dbError) {
      console.error('[CEREBRO] Save response error:', dbError);
    }

    // ---- PASO 4: CICLO DE MEMORIA POST-RESPUESTA ----
    try {
      await postResponseMemoryCycle(
        tenantId,
        message,
        responseText,
        userName,
        contextSummary
      );
    } catch (memError) {
      console.error('[CEREBRO] Memory cycle error:', memError);
    }

    return NextResponse.json({ response: responseText });
  } catch (error) {
    console.error('[CEREBRO] Error:', error);
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: 'Error interno del servidor', detail: msg },
      { status: 500 }
    );
  }
}

// ========================================
// CICLO DE MEMORIA POST-RESPUESTA
// ========================================

async function postResponseMemoryCycle(
  tenantId: string,
  userMessage: string,
  _assistantResponse: string,
  existingUserName: string,
  existingSummary: string
) {
  let updatedName = existingUserName;
  let updatedSummary = existingSummary;
  let needsUpdate = false;

  // ---- DETECTAR NOMBRE ----
  if (!updatedName) {
    const namePatterns = [
      /(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s|$|,|\.)/i,
      /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+(?:y\s+)?(?:soy|estoy|tengo|quiero|necesito)/,
    ];
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1] && match[1].length > 2 && match[1].length < 20) {
        updatedName =
          match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        needsUpdate = true;
        break;
      }
    }
  }

  // ---- DETECTAR TEMA/PROBLEMA NUEVO ----
  const topicPatterns = [
    {
      pattern:
        /(?:problema|situación|tema|asunto|conflicto|dificultad)\s+(?:es|con|sobre|de)\s+(.+?)(?:\.|,|$)/i,
      label: 'Problema',
    },
    {
      pattern:
        /(?:mi\s+)?(?:pareja|novi[oa]|espos[oa]|marido|mujer)\s+(.+?)(?:\.|,|$)/i,
      label: 'Relación de pareja',
    },
    {
      pattern:
        /(?:trabajo|jefe|empleo|negocio|empresa)\s+(.+?)(?:\.|,|$)/i,
      label: 'Trabajo',
    },
    {
      pattern:
        /(?:estres|ansiedad|miedo|depresión|angustia|frustración|trusteza)\s+(.+?)(?:\.|,|$)/i,
      label: 'Salud mental',
    },
    {
      pattern:
        /(?:no\s+(?:puedo|logro|sé|puedes))\s+(.+?)(?:\.|,|$)/i,
      label: 'Bloqueo',
    },
    {
      pattern: /(?:quiero|necesito|aspiro|meta)\s+(.+?)(?:\.|,|$)/i,
      label: 'Objetivo',
    },
    {
      pattern: /(?:me\s+siento|estoy\s+sintiendo)\s+(.+?)(?:\.|,|$)/i,
      label: 'Emoción',
    },
  ];

  for (const { pattern, label } of topicPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1] && match[1].trim().length > 5) {
      const newTopic = `[${label}] ${match[1].trim().substring(0, 80)}`;

      if (!updatedSummary) {
        updatedSummary = newTopic;
      } else {
        if (!updatedSummary.includes(newTopic.substring(0, 30))) {
          const lines = updatedSummary.split(' | ');
          if (lines.length >= 3) lines.shift();
          lines.push(newTopic);
          updatedSummary = lines.join(' | ');
        }
      }
      needsUpdate = true;
      break;
    }
  }

  // ---- UPSERT ----
  if (needsUpdate) {
    try {
      const existing = await db.execute(
        `SELECT id FROM UserMemory WHERE tenantId = ?`,
        [tenantId]
      );

      if (existing.rows.length > 0) {
        await db.execute(
          `UPDATE UserMemory SET userName = ?, contextSummary = ?, updatedAt = ? WHERE tenantId = ?`,
          [updatedName, updatedSummary, new Date().toISOString(), tenantId]
        );
      } else {
        const id = crypto.randomUUID();
        await db.execute(
          `INSERT INTO UserMemory (id, tenantId, userName, contextSummary, updatedAt) VALUES (?, ?, ?, ?, ?)`,
          [id, tenantId, updatedName, updatedSummary, new Date().toISOString()]
        );
      }
    } catch (upsertError) {
      console.error('[MEMORIA] UPSERT error:', upsertError);
    }
  }
}

// ========================================
// GET /api/chat — Cargar historial
// ========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId requerido' },
        { status: 400 }
      );
    }

    const result = await db.execute(
      `SELECT id, role, content, timestamp FROM Message WHERE sessionId = ? ORDER BY timestamp ASC`,
      [sessionId]
    );

    return NextResponse.json({
      messages: result.rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });
  } catch (error) {
    console.error('[MEMORIA] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ========================================
// DELETE /api/chat — Eliminar sesión
// ========================================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId requerido' },
        { status: 400 }
      );
    }

    await db.execute(`DELETE FROM Message WHERE sessionId = ?`, [sessionId]);
    await db.execute(`DELETE FROM Session WHERE id = ?`, [sessionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MEMORIA] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
