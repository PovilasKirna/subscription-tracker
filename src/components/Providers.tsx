"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { getQueryClient } from "@/lib/query/client";

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    // `.dark` drives shadcn, `data-theme` drives the chart tokens' convention; system by default.
    <ThemeProvider attribute={["class", "data-theme"]} defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>{children}</NuqsAdapter>
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
