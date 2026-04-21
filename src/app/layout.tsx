import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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
        {/* Service Worker Registration — runs only in browser */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) {
                      console.log('[PWA] Service Worker registered:', reg.scope);
                    })
                    .catch(function(err) {
                      console.warn('[PWA] SW registration failed:', err);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} antialiased bg-gray-950 text-white font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
