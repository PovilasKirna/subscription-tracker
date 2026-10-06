import assert from "node:assert/strict";
import { test } from "node:test";
import { dayBaseline, dayLogoLayout, gridSize, logoBottom, logoX, MIN_GLYPH_GAP, MORE_W } from "../charts/renewalLayout";

// Day-cell widths RenewalCalendar actually gets: 7 columns with fixed gaps across the card's content
// box (card width minus 2 × 16px padding).
const cellWidth = (card: number) => gridSize(card - 32, 5).cellW;

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

test("the logo row clears the day number, from a 320px phone up", () => {
  for (const card of [288, 311, 343, 398, 500, 700, 1100]) {
    const w = cellWidth(card);
    const { size } = dayLogoLayout(w, 1);
    const logoTop = w - logoBottom(w) - size; // square cells: height = width
    assert.ok(logoTop - dayBaseline(w) >= MIN_GLYPH_GAP, `card ${card}: logo top ${logoTop} vs baseline ${dayBaseline(w)}`);
  }
});

test("the narrowest phone card (288px, a 320px screen) fits two 12px logos, or one plus +k", () => {
  const w = cellWidth(288);
  assert.ok(w > 32 && w < 34);
  assert.deepEqual(dayLogoLayout(w, 2), { size: 12, shown: 2, more: 0 });
  assert.deepEqual(dayLogoLayout(w, 3), { size: 12, shown: 1, more: 2 });
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
