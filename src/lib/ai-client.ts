// ========================================
// EDGE-COMPATIBLE AI CLIENT — QWEN + ROUTER
// Direct fetch calls — no Node.js APIs
//
// Models:
//   qwen/qwen-turbo          — Main chat brain
//   meta-llama/llama-3.3-70b-instruct  — PDF structured extraction (free on OpenRouter)
//   google/gemini-2.5-flash-lite       — Image description (future)
//
// Env vars:
//   QWEN_API_KEY      — OpenRouter API key
//   QWEN_BASE_URL     — OpenRouter base URL (default: https://openrouter.ai/api/v1)
//   QWEN_MODEL        — Qwen model name (default: qwen/qwen-turbo)
//   LLM_MAX_TOKENS    — Max response tokens (default: 150)
// ========================================

const QWEN_CONFIG = {
  baseUrl: process.env.QWEN_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.QWEN_API_KEY || '',
  model: process.env.QWEN_MODEL || 'qwen/qwen-turbo',
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '300', 10),
};

// PDF Pipeline Model — Llama 3.3 70B (free on OpenRouter)
const PDF_EXTRACTOR_CONFIG = {
  model: process.env.PDF_EXTRACTOR_MODEL || 'meta-llama/llama-3.3-70b-instruct',
};

// Image Pipeline Model — Gemini 2.5 Flash Lite (future)
const IMAGE_DESCRIBER_CONFIG = {
  model: process.env.IMAGE_DESCRIBER_MODEL || 'google/gemini-2.5-flash-lite-preview-06-05',
};

function hasQwen(): boolean {
  return !!QWEN_CONFIG.apiKey;
}

// ========================================
// CHAT COMPLETIONS — QWEN ONLY, NO FALLBACK
// ========================================

export async function createChatCompletion(body: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  model?: string;
  thinking?: { type: string };
}) {
  if (!hasQwen()) {
    throw new Error('[BRAIN] Qwen API key no configurada. No se permite fallback a otros modelos.');
  }

  const maxTokens = body.max_tokens || QWEN_CONFIG.maxTokens;
  const url = `${QWEN_CONFIG.baseUrl}/chat/completions`;

  console.log('[BRAIN] Using Qwen:', QWEN_CONFIG.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`,
      'HTTP-Referer': 'https://atlas-9mv.pages.dev',
      'X-Title': 'Atlas Coach',
    },
    body: JSON.stringify({
      model: body.model || QWEN_CONFIG.model,
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Qwen API ${response.status}: ${errorBody}`);
  }

  return await response.json();
}

// ========================================
// STREAMING CHAT COMPLETIONS — SSE from Qwen ONLY
// Returns raw ReadableStream, caller handles SSE parsing
// ========================================

export async function streamChatCompletion(body: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  model?: string;
}): Promise<ReadableStream<Uint8Array> | null> {
  if (!hasQwen()) {
    throw new Error('[BRAIN] Qwen API key no configurada. No se permite fallback a otros modelos.');
  }

  const maxTokens = body.max_tokens || QWEN_CONFIG.maxTokens;
  const url = `${QWEN_CONFIG.baseUrl}/chat/completions`;

  console.log('[BRAIN] Streaming Qwen:', QWEN_CONFIG.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`,
      'HTTP-Referer': 'https://atlas-9mv.pages.dev',
      'X-Title': 'Atlas Coach',
    },
    body: JSON.stringify({
      model: body.model || QWEN_CONFIG.model,
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Qwen API ${response.status}: ${errorBody}`);
  }

  return response.body;
}

// ========================================
// PDF PIPELINE — Llama 3.3 70B (free on OpenRouter)
// Extracts structured data from document text
// ========================================

const PDF_EXTRACTOR_SYSTEM_PROMPT = `Eres un asistente de extracción de datos. Analiza el siguiente texto y extrae: 1) Los puntos clave o hechos principales. 2) Las entidades mencionadas (nombres, fechas, montos, problemas). 3) Las conclusiones del texto. Sé exhaustivo, no dejes fuera ningún detalle importante. Estructura tu salida claramente con viñetas.`;

