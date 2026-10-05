import assert from "node:assert/strict";
import { test } from "node:test";
import { sizeToggleVisibility, widgetSpan } from "../components/overview/layout";
import {
  addWidget,
  clampSize,
  DEFAULT_LAYOUT,
  hiddenWidgets,
  type Layout,
  moveWidget,
  nextSize,
  parseLayout,
  removeWidget,
  resizeWidget,
  sameLayout,
  serializeLayout,
  WIDGETS,
  widgetDef,
} from "../components/overview/widgets";

const ids = (l: Layout) => l.map((w) => w.id);

test("the default layout shows every widget once, at its default size", () => {
  assert.equal(DEFAULT_LAYOUT.length, WIDGETS.length);
  assert.equal(new Set(ids(DEFAULT_LAYOUT)).size, WIDGETS.length);
  for (const w of DEFAULT_LAYOUT) assert.equal(w.size, widgetDef(w.id).defaultSize);
  for (const def of WIDGETS) assert.ok(def.sizes.includes(def.defaultSize), `${def.id}: default size is allowed`);
  assert.equal(DEFAULT_LAYOUT.find((w) => w.id === "timeline")?.size, "full");
});

test("the default layout packs a 4-column row without holes", () => {
  // Units of a 4-column row: small 1, half 2, full 4. Every row must close exactly.
  const units = { small: 1, half: 2, full: 4 } as const;
  let row = 0;
  for (const w of DEFAULT_LAYOUT) {
    row += units[w.size];
    assert.ok(row <= 4, `${w.id} overflows its row`);
    if (row === 4) row = 0;
  }
  assert.equal(row, 0, "the last row is full");
});

test("parseLayout round-trips a stored layout", () => {
  const layout: Layout = [
    { id: "timeline", size: "half" },
    { id: "monthly-total", size: "half" },
    { id: "renewals", size: "full" },
  ];
  assert.deepEqual(parseLayout(serializeLayout(layout)), layout);
});

test("parseLayout falls back to the default on missing or garbage input", () => {
  for (const raw of [null, undefined, "", "not json", "{}", '"timeline"', "42", "null", '[{"id":"nope"}]', "[1,2,3]"]) {
    assert.deepEqual(parseLayout(raw), DEFAULT_LAYOUT, `input ${String(raw)}`);
  }
});

test("parseLayout keeps an empty layout (every widget removed)", () => {
  assert.deepEqual(parseLayout("[]"), []);
});

test("parseLayout drops unknown ids and repeats, and clamps sizes", () => {
  const raw = JSON.stringify([
    { id: "spend", size: "full" },
    { id: "retired-widget", size: "half" },
    { id: "spend", size: "half" },
    { id: "yearly", size: "full" }, // a stat tile can't span the whole row
    { id: "renewals", size: "small" }, // a chart can't be a quarter
    { id: "merchants" }, // no size
    { id: "active", size: 3 },
    "timeline",
    null,
  ]);
  assert.deepEqual(parseLayout(raw), [
    { id: "spend", size: "full" },
    { id: "yearly", size: "small" },
    { id: "renewals", size: "half" },
    { id: "merchants", size: "full" },
    { id: "active", size: "small" },
  ]);
});

test("clampSize keeps allowed sizes and defaults the rest", () => {
  assert.equal(clampSize("timeline", "half"), "half");
  assert.equal(clampSize("timeline", "small"), "full");
  assert.equal(clampSize("yearly", "bogus"), "small");
});

test("add appends at the default size, once", () => {
  const without = removeWidget(DEFAULT_LAYOUT, "spend");
  assert.deepEqual(
    hiddenWidgets(without).map((w) => w.id),
    ["spend"],
  );
  const back = addWidget(without, "spend");
  assert.deepEqual(back.at(-1), { id: "spend", size: "half" });
  assert.equal(addWidget(back, "spend"), back, "adding a shown widget changes nothing");
  assert.equal(hiddenWidgets(back).length, 0);
});

test("remove drops just that widget", () => {
  const out = removeWidget(DEFAULT_LAYOUT, "timeline");
  assert.equal(out.length, DEFAULT_LAYOUT.length - 1);
  assert.ok(!ids(out).includes("timeline"));
  assert.deepEqual(removeWidget(out, "timeline"), out);
  assert.deepEqual(
    WIDGETS.reduce<Layout>((l, w) => removeWidget(l, w.id), DEFAULT_LAYOUT),
    [],
  );
});

test("move reorders, clamps the target and ignores a bad source", () => {
  const l: Layout = [
    { id: "yearly", size: "small" },
    { id: "spend", size: "half" },
    { id: "timeline", size: "full" },
  ];
  assert.deepEqual(ids(moveWidget(l, 0, 2)), ["spend", "timeline", "yearly"]);
  assert.deepEqual(ids(moveWidget(l, 2, 0)), ["timeline", "yearly", "spend"]);
  assert.deepEqual(ids(moveWidget(l, 1, 99)), ["yearly", "timeline", "spend"]);
  assert.deepEqual(ids(moveWidget(l, 1, -5)), ["spend", "yearly", "timeline"]);
  assert.equal(moveWidget(l, 1, 1), l);
  assert.equal(moveWidget(l, 7, 0), l);
  assert.equal(moveWidget(l, -1, 0), l);
  assert.deepEqual(ids(l), ["yearly", "spend", "timeline"], "the input is not mutated");
});

test("resize clamps to the widget's sizes and leaves the rest alone", () => {
  const out = resizeWidget(DEFAULT_LAYOUT, "timeline", "half");
  assert.equal(out.find((w) => w.id === "timeline")?.size, "half");
  assert.equal(resizeWidget(DEFAULT_LAYOUT, "yearly", "full").find((w) => w.id === "yearly")?.size, "small");
  assert.ok(sameLayout(removeWidget(out, "timeline"), removeWidget(DEFAULT_LAYOUT, "timeline")));
});

test("nextSize cycles through the allowed sizes", () => {
  assert.equal(nextSize("timeline", "full"), "half");
  assert.equal(nextSize("timeline", "half"), "full");
  assert.equal(nextSize("yearly", "small"), "half");
  assert.equal(nextSize("yearly", "half"), "small");
});

test("grid spans: phones pair plain stat tiles, wide-on-phone tiles and charts take the row", () => {
  assert.equal(widgetSpan(widgetDef("yearly"), "small"), "col-span-1");
  assert.match(widgetSpan(widgetDef("monthly-total"), "small"), /^col-span-2 @lg\/widgets:col-span-1$/);
  assert.equal(widgetSpan(widgetDef("spend"), "half"), "col-span-2");
  assert.match(widgetSpan(widgetDef("timeline"), "full"), /@4xl\/widgets:col-span-4/);
  // Half and full only differ on the 4-column grid, so a chart's toggle hides below it.
  assert.match(sizeToggleVisibility(widgetDef("spend")), /^hidden @4xl/);
  assert.equal(sizeToggleVisibility(widgetDef("yearly")), "flex");
});
