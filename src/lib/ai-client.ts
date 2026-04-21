// ========================================
// EDGE-COMPATIBLE AI CLIENT — QWEN BRAIN
// Primary: Qwen via OpenRouter
// Fallback: Z.ai internal proxy (GLM)
// Direct fetch calls — no Node.js APIs
// ========================================
//
// Env vars:
//   QWEN_API_KEY      — OpenRouter API key (primary brain)
//   QWEN_BASE_URL     — OpenRouter base URL
//   QWEN_MODEL        — Qwen model name (default: qwen/qwen-turbo)
//   ZAI_BASE_URL      — Z.ai internal proxy URL (fallback)
//   ZAI_API_KEY       — Z.ai API key (fallback)
//   LLM_MODEL         — Fallback model (default: glm-4-flash)
//   LLM_MAX_TOKENS    — Max response tokens (default: 150)

// ========================================
// QWEN / OPENROUTER — PRIMARY BRAIN
// ========================================

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
// Z.AI PROXY — FALLBACK BRAIN
// ========================================

const ZAI_CONFIG = {
  baseUrl: process.env.ZAI_BASE_URL || 'http://172.25.136.193:8080/v1',
  apiKey: process.env.ZAI_API_KEY || 'Z.ai',
  chatId: process.env.ZAI_CHAT_ID || '',
  userId: process.env.ZAI_USER_ID || '',
  token: process.env.ZAI_TOKEN || '',
  defaultModel: process.env.LLM_MODEL || 'glm-4-flash',
};

function getZaiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_CONFIG.apiKey}`,
    'X-Z-AI-From': 'Z',
  };
  if (ZAI_CONFIG.chatId) headers['X-Chat-Id'] = ZAI_CONFIG.chatId;
  if (ZAI_CONFIG.userId) headers['X-User-Id'] = ZAI_CONFIG.userId;
  if (ZAI_CONFIG.token) headers['X-Token'] = ZAI_CONFIG.token;
  return headers;
}

// ========================================
// CHAT COMPLETIONS (LLM) — QWEN PRIMARY, Z.AI FALLBACK
// ========================================

export async function createChatCompletion(body: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  model?: string;
  thinking?: { type: string };
}) {
  const maxTokens = body.max_tokens || QWEN_CONFIG.maxTokens;

  // ---- TRY QWEN (OpenRouter) FIRST ----
  if (hasQwen()) {
    try {
      return await callQwen(body, maxTokens);
    } catch (error) {
      console.error('[BRAIN] Qwen error, falling back to Z.ai:', error instanceof Error ? error.message : error);
    }
  }

  // ---- FALLBACK: Z.AI PROXY ----
  return callZai(body, maxTokens);
}

async function callQwen(body: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  model?: string;
  thinking?: { type: string };
}, maxTokens: number) {
  const url = `${QWEN_CONFIG.baseUrl}/chat/completions`;
  const requestBody = {
    model: body.model || QWEN_CONFIG.model,
    messages: body.messages,
    temperature: body.temperature ?? 0.7,
    max_tokens: maxTokens,
  };

  console.log('[BRAIN] Using Qwen:', QWEN_CONFIG.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`,
      'HTTP-Referer': 'https://atlas-9mv.pages.dev',
      'X-Title': 'Atlas Coach',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Qwen API ${response.status}: ${errorBody}`);
  }

  return await response.json();
}

async function callZai(body: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  model?: string;
  thinking?: { type: string };
}, maxTokens: number) {
  const url = `${ZAI_CONFIG.baseUrl}/chat/completions`;
  const requestBody = {
    ...body,
    model: body.model || ZAI_CONFIG.defaultModel,
    max_tokens: maxTokens,
    thinking: body.thinking || { type: 'disabled' },
  };

  console.log('[BRAIN] Using Z.ai fallback:', ZAI_CONFIG.defaultModel);

  const response = await fetch(url, {
    method: 'POST',
    headers: getZaiHeaders(),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Z.ai API ${response.status}: ${errorBody}`);
  }

  return await response.json();
}

// ========================================
// AUDIO TRANSCRIPTION (ASR)
// ========================================

export async function createTranscription(
  audioBase64: string,
  language: string = 'es'
) {
  // Use Z.ai proxy for STT (Qwen/OpenRouter doesn't have audio)
  const url = `${ZAI_CONFIG.baseUrl}/audio/transcriptions`;

  const formData = new FormData();
  const byteChars = atob(audioBase64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: 'audio/webm' });
  formData.append('file', blob, 'audio.webm');
  formData.append('language', language);

  const response = await fetch(url, {
    method: 'POST',
    headers: getZaiHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ASR API ${response.status}: ${errorBody}`);
  }

  return await response.json();
}
