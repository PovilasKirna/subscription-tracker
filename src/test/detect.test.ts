import assert from "node:assert/strict";
import { test } from "node:test";
import type { Override, TxRow } from "../lib/server/db";
import { amountStability, buildHistory, detectSubscriptions, fitCadence, websiteResolver } from "../lib/server/detect";
import { merchantKey, normalizeWebsite } from "../lib/server/merchant";

let n = 0;
function tx(date: string, amount: number, description: string, type = "CARD_PAYMENT"): TxRow {
  return {
    id: `t${n++}`,
    source: "csv",
    account: "Current",
    date,
    amount_minor: Math.round(amount * 100),
    currency: "EUR",
    description,
    merchant_key: merchantKey(description),
    type,
    state: "COMPLETED",
  };
}
const monthly = (desc: string, amount: number, months: number, day = 7, startYear = 2025) =>
  Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(startYear, i, day));
    return tx(d.toISOString().slice(0, 10), -amount, desc);
  });

const none = new Map<string, Override>();

test("merchant keys normalise processor prefixes and references", () => {
  assert.equal(merchantKey("PAYPAL *SPOTIFY P1A2B3"), "spotify");
  assert.equal(merchantKey("Google *YouTube Premium"), "youtube-premium");
  assert.equal(merchantKey("Amazon Prime*2K4LD8"), "prime-video");
  assert.equal(merchantKey("Caif Cafe #1234"), "caif-cafe");
});

test("fitCadence recognises monthly and yearly rhythms, tolerating a missed month", () => {
  assert.equal(fitCadence(["2025-01-07", "2025-02-07", "2025-03-07", "2025-05-07"])?.cadence, "monthly");
  assert.equal(fitCadence(["2024-03-01", "2025-03-02", "2026-03-01"])?.cadence, "yearly");
  assert.equal(fitCadence(["2025-01-01", "2025-01-04", "2025-01-19"]), null);
});

test("amountStability tolerates a single price change", () => {
  assert.equal(amountStability([1299, 1299, 1599, 1599]), 2 / 3);
});

test("detects a monthly subscription with a price increase", () => {
  const txs = [
    ...monthly("Netflix.com", 12.99, 6),
    ...monthly("Netflix.com", 15.99, 6, 7, 2025).map((t, i) => ({ ...t, date: `2025-${String(i + 7).padStart(2, "0")}-07` })),
  ];
  const { subscriptions } = detectSubscriptions(txs, none, "2025-12-20");
  assert.equal(subscriptions.length, 1);
  const s = subscriptions[0];
  assert.equal(s.name, "Netflix");
  assert.equal(s.cadence, "monthly");
  assert.equal(s.amount, 15.99);
  assert.equal(s.status, "active");
  assert.equal(s.nextCharge, "2026-01-07");
  assert.deepEqual(s.priceChanges, [{ date: "2025-07-07", from: 12.99, to: 15.99 }]);
});

test("splits two plans billed under the same merchant", () => {
  const txs = [...monthly("Apple.com/Bill", 2.99, 8, 3), ...monthly("Apple.com/Bill", 9.99, 8, 19)];
  const { subscriptions } = detectSubscriptions(txs, none, "2025-08-25");
  assert.deepEqual(subscriptions.map((s) => s.amount).sort(), [2.99, 9.99]);
});

test("ignores irregular shopping and transfers", () => {
  const txs = [
    tx("2025-01-03", -23.1, "Maxima LT"),
    tx("2025-01-09", -8.2, "Maxima LT"),
    tx("2025-02-21", -41.0, "Maxima LT"),
    ...monthly("To Landlord", 650, 6).map((t) => ({ ...t, type: "TRANSFER" })),
  ];
  assert.equal(detectSubscriptions(txs, none, "2025-07-01").subscriptions.length, 0);
});

