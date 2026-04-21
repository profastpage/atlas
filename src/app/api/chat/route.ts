export const runtime = 'edge';

// ========================================
// CHAT MODULE — Brain + Memory + Security + STREAMING
// Direct SQL via libsql — Edge-compatible
// SSE streaming: tokens arrive in real-time via ReadableStream
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createChatCompletion, streamChatCompletion } from '@/lib/ai-client';
import {
  ATLAS_SYSTEM_PROMPT,
  ATLAS_SYSTEM_PROMPT_EXPANDED,
  WELCOME_MESSAGE_NEW,
  SAFETY_RESPONSE,
  SAFETY_KEYWORDS,
} from '@/lib/atlas';
import { db } from '@/lib/sql';
import { supabase } from '@/lib/supabase';

// ========================================
// POST /api/chat — STREAMING (SSE) + JSON fallback
// ========================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, tenantId, expandedMode, messageId, documentText } = body;

    if (!sessionId || !tenantId) {
      return NextResponse.json(
        { error: 'sessionId y tenantId son obligatorios' },
        { status: 400 }
      );
    }

    // ---- PASO 0: PLAN GATE — Verify active subscription ----
    // Reject authenticated users without an active plan (security hardening)
    try {
      if (supabase) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan_type')
          .eq('id', tenantId)
          .single();

        const planType = profile?.plan_type;
        if (planType === null || planType === undefined || planType === 'free') {
          // User has no paid plan — block the request
          return NextResponse.json(
            { error: 'PLAN_REQUIRED', detail: 'Necesitas un plan activo para enviar mensajes. Selecciona un plan en Configuracion.' },
            { status: 403 }
          );
        }
      }
    } catch (gateError) {
      // If Supabase is down or profiles table doesn't exist, allow through (graceful degradation)
      console.warn('[PLAN GATE] Supabase check failed, allowing request:', gateError);
    }

    // ---- EXPANDED MODE: Re-generate with no word limit ----
    if (expandedMode && messageId) {
      return handleExpandMode(sessionId, tenantId, messageId);
    }

    if (!message) {
      return NextResponse.json(
        { error: 'message es obligatorio' },
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

    // ---- PASO 1: PROTOCOLO DE SEGURIDAD (instant JSON) ----
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

    // ---- PASO 2: MEMORIA ----
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

    // ---- PASO 2.5: VALIDATE DOCUMENT SIZE ----
    if (documentText) {
      const tokenEstimate = Math.ceil(documentText.length / 4);
      if (tokenEstimate > 80000) {
        return NextResponse.json({
          error: `El documento excede el limite de 80,000 tokens (aprox 60 paginas, tiene ~${tokenEstimate.toLocaleString()}). Por favor sube un resumen o la parte especifica.`,
        }, { status: 413 });
      }
    }

    // ---- PASO 3: CONSTRUIR MENSAJES ----
    const basePrompt = ATLAS_SYSTEM_PROMPT;
    let systemPrompt = basePrompt
      .replace('{user_name}', userName || 'Desconocido')
      .replace(
        '{context_summary}',
        contextSummary || 'Sin información previa. Es un nuevo usuario.'
      );

    // If document attached, append document context to system prompt
    if (documentText) {
      const docPrompt = `\n\n[CONTEXTO DE DOCUMENTO ADJUNTO]\nEl usuario ha adjuntado un documento. Aqui esta el texto extraido:\n---\n${documentText}\n---\nINSTRUCCIONES SOBRE EL DOCUMENTO:\n- Responde estrictamente basandote en este texto.\n- Si la respuesta no esta en el texto, dile 'La informacion no se encuentra en el documento'.\n- Manten tu tono de Atlas, usa vinetas y negritas.\n- Sé conciso y directo.`;
      systemPrompt += docPrompt;
    }

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

    const llmMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        llmMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // ---- PASO 4: CEREBRO — TRY STREAMING FIRST ----
    const qwenStream = await streamChatCompletion({
      messages: llmMessages,
      temperature: 0.7,
      max_tokens: 300,
    });

    if (qwenStream) {
      return createSSEStream(qwenStream, sessionId, tenantId, message, userName, contextSummary);
    }

    // ---- FALLBACK: NON-STREAMING (Z.ai or Qwen error) ----
    const completion = await createChatCompletion({
      messages: llmMessages,
      temperature: 0.7,
      max_tokens: 300,
    });
    const responseText = completion.choices?.[0]?.message?.content?.trim() || '';

    await saveAssistantAndMemory(sessionId, tenantId, message, responseText, userName, contextSummary);

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
// EXPANDED MODE — Re-generate response without 100-word limit
// ========================================

async function handleExpandMode(
  sessionId: string,
  tenantId: string,
  messageId: string,
): Promise<Response> {
  // Load memory for context
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
  } catch {}

  // Build expanded system prompt
  const expandedPrompt = ATLAS_SYSTEM_PROMPT_EXPANDED
    .replace('{user_name}', userName || 'Desconocido')
    .replace(
      '{context_summary}',
      contextSummary || 'Sin información previa. Es un nuevo usuario.'
    );

  // Load chat history (last 16 messages)
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
  } catch {}

  const llmMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: expandedPrompt },
  ];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add expand instruction as last user message
  llmMessages.push({
    role: 'user',
    content: '[MODO EXPANDIDO ACTIVADO] Expande y profundiza tu última respuesta de forma exhaustiva. Da una versión mucho más detallada y completa del mismo tema.',
  });

  // Try streaming first
  const qwenStream = await streamChatCompletion({
    messages: llmMessages,
    temperature: 0.7,
    max_tokens: 700,
  });

  if (qwenStream) {
    return createExpandSSEStream(qwenStream, messageId);
  }

  // Fallback: non-streaming
  const completion = await createChatCompletion({
    messages: llmMessages,
    temperature: 0.7,
    max_tokens: 700,
  });
  const responseText = completion.choices?.[0]?.message?.content?.trim() || '';

  // Update existing message in DB
  try {
    await db.execute(
      `UPDATE Message SET content = ?, timestamp = ? WHERE id = ?`,
      [responseText, new Date().toISOString(), messageId]
    );
  } catch {}

  return NextResponse.json({ response: responseText, messageId });
}

