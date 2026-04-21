export const runtime = 'edge';

// ========================================
// VOICE TRANSCRIPTION — Speech-to-Text with Plan Quotas
// Edge-compatible: no Node.js APIs
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createTranscription } from '@/lib/ai-client';
import { getSupabaseServer } from '@/lib/supabase';

// ========================================
// VOICE LIMITS BY PLAN (minutes per month)
// ========================================
const VOICE_LIMITS: Record<string, number> = {
  basico: 30,
  pro: 60,
  ejecutivo: 100,
  elite: 100,
  profesional: 60,
  free: 0,
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const tenantId = (formData.get('tenantId') as string) || '';

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

    // ---- VOICE QUOTA CHECK ----
    // Measure audio duration from file size (rough estimate)
    // WebM/Opus: ~1 byte per second at typical bitrate; MP4/AAC: ~16 bytes per second
    // We'll use the file size as a rough proxy: assume ~32kbps = 4KB/s average
    const estimatedDurationSeconds = audioFile.size / 4000;
    const audioDurationMinutes = estimatedDurationSeconds / 60;

    // If user is authenticated, check quota
    if (tenantId) {
      const supabase = getSupabaseServer();
      if (supabase) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan_type, voice_minutes_used')
          .eq('id', tenantId)
          .single();

        if (profile) {
          const planType = (profile.plan_type || 'free').toLowerCase();
          const limit = VOICE_LIMITS[planType] ?? VOICE_LIMITS.free;
          const used = Number(profile.voice_minutes_used || 0);

          if (limit === 0) {
            return NextResponse.json(
              {
                error: `No tienes minutos de voz disponibles. Actualiza tu plan para usar la transcripción de voz.`,
                code: 'VOICE_NO_PLAN',
                used: 0,
                limit: 0,
              },
              { status: 403 }
            );
          }

          if (used + audioDurationMinutes > limit) {
            const remaining = Math.max(0, limit - used);
            return NextResponse.json(
              {
                error: `Límite de voz alcanzado. Has usado ${used.toFixed(1)} de ${limit} minutos. Actualiza tu plan para más tiempo.`,
                code: 'VOICE_LIMIT_REACHED',
                used: used.toFixed(1),
                limit,
                remaining: remaining.toFixed(1),
              },
              { status: 403 }
            );
          }
        }
      }
    }

    // ---- TRANSCRIPTION ----
    // Convertir a base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const base64Audio = btoa(binary);

    const result = await createTranscription(base64Audio, 'es');
    const transcription = (result.text || '').trim();

    if (!transcription) {
      return NextResponse.json({
        transcription: '',
        warning: 'No se detectó voz',
      });
    }

    // ---- UPDATE VOICE USAGE ----
    if (tenantId) {
      const supabase = getSupabaseServer();
      if (supabase) {
        try {
          // Use actual duration if we got a more precise one, otherwise use estimate
          await supabase.rpc('increment_voice_minutes', {
            p_tenant_id: tenantId,
            p_minutes: audioDurationMinutes,
          }).catch(async () => {
            // Fallback: direct update if RPC doesn't exist
            const { data: profile } = await supabase
              .from('profiles')
              .select('voice_minutes_used')
              .eq('id', tenantId)
              .single();
            const current = Number(profile?.voice_minutes_used || 0);
            await supabase
              .from('profiles')
              .update({ voice_minutes_used: current + audioDurationMinutes })
              .eq('id', tenantId);
          });
        } catch (err) {
          console.error('[VOICE] Error updating usage:', err);
        }
      }
    }

    // Return transcription + updated usage info
    let voiceInfo: { used: number; limit: number } | undefined;
    if (tenantId) {
      const supabase = getSupabaseServer();
      if (supabase) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan_type, voice_minutes_used')
            .eq('id', tenantId)
            .single();
          if (profile) {
            const planType = (profile.plan_type || 'free').toLowerCase();
            voiceInfo = {
              used: Number(profile.voice_minutes_used || 0),
              limit: VOICE_LIMITS[planType] ?? VOICE_LIMITS.free,
            };
          }
        } catch {}
      }
    }

    return NextResponse.json({ transcription, voiceInfo });
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
