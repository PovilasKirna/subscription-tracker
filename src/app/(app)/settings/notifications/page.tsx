import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { DevicesCard } from "@/components/settings/DevicesCard";
import { EmailCard } from "@/components/settings/EmailCard";
import { DigestCard, PreferencesCard, SchedulerCard } from "@/components/settings/NotificationSettings";
import { SectionHeader } from "@/components/settings/SettingsNav";
import { getQueryClient } from "@/lib/query/client";
import { mailStatusQuery, pushDevicesQuery, schedulerQuery, settingsQuery } from "@/lib/query/options";
import { getDb } from "@/lib/server/db";
import { mailSetup } from "@/lib/server/mail";
import { getSchedulerStatus } from "@/lib/server/notifications/tick";
import { pushDevices } from "@/lib/server/push/send";
import { getSettings } from "@/lib/server/settings";

// Awaited (small reads), so the page renders with the values instead of skeletons.
export default async function NotificationSettingsPage() {
  const queryClient = getQueryClient();
  const db = await getDb();
  await Promise.all([
    queryClient.prefetchQuery({ ...settingsQuery(), queryFn: () => getSettings(db) }),
    queryClient.prefetchQuery({ ...schedulerQuery(), queryFn: () => getSchedulerStatus() }),
    queryClient.prefetchQuery({ ...mailStatusQuery(), queryFn: () => mailSetup() }),
    queryClient.prefetchQuery({ ...pushDevicesQuery(), queryFn: () => pushDevices(db) }),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SectionHeader href="/settings/notifications" />
      <div className="flex flex-col gap-4">
        <PreferencesCard />
        <DigestCard />
        <DevicesCard />
        <EmailCard />
        <SchedulerCard />
      </div>
    </HydrationBoundary>
  );
}
