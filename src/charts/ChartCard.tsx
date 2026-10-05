import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Card shell for a chart: title, description, optional controls (range toggles etc.) on the right. */
export function ChartCard({
  title,
  description,
  controls,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {controls && <CardAction className="flex items-center gap-2">{controls}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
