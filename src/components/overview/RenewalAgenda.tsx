import Link from "next/link";
import type { ExpectedCharge } from "@/charts";
import { MerchantIcon } from "@/components/MerchantIcon";
import { money, relativeDays } from "@/lib/format";
import { drawerHref, weekdayDate } from "./links";

/**
 * The renewals month as a chronological list, the phone default (the calendar is the other view):
 * each row names the charge next to its logo, with the date underneath, and opens the subscription.
 */
export function RenewalAgenda({ charges, today, emptyLabel }: { charges: readonly ExpectedCharge[]; today: string; emptyLabel: string }) {
  if (!charges.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {charges.map((c) => (
        <li key={`${c.key}:${c.date}`}>
          <Link
            href={drawerHref(c.key)}
            className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            <MerchantIcon name={c.name} website={c.website} />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium [overflow-wrap:anywhere]">{c.name}</span>
              <span className="text-[12.5px] text-muted-foreground tabular-nums">
                {weekdayDate(c.date)} · {relativeDays(c.date, today)}
              </span>
            </span>
            <span className="text-sm tabular-nums">{money(c.amount, c.currency)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
