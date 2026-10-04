"use client";

import { BarChart3Icon, TableIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Card shell with a chart / table switch — every chart ships a table-view fallback. */
export function ChartCard({
  title,
  description,
  controls,
  chart,
  table,
  className,
}: {
  title: string;
  description?: ReactNode;
  controls?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction className="flex items-center gap-2">
          {controls}
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[view]}
            onValueChange={(v: string[]) => v[0] && setView(v[0] as "chart" | "table")}
            aria-label="View as"
          >
            <ToggleGroupItem value="chart" aria-label="Chart view">
              <BarChart3Icon />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <TableIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>{view === "chart" ? chart : table}</CardContent>
    </Card>
  );
}