test("marks a stopped subscription inactive and honours user overrides", () => {
  const txs = monthly("Disney Plus", 8.99, 5);
  const det = detectSubscriptions(txs, none, "2025-12-01");
  assert.equal(det.subscriptions[0].status, "inactive");
  const key = det.subscriptions[0].key;
  const ignored = detectSubscriptions(
    txs,
    new Map([
      [
        key,
        { key, display_name: null, category: null, status: "ignored", color_slot: null, color_hex: null, cadence: null, website: null },
      ],
    ]),
    "2025-12-01",
  );
  assert.equal(ignored.subscriptions.length, 0);
  assert.equal(ignored.ignored.length, 1);
});

test("colour slots follow first-seen order, not rank", () => {
  const txs = [
    ...monthly("Spotify", 11.99, 10, 14),
    ...monthly("Lemon Gym", 34.99, 6, 1, 2025).map((t, i) => ({ ...t, date: `2025-${String(i + 5).padStart(2, "0")}-01` })),
  ];
  const det = detectSubscriptions(txs, none, "2025-11-01");
  const slot = Object.fromEntries(det.subscriptions.map((s) => [s.name, s.color]));
  assert.equal(slot.Spotify, 1); // seen first, even though the gym costs more
  assert.equal(slot["Lemon Gym"], 2);
  const history = buildHistory(txs, det, "EUR", "2025-11-01", 6);
  assert.deepEqual(
    history.series.map((s) => s.color),
    [1, 2],
  );
});

// A plan upgrade: four months of Pro, a prorated upgrade charge, then Max, with irregular API
// usage from the same merchant. Detection splits it into two price points and drops the upgrade.
const claudeUpgrade = () => [
  ...["2026-01-10", "2026-02-10", "2026-03-10", "2026-04-10"].map((d) => tx(d, -18, "CLAUDE.AI SUBSCRIPTION")),
  tx("2026-04-22", -72.6, "CLAUDE.AI SUBSCRIPTION"),
  ...["2026-05-22", "2026-06-22", "2026-07-22"].map((d) => tx(d, -90, "CLAUDE.AI SUBSCRIPTION")),
  ...[
    ["2026-02-14", 5],
    ["2026-02-15", 5],
    ["2026-03-02", 10],
    ["2026-05-03", 5],
    ["2026-05-04", 5],
  ].map(([d, a]) => tx(d as string, -(a as number), "Anthropic API")),
];

test("a plan upgrade is detected as separate price points, missing the upgrade charge", () => {
  const txs = claudeUpgrade();
  const det = detectSubscriptions(txs, none, "2026-08-10");
  assert.deepEqual(det.subscriptions.map((s) => s.key).sort(), ["anthropic|EUR|1800", "anthropic|EUR|9000"]);
  assert.equal(det.txToSub.get(txs[4].id), undefined);
});

test("assigned charges form one pinned subscription and new charges at its price follow", () => {
  const txs = claudeUpgrade();
  const key = "anthropic|EUR|1800";
  const assigned = new Map(txs.slice(0, 8).map((t) => [t.id, key]));
  const later = tx("2026-08-22", -90, "CLAUDE.AI SUBSCRIPTION");
  const det = detectSubscriptions([...txs, later], none, "2026-08-25", "EUR", new Set(), assigned);
  assert.equal(det.subscriptions.length, 1);
  const s = det.subscriptions[0];
  assert.equal(s.key, key);
  assert.ok(s.pinned && s.confirmed);
  assert.equal(s.chargeCount, 9);
  assert.equal(s.amount, 90);
  assert.equal(s.status, "active");
  assert.equal(det.txToSub.get(later.id), key, "the next renewal joins without another assignment");
  for (const api of txs.slice(8)) assert.equal(det.txToSub.get(api.id), undefined, "API usage stays out");
});

