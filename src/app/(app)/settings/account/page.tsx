import { AppearanceCard, SignOutCard } from "@/components/settings/AccountPanels";
import { SectionHeader } from "@/components/settings/SettingsNav";

export default function AccountSettingsPage() {
  return (
    <>
      <SectionHeader href="/settings/account" />
      <div className="flex flex-col gap-4">
        <AppearanceCard />
        <SignOutCard />
      </div>
    </>
  );
}