export async function extractPdfStructured(documentText: string): Promise<string> {
  const url = `${QWEN_CONFIG.baseUrl}/chat/completions`;

  console.log('[PDF_PIPELINE] Extracting with Llama:', PDF_EXTRACTOR_CONFIG.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`,
      'HTTP-Referer': 'https://atlas-9mv.pages.dev',
      'X-Title': 'Atlas Coach — PDF Pipeline',
    },
    body: JSON.stringify({
      model: PDF_EXTRACTOR_CONFIG.model,
      messages: [
        { role: 'system', content: PDF_EXTRACTOR_SYSTEM_PROMPT },
        { role: 'user', content: `Analiza este documento:\n\n---\n${documentText}\n---` },
      ],
      temperature: 0.3, // Low temp for extraction accuracy
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[PDF_PIPELINE] Llama error:', response.status, errorBody);
    throw new Error(`PDF extractor ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const extracted = data.choices?.[0]?.message?.content?.trim() || '';

  if (!extracted) {
    console.error('[PDF_PIPELINE] Empty extraction from Llama');
    throw new Error('PDF extraction returned empty result');
  }

  console.log('[PDF_PIPELINE] Extraction complete, length:', extracted.length);
  return extracted;
}

// ========================================
// IMAGE PIPELINE — Gemini 2.5 Flash Lite
// Describes image content for Qwen to respond
// Receives base64 data URL from frontend
// ========================================

const IMAGE_DESCRIBER_SYSTEM_PROMPT = `Eres un asistente que describe imágenes para otro modelo. Describe detalladamente lo que ves en español. Incluye: 1) Elementos principales visibles. 2) Texto legible en la imagen. 3) Colores,布局 y composición. 4) Contexto o escenario si es identifiable. 5) Detalles relevantes que podrían ser útiles para responder preguntas sobre la imagen.`;

export async function describeImage(base64DataUrl: string): Promise<string> {
  const url = `${QWEN_CONFIG.baseUrl}/chat/completions`;

  console.log('[IMAGE_PIPELINE] Describing with Gemini:', IMAGE_DESCRIBER_CONFIG.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`,
      'HTTP-Referer': 'https://atlas-9mv.pages.dev',
      'X-Title': 'Atlas Coach — Image Pipeline',
    },
    body: JSON.stringify({
      model: IMAGE_DESCRIBER_CONFIG.model,
      messages: [
        { role: 'system', content: IMAGE_DESCRIBER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe esta imagen y sus detalles clave:' },
            { type: 'image_url', image_url: { url: base64DataUrl } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[IMAGE_PIPELINE] Gemini error:', response.status, errorBody);
    throw new Error(`Image describer ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const description = data.choices?.[0]?.message?.content?.trim() || '';

  if (!description) {
    console.error('[IMAGE_PIPELINE] Empty description from Gemini');
    throw new Error('Image description returned empty result');
  }

  console.log('[IMAGE_PIPELINE] Description complete, length:', description.length);
  return description;
}

// ========================================
// IMAGE GENERATION — FLUX.1 Schnell via Together AI
// $0.003 per image — excellent quality
// Returns base64 image data URL
// ========================================

const IMAGE_GEN_CONFIG = {
  baseUrl: process.env.IMAGE_GEN_BASE_URL || 'https://api.together.xyz',
  apiKey: process.env.IMAGE_GEN_API_KEY || '',
  model: process.env.IMAGE_GEN_MODEL || 'black-forest-labs/FLUX.1-schnell',
};

export async function generateImage(prompt: string): Promise<string> {
  const apiKey = IMAGE_GEN_CONFIG.apiKey;
  const baseUrl = IMAGE_GEN_CONFIG.baseUrl;

  console.log('[IMAGE_GEN] Generating with:', IMAGE_GEN_CONFIG.model, 'via Together AI');

  const response = await fetch(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_GEN_CONFIG.model,
      prompt: prompt,
      n: 1,
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[IMAGE_GEN] API error:', response.status, errorBody);
    throw new Error(`Image generation ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const base64Data = data.data?.[0]?.b64_json;

  if (!base64Data) {
    console.error('[IMAGE_GEN] No image data in response');
    throw new Error('Image generation returned no data');
  }

  console.log('[IMAGE_GEN] Image generated successfully');
  return `data:image/png;base64,${base64Data}`;
}

// ========================================
// AUDIO TRANSCRIPTION
// Now uses Web Speech API (browser-native, free).
// createTranscription is no longer needed server-side.
// ========================================
