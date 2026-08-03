import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const arabicFont = Noto_Sans_Arabic({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-arabic",
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "REST — رست",
    description: "رفيقك الشخصي للتمرين والتغذية والتقدم.",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "REST" },
    openGraph: {
      title: "REST — رست",
      description: "تمرّن · سجّل · تحسّن",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "REST — رست" }],
    },
    twitter: { card: "summary_large_image", title: "REST — رست", images: [`${origin}/og.png`] },
  };
}

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
