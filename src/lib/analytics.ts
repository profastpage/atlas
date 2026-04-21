'use client';

import posthog from 'posthog-js';

// ========================================
// POSTHOG ANALYTICS — Atlas Coach
// 100% gratuito para startups
// ========================================

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let isInitialized = false;

export function initPostHog() {
  if (isInitialized || typeof window === 'undefined') return;
  if (!POSTHOG_KEY) {
    console.warn('[PostHog] NEXT_PUBLIC_POSTHOG_KEY no configurada. Analytics desactivada.');
    return;
  }

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // Cloudflare Pages — la app es SPA en production
      capture_pageview: false, // Manejamos pageviews manualmente con router
      persistence: 'localStorage+cookie',
      // Privacy: no capturar inputs de formularios
      autocapture: false,
      // Rendimiento: no bloquear carga
      request_batching: true,
      batch_size: 20,
      flush_interval: 5000,
      // Session: 30 minutos
      session_recording: false, // Desactivado por ahora (ahorra bundle)
    });
    isInitialized = true;
    console.log('[PostHog] Inicializada correctamente');
  } catch (err) {
    console.warn('[PostHog] Error al inicializar:', err);
  }
}

// ========================================
// FUNCIONES DE TRACKING — Eventos custom
// ========================================

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Captura un evento de analytics de forma segura.
 * Si PostHog no está inicializada, no hace nada (no throw).
 */
export function trackEvent(event: string, properties?: Record<string, string | number | boolean>) {
  if (!isInitialized) return;
  try {
    posthog.capture(event, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Silencio — analytics nunca debe romper la app
  }
}

// ---- EVENTOS PREDEFINIDOS ----

/** Se dispara cada vez que el usuario envía un mensaje */
export function trackMessageSent(props: {
  hasPlan: boolean;
  planType?: string;
  hasDocument: boolean;
  isVoice: boolean;
  messageLength: number;
}) {
  trackEvent('Mensaje Enviado', {
    tiene_plan: props.hasPlan,
    tipo_plan: props.planType || 'ninguno',
    con_documento: props.hasDocument,
    es_voz: props.isVoice,
    largo_mensaje: props.messageLength,
  });
}

/** Se dispara cuando alguien selecciona/compra un plan */
export function trackPlanSelected(props: {
  planId: string;
  planName: string;
  price: number;
  source: string; // 'paywall', 'settings', 'upgrade'
}) {
  trackEvent('Plan Comprado', {
    plan_id: props.planId,
    plan_nombre: props.planName,
    precio: props.price,
    fuente: props.source,
  });
}

/** Se dispara cuando se muestra el paywall */
export function trackPaywallShown(props: {
  reason: string; // 'trial_exceeded', 'pdf_gate', 'alarm_gate'
  messagesSent: number;
  isAuthenticated: boolean;
}) {
  trackEvent('Paywall Mostrado', {
    razon: props.reason,
    mensajes_enviados: props.messagesSent,
    autenticado: props.isAuthenticated,
  });
}

/** Se dispara cuando el usuario cierra el paywall sin comprar */
export function trackPaywallDismissed(props: {
  reason: string;
}) {
  trackEvent('Paywall Cerrado', {
    razon: props.reason,
  });
}

/** Se dispara cuando el usuario inicia sesión */
export function trackLogin(props: {
  method: string; // 'google', 'email', 'oauth_callback'
}) {
  trackEvent('Login', {
    metodo: props.method,
  });
}

/** Se dispara cuando el usuario se registra */
export function trackSignUp(props: {
  method: string;
}) {
  trackEvent('Registro', {
    metodo: props.method,
  });
}

/** Se dispara cuando el usuario cierra sesión */
export function trackLogout() {
  trackEvent('Logout');
}

/** Track de botones de acción (copy, share, alarm, expand) */
export function trackActionButton(props: {
  action: string; // 'copy', 'share', 'alarm', 'expand', 'attach'
}) {
  trackEvent('Boton Accion', {
    accion: props.action,
  });
}

/** Track de inicio de grabación de voz */
export function trackVoiceStart() {
  trackEvent('Voz Iniciada');
}

/** Track de grabación bloqueada (slide to lock) */
export function trackVoiceLocked() {
  trackEvent('Voz Bloqueada');
}

/** Track de error en voz */
export function trackVoiceError(props: {
  error: string;
}) {
  trackEvent('Voz Error', {
    error: props.error,
  });
}

/** Track de creación de alarma */
export function trackAlarmCreated() {
  trackEvent('Alarma Creada');
}

/** Track de sesión creada */
export function trackSessionCreated() {
  trackEvent('Sesion Creada');
}

/** Identify usuario con metadata */
export function identifyUser(props: {
  id: string;
  email: string;
  name: string;
  planType?: string;
  tenantId: string;
}) {
  if (!isInitialized) return;
  try {
    posthog.identify(props.id, {
      email: props.email,
      name: props.name,
      plan_type: props.planType || 'free',
      tenant_id: props.tenantId,
    });
  } catch {
    // silencio
  }
}

/** Reset identidad (logout) */
export function resetIdentity() {
  if (!isInitialized) return;
  try {
    posthog.reset();
  } catch {
    // silencio
  }
}
