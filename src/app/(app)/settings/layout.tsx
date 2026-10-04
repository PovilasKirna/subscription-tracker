import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { PageHeader } from "@/components/shell/PageHeader";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[176px_minmax(0,1fr)] md:items-start md:gap-8">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
