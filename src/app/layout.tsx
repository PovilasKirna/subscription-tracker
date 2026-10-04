import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Subscriptions",
  description: "Self-hosted subscription tracker for your Revolut account",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans antialiased", geist.variable)} suppressHydrationWarning>
      {/* Browser extensions (dark-mode/theme tools) stamp attributes on <body> before hydration. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
