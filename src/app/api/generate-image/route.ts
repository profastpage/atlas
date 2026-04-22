export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai-client';
import { getSupabaseServer } from '@/lib/supabase';

const supabase = getSupabaseServer();

// Image limits per plan
const IMAGE_LIMITS: Record<string, number> = {
  basico: 20,
  pro: 50,
  executive: 100,
  free: 0,
  suspended: 0,
};

// Demo/trial plans: max 5 images to avoid excessive costs
const DEMO_IMAGE_LIMIT = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, tenantId } = body;

    if (!prompt || !tenantId) {
      return NextResponse.json(
        { error: 'prompt y tenantId son obligatorios' },
        { status: 400 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Servicio no disponible' },
        { status: 503 }
      );
    }

    // Fetch user profile to check plan and image count
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_type, trial_plan, trial_ends_at, images_generated_month, extra_images_purchased, pending_image_payment')
      .eq('id', tenantId)
      .single();

    if (profileError || !profile) {
      console.error('[IMAGE_GEN] Profile fetch error:', profileError);
      return NextResponse.json(
        { error: 'No se pudo verificar tu perfil' },
        { status: 403 }
      );
    }

    const planType = profile.plan_type || 'free';
    // Check if user is on an active demo/trial
    const trialPlan = profile.trial_plan || null;
    const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const isDemoUser = !!(trialPlan && trialEndsAt && trialEndsAt > new Date());

    // Demo/trial users: max 5 images regardless of plan tier
    const monthLimit = isDemoUser ? DEMO_IMAGE_LIMIT : (IMAGE_LIMITS[planType] || 0);
    const extraImages = isDemoUser ? 0 : (profile.extra_images_purchased || 0);
    const totalAvailable = monthLimit + extraImages;
    const used = profile.images_generated_month || 0;

    // Check if user has pending payment (admin hasn't approved yet)
    if (profile.pending_image_payment) {
      return NextResponse.json({
        error: 'pending_payment',
        message: 'Tu pago esta siendo verificado. Espera la aprobacion del admin.',
        used,
        totalAvailable,
        is_demo: isDemoUser,
      }, { status: 402 });
    }

    // Check limit
    if (used >= totalAvailable) {
      return NextResponse.json({
        error: 'limit_reached',
        message: isDemoUser
          ? `Tu demo permite maximo ${DEMO_IMAGE_LIMIT} imagenes. Adquiere un plan para mas.`
          : 'Has alcanzado tu limite de imagenes este mes.',
        used,
        totalAvailable,
        monthLimit,
        extraImages,
        is_demo: isDemoUser,
      }, { status: 402 });
    }

    // Generate image
    const imageDataUrl = await generateImage(prompt);

    // Increment counter in Supabase
    const newCount = used + 1;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        images_generated_month: newCount,
        // Decrement extra_images_purchased if the monthly limit was exceeded
        ...(used >= monthLimit ? { extra_images_purchased: Math.max(0, extraImages - 1) } : {}),
      })
      .eq('id', tenantId);

    if (updateError) {
      console.error('[IMAGE_GEN] Counter update error:', updateError);
      // Don't fail — image was already generated
    }

    return NextResponse.json({
      image: imageDataUrl,
      used: newCount,
      remaining: Math.max(0, totalAvailable - newCount),
      is_demo: isDemoUser,
    });
  } catch (error) {
    console.error('[IMAGE_GEN] Error:', error);
    const msg = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json(
      { error: 'Error al generar imagen', detail: msg },
      { status: 500 }
    );
  }
}

// GET: Check image quota for user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId || !supabase) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_type, trial_plan, trial_ends_at, images_generated_month, extra_images_purchased, pending_image_payment')
      .eq('id', tenantId)
      .single();

    if (!profile) {
      return NextResponse.json({
        plan_type: 'free',
        images_generated_month: 0,
        extra_images_purchased: 0,
        total_available: 0,
        remaining: 0,
        pending_image_payment: false,
        is_demo: false,
      });
    }

    const planType = profile.plan_type || 'free';
    // Check if user is on an active demo/trial
    const trialPlan = profile.trial_plan || null;
    const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const isDemoUser = !!(trialPlan && trialEndsAt && trialEndsAt > new Date());

    // Demo/trial users: max 5 images regardless of plan tier
    const monthLimit = isDemoUser ? DEMO_IMAGE_LIMIT : (IMAGE_LIMITS[planType] || 0);
    const extraImages = isDemoUser ? 0 : (profile.extra_images_purchased || 0);
    const totalAvailable = monthLimit + extraImages;
    const used = profile.images_generated_month || 0;

    return NextResponse.json({
      plan_type: planType,
      is_demo: isDemoUser,
      images_generated_month: used,
      extra_images_purchased: extraImages,
      total_available: totalAvailable,
      remaining: Math.max(0, totalAvailable - used),
      pending_image_payment: profile.pending_image_payment || false,
    });
  } catch (error) {
    console.error('[IMAGE_QUOTA] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