// ========================================
// EXPAND SSE STREAM — Stream expanded response, update DB on completion
// ========================================

function createExpandSSEStream(
  upstream: ReadableStream<Uint8Array>,
  messageId: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)); } catch {}
      };

      try {
        const reader = upstream.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const json = JSON.parse(payload);
              const token = json.choices?.[0]?.delta?.content || '';
              if (token) {
                fullText += token;
                send(`data: ${JSON.stringify({ token })}\n\n`);
              }
            } catch {}
          }
        }

        // Update the existing message in DB
        if (fullText.trim()) {
          try {
            await db.execute(
              `UPDATE Message SET content = ?, timestamp = ? WHERE id = ?`,
              [fullText.trim(), new Date().toISOString(), messageId]
            );
          } catch {}
        }

        send(`data: ${JSON.stringify({ done: true, full: fullText, messageId })}\n\n`);
      } catch (error) {
        console.error('[EXPAND] Stream error:', error);
        send(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ========================================
// SSE STREAM — Parse OpenRouter chunks, re-emit to client
// ========================================

function createSSEStream(
  upstream: ReadableStream<Uint8Array>,
  sessionId: string,
  tenantId: string,
  userMessage: string,
  userName: string,
  contextSummary: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)); } catch {}
      };

      try {
        const reader = upstream.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const json = JSON.parse(payload);
              const token = json.choices?.[0]?.delta?.content || '';
              if (token) {
                fullText += token;
                send(`data: ${JSON.stringify({ token })}\n\n`);
              }
            } catch {}
          }
        }

        // ---- Save to DB after stream completes ----
        if (fullText.trim()) {
          await saveAssistantAndMemory(sessionId, tenantId, userMessage, fullText.trim(), userName, contextSummary);
        }

        send(`data: ${JSON.stringify({ done: true, full: fullText })}\n\n`);
      } catch (error) {
        console.error('[CEREBRO] Stream error:', error);
        send(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ========================================
// DB SAVE + MEMORY CYCLE (shared by streaming & non-streaming)
// ========================================

async function saveAssistantAndMemory(
  sessionId: string,
  tenantId: string,
  userMessage: string,
  responseText: string,
  userName: string,
  contextSummary: string,
) {
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

  try {
    await postResponseMemoryCycle(tenantId, userMessage, responseText, userName, contextSummary);
  } catch (memError) {
    console.error('[CEREBRO] Memory cycle error:', memError);
  }
}

// ========================================
// MEMORY CYCLE POST-RESPONSE
// ========================================

async function postResponseMemoryCycle(
  tenantId: string,
  userMessage: string,
  _assistantResponse: string,
  existingUserName: string,
  existingSummary: string,
) {
  let updatedName = existingUserName;
  let updatedSummary = existingSummary;
  let needsUpdate = false;

  if (!updatedName) {
    const namePatterns = [
      /(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s|$|,|\.)/i,
      /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+(?:y\s+)?(?:soy|estoy|tengo|quiero|necesito)/,
    ];
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1] && match[1].length > 2 && match[1].length < 20) {
        updatedName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        needsUpdate = true;
        break;
      }
    }
  }

  const topicPatterns = [
    { pattern: /(?:problema|situación|tema|asunto|conflicto|dificultad)\s+(?:es|con|sobre|de)\s+(.+?)(?:\.|,|$)/i, label: 'Problema' },
    { pattern: /(?:mi\s+)?(?:pareja|novi[oa]|espos[oa]|marido|mujer)\s+(.+?)(?:\.|,|$)/i, label: 'Relación de pareja' },
    { pattern: /(?:trabajo|jefe|empleo|negocio|empresa)\s+(.+?)(?:\.|,|$)/i, label: 'Trabajo' },
    { pattern: /(?:estres|ansiedad|miedo|depresión|angustia|frustración|trusteza)\s+(.+?)(?:\.|,|$)/i, label: 'Salud mental' },
    { pattern: /(?:no\s+(?:puedo|logro|sé|puedes))\s+(.+?)(?:\.|,|$)/i, label: 'Bloqueo' },
    { pattern: /(?:quiero|necesito|aspiro|meta)\s+(.+?)(?:\.|,|$)/i, label: 'Objetivo' },
    { pattern: /(?:me\s+siento|estoy\s+sintiendo)\s+(.+?)(?:\.|,|$)/i, label: 'Emoción' },
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

  if (needsUpdate) {
    try {
      const existing = await db.execute(`SELECT id FROM UserMemory WHERE tenantId = ?`, [tenantId]);
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
// GET /api/chat — Load history
// ========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 });
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
// DELETE /api/chat — Delete session
// ========================================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 });
    }

    await db.execute(`DELETE FROM Message WHERE sessionId = ?`, [sessionId]);
    await db.execute(`DELETE FROM Session WHERE id = ?`, [sessionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MEMORIA] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
