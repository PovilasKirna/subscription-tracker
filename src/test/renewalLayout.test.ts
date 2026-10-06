import assert from "node:assert/strict";
import { test } from "node:test";
import { dayLogoLayout, logoX, MORE_W } from "../charts/renewalLayout";

// Day-cell widths RenewalCalendar actually gets: 7 bands with 8% inner padding across the card's
// content box (card width minus 2 × 16px padding).
const cellWidth = (card: number) => {
  const step = (card - 32) / (7 - 0.08);
  return step * 0.92;
};

/** Right edge of everything drawn in the cell: the last logo, or the "+k" label after it. */
const rightEdge = (cellW: number, count: number) => {
  const { size, shown, more } = dayLogoLayout(cellW, count);
  return more ? logoX(size, shown) + MORE_W : logoX(size, shown - 1) + size;
};

test("day-cell logos and the +k label stay inside the cell from a 320px phone up", () => {
  for (const card of [288, 311, 343, 398, 500, 700, 1100]) {
    const w = cellWidth(card);
    for (let count = 1; count <= 9; count++) {
      const { shown, more } = dayLogoLayout(w, count);
      assert.ok(shown >= 1, `card ${card}: at least one logo`);
      assert.equal(shown + more, count, `card ${card}: every charge is counted`);
      assert.ok(rightEdge(w, count) <= w - 1, `card ${card}, ${count} charges: ${rightEdge(w, count)} > ${w}`);
    }
  }
});

test("a phone card (343px) fits two 16px logos, or one plus +k", () => {
  const w = cellWidth(343);
  assert.ok(w > 40 && w < 44);
  assert.deepEqual(dayLogoLayout(w, 2), { size: 16, shown: 2, more: 0 });
  assert.deepEqual(dayLogoLayout(w, 3), { size: 16, shown: 1, more: 2 });
});

test("desktop cells use 20px logos, at most two, then +k", () => {
  assert.deepEqual(dayLogoLayout(100, 2), { size: 20, shown: 2, more: 0 });
  assert.deepEqual(dayLogoLayout(100, 3), { size: 20, shown: 2, more: 1 });
  assert.deepEqual(dayLogoLayout(100, 6), { size: 20, shown: 2, more: 4 });
});
