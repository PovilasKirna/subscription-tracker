"use client";

import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Suspense queries throw to the nearest error boundary; reset both React and the query cache.
export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="flex flex-col items-start gap-3">
        <TriangleAlertIcon className="size-5 text-[var(--status-critical)]" />
        <div className="font-medium">Something went wrong loading this page</div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            resetQueries();
            reset();
          }}
        >
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
