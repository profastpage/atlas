// ================================================
// ATLAS — Cloudflare Pages Function
// Archivo: /functions/api/chat.ts
// Endpoint: POST https://<tu-sitio>.pages.dev/api/chat
// ================================================
//
// Recibe POST con { message, history? }
// Conecta a Qwen Turbo (DashScope — OpenAI-compatible)
// CORS restringido a *.vercel.app
// System Prompt: Consultor experto en estilo y estrategia
// para la tienda Urban Style.
// ================================================

interface CorsHeaders {
  'Access-Control-Allow-Origin': string;
  'Access-Control-Allow-Methods': string;
  'Access-Control-Allow-Headers': string;
  'Content-Type': string;
  'Access-Control-Max-Age'?: string;
}

interface ChatRequestBody {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

interface ChatResponseBody {
  role?: string;
  content?: string;
  timestamp?: string;
  error?: string;
}

interface PagesFunctionContext {
  request: Request;
  env: {
    QWEN_API_KEY?: string;
  };
}

interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface QwenChoice {
  message?: {
    content?: string;
  };
}

interface QwenResponse {
  choices?: QwenChoice[];
}

// Allowed origins for CORS
const ALLOWED_ORIGINS: readonly string[] = [
  'https://tienda-online-oficial.vercel.app',
  'https://tiendaonlineoficial.com',
  'https://www.tiendaonlineoficial.com',
];

function getCorsHeaders(origin: string): CorsHeaders {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const origin: string = context.request.headers.get('Origin') || '';
  const corsHeaders: CorsHeaders = getCorsHeaders(origin);

  try {
    const req: Request = context.request;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ---- Validar Content-Type ----
    const contentType: string = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type debe ser application/json' } as ChatResponseBody),
        { status: 415, headers: corsHeaders }
      );
    }

    // ---- Leer body ----
    let body: ChatRequestBody;
    try {
      body = await req.json() as ChatRequestBody;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Body invalido. Envía JSON válido.' } as ChatResponseBody),
        { status: 400, headers: corsHeaders }
      );
    }

    const { message, history } = body;

    // ---- Validar mensaje ----
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'El campo "message" es obligatorio.' } as ChatResponseBody),
        { status: 400, headers: corsHeaders }
      );
    }

    if (message.length > 4000) {
      return new Response(
        JSON.stringify({ error: 'El mensaje no puede superar los 4000 caracteres.' } as ChatResponseBody),
        { status: 413, headers: corsHeaders }
      );
    }

    // ---- API Key ----
    const QWEN_API_KEY: string | undefined = context.env.QWEN_API_KEY;
    if (!QWEN_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key no configurada en el servidor.' } as ChatResponseBody),
        { status: 503, headers: corsHeaders }
      );
    }

    // ---- Construir mensajes para Qwen ----
    const systemPrompt: QwenMessage = {
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
    const messages: QwenMessage[] = [systemPrompt];

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
    let atlasResponse: string;
    try {
      const qwenRes: Response = await fetch(
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
        const errorBody: string = await qwenRes.text();
        console.error('[ATLAS] Qwen API error:', qwenRes.status, errorBody);
        return new Response(
          JSON.stringify({
            error: 'Error temporal con el servicio de IA. Intenta en unos segundos.',
          } as ChatResponseBody),
          { status: 502, headers: corsHeaders }
        );
      }

      const qwenData: QwenResponse = await qwenRes.json() as QwenResponse;
      atlasResponse =
        qwenData.choices?.[0]?.message?.content ||
        'No pude generar una respuesta. Intenta de nuevo.';

      atlasResponse = atlasResponse.trim();
      if (!atlasResponse) {
        atlasResponse = 'No pude generar una respuesta. Intenta de nuevo.';
      }
    } catch (err: unknown) {
      console.error('[ATLAS] Fetch error:', err);
      return new Response(
        JSON.stringify({ error: 'Error de conexión con el servicio de IA.' } as ChatResponseBody),
        { status: 502, headers: corsHeaders }
      );
    }

    // ---- Respuesta exitosa ----
    return new Response(
      JSON.stringify({
        role: 'assistant',
        content: atlasResponse,
        timestamp: new Date().toISOString(),
      } as ChatResponseBody),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: unknown) {
    console.error('[ATLAS] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor.' } as ChatResponseBody),
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---- Handle OPTIONS (CORS preflight) ----
export async function onRequestOptions(context: PagesFunctionContext): Promise<Response> {
  const origin: string = context.request.headers.get('Origin') || '';
  const headers: CorsHeaders = getCorsHeaders(origin);
  const preflightHeaders: Record<string, string> = { ...headers, 'Access-Control-Max-Age': '86400' };
  return new Response(null, { status: 204, headers: preflightHeaders });
}