test("an assigned payment counts even when its type is normally excluded", () => {
  const debits = monthly("Telia Lietuva", 25, 4).map((t) => ({ ...t, type: "TRANSFER" }));
  assert.equal(detectSubscriptions(debits, none, "2025-04-20").subscriptions.length, 0);
  const assigned = new Map(debits.map((t) => [t.id, "telia|EUR"]));
  const det = detectSubscriptions(debits, none, "2025-04-20", "EUR", new Set(), assigned);
  assert.equal(det.subscriptions.length, 1);
  assert.equal(det.subscriptions[0].chargeCount, 4);
  const history = buildHistory(debits, det, "EUR", "2025-04-20", 4);
  assert.deepEqual(history.totals, [25, 25, 25, 25]);
});

test("a confirmed merchant stays one subscription even if its charges split by price", () => {
  // Same-day pairs make detection look for several plans; the user said it's one.
  const txs = [...monthly("Apple.com/Bill", 2.99, 6, 3), ...monthly("Apple.com/Bill", 9.99, 6, 3)];
  assert.equal(detectSubscriptions(txs, none, "2025-06-10").subscriptions.length, 2);
  const key = "apple|EUR";
  const confirmed = new Map([
    [
      key,
      {
        key,
        display_name: null,
        category: null,
        status: "confirmed" as const,
        color_slot: null,
        color_hex: null,
        cadence: null,
        website: null,
      },
    ],
  ]);
  const det = detectSubscriptions(txs, confirmed, "2025-06-10");
  assert.deepEqual(
    det.subscriptions.map((s) => s.key),
    [key],
  );
  for (const t of txs) assert.equal(det.txToSub.get(t.id), key);
});

test("charges detected under a pinned key fold into it", () => {
  const old = monthly("Spotify", 9.99, 3);
  const later = monthly("Spotify", 11.99, 3, 7, 2025).map((t, i) => ({ ...t, date: `2025-${String(i + 5).padStart(2, "0")}-07` }));
  const assigned = new Map(old.map((t) => [t.id, "spotify|EUR"]));
  const det = detectSubscriptions([...old, ...later], none, "2025-07-20", "EUR", new Set(), assigned);
  assert.equal(det.subscriptions.length, 1);
  assert.equal(det.subscriptions[0].chargeCount, 6);
  assert.equal(det.subscriptions[0].amount, 11.99);
});

test("a user-picked colour sticks and automatic slots skip it", () => {
  const txs = [
    ...monthly("Spotify", 11.99, 10, 14),
    ...monthly("Lemon Gym", 34.99, 6, 1, 2025).map((t, i) => ({ ...t, date: `2025-${String(i + 5).padStart(2, "0")}-01` })),
  ];
  const gym = detectSubscriptions(txs, none, "2025-11-01").subscriptions.find((s) => s.name === "Lemon Gym");
  assert.ok(gym);
  const picked = new Map([
    [
      gym.key,
      { key: gym.key, display_name: null, category: null, status: null, color_slot: 1, color_hex: null, cadence: null, website: null },
    ],
  ]);
  const det = detectSubscriptions(txs, picked, "2025-11-01");
  const by = Object.fromEntries(det.subscriptions.map((s) => [s.name, s]));
  assert.equal(by["Lemon Gym"].color, 1);
  assert.equal(by["Lemon Gym"].colorChosen, true);
  assert.equal(by.Spotify.color, 2); // slot 1 is taken, so the next free one
  assert.equal(by.Spotify.colorChosen, false);
});

