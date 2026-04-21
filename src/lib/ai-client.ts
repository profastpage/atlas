// ========================================
// EDGE-COMPATIBLE AI CLIENT — QWEN ONLY
// NO fallback. Qwen-Turbo is the ONLY model.
// Direct fetch calls — no Node.js APIs
// ========================================
//
// Env vars:
//   QWEN_API_KEY      — OpenRouter API key
//   QWEN_BASE_URL     — OpenRouter base URL (default: https://openrouter.ai/api/v1)
//   QWEN_MODEL        — Qwen model name (default: qwen/qwen-turbo)
//   LLM_MAX_TOKENS    — Max response tokens (default: 150)

const QWEN_CONFIG = {
  baseUrl: process.env.QWEN_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.QWEN_API_KEY || '',
  model: process.env.QWEN_MODEL || 'qwen/qwen-turbo',
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '150', 10),
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
// AUDIO TRANSCRIPTION
// Now uses Web Speech API (browser-native, free).
// createTranscription is no longer needed server-side.
// ========================================
