'use client';

import { useEffect, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { initPostHog } from '@/lib/analytics';

// ========================================
// POSTHOG PROVIDER — Client component wrapper
// Inicializa PostHog y trackea page views
// ========================================

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Inicializar PostHog solo en el cliente
    initPostHog();
  }, []);

  useEffect(() => {
    // Capturar page views en cada cambio de ruta
    if (pathname && (posthog as any).__loaded) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        path: pathname,
      });
    }
  }, [pathname]);

  return <>{children}</>;
}
