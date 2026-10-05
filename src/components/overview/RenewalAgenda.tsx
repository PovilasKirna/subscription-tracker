import Link from "next/link";
import { type ExpectedCharge, seriesColor } from "@/charts";
import { money, relativeDays } from "@/lib/format";
import { drawerHref, weekdayDate } from "./links";

/**
 * The renewals month as a chronological list, for phones: the calendar grid is too small there to
 * name what charges. Each row opens the subscription.
 */
export function RenewalAgenda({ charges, today, emptyLabel }: { charges: readonly ExpectedCharge[]; today: string; emptyLabel: string }) {
  if (!charges.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {charges.map((c) => (
        <li key={`${c.key}:${c.date}`}>
          <Link
            href={drawerHref(c.key)}
            className="grid min-h-11 grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            <span className="flex flex-col">
              <span className="text-sm tabular-nums">{weekdayDate(c.date)}</span>
              <span className="text-[12.5px] text-muted-foreground">{relativeDays(c.date, today)}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: seriesColor(c.color) }} aria-hidden />
              <span className="text-sm font-medium [overflow-wrap:anywhere]">{c.name}</span>
            </span>
            <span className="text-sm tabular-nums">{money(c.amount, c.currency)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
