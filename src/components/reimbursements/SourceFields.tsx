"use client";

import { BellIcon, ZapIcon } from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SourceInput } from "@/lib/query/mutations";
import { MODE_LABEL, ordinal } from "@/lib/reimbursement";
import type { ReimbursementMode } from "@/lib/types";
import { cn } from "@/lib/utils";

// The fields describing a reimbursement source, shared by the sources manager and the
// drawer's "new source" option.

export const DEFAULT_SOURCE_INPUT: SourceInput = { name: "Salary", mode: "request", reminderDay: 20 };

const MODE_HINT: Record<ReimbursementMode, string> = {
  request: "You file a request each time, e.g. with your salary. You're reminded so none are forgotten.",
  automatic: "Paid back without asking. Charges count as reimbursed unless you say otherwise.",
};
const MODE_ICON = { request: BellIcon, automatic: ZapIcon } as const;
const DAYS = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [String(i + 1), ordinal(i + 1)]));

export const validSource = (s: SourceInput) => s.name.trim().length > 0 && s.name.trim().length <= 60;

export function SourceFields({
  value,
  onChange,
  autoFocus,
}: {
  value: SourceInput;
  onChange: (v: SourceInput) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          autoFocus={autoFocus}
          value={value.name}
          maxLength={60}
          placeholder="Salary"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          aria-invalid={!validSource(value) && value.name !== ""}
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm leading-none font-medium">How it pays back</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["request", "automatic"] as const).map((mode) => {
            const Icon = MODE_ICON[mode];
            const checked = value.mode === mode;
            return (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  checked && "border-primary bg-primary/5 hover:bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={mode}
                  checked={checked}
                  onChange={() => onChange({ ...value, mode, reminderDay: mode === "request" ? (value.reminderDay ?? 20) : null })}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                  {MODE_LABEL[mode]}
                </span>
                <span className="text-xs text-muted-foreground">{MODE_HINT[mode]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {value.mode === "request" && (
        <div className="flex flex-col gap-1.5">
          <Label id={`${id}-day`}>Reminder day</Label>
          <Select
            items={DAYS}
            value={String(value.reminderDay ?? 20)}
            onValueChange={(v) => v && onChange({ ...value, reminderDay: Number(v) })}
          >
            <SelectTrigger className="w-40" aria-labelledby={`${id}-day`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DAYS).map(([day, label]) => (
                <SelectItem key={day} value={day}>
                  {label} of the month
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">When to remind you about requests not filed yet.</span>
        </div>
      )}
    </div>
  );
}
