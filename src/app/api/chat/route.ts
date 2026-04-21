export const runtime = 'edge';

// ========================================
// MÓDULO DE CEREBRO + MEMORIA + SEGURIDAD
// Orquestador principal del sistema Atlas
// Edge-compatible: no Node.js APIs
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createChatCompletion } from '@/lib/ai-client';
import {
  ATLAS_SYSTEM_PROMPT,
  WELCOME_MESSAGE_NEW,
  SAFETY_RESPONSE,
  SAFETY_KEYWORDS,
} from '@/lib/atlas';
import { db } from '@/lib/db';

// ========================================
// POST /api/chat — Flujo completo:
// 1. Safety Check
// 2. Módulo de Memoria (SELECT user_memory)
// 3. Módulo de Cerebro (LLM con contexto)
// 4. Ciclo de Memoria Post-Respuesta (UPSERT)
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
      await db.message.create({
        data: { sessionId, role: 'user', content: message },
      });
    } catch (dbError) {
      console.error('[CEREBRO] DB write error:', dbError);
      // Continue anyway — don't block the AI response on DB errors
    }

    // ---- PASO 1: PROTOCOLO DE SEGURIDAD CRÍTICO ----
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
          await db.message.create({
            data: { sessionId, role: 'assistant', content: SAFETY_RESPONSE },
          });
        } catch {}
        return NextResponse.json({ response: SAFETY_RESPONSE });
      }
    }

    // ---- PASO 2: MÓDULO DE MEMORIA (SELECT user_memory) ----
    let userName = '';
    let contextSummary = '';
    try {
      const userMemory = await db.userMemory.findUnique({
        where: { tenantId },
      });
      userName = userMemory?.userName || '';
      contextSummary = userMemory?.contextSummary || '';
    } catch (dbError) {
      console.error('[CEREBRO] Memory read error:', dbError);
    }

    // ---- PASO 3: MÓDULO DE CEREBRO (LLM) ----
    const systemPrompt = ATLAS_SYSTEM_PROMPT
      .replace('{user_name}', userName || 'Desconocido')
      .replace(
        '{context_summary}',
        contextSummary || 'Sin información previa. Es un nuevo usuario.'
      );

    // Obtener historial reciente de la sesión (últimos 16 mensajes)
    let history: Array<{ role: string; content: string }> = [];
    try {
      const msgs = await db.message.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'asc' },
        take: 16,
      });
      history = msgs.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } catch (dbError) {
      console.error('[CEREBRO] History read error:', dbError);
    }

    // Construir array de mensajes para el LLM
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Llamada al LLM via fetch nativo (Edge-compatible)
    const completion = await createChatCompletion({
      messages,
      temperature: 0.7,
      max_tokens: 150,
    });

    const responseText =
      completion.choices?.[0]?.message?.content?.trim() || '';

    // Guardar respuesta del asistente
    try {
      await db.message.create({
        data: { sessionId, role: 'assistant', content: responseText },
      });
      await db.session.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
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
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: 'Error interno del servidor', detail: message },
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
      const existingMemory = await db.userMemory.findUnique({
        where: { tenantId },
      });

      if (existingMemory) {
        await db.userMemory.update({
          where: { tenantId },
          data: {
            userName: updatedName,
            contextSummary: updatedSummary,
          },
        });
      } else {
        await db.userMemory.create({
          data: {
            tenantId,
            userName: updatedName,
            contextSummary: updatedSummary,
          },
        });
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

    const messages = await db.message.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    return NextResponse.json({ messages });
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

    await db.message.deleteMany({ where: { sessionId } });
    await db.session.delete({ where: { id: sessionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MEMORIA] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
