import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#172e25" },
  ],
  width: "device-width",
  initialScale: 1,
  // Let the app paint under the notch and the home indicator.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: { default: "SAIP Board", template: "%s" },
  description:
    "Planning, finances and coordination for the Society for African Internationals at Princeton executive board.",
  applicationName: "SAIP Board",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "SAIP",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  other: {
    // Next emits the modern name; iOS still honours the prefixed one, and without
    // it a Home Screen launch keeps Safari's chrome.
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
