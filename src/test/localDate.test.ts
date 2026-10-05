import assert from "node:assert/strict";
import { test } from "node:test";
import { localDate } from "../lib/format";

test("localDate puts a timestamp on the given time zone's calendar", () => {
  assert.equal(localDate("2026-10-03T21:30:00Z", "Europe/Vilnius"), "2026-10-04"); // UTC+3 in summer
  assert.equal(localDate("2026-10-03T21:30:00Z", "UTC"), "2026-10-03");
  assert.equal(localDate("2026-12-31T22:30:00Z", "Europe/Vilnius"), "2027-01-01"); // UTC+2 in winter, across a year
  assert.equal(localDate("2026-10-04T02:00:00Z", "America/New_York"), "2026-10-03");
});

test("localDate keeps date-only input and falls back on unparseable input", () => {
  assert.equal(localDate("2026-10-04", "Pacific/Kiritimati"), "2026-10-04");
  assert.equal(localDate("2026-10-04 nonsense"), "2026-10-04");
});
