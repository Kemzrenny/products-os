import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import ServiceWorker from "@/components/pwa/ServiceWorker";

const url = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: "Products OS: build the right thing, and prove it worked", template: "%s · Products OS" },
  description:
    "The strategy-to-outcome operating system for product teams. Connect company goals to every idea, decision and roadmap item, with AI agents that do the legwork and a Command Centre for leadership.",
  applicationName: "Products OS",
  appleWebApp: { capable: true, title: "Products OS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  openGraph: { type: "website", siteName: "Products OS", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="antialiased">
      <body className="min-h-dvh">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
