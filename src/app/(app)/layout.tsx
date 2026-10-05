import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SyncWatcher } from "@/components/data/SyncWatcher";
import { AppNav } from "@/components/shell/AppNav";
import { SkipLink } from "@/components/shell/SkipLink";
import { isAuthenticated } from "@/lib/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[224px_minmax(0,1fr)]">
      <SkipLink />
      <AppNav />
      {/* Phones: bottom padding clears the fixed tab bar (56px + safe area) with room to spare. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1240px] min-w-0 scroll-mt-12 pt-5 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] outline-none md:scroll-mt-0 md:pt-7 md:pl-8 md:pr-[max(2rem,env(safe-area-inset-right))] md:pb-16"
      >
        {children}
      </main>
      <SyncWatcher />
    </div>
  );
}
