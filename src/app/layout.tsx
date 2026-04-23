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
  title: "Atlas | Consultor Estratégico",
  description:
    "Asesor estratégico de inteligencia artificial 24/7. Analiza, planifica y ejecuta con respuestas precisas. Estrategia empresarial, productividad y decision-making.",
  keywords: [
    "Atlas",
    "Consultor Estratégico",
    "IA",
    "Inteligencia Artificial",
    "Asesor",
    "Estrategia empresarial",
    "Productividad",
    "Coach ejecutivo",
    "Decision-making",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Atlas",
  },
  openGraph: {
    title: "Atlas | Consultor Estratégico",
    description:
      "Asesor estratégico de IA 24/7. Analiza, planifica y ejecuta con respuestas precisas y sin relleno.",
    type: "website",
    url: SITE_URL,
    siteName: "Atlas",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Atlas | Consultor Estratégico",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas | Consultor Estratégico",
    description:
      "Asesor estratégico de IA 24/7. Analiza, planifica y ejecuta.",
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
  themeColor: "#047857",
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
        <meta name="theme-color" content="#047857" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Atlas" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/* Self-healing: detect stale SW errors + force SW registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // 1. If JS crashes with "Cannot access" / "is not defined" etc,
                //    the old SW probably served stale HTML. Unregister SW and reload.
                var healingKey = 'atlas-sw-healed-' + (document.documentElement.getAttribute('data-build') || '0');
                var healed = sessionStorage.getItem(healingKey);
                window.addEventListener('error', function(e) {
                  if (healed) return;
                  var msg = (e.message || '').toLowerCase();
                  if (msg.indexOf('cannot access') !== -1 ||
                      msg.indexOf('is not defined') !== -1 ||
                      msg.indexOf('is not a function') !== -1) {
                    healed = true;
                    sessionStorage.setItem(healingKey, '1');
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(function(regs) {
                        return Promise.all(regs.map(function(r) { return r.unregister(); }));
                      }).then(function() {
                        window.location.reload();
                      });
                    } else {
                      window.location.reload();
                    }
                  }
                });
                // 2. Register SW
                if ('serviceWorker' in navigator) {
                  var swKey = 'sw-reloaded';
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(function() {});
                  });
                  navigator.serviceWorker.addEventListener('message', function(event) {
                    if (event.data && event.data.type === 'SW_UPDATED') {
                      var v = sessionStorage.getItem(swKey);
                      if (v !== event.data.version) {
                        sessionStorage.setItem(swKey, event.data.version);
                        window.location.reload();
                      }
                    }
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} antialiased text-white font-sans`}
      >
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
