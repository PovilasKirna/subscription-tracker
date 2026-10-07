"use client";

import {
  BadgeCheckIcon,
  CircleSlashIcon,
  EyeOffIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PanelRightOpenIcon,
  RotateCcwIcon,
  TagIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOverride, useOverridePending, useResetOverride } from "@/lib/query/mutations";
import { CATEGORIES, type SubscriptionRow } from "./shared";

type Props = {
  sub: Pick<SubscriptionRow, "key" | "name" | "category" | "confirmed" | "status" | "rowStatus">;
  /** Shown in the table; omitted inside the drawer. */
  onOpen?: () => void;
  trigger?: ComponentProps<typeof Button>;
};

/**
 * Every action on a subscription, shared by table rows and the detail drawer. While a change
 * saves, its trigger spins and waits; other rows stay usable.
 */
export function SubscriptionActions({ sub, onOpen, trigger }: Props) {
  const override = useOverride();
  const reset = useResetOverride();
  const saving = useOverridePending(sub.key);
  const set = (patch: Parameters<typeof override.mutate>[0], message: string) =>
    override.mutate(patch, { onSuccess: () => toast.success(message) });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={saving}
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="data-popup-open:bg-muted"
            aria-label={`Actions for ${sub.name}${saving ? " (saving)" : ""}`}
            aria-busy={saving}
            {...trigger}
          />
        }
      >
        {saving ? <Loader2Icon className="animate-spin" aria-hidden /> : (trigger?.children ?? <MoreHorizontalIcon />)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sub.rowStatus === "ignored" ? (
          <DropdownMenuItem onClick={() => reset.mutate(sub.key, { onSuccess: () => toast.success(`${sub.name} restored`) })}>
            <RotateCcwIcon /> Restore as subscription
          </DropdownMenuItem>
        ) : (
          <DropdownMenuGroup>
            {onOpen && (
              <>
                <DropdownMenuItem onClick={onOpen}>
                  <PanelRightOpenIcon /> Open details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TagIcon /> Category
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuRadioGroup
                  value={sub.category}
                  onValueChange={(v) => set({ key: sub.key, category: String(v) }, `Category set to ${v}`)}
                >
                  {CATEGORIES.map((c) => (
                    <DropdownMenuRadioItem key={c} value={c}>
                      {c}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {!sub.confirmed && (
              <DropdownMenuItem onClick={() => set({ key: sub.key, status: "confirmed" }, `${sub.name} confirmed`)}>
                <BadgeCheckIcon /> Confirm subscription
              </DropdownMenuItem>
            )}
            {sub.status === "cancelled" ? (
              <DropdownMenuItem onClick={() => set({ key: sub.key, status: null }, "Cancellation undone")}>
                <RotateCcwIcon /> Undo cancel
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => set({ key: sub.key, status: "cancelled" }, `${sub.name} marked as cancelled`)}>
                <CircleSlashIcon /> Mark as cancelled
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => set({ key: sub.key, status: "ignored" }, `${sub.name} ignored`)}>
              <EyeOffIcon /> Not a subscription
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
