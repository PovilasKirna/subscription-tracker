import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SyncWatcher } from "@/components/data/SyncWatcher";
import { AppNav } from "@/components/shell/AppNav";
import { isAuthenticated } from "@/lib/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[224px_1fr]">
      <AppNav />
      <main className="mx-auto w-full max-w-[1240px] px-4 pt-5 pb-16 md:px-8 md:pt-7">{children}</main>
      <SyncWatcher />
    </div>
  );
}
