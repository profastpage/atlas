// ================================================
// ATLAS — Cloudflare Pages Function
// Archivo: /functions/api/chat.js
// Endpoint: POST https://<tu-sitio>.pages.dev/api/chat
// ================================================
//
// Recibe POST con { message, history? }
// Conecta a Qwen Turbo (DashScope — OpenAI-compatible)
// CORS restringido a *.vercel.app
// System Prompt: Consultor experto en estilo y estrategia
// para la tienda Urban Style.
// ================================================

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://tienda-online-oficial.vercel.app',
  'https://tiendaonlineoficial.com',
  'https://www.tiendaonlineoficial.com',
];

function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

export async function onRequestPost(context) {
  const origin = context.request.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(origin);

  try {
    const req = context.request;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ---- Validar Content-Type ----
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type debe ser application/json' }),
        { status: 415, headers: corsHeaders }
      );
    }

    // ---- Leer body ----
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Body invalido. Envía JSON válido.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { message, history } = body;

    // ---- Validar mensaje ----
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'El campo "message" es obligatorio.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (message.length > 4000) {
      return new Response(
        JSON.stringify({ error: 'El mensaje no puede superar los 4000 caracteres.' }),
        { status: 413, headers: corsHeaders }
      );
    }

    // ---- API Key ----
    const QWEN_API_KEY = context.env.QWEN_API_KEY;
    if (!QWEN_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key no configurada en el servidor.' }),
        { status: 503, headers: corsHeaders }
      );
    }

    // ---- Construir mensajes para Qwen ----
    const systemPrompt = {
      role: 'system',
      content: `Eres ATLAS, un consultor experto en estilo personal, moda masculina y estrategia de tienda para "Urban Style".

Tu misión:
- Asesorar al cliente sobre outfits, combinaciones de colores, tendencias actuales y estilo personal.
- Recomendar productos de Urban Style basándote en las preferencias del cliente.
- Ofrecer consejos de moda prácticos adaptados al clima, ocasión y presupuesto.
- Mantener un tono cercano, profesional y moderno (tú/usted según la situación).
- Responder en español.
- Si el cliente pregunta por algo fuera de moda/estilo, redirige amablemente al tema.

Reglas:
- Nunca inventes productos que no existan. Si no estás seguro, sugiere consultar la tienda.
- Sé conciso pero completo (3-5 oraciones por respuesta).
- Usa un tono entusiasta pero no excesivo.
- Si el usuario esgroza o pide cosas inapropiadas, responde con humor elegante y redirige.`,
    };

    // Historial de conversación (opcional, máx 10 mensajes para contexto)
    const messages = [systemPrompt];

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          if (typeof msg.content === 'string' && msg.content.trim()) {
            messages.push({ role: msg.role, content: msg.content.trim() });
          }
        }
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    // ---- Llamar a Qwen Turbo (DashScope OpenAI-compatible) ----
    let atlasResponse;
    try {
      const qwenRes = await fetch(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${QWEN_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'qwen-turbo',
            messages,
            max_tokens: 600,
            temperature: 0.7,
            top_p: 0.9,
          }),
        }
      );

      if (!qwenRes.ok) {
        const errorBody = await qwenRes.text();
        console.error('[ATLAS] Qwen API error:', qwenRes.status, errorBody);
        return new Response(
          JSON.stringify({
            error: 'Error temporal con el servicio de IA. Intenta en unos segundos.',
          }),
          { status: 502, headers: corsHeaders }
        );
      }

      const qwenData = await qwenRes.json();
      atlasResponse =
        qwenData.choices?.[0]?.message?.content ||
        'No pude generar una respuesta. Intenta de nuevo.';

      atlasResponse = atlasResponse.trim();
      if (!atlasResponse) {
        atlasResponse = 'No pude generar una respuesta. Intenta de nuevo.';
      }
    } catch (err) {
      console.error('[ATLAS] Fetch error:', err);
      return new Response(
        JSON.stringify({ error: 'Error de conexión con el servicio de IA.' }),
        { status: 502, headers: corsHeaders }
      );
    }

    // ---- Respuesta exitosa ----
    return new Response(
      JSON.stringify({
        role: 'assistant',
        content: atlasResponse,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[ATLAS] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor.' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---- Handle OPTIONS (CORS preflight) ----
export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin') || '';
  const headers = getCorsHeaders(origin);
  headers['Access-Control-Max-Age'] = '86400';
  return new Response(null, { status: 204, headers });
}
