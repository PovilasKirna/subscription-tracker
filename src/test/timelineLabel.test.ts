import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineRowLabel } from "../charts/timelineLabel";
import type { TimelineRow } from "../charts/types";

const format = { money: (a: number, c: string) => `${a.toFixed(2)} ${c}`, date: (d: string) => d };

const row = {
  key: "netflix",
  name: "Netflix",
  currency: "EUR",
  firstCharge: "2024-01-05",
  lastCharge: "2026-09-05",
  charges: [
    { date: "2024-01-05", amount: 8 },
    { date: "2025-01-05", amount: 10 },
    { date: "2026-01-05", amount: 12 },
    { date: "2026-09-05", amount: 12 },
  ],
  priceChanges: [
    { date: "2025-01-05", from: 8, to: 10 },
    { date: "2026-01-05", from: 10, to: 12 },
  ],
} as unknown as TimelineRow;

test("without a window the label covers the whole history", () => {
  assert.equal(
    timelineRowLabel(row, format),
    "Netflix: 4 charges from 2024-01-05 to 2026-09-05, latest 12.00 EUR, " +
      "price changes: 8.00 EUR to 10.00 EUR on 2025-01-05; 10.00 EUR to 12.00 EUR on 2026-01-05",
  );
});

test("with a window the label counts only the charges and price changes inside it", () => {
  assert.equal(
    timelineRowLabel(row, format, "2025-10-01"),
    "Netflix: 2 charges since 2025-10-01 from 2026-01-05 to 2026-09-05, latest 12.00 EUR, " +
      "price changes: 10.00 EUR to 12.00 EUR on 2026-01-05",
  );
});

test("a window with no price changes omits that clause", () => {
  assert.equal(
    timelineRowLabel(row, format, "2026-06-01"),
    "Netflix: 1 charges since 2026-06-01 from 2026-09-05 to 2026-09-05, latest 12.00 EUR",
  );
});
