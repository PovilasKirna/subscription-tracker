"use client";

import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { DownloadIcon, FileUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fullDate } from "@/lib/format";
import { useInvalidateAll } from "@/lib/query/mutations";
import { api, statusQuery } from "@/lib/query/options";
import { dataParams } from "@/lib/search-params";
import type { InsertStats } from "@/lib/server/db";
import { cn } from "@/lib/utils";


export function ImportCard() {
  const invalidate = useInvalidateAll();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const upload = useMutation({
    mutationFn: async (file: File) =>
      api<InsertStats>("/api/import/csv", { method: "POST", body: await file.text(), headers: { "Content-Type": "text/csv", "X-File-Name": file.name } }),
    onSuccess: (s) => {
      toast.success(`Imported ${s.inserted} new transactions`, { description: `${s.updated} updated · ${s.skipped} skipped` });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a Revolut statement</CardTitle>
        <CardDescription>Works offline, no third parties. Re-importing overlapping statements is safe — duplicates are merged.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed px-6 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-[var(--series-1)] hover:bg-muted/50",
            drag && "border-[var(--series-1)] bg-muted/50",
          )}
        >
          <FileUpIcon className="size-6" />
          <span className="font-medium text-foreground">{upload.isPending ? "Importing…" : "Drop your CSV here or click to choose"}</span>
          <span>Revolut app → Accounts → Statement → Excel (CSV) → pick a period</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}

export function ImportLog() {
  const { data } = useSuspenseQuery(statusQuery());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          {data.transactionCount.toLocaleString("en-GB")} transactions
          {data.firstDate && data.lastDate && ` from ${fullDate(data.firstDate)} to ${fullDate(data.lastDate)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">Skipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.imports.map((i) => (
                <TableRow key={`${i.at}-${i.source}-${i.inserted}`}>
                  <TableCell className="text-muted-foreground">{fullDate(i.at.slice(0, 10))}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{i.source === "bank" ? "Bank sync" : (i.message ?? "CSV")}</TableCell>
                  <TableCell className="tabular text-right">{i.inserted}</TableCell>
                  <TableCell className="tabular text-right">{i.updated}</TableCell>
                  <TableCell className="tabular text-right">{i.skipped}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function BackupCard() {
  const { data } = useSuspenseQuery(statusQuery());
  const invalidate = useInvalidateAll();
  // Base UI's AlertDialogAction is a plain button (not a Close), so the dialog is controlled:
  // it stays open while deleting and closes only once the server confirms.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const wipe = useMutation({
    mutationFn: () => api("/api/data", { method: "DELETE" }),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success("All imported data deleted");
      void invalidate();
    },
    onError: (e) => toast.error(`Couldn't delete data: ${e.message}`),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup & privacy</CardTitle>
        <CardDescription>Everything lives in one SQLite file on your server (data/tracker.db). Nothing is sent anywhere unless you enable bank sync.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <a href="/api/export" className={buttonVariants({ variant: "outline" })} download>
          <DownloadIcon /> Export JSON backup
        </a>
        <AlertDialog open={confirmOpen} onOpenChange={(open) => !wipe.isPending && setConfirmOpen(open)}>
          <AlertDialogTrigger render={<Button variant="destructive" disabled={data.transactionCount === 0} />}>
            <Trash2Icon /> Delete all data
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all imported data?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes {data.transactionCount.toLocaleString("en-GB")} transactions and your edits from this server. Bank links are kept. Export a backup first if you might need it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={wipe.isPending}>Keep my data</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={wipe.isPending} onClick={() => wipe.mutate()}>
                {wipe.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                {wipe.isPending ? "Deleting…" : "Delete everything"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
