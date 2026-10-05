import type { ReactNode } from "react";
import { SettingsHeader, SettingsNav } from "@/components/settings/SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsHeader />
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[176px_minmax(0,1fr)] md:items-start md:gap-8">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
