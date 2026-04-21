export const runtime = 'edge';

// ========================================
// MÓDULO DE OÍDO — WHISPER API
// Speech-to-Text: Transcripción en español
// PROHIBIDO: TTS — Solo texto de salida
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

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

    // Validar tamaño máximo (25MB como Whisper)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Archivo de audio demasiado grande (máx 25MB)' },
        { status: 413 }
      );
    }

    // Convertir a base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    // ---- LLAMADA A WHISPER (vía z-ai-web-dev-sdk) ----
    // Configuración: idioma "es", sin prompt adicional
    const zai = await ZAI.create();
    const result = await zai.audio.transcriptions.create({
      audio: base64Audio,
      language: 'es',
    });

    const transcription = (result.text || '').trim();

    // El archivo de audio ya se destruye automáticamente (no se guarda en disco)

    if (!transcription) {
      return NextResponse.json(
        { transcription: '', warning: 'No se detectó voz en el audio' },
        { status: 200 }
      );
    }

    return NextResponse.json({ transcription });
  } catch (error: unknown) {
    console.error('[OÍDO] Error de transcripción:', error);

    // Error específico de acceso al micrófono
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
    if (errorMsg.includes('Permission') || errorMsg.includes('NotAllowed')) {
      return NextResponse.json(
        { error: 'Permiso de micrófono denegado. Activa el acceso al micrófono en tu navegador.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Error en la transcripción de audio' },
      { status: 500 }
    );
  }
}
