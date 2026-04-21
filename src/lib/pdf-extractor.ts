// ========================================
// PDF TEXT EXTRACTOR — Client-side only
// Uses pdfjs-dist with CDN worker (Edge-safe)
// Lazy loaded: only imported when user uploads a PDF
// ========================================

const PDFJS_CDN_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';
const MAX_TOKENS = 80000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN; // 320,000 chars

let _pdfjsLoaded = false;

async function loadPdfJs() {
  if (_pdfjsLoaded) return;
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
  _pdfjsLoaded = true;
}

/**
 * Extract text from a PDF File object
 * Returns { text, charCount, tokenEstimate } or throws Error
 */
export async function extractPdfText(file: File): Promise<{
  text: string;
  charCount: number;
  tokenEstimate: number;
}> {
  await loadPdfJs();

  const pdfjsLib = await import('pdfjs-dist');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();
    pages.push(pageText);
  }

  const text = pages.join('\n\n').trim();
  const charCount = text.length;
  const tokenEstimate = Math.ceil(charCount / CHARS_PER_TOKEN);

  return { text, charCount, tokenEstimate };
}

/**
 * Extract text from a .txt file
 */
export function extractTxtText(file: File): {
  text: string;
  charCount: number;
  tokenEstimate: number;
} {
  // This returns a promise because we need to read the file
  // Caller should use: await extractTxtText(file) — but this is sync
  // Actually, FileReader is async, so let's return a promise
  throw new Error('Use extractTxtTextAsync instead');
}

export async function extractTxtTextAsync(file: File): Promise<{
  text: string;
  charCount: number;
  tokenEstimate: number;
}> {
  const text = await file.text();
  const charCount = text.length;
  const tokenEstimate = Math.ceil(charCount / CHARS_PER_TOKEN);
  return { text, charCount, tokenEstimate };
}

/**
 * Validate token count against limit
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateDocumentSize(charCount: number, tokenEstimate: number): {
  valid: boolean;
  error?: string;
} {
  if (tokenEstimate > MAX_TOKENS) {
    return {
      valid: false,
      error: `El documento excede el limite de 80,000 tokens (aprox 60 paginas, tiene ~${tokenEstimate.toLocaleString()}). Por favor sube un resumen o la parte especifica.`,
    };
  }
  return { valid: true };
}

export { MAX_TOKENS, CHARS_PER_TOKEN, MAX_CHARS };