test("a custom colour keeps its own series without taking a slot; 'none' folds into Other", () => {
  const txs = [
    ...monthly("Spotify", 11.99, 10, 14),
    ...monthly("Lemon Gym", 34.99, 6, 1, 2025).map((t, i) => ({ ...t, date: `2025-${String(i + 5).padStart(2, "0")}-01` })),
    ...monthly("Netflix", 15.99, 10, 20),
  ];
  const keyOf = (name: string) => detectSubscriptions(txs, none, "2025-11-01").subscriptions.find((s) => s.name === name)?.key ?? "";
  const picked = new Map<string, Override>([
    [
      keyOf("Lemon Gym"),
      {
        key: keyOf("Lemon Gym"),
        display_name: null,
        category: null,
        status: null,
        color_slot: null,
        color_hex: "#123abc",
        cadence: null,
        website: null,
      },
    ],
    [
      keyOf("Netflix"),
      {
        key: keyOf("Netflix"),
        display_name: null,
        category: null,
        status: null,
        color_slot: 0,
        color_hex: null,
        cadence: null,
        website: null,
      },
    ],
  ]);
  const det = detectSubscriptions(txs, picked, "2025-11-01");
  const by = Object.fromEntries(det.subscriptions.map((s) => [s.name, s]));
  assert.deepEqual([by["Lemon Gym"].color, by["Lemon Gym"].colorChosen], ["#123abc", true]);
  assert.deepEqual([by.Netflix.color, by.Netflix.colorChosen], [null, true]); // "none" is a choice, not automatic
  assert.equal(by.Spotify.color, 1); // neither choice took slot 1
  const history = buildHistory(txs, det, "EUR", "2025-11-01", 6);
  assert.deepEqual(
    history.series.map((s) => [s.name, s.color]),
    [
      ["Spotify", 1],
      ["Lemon Gym", "#123abc"],
      ["Other (1)", null],
    ],
  );
});

test("a user-set cadence replaces the guess for a lone charge, and beats a detected one", () => {
  const once = [tx("2025-03-10", -59.99, "Proton AG")];
  const assigned = new Map([[once[0].id, "proton|EUR"]]);
  const guessed = detectSubscriptions(once, none, "2025-04-01", "EUR", new Set(), assigned).subscriptions[0];
  assert.equal(guessed.cadence, "monthly");
  assert.equal(guessed.cadenceChosen, false);

  const yearly = new Map([
    [
      "proton|EUR",
      {
        key: "proton|EUR",
        display_name: null,
        category: null,
        status: null,
        color_slot: null,
        color_hex: null,
        cadence: "yearly" as const,
        website: null,
      },
    ],
  ]);
  const set = detectSubscriptions(once, yearly, "2025-04-01", "EUR", new Set(), assigned).subscriptions[0];
  assert.equal(set.cadence, "yearly");
  assert.equal(set.cadenceChosen, true);
  assert.equal(set.nextCharge, "2026-03-10");
  assert.equal(set.status, "active");
  assert.equal(set.yearlyCost, 59.99);

  const spotify = monthly("Spotify", 11.99, 4);
  const quarterly = new Map([
    [
      "spotify|EUR",
      {
        key: "spotify|EUR",
        display_name: null,
        category: null,
        status: null,
        color_slot: null,
        color_hex: null,
        cadence: "quarterly" as const,
        website: null,
      },
    ],
  ]);
  assert.equal(detectSubscriptions(spotify, quarterly, "2025-04-20").subscriptions[0].cadence, "quarterly");
});

test("an exclusion overrides an assignment, and lifting it restores the subscription", () => {
  const one = tx("2025-03-10", -4.5, "Caif Cafe");
  const assigned = new Map([[one.id, "caif-cafe|EUR"]]);
  const removed = detectSubscriptions([one], none, "2025-03-20", "EUR", new Set([one.id]), assigned);
  assert.equal(removed.subscriptions.length, 0);
  const restored = detectSubscriptions([one], none, "2025-03-20", "EUR", new Set(), assigned);
  assert.deepEqual(
    restored.subscriptions.map((s) => s.key),
    ["caif-cafe|EUR"],
  );
});

test("a renewal split over same-day rows joins its pinned subscription whole", () => {
  // Assigned history bills €20 in one row; the renewal arrives as two €10 rows.
  const history = monthly("Lemon Gym", 20, 3);
  const split = [tx("2025-04-07", -10, "Lemon Gym"), tx("2025-04-07", -10, "Lemon Gym")];
  const assigned = new Map(history.map((t) => [t.id, "lemon-gym|EUR"]));
  const det = detectSubscriptions([...history, ...split], none, "2025-04-10", "EUR", new Set(), assigned);
  for (const t of split) assert.equal(det.txToSub.get(t.id), "lemon-gym|EUR");
  assert.equal(det.subscriptions[0].amount, 20);
});

