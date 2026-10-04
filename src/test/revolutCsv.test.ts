import assert from "node:assert/strict";
import { test } from "node:test";
import { CsvFormatError, parseCsv, parseRevolutCsv } from "../lib/server/revolutCsv";

const HEADER = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";

test("parseCsv handles quotes, escaped quotes and CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["x, y", 'he said "hi"'],
  ]);
});

test("parses a Revolut statement into signed minor units", () => {
  const csv = [
    HEADER,
    "CARD_PAYMENT,Current,2026-03-07 10:00:00,2026-03-07 10:00:01,Netflix.com,-15.99,0.00,EUR,COMPLETED,100.00",
    "TOPUP,Current,2026-03-02 09:00:00,2026-03-02 09:00:00,Payment from Employer,2400.00,0.00,EUR,COMPLETED,2500.00",
  ].join("\n");
  const { rows, skipped } = parseRevolutCsv(csv);
  assert.equal(skipped, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { date: rows[0].date, amount: rows[0].amount_minor, merchant: rows[0].merchant_key, type: rows[0].type },
    { date: "2026-03-07", amount: -1599, merchant: "netflix", type: "CARD_PAYMENT" },
  );
  assert.equal(rows[1].amount_minor, 240000);
});

test("skips declined and reverted rows, subtracts fees", () => {
  const csv = [
    HEADER,
    "CARD_PAYMENT,Current,2026-03-07 10:00:00,,Netflix.com,-15.99,0.00,EUR,DECLINED,",
    "CARD_PAYMENT,Current,2026-03-08 10:00:00,,Shop,-10.00,0.00,EUR,REVERTED,",
    "ATM,Current,2026-03-09 10:00:00,2026-03-09 10:00:00,Cash,-50.00,1.00,EUR,COMPLETED,0",
  ].join("\n");
  const { rows, skipped } = parseRevolutCsv(csv);
  assert.equal(skipped, 2);
  assert.equal(rows[0].amount_minor, -5100);
});

test("ids are stable across re-imports and unique for identical rows", () => {
  const line = "CARD_PAYMENT,Current,2026-03-07 10:00:00,2026-03-07 10:00:00,Coffee,-3.00,0.00,EUR,COMPLETED,1";
  const a = parseRevolutCsv([HEADER, line, line].join("\n")).rows;
  const b = parseRevolutCsv([HEADER, line, line].join("\n")).rows;
  assert.notEqual(a[0].id, a[1].id);
  assert.deepEqual(
    a.map((r) => r.id),
    b.map((r) => r.id),
  );
});

test("rejects files that are not Revolut statements", () => {
  assert.throws(() => parseRevolutCsv("foo,bar\n1,2"), CsvFormatError);
});
