import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { SourcesManager } from "@/components/reimbursements/SourcesManager";
import { SectionHeader } from "@/components/settings/SettingsNav";
import { getQueryClient } from "@/lib/query/client";
import { reimbursementSourcesQuery } from "@/lib/query/options";
import { getReimbursementSources } from "@/lib/server/queries";

export default function ReimbursementSettingsPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...reimbursementSourcesQuery(), queryFn: getReimbursementSources });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SectionHeader href="/settings/reimbursements" />
      <SourcesManager />
    </HydrationBoundary>
  );
}