test("equal rows on one renewal date both join a pinned subscription", () => {
  const history = monthly("Lemon Gym", 10, 3);
  const pair = [tx("2025-04-07", -10, "Lemon Gym"), tx("2025-04-07", -10, "Lemon Gym")];
  const assigned = new Map(history.map((t) => [t.id, "lemon-gym|EUR"]));
  const det = detectSubscriptions([...history, ...pair], none, "2025-04-10", "EUR", new Set(), assigned);
  for (const t of pair) assert.equal(det.txToSub.get(t.id), "lemon-gym|EUR");
});

test("a renewal that fits two pinned subscriptions joins neither", () => {
  const a = monthly("Apple.com/Bill", 2.99, 3, 3);
  const b = monthly("Apple.com/Bill", 2.99, 3, 20);
  const next = tx("2025-04-03", -2.99, "Apple.com/Bill");
  const assigned = new Map([...a.map((t) => [t.id, "apple|EUR|a"] as const), ...b.map((t) => [t.id, "apple|EUR|b"] as const)]);
  const det = detectSubscriptions([...a, ...b, next], none, "2025-04-10", "EUR", new Set(), assigned);
  assert.equal(det.txToSub.get(next.id), undefined);
});

test("a direct-debit renewal continues a pinned subscription despite its transfer type", () => {
  const debits = monthly("Telia Lietuva", 25, 5).map((t) => ({ ...t, type: "TRANSFER" }));
  const assigned = new Map(debits.slice(0, 4).map((t) => [t.id, "telia|EUR"]));
  const det = detectSubscriptions(debits, none, "2025-05-10", "EUR", new Set(), assigned);
  assert.equal(det.txToSub.get(debits[4].id), "telia|EUR");
  assert.equal(det.subscriptions[0].lastCharge, debits[4].date);
});

test("websites: built-in for known services, the user's wins, and one-off payments to that merchant match", () => {
  const txs = [...monthly("Netflix.com", 15.99, 4), ...monthly("Hostinger", 3.99, 4), tx("2025-02-20", -10, "Hostinger")];
  const host = detectSubscriptions(txs, none, "2025-04-20").subscriptions.find((s) => s.merchantKey === "hostinger");
  assert.ok(host);
  const set = new Map([
    [
      host.key,
      {
        key: host.key,
        display_name: null,
        category: null,
        status: null,
        color_slot: null,
        color_hex: null,
        cadence: null,
        website: "hostinger.com",
      },
    ],
  ]);
  const det = detectSubscriptions(txs, set, "2025-04-20");
  const by = Object.fromEntries(det.subscriptions.map((s) => [s.merchantKey, s]));
  assert.equal(by.netflix.website, "netflix.com");
  assert.equal(by.netflix.websiteChosen, false);
  assert.equal(by.hostinger.website, "hostinger.com");
  assert.equal(by.hostinger.websiteChosen, true);

  const websiteOf = websiteResolver(det);
  assert.equal(websiteOf("hostinger", null), "hostinger.com"); // the one-off payment, not in the subscription
  assert.equal(websiteOf("netflix", null), "netflix.com");
  assert.equal(websiteOf("maxima", null), null);
});

test("website input is reduced to a bare domain, junk is rejected", () => {
  assert.equal(normalizeWebsite("https://www.Hostinger.com/pricing?x=1"), "hostinger.com");
  assert.equal(normalizeWebsite("tv.apple.com"), "tv.apple.com");
  assert.equal(normalizeWebsite("  lemongym.lt:443 "), "lemongym.lt");
  assert.equal(normalizeWebsite("xn--80ak6aa92e.com"), "xn--80ak6aa92e.com");
  for (const bad of ["", "hostinger", "not a site.com", "localhost", "127.0.0.1", "-bad-.com", "a..com"]) {
    assert.equal(normalizeWebsite(bad), null, bad);
  }
});
