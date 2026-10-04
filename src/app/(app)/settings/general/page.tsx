import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { SectionHeader } from "@/components/settings/SettingsNav";
import { getQueryClient } from "@/lib/query/client";
import { settingsQuery } from "@/lib/query/options";
import { getDb } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";

// Awaited (a tiny read), so the page renders with the values instead of a skeleton.
export default async function GeneralSettingsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({ ...settingsQuery(), queryFn: async () => getSettings(await getDb()) });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SectionHeader href="/settings/general" />
      <GeneralSettings />
    </HydrationBoundary>
  );
}
