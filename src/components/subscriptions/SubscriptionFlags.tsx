import { CircleAlertIcon, HandCoinsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";
import type { SubscriptionRow } from "./shared";

/** Price-change and pending-reimbursement flags; shared by the table row and the phone list row. */
export function SubscriptionFlags({ sub: s }: { sub: SubscriptionRow }) {
  return (
    <>
      {s.priceChanges.length > 0 && (
        <Badge variant="outline" className="h-5 px-1.5 text-xs font-normal">
          {s.priceChanges.length} price change{s.priceChanges.length > 1 ? "s" : ""}
        </Badge>
      )}
      {s.pendingReimbursements > 0 ? (
        <Badge variant="outline" className="h-5 gap-1 px-1.5 text-xs font-normal" title="Reimbursements with nothing recorded yet">
          <CircleAlertIcon className="text-[var(--status-warning)]" aria-hidden />
          {s.pendingReimbursements} pending
        </Badge>
      ) : (
        s.reimbursement && (
          <HandCoinsIcon className="size-3.5" aria-label={`Reimbursed ${money(s.reimbursement.amount, s.currency)} per charge`} />
        )
      )}
    </>
  );
}
