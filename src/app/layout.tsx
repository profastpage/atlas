import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PostHogProvider } from './providers';
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const SITE_URL = 'https://atlas-9mv.pages.dev';

export const metadata: Metadata = {
  title: "Atlas - Consultor Estratégico de Élite 24/7",
  description:
    "Tu asesor de inteligencia artificial privado. Resuelve problemas de trabajo, estudios, emociones y estrategia con respuestas directas y sin relleno. Disponible las 24 horas.",
  keywords: [
    "Atlas",
    "Consultor Estratégico",
    "Coach",
    "IA",
    "Inteligencia Artificial",
    "Asesor",
    "Productividad",
    "Estrategia",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Atlas",
  },
  openGraph: {
    title: "Atlas – Tu Consultor Estratégico 24/7",
    description:
      "Resuelve el problema de raíz. Sin relleno, sin listas aburridas. Asesoría en cualquier nicho: trabajo, estudios, salud y productividad.",
    type: "website",
    url: SITE_URL,
    siteName: "Atlas",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Atlas – Consultor Estratégico de Élite",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas – Tu Consultor Estratégico 24/7",
    description:
      "Resuelve el problema de raíz. Sin relleno, sin listas aburridas. Asesoría en cualquier nicho.",
    images: [`${SITE_URL}/og-image.png`],
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192x192.png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Atlas" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/* Service Worker Registration + Auto-Update System */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (!('serviceWorker' in navigator)) return;

                var RELOAD_COOLDOWN = 120000; // 2 min cooldown between reloads
                var lastReload = 0;

                // Listen for SW update messages
                navigator.serviceWorker.addEventListener('message', function(event) {
                  var data = event.data;
                  if (!data) return;

                  // SW was installed/updated — reload if enough time passed
                  if (data.type === 'SW_UPDATED' || data.type === 'CONTENT_UPDATED') {
                    var now = Date.now();
                    if (now - lastReload > RELOAD_COOLDOWN) {
                      lastReload = now;
                      console.log('[PWA] New version detected, reloading...');
                      // Wait briefly for SW to activate, then reload
                      setTimeout(function() {
                        window.location.reload();
                      }, 500);
                    }
                  }

                  // Periodic version check from SW
                  if (data.type === 'NEW_VERSION_AVAILABLE' && data.reload) {
                    var now2 = Date.now();
                    if (now2 - lastReload > RELOAD_COOLDOWN) {
                      lastReload = now2;
                      console.log('[PWA] New version available, reloading...');
                      setTimeout(function() {
                        window.location.reload();
                      }, 1000);
                    }
                  }
                });

                // Register SW on page load
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
                    .then(function(reg) {
                      console.log('[PWA] Service Worker registered:', reg.scope);

                      // Check for SW updates immediately (don't wait for default 24h)
                      reg.update();

                      // Also check every 2 minutes
                      setInterval(function() {
                        reg.update();
                      }, 2 * 60 * 1000);
                    })
                    .catch(function(err) {
                      console.warn('[PWA] SW registration failed:', err);
                    });
                });
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} antialiased bg-gray-950 text-white font-sans`}
      >
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
