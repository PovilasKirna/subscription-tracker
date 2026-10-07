import assert from "node:assert/strict";
import { test } from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { optimisticEdit } from "../lib/query/mutations";

// Overlapping edits that fail must not leave a failed value on screen, nor drop a saved one,
// whatever order they finish in (the background refresh only comes after the last one).

type Edit = { id: string; value: string };
const KEY = ["transactions", {}] as const;

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(KEY, { a: "old-a", b: "old-b" });
  const handlers = optimisticEdit<Edit>(qc, {
    patch: async (e, out) => {
      const data = qc.getQueryData<Record<string, string>>(KEY);
      if (!data || data[e.id] === e.value) return;
      out.push([KEY, data]);
      qc.setQueryData(KEY, { ...data, [e.id]: e.value });
    },
    shownAtOnce: () => true,
    refreshes: new Set(),
    error: "Couldn't save",
  });
  /** Starts an edit whose request settles when `finish` is called (true = success). */
  const start = (e: Edit) => {
    let finish!: (ok: boolean) => void;
    const request = new Promise<void>((resolve, reject) => {
      finish = (ok) => (ok ? resolve() : reject(new Error("nope")));
    });
    const observer = new MutationObserver(qc, { mutationKey: ["set-category"], mutationFn: () => request, ...handlers });
    const done = observer.mutate(e).catch(() => undefined);
    return { finish, done };
  };
  const shown = () => qc.getQueryData<Record<string, string>>(KEY);
  return { start, shown };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("an edit that fails while a later one is saving is undone at once; the later one stays", async () => {
  const { start, shown } = setup();
  const a = start({ id: "a", value: "new-a" });
  await tick();
  const b = start({ id: "b", value: "new-b" });
  await tick();
  assert.deepEqual(shown(), { a: "new-a", b: "new-b" });
  a.finish(false);
  await a.done;
  assert.deepEqual(shown(), { a: "old-a", b: "new-b" });
  b.finish(true);
  await b.done;
  assert.deepEqual(shown(), { a: "old-a", b: "new-b" });
});

test("when both fail, in either order, everything goes back", async () => {
  for (const order of [
    ["a", "b"],
    ["b", "a"],
  ] as const) {
    const { start, shown } = setup();
    const edits = { a: start({ id: "a", value: "new-a" }), b: undefined as ReturnType<typeof start> | undefined };
    await tick();
    edits.b = start({ id: "b", value: "new-b" });
    await tick();
    for (const id of order) {
      const e = edits[id];
      e?.finish(false);
      await e?.done;
    }
    assert.deepEqual(shown(), { a: "old-a", b: "old-b" }, order.join(" then "));
  }
});

test("a later edit of the same item that saves wins over an earlier one that failed", async () => {
  const { start, shown } = setup();
  const first = start({ id: "a", value: "first" });
  await tick();
  const second = start({ id: "a", value: "second" });
  await tick();
  first.finish(false);
  await first.done;
  assert.deepEqual(shown(), { a: "second", b: "old-b" });
  second.finish(true);
  await second.done;
  assert.deepEqual(shown(), { a: "second", b: "old-b" });
});
