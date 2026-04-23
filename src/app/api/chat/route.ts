export const runtime = 'edge';

// ========================================
// CHAT MODULE — Brain + Memory + Security + STREAMING
// Direct SQL via libsql — Edge-compatible
// SSE streaming: tokens arrive in real-time via ReadableStream
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createChatCompletion, streamChatCompletion, extractPdfStructured, describeImage } from '@/lib/ai-client';
import {
  ATLAS_SYSTEM_PROMPT,
  ATLAS_SYSTEM_PROMPT_EXPANDED,
  WELCOME_MESSAGE_NEW,
  SAFETY_RESPONSE,
  SAFETY_KEYWORDS,
} from '@/lib/atlas';
import { db } from '@/lib/sql';
import { getSupabaseServer } from '@/lib/supabase';
import { enrichContext, buildContextInjection, buildTimeInjection } from '@/lib/context-api';
import { performAutoResearch, AutoSource } from '@/lib/auto-research';

// ========================================
// POST /api/chat — STREAMING (SSE) + JSON fallback
// ========================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, tenantId, expandedMode, messageId, documentText, imageBase64 } = body;

    if (!sessionId || !tenantId) {
      return NextResponse.json(
        { error: 'sessionId y tenantId son obligatorios' },
        { status: 400 }
      );
    }

    // ---- PLAN GATE REMOVED ----
    // The frontend handles paywall gating via trialBotResponses counter.
    // First 5 messages ALWAYS work. After 5, frontend blocks input & shows modal.
    // No backend plan check needed — prevents race condition with frontend counter.

    // ---- EXPANDED MODE: Re-generate with no word limit ----
    if (expandedMode && messageId) {
      return handleExpandMode(sessionId, tenantId, messageId);
    }

    if (!message && !imageBase64 && !documentText) {
      return NextResponse.json(
        { error: 'message es obligatorio' },
        { status: 400 }
      );
    }

    // ---- PASO 0: GUARDAR MENSAJE DEL USUARIO ----
    try {
      const msgId = crypto.randomUUID();
      const userContent = message || (imageBase64 ? '[Imagen adjunta]' : (documentText ? '[Documento adjunto]' : ''));
      await db.execute(
        `INSERT INTO Message (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [msgId, sessionId, 'user', userContent, new Date().toISOString()]
      );
    } catch (dbError) {
      console.error('[CEREBRO] DB write error:', dbError);
    }

    // ---- PASO 1: PROTOCOLO DE SEGURIDAD (instant JSON) ----
    const lowerMessage = (message || '')
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

    // ---- PASO 2.4: AUTO-RESEARCH — Busca web para preguntas factuales ----
    let autoResearchSources: AutoSource[] = [];
    let autoResearchContext = '';
    try {
      if (message && !documentText && !imageBase64) {
        console.log('[CEREBRO] Auto-research check for:', message.substring(0, 60));
        const researchResult = await Promise.race([
          performAutoResearch(message),
          new Promise<{ needed: false; sources: []; contextBlock: '' }>(r =>
            setTimeout(() => r({ needed: false, sources: [], contextBlock: '' }), 6000)
          ),
        ]);
        if (researchResult.needed) {
          autoResearchSources = researchResult.sources;
          autoResearchContext = researchResult.contextBlock;
          console.log('[CEREBRO] Auto-research found', researchResult.sources.length, 'sources');
        } else {
          console.log('[CEREBRO] Auto-research not needed for this message');
        }
      }
    } catch (researchErr) {
      console.warn('[CEREBRO] Auto-research failed (continuing without it):', researchErr);
    }

    // ---- PASO 2.5: CONTEXTO AMBIENTAL (clima + noticias) + CIUDAD DEL USUARIO ----
    let userCity: string | undefined;
    try {
      if (tenantId) {
        try {
          const supabase = getSupabaseServer();
          if (supabase) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('city')
              .eq('id', tenantId)
              .single();
            userCity = profile?.city || undefined;
          }
        } catch {}
        // Fallback: check UserMemory for [Ubicacion] topic if Supabase has no city
        if (!userCity) {
          try {
            const memResult = await db.execute(
              `SELECT contextSummary FROM UserMemory WHERE tenantId = ?`,
              [tenantId]
            );
            if (memResult.rows.length > 0) {
              const summary = (memResult.rows[0].contextSummary as string) || '';
              const ubicMatch = summary.match(/\[Ubicaci[oó]n\]\s*([^|]+)/);
              if (ubicMatch?.[1]?.trim()) {
                userCity = ubicMatch[1].trim();
              }
            }
          } catch {}
        }
      }
    } catch {}

    const context = await enrichContext(message, userCity);
    const contextInjection = buildContextInjection(context);

    // ---- PASO 3: MEMORIA ----
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

    // ================================================================
    // ROUTER INTELIGENTE MULTIMODAL
    // - Plain text -> Qwen directly (cheapest)
    // - PDF (documentText) -> Llama extracts -> Qwen responds
    // - Image (imageBase64) -> Gemini describes -> Qwen responds
    // ================================================================

    let enrichedMessage = message || '';

    // ---- PIPELINE DE PDF: Llama extrae datos estructurados ----
    if (documentText) {
      console.log('[ROUTER] PDF detected -> Llama extraction pipeline');
      try {
        const extractedData = await extractPdfStructured(documentText);
        // Replace message with extracted context for Qwen
        enrichedMessage = `[El usuario subió un documento y un asistente preliminar extrajo estos datos]:
${extractedData}

[Pregunta del usuario sobre el documento]:
${message || 'Analiza este documento.'}`;
        console.log('[ROUTER] Llama extraction done, passing to Qwen');
      } catch (pdfErr) {
        console.error('[ROUTER] Llama extraction failed, falling back to raw text:', pdfErr);
        // Fallback: use raw document text (original behavior)
        enrichedMessage = message;
      }
    }

    // ---- PIPELINE DE IMAGEN: Gemini describe -> Qwen responde ----
    if (imageBase64 && !documentText) {
      console.log('[ROUTER] Image detected -> Gemini description pipeline');
      try {
        const imageDescription = await describeImage(imageBase64);
        enrichedMessage = `[El usuario subió una imagen. Descripción generada]:
${imageDescription}

[Pregunta del usuario sobre la imagen]:
${message || 'Describe lo que ves en esta imagen.'}`;
        console.log('[ROUTER] Gemini description done, passing to Qwen');
      } catch (imgErr) {
        console.error('[ROUTER] Gemini description failed:', imgErr);
        return NextResponse.json({
          error: 'No se pudo procesar la imagen. Intenta de nuevo con otro formato (JPG, PNG, WebP).',
        }, { status: 422 });
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

    // Inject user's city into system prompt if available (identity persistence)
    if (userCity) {
      systemPrompt += `\n\n[CIUDAD DEL USUARIO] El usuario vive en **${userCity}**. Usa esta información naturalmente en la conversación (por ejemplo, cuando hables de clima, horarios, eventos locales, referencias geográficas). No le preguntes su ciudad — ya la sabes. Inclúyela como contexto conocido.`;
    }

    // If document was processed by Llama, add Qwen-specific instructions
    if (documentText) {
      const docPrompt = `\n\n[CONTEXTO DE DOCUMENTO ADJUNTO]\nEl usuario subió un documento. Los datos extraidos ya estan incluidos en el mensaje del usuario. Responde como Atlas de manera directa y estratégica basandote en los datos extraidos. Manten tu tono habitual, usa vinetas y negritas.`;
      systemPrompt += docPrompt;
    }

    // If image was described by Gemini, add context instructions
    if (imageBase64) {
      const imgPrompt = `\n\n[CONTEXTO DE IMAGEN ADJUNTA]\nEl usuario subió una imagen. La descripción generada ya esta incluida en el mensaje del usuario. Responde como Atlas de manera directa basandote en la descripción. Manten tu tono habitual.`;
      systemPrompt += imgPrompt;
    }

    // If auto-research found sources, inject into system prompt (HIGHEST PRIORITY)
    if (autoResearchContext) {
      systemPrompt += '\n\n' + autoResearchContext;
    }

    // If weather/news context detected, append to system prompt
    if (contextInjection) {
      systemPrompt += contextInjection;
    }

    // Always inject server time (zero cost, enables time-relative calculations)
    systemPrompt += buildTimeInjection();

    // ---- MEMORY EFFICIENCY: Limit history to avoid excessive token usage ----
    // Load recent messages + use condensed summary for older context
    let history: Array<{ role: string; content: string }> = [];
    try {
      // Get last 30 messages for actual conversation context
      const result = await db.execute(
        `SELECT role, content FROM Message WHERE sessionId = ? ORDER BY timestamp ASC LIMIT 30`,
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

    // ---- ROUTER: Replace last user message with enriched content ----
    // If PDF/Image pipeline processed, the last user message in DB is raw,
    // but we want Qwen to see the enriched version (Llama extraction or Gemini description)
    if (enrichedMessage !== message) {
      // Replace the last 'user' message in llmMessages with enriched version
      for (let i = llmMessages.length - 1; i >= 0; i--) {
        if (llmMessages[i].role === 'user') {
          llmMessages[i] = { role: 'user', content: enrichedMessage };
          break;
        }
      }
    }

    // ---- PASO 4: CEREBRO — TRY STREAMING FIRST, FALLBACK TO NON-STREAMING ----
    let qwenStream: ReadableStream<Uint8Array> | null = null;
    try {
      qwenStream = await streamChatCompletion({
        messages: llmMessages,
        temperature: 0.75,
        max_tokens: 500,
      });
    } catch (streamErr) {
      console.error('[CEREBRO] Streaming failed, trying non-streaming:', streamErr);
    }

    if (qwenStream) {
      return createSSEStream(qwenStream, sessionId, tenantId, message, userName, contextSummary, autoResearchSources);
    }

    // ---- FALLBACK: NON-STREAMING (Qwen only) ----
    console.log('[CEREBRO] Falling back to non-streaming');
    try {
      const completion = await createChatCompletion({
        messages: llmMessages,
        temperature: 0.75,
        max_tokens: 500,
      });
      const responseText = completion.choices?.[0]?.message?.content?.trim() || '';

      await saveAssistantAndMemory(sessionId, tenantId, message, responseText, userName, contextSummary);

      return NextResponse.json({ response: responseText, sources: autoResearchSources.length > 0 ? autoResearchSources : undefined });
    } catch (fallbackErr) {
      console.error('[CEREBRO] Non-streaming also failed:', fallbackErr);
      const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Error desconocido';
      return NextResponse.json(
        { error: 'Error interno del servidor' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[CEREBRO] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
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

  // Load chat history (last 30 messages)
  let history: Array<{ role: string; content: string }> = [];
  try {
    const result = await db.execute(
      `SELECT role, content FROM Message WHERE sessionId = ? ORDER BY timestamp ASC LIMIT 30`,
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
  let qwenStream: ReadableStream<Uint8Array> | null = null;
  try {
    qwenStream = await streamChatCompletion({
      messages: llmMessages,
      temperature: 0.7,
      max_tokens: 700,
    });
  } catch (expandStreamErr) {
    console.error('[EXPAND] Streaming failed, trying non-streaming:', expandStreamErr);
  }

  if (qwenStream) {
    return createExpandSSEStream(qwenStream, messageId);
  }

  // Fallback: non-streaming Qwen only
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
  researchSources: AutoSource[] = [],
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

        send(`data: ${JSON.stringify({ done: true, full: fullText, sources: researchSources.length > 0 ? researchSources : undefined })}\n\n`);
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
    // Personal — UBICACION (enhanced to be more specific)
    { pattern: /(?:vivo en|resido en|estoy radicado en|me mud[eé] a|ubicado en|based in)\s+(.+?)(?:\.|,|$)/i, label: 'Ubicacion', priority: true },
    { pattern: /(?:soy de|mi ciudad es|mi ciudad|mi pa[ií]s|mi pueblo|nací en|crecí en)\s+(.+?)(?:\.|,|$)/i, label: 'Ubicacion', priority: true },
    { pattern: /(?:problema|situación|tema|asunto|conflicto|dificultad)\s+(?:es|con|sobre|de)\s+(.+?)(?:\.|,|$)/i, label: 'Problema' },
    { pattern: /(?:tengo|mi)\s+(?:edad|anos|cumpleaños)\s+(?:de\s+)?(\d+)/i, label: 'Edad' },
    { pattern: /(?:profesion|ocupacion|trabajo como)\s+(?:es\s+|soy\s+)?(.+?)(?:\.|,|$)/i, label: 'Profesión' },
    // Relaciones
    { pattern: /(?:mi\s+)?(?:pareja|novi[oa]|espos[oa]|marido|mujer|pololo|polola)\s+(.+?)(?:\.|,|$)/i, label: 'Pareja' },
    { pattern: /(?:mi\s+)?(?:hij[oa]|niñ[oa]|bebe|familia|herman[oa]|mamá|papá|mami|papi|padre|madre)\s+(.+?)(?:\.|,|$)/i, label: 'Familia' },
    { pattern: /(?:mi\s+)?(?:amig[oa]|grupo|cuates|compañeros)\s+(.+?)(?:\.|,|$)/i, label: 'Amigos' },
    { pattern: /(?:mi\s+)?(?:perro|gato|mascota|perrito|gatito|dog|cat)\s+(.+?)(?:\.|,|$)/i, label: 'Mascota' },
    // Trabajo y carrera
    { pattern: /(?:trabajo|jefe|empleo|negocio|empresa|freelance|oficina|sueldo|salario)\s+(.+?)(?:\.|,|$)/i, label: 'Trabajo' },
    { pattern: /(?:mi\s+)?(?:emprendimiento|startup|proyecto|negocio propio)\s+(.+?)(?:\.|,|$)/i, label: 'Emprendimiento' },
    { pattern: /(?:client[ea]s?|ventas|marketing|publicidad|redes sociales)\s+(.+?)(?:\.|,|$)/i, label: 'Ventas/Marketing' },
    // Educación
    { pattern: /(?:estudio|carrera|universidad|colegio|escuela|curso|clase|certificacion|título|titulo|grado)\s+(.+?)(?:\.|,|$)/i, label: 'Educación' },
    { pattern: /(?:aprendo|estoy aprendiendo|quiero aprender|idioma|inglés|español|portugués|francés|programación|python|javascript)\s+(.+?)(?:\.|,|$)/i, label: 'Aprendizaje' },
    // Finanzas
    { pattern: /(?:mis\s+)?(?:ingresos|dinero|ahorro|deuda|prestamo|crédito|inversiones|inversión|presupuesto)\s+(.+?)(?:\.|,|$)/i, label: 'Finanzas' },
    { pattern: /(?:dolar|dolares|compra|venta|precio|cuesta|costo)\s+(.+?)(?:\.|,|$)/i, label: 'Compras/Finanzas' },
    // Salud física
    { pattern: /(?:ejercicio|gimnasio|rutina|entreno|pesas|cardio|correr|maraton)\s+(.+?)(?:\.|,|$)/i, label: 'Ejercicio' },
    { pattern: /(?:dieta|comida|alimentación|nutrición|calorías|proteina|suplemento|creatina|vitamina)\s+(.+?)(?:\.|,|$)/i, label: 'Nutrición' },
    { pattern: /(?:lesion|dolor|cadera|rodilla|espalda|hombro|músculo|lastimad|operac|cirugía)\s+(.+?)(?:\.|,|$)/i, label: 'Salud física' },
    { pattern: /(?:peso|bajar|subir|kilos|kg|imc|grasa corporal)\s+(.+?)(?:\.|,|$)/i, label: 'Peso/Fitness' },
    // Salud mental
    { pattern: /(?:estres|ansiedad|miedo|depresión|angustia|frustración|tristeza|soledad|panic|ataque)\s+(.+?)(?:\.|,|$)/i, label: 'Salud mental' },
    { pattern: /(?:sueño|dormir|insomnio|descanso|cansancio|fatiga|noche)\s+(.+?)(?:\.|,|$)/i, label: 'Sueño' },
    { pattern: /(?:meditación|meditacion|mindfulness|yoga|respiración|relajacion)\s+(.+?)(?:\.|,|$)/i, label: 'Bienestar' },
    // Gaming
    { pattern: /(?:juego|juegos|gaming|videojuego|smash|minecraft|fortnite|gta|fifa|lol|valorant|steam|playstation|xbox|nintendo|switch|pc gaming)\s+(.+?)(?:\.|,|$)/i, label: 'Gaming' },
    { pattern: /(?:ranking|rango|tier|diamond|platinum|gold| Ranked|competitivo|torneo)\s+(.+?)(?:\.|,|$)/i, label: 'Gaming competitivo' },
    // Deportes
    { pattern: /(?:fútbol|futbol|soccer|baloncesto|basket|beisbol|tenis|natación|boxeo|mma|ufc)\s+(.+?)(?:\.|,|$)/i, label: 'Deportes' },
    { pattern: /(?:mi\s+)?(?:equipo|selección|club|hincha|fan|barcelona|real madrid|river|boca|alianza|universitario| selects)\s+(.+?)(?:\.|,|$)/i, label: 'Equipo favorito' },
    // Música
    { pattern: /(?:musica|música|cancion|cantante|banda|artista|concierto|guitarra|piano|batería|rap|reggaeton|rock|pop|trap|kpop)\s+(.+?)(?:\.|,|$)/i, label: 'Música' },
    // Cine y series
    { pattern: /(?:pelicula|película|serie|anime|manga|netflix|disney|hbo|prime|director|actor|actriz)\s+(.+?)(?:\.|,|$)/i, label: 'Cine/Series' },
    // Tecnología
    { pattern: /(?:mi\s+)?(?:celular|phone|iphone|android|laptop|computadora|pc|mac|ipad|tablet|gadget|airpods|monitor)\s+(.+?)(?:\.|,|$)/i, label: 'Tecnología' },
    { pattern: /(?:programo|programacion|python|javascript|react|node|django|flask|codigo|desarrollo|software|app|ia|inteligencia artificial)\s+(.+?)(?:\.|,|$)/i, label: 'Programación' },
    // Viajes
    { pattern: /(?:viaje|viajar|vuelo|hotel|destino|turismo|maleta|pasaporte|pais extranjero)\s+(.+?)(?:\.|,|$)/i, label: 'Viajes' },
    // Comida y recetas
    { pattern: /(?:receta|cocinar|cocina|restaurante|comida favorita|postre|cerveza|vino|cafe|café)\s+(.+?)(?:\.|,|$)/i, label: 'Cocina' },
    // Automoviles
    { pattern: /(?:mi\s+)?(?:auto|carro|coche|moto|vehiculo|toyota| honda|hyundai|kia|bmw|mercedes|tesla)\s+(.+?)(?:\.|,|$)/i, label: 'Automóvil' },
    // Moda
    { pattern: /(?:ropa|zapatillas|tenis|marca|nike|adidas|outfit|estilo|moda)\s+(.+?)(?:\.|,|$)/i, label: 'Moda' },
    // Emociones y objetivos
    { pattern: /(?:me\s+siento|estoy\s+sintiendo)\s+(.+?)(?:\.|,|$)/i, label: 'Emoción' },
    { pattern: /(?:no\s+(?:puedo|logro|sé|puedes))\s+(.+?)(?:\.|,|$)/i, label: 'Bloqueo' },
    { pattern: /(?:quiero|necesito|aspiro|meta|objetivo|sueño|proposito)\s+(.+?)(?:\.|,|$)/i, label: 'Objetivo' },
    { pattern: /(?:me gusta|amo|adoro|fan de|sigo|encanta|disfruto)\s+(.+?)(?:\.|,|$)/i, label: 'Interés' },
    // Decisiones importantes
    { pattern: /(?:compr[ea]|mudar[se]|cambiar de|renunciar|empezar|dejar|terminar|iniciar)\s+(.+?)(?:\.|,|$)/i, label: 'Decisión' },
  ];

  for (const { pattern, label, priority } of topicPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1] && match[1].trim().length > 3) {
      const newTopic = `[${label}] ${match[1].trim().substring(0, 120)}`;
      if (!updatedSummary) {
        updatedSummary = newTopic;
      } else {
        if (!updatedSummary.includes(newTopic.substring(0, 20))) {
          const lines = updatedSummary.split(' | ');
          // Keep up to 20 topics for richer memory (increased from 15)
          if (lines.length >= 20) {
            // Remove oldest non-priority topic to make room
            const priorityIdx = lines.findIndex(l => !l.startsWith('[Ubicacion]') && !l.startsWith('[Profesión]') && !l.startsWith('[Edad]') && !l.startsWith('[Pareja]'));
            if (priorityIdx >= 0) {
              lines.splice(priorityIdx, 1);
            } else {
              lines.shift();
            }
          }
          // For priority topics (Ubicacion), always put them near the front
          if (priority) {
            lines.unshift(newTopic);
          } else {
            lines.push(newTopic);
          }
          updatedSummary = lines.join(' | ');
        }
      }
      needsUpdate = true;
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
    const tenantId = searchParams.get('tenantId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 });
    }

    // Verify session ownership
    if (tenantId) {
      try {
        const sessionCheck = await db.execute(
          `SELECT tenantId FROM Session WHERE id = ?`,
          [sessionId]
        );
        if (sessionCheck.rows.length > 0 && sessionCheck.rows[0].tenantId !== tenantId) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }
      } catch {}
    }

    await db.execute(`DELETE FROM Message WHERE sessionId = ?`, [sessionId]);
    await db.execute(`DELETE FROM Session WHERE id = ?`, [sessionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MEMORIA] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
