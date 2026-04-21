// ========================================
// EDGE-COMPATIBLE AI CLIENT
// Direct fetch calls — no Node.js APIs (fs, path, os)
// Works on Cloudflare Workers, Vercel Edge, Browser
// ========================================

const ZAI_CONFIG = {
  baseUrl: process.env.ZAI_BASE_URL || 'http://172.25.136.193:8080/v1',
  apiKey: process.env.ZAI_API_KEY || 'Z.ai',
  chatId: process.env.ZAI_CHAT_ID || '',
  userId: process.env.ZAI_USER_ID || '',
  token: process.env.ZAI_TOKEN || '',
};

function getHeaders(): Record<string, string> {
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
// CHAT COMPLETIONS (LLM)
// ========================================

export async function createChatCompletion(body: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}) {
  const url = `${ZAI_CONFIG.baseUrl}/chat/completions`;
  const requestBody = {
    ...body,
    thinking: body.thinking || { type: 'disabled' },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API ${response.status}: ${errorBody}`);
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
  const url = `${ZAI_CONFIG.baseUrl}/audio/transcriptions`;

  const formData = new FormData();

  // Convert base64 to Blob for FormData
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
    headers: getHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ASR API ${response.status}: ${errorBody}`);
  }

  return await response.json();
}
