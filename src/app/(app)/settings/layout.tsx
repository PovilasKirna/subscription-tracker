import type { ReactNode } from "react";
import { SettingsHeader, SettingsNav } from "@/components/settings/SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsHeader />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[176px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
