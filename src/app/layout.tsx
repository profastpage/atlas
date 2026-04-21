import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas — Coach Estratégico de Alto Rendimiento",
  description:
    "Atlas es tu consultor estratégico y coach personal 24/7. Metodología socrática y reencuadre cognitivo para resolver problemas de raíz.",
  keywords: [
    "Atlas",
    "Coach",
    "Coaching",
    "Psicología",
    "Consultoría",
    "Bienestar",
  ],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧭</text></svg>",
  },
  openGraph: {
    title: "Atlas — Coach Estratégico",
    description: "Tu consultor estratégico 24/7. Resuelve el problema de raíz.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#030712",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.variable} antialiased bg-gray-950 text-white font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
