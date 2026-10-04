"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon, ClockIcon, GlobeIcon, LocateFixedIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaveSettings } from "@/lib/query/mutations";
import { settingsQuery } from "@/lib/query/options";
import { allTimeZones, hourLabel, utcOffsetLabel } from "@/lib/timeZone";

// Settings → General: the calendar reminders and summaries follow, and the hour they arrive.

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const zoneLabel = (tz: string) => tz.replaceAll("_", " ");

export function GeneralSettings() {
  const settings = useQuery(settingsQuery());
  const save = useSaveSettings();
  // The browser's own zone is only known after hydration.
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null), []);

  const s = settings.data;
  const setZone = (timeZone: string) =>
    save.mutate({ timeZone }, { onSuccess: () => toast.success(`Time zone set to ${zoneLabel(timeZone)}`) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time & delivery</CardTitle>
        <CardDescription>
          Reminder days, renewal dates and the weekly summary follow your calendar. Reminders and summaries wait for the delivery hour; one
          the scheduler missed follows at its next run.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {settings.error ? (
          <p className="text-sm text-destructive">{settings.error.message}</p>
        ) : !s ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label id="tz-label">
                <GlobeIcon className="size-4 text-muted-foreground" /> Time zone
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <TimeZonePicker value={s.timeZone} onChange={setZone} />
                {deviceZone && deviceZone !== s.timeZone && (
                  <Button variant="ghost" size="sm" onClick={() => setZone(deviceZone)}>
                    <LocateFixedIcon /> Use this device's ({zoneLabel(deviceZone)})
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delivery-hour">
                <ClockIcon className="size-4 text-muted-foreground" /> Delivery hour
              </Label>
              <Select
                value={String(s.deliveryHour)}
                onValueChange={(v) => {
                  if (v === null) return;
                  const deliveryHour = Number(v);
                  save.mutate({ deliveryHour }, { onSuccess: () => toast.success(`Reminders arrive from ${hourLabel(deliveryHour)}`) });
                }}
              >
                <SelectTrigger id="delivery-hour" className="w-32">
                  <SelectValue>{(v: string) => hourLabel(Number(v))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Reimbursement reminders and summaries go out at the first scheduler run from {hourLabel(s.deliveryHour)} (
                {zoneLabel(s.timeZone)} time). Other notifications arrive as soon as they're noticed.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A searchable list of every IANA time zone, in a popover (no giant dropdown on the page). */
function TimeZonePicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => allTimeZones(), []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" className="min-w-0 max-w-full justify-between gap-2 font-normal" aria-labelledby="tz-label" />}
      >
        <span className="truncate">{zoneLabel(value)}</span>
        <span className="text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
          UTC{utcOffsetLabel(value)}
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command className="p-0">
          <CommandInput autoFocus placeholder="Search time zones…" aria-label="Search time zones" />
          <CommandList className="max-h-64">
            <CommandEmpty>No time zone with that name.</CommandEmpty>
            <CommandGroup>
              {zones.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  keywords={[zoneLabel(tz)]}
                  data-checked={tz === value}
                  onSelect={() => {
                    setOpen(false);
                    if (tz !== value) onChange(tz);
                  }}
                >
                  <span className="truncate">{zoneLabel(tz)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
