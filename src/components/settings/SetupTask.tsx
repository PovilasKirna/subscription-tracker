import { CircleCheckIcon, ExternalLinkIcon, LightbulbIcon } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A one-off setup job on a settings card (a sending domain, an hourly cron job). Done: a green
 * tick, the steps tucked away. Not done: a tip with a button to the service and the steps open.
 */
export function SetupTask({
  done,
  title,
  summary,
  action,
  children,
}: {
  done: boolean;
  title: string;
  summary: ReactNode;
  /** Where the job is done, e.g. the provider's dashboard; opens in a new tab. */
  action: { href: string; label: string };
  /** The steps. */
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border p-3", !done && "bg-muted/40")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {done ? (
            <CircleCheckIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-good)" }} aria-label="Done" />
          ) : (
            <LightbulbIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-warning)" }} aria-label="To do" />
          )}
          <div className="min-w-0">
            <div className="font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{summary}</div>
          </div>
        </div>
        {!done && (
          <a href={action.href} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}>
            {action.label} <ExternalLinkIcon data-icon="inline-end" />
          </a>
        )}
      </div>
      <details open={!done} className="mt-2 pl-6.5">
        <summary className="cursor-pointer text-xs text-muted-foreground outline-none select-none hover:text-foreground focus-visible:underline">
          {done ? "How it's set up" : "Steps"}
        </summary>
        <div className="mt-2">{children}</div>
      </details>
    </div>
  );
}
