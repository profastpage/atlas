export const runtime = 'edge';

// ========================================
// MÓDULO DE OÍDO — Speech-to-Text
// Edge-compatible: no Node.js APIs
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createTranscription } from '@/lib/ai-client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No se recibió archivo de audio' },
        { status: 400 }
      );
    }

    // Validar tamaño (25MB)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio demasiado grande (máx 25MB)' },
        { status: 413 }
      );
    }

    // Convertir a base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const base64Audio = btoa(binary);

    // Transcripción via fetch nativo
    const result = await createTranscription(base64Audio, 'es');
    const transcription = (result.text || '').trim();

    if (!transcription) {
      return NextResponse.json({
        transcription: '',
        warning: 'No se detectó voz',
      });
    }

    return NextResponse.json({ transcription });
  } catch (error: unknown) {
    console.error('[OÍDO] Error:', error);
    const msg = error instanceof Error ? error.message : 'Error desconocido';

    if (msg.includes('Permission') || msg.includes('NotAllowed')) {
      return NextResponse.json(
        { error: 'Permiso de micrófono denegado' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Error en la transcripción' },
      { status: 500 }
    );
  }
}
