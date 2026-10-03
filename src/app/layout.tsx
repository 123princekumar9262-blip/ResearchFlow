import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { ServiceWorker } from "@/components/pwa/install";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ResearchFlow", template: "%s · ResearchFlow" },
  description: "Deadlines with owners, progress with proof. Project accountability for research students and their professors.",
  applicationName: "ResearchFlow",
  // iPhone and iPad: full screen from the Home Screen, with the system status bar kept readable.
  appleWebApp: { capable: true, title: "ResearchFlow", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-[13px] leading-[1.5]">
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
