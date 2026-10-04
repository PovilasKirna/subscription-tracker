import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { ChannelsCard, DigestCard, PreferencesCard, SchedulerCard } from "@/components/settings/NotificationSettings";
import { SectionHeader } from "@/components/settings/SettingsNav";
import { getQueryClient } from "@/lib/query/client";
import { schedulerQuery, settingsQuery } from "@/lib/query/options";
import { getDb } from "@/lib/server/db";
import { getSchedulerStatus } from "@/lib/server/notifications/tick";
import { getSettings } from "@/lib/server/settings";

export default function NotificationSettingsPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...settingsQuery(), queryFn: async () => getSettings(await getDb()) });
  void queryClient.prefetchQuery({ ...schedulerQuery(), queryFn: () => getSchedulerStatus() });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SectionHeader href="/settings/notifications" />
      <div className="flex flex-col gap-4">
        <PreferencesCard />
        <DigestCard />
        <ChannelsCard />
        <SchedulerCard />
      </div>
    </HydrationBoundary>
  );
}
