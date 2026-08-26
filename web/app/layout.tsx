import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

const arabicFont = Noto_Sans_Arabic({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-arabic",
  weight: ["400", "500", "600", "700"],
});

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || process.env.URL || "http://localhost:3000";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const dynamic = "force-static";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "REST — رست",
  description: "رفيقك الشخصي للتمرين والتغذية والتقدم.",
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE_PATH}/icon-192.png`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${BASE_PATH}/icon-192.png`, sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "REST" },
  openGraph: {
    title: "REST — رست",
    description: "تمرّن · سجّل · تحسّن",
    images: [{ url: `${SITE_ORIGIN}${BASE_PATH}/og.png`, width: 1536, height: 1024, alt: "REST — رست" }],
  },
  twitter: { card: "summary_large_image", title: "REST — رست", images: [`${SITE_ORIGIN}${BASE_PATH}/og.png`] },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body className={arabicFont.variable}>{children}</body></html>;
}
