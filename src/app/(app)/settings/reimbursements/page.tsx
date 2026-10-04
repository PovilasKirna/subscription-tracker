import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { SourcesManager } from "@/components/reimbursements/SourcesManager";
import { PageHeader } from "@/components/shell/PageHeader";
import { getQueryClient } from "@/lib/query/client";
import { reimbursementSourcesQuery } from "@/lib/query/options";
import { getReimbursementSources } from "@/lib/server/queries";

export default function ReimbursementSettingsPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...reimbursementSourcesQuery(), queryFn: getReimbursementSources });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Reimbursements"
        description="Where money for your subscriptions comes back from, and whether you have to ask for it."
      />
      <SourcesManager />
    </HydrationBoundary>
  );
}
