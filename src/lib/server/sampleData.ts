// A realistic *fake* Revolut CSV statement for demos, tests and dev databases. Dates are
// relative to `today` so the dashboard always looks current; the same day gives the same file.

export function sampleRevolutCsv(today = new Date()): string {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  const DAY = 86_400_000;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ts = (d: Date) =>
    `${iso(d)} ${String(8 + Math.floor(rand() * 12)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;
  const monthsAgo = (m: number, day: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d;
  };

  type Row = { type: string; date: Date; description: string; amount: number; fee?: number };
  const rows: Row[] = [];
  const HISTORY = 20; // months

  function monthly(description: string, day: number, price: (m: number) => number, from = HISTORY, to = 0, type = "CARD_PAYMENT") {
    for (let m = from; m >= to; m--) {
      const d = monthsAgo(m, day);
      if (d > today) continue;
      rows.push({ type, date: d, description, amount: -price(m) });
    }
  }
  function yearly(description: string, monthOfYearAgo: number, day: number, price: number) {
    for (let m = monthOfYearAgo; m <= HISTORY; m += 12)
      rows.push({ type: "CARD_PAYMENT", date: monthsAgo(m, day), description, amount: -price });
  }

  // Subscriptions
  monthly("Netflix.com", 7, (m) => (m > 8 ? 12.99 : 15.99)); // price increase 8 months ago
  monthly("Spotify P2C1A3B9F4", 14, (m) => (m > 14 ? 10.99 : 11.99));
  monthly("OpenAI *ChatGPT Subscr", 3, () => 22.99, 11);
  monthly("Apple.com/Bill", 21, () => 2.99); // iCloud 200GB
  monthly("Apple.com/Bill", 9, () => 9.99, 15, 0); // a second Apple plan
  monthly("Google *YouTube Premium", 18, () => 11.99, 20, 2); // cancelled ~2 months ago
  monthly("Lemon Gym", 1, () => 34.99);
  monthly("Telia Lietuva", 25, () => 19.9 + (rand() < 0.15 ? 2.5 : 0));
  monthly("Premium plan fee", 11, () => 7.99, HISTORY, 0, "FEE");
  monthly("Disney Plus", 28, () => 8.99, 19, 9); // cancelled long ago
  monthly("Wolt+ subscription", 16, () => 5.99, 10);
  monthly("Patreon* Membership", 1, () => 5);
  monthly("GitHub, Inc.", 4, () => 9.2, 6);
  yearly("Amazon Prime*2K4LD8", 4, 12, 49.9);
  yearly("JetBrains Americas", 10, 2, 99);

  // Everyday noise
  const shops = ["Maxima LT", "Lidl Vilnius", "Rimi Hyper", "Iki Express", "Norfa"];
  const eats = ["Bolt Food", "Wolt", "Caif Cafe", "Vapiano", "Huracan Coffee", "Hesburger"];
  const misc = ["Bolt", "Circle K", "Apotheka", "Senukai", "IKEA Vilnius", "Amazon.de", "Steam Purchase", "Pigu.lt"];
  for (let day = HISTORY * 30.5; day >= 0; day--) {
    const date = new Date(today.getTime() - day * DAY);
    if (rand() < 0.55)
      rows.push({ type: "CARD_PAYMENT", date, description: pick(shops), amount: -Math.round((5 + rand() * 60) * 100) / 100 });
    if (rand() < 0.35)
      rows.push({ type: "CARD_PAYMENT", date, description: pick(eats), amount: -Math.round((4 + rand() * 25) * 100) / 100 });
    if (rand() < 0.25)
      rows.push({ type: "CARD_PAYMENT", date, description: pick(misc), amount: -Math.round((3 + rand() * 80) * 100) / 100 });
  }
  for (let m = HISTORY; m >= 0; m--) {
    rows.push({ type: "TOPUP", date: monthsAgo(m, 2), description: "Payment from Darbdavys UAB", amount: 2400 });
    rows.push({ type: "TRANSFER", date: monthsAgo(m, 3), description: "To Rent Landlord", amount: -650 });
    rows.push({ type: "EXCHANGE", date: monthsAgo(m, 20), description: "Exchanged to USD", amount: -50 });
  }
  // A refund and a declined payment the importer should ignore
  rows.push({ type: "CARD_REFUND", date: monthsAgo(3, 15), description: "Amazon.de", amount: 23.5 });

  // Nothing from the future: a real statement ends today.
  const pastRows = rows.filter((r) => r.date <= today);
  pastRows.sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = 1200;
  const header = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";
  const lines = pastRows.map((r) => {
    balance += r.amount - (r.fee ?? 0);
    const started = ts(r.date);
    const desc = r.description.includes(",") ? `"${r.description}"` : r.description;
    return [
      r.type,
      "Current",
      started,
      started,
      desc,
      r.amount.toFixed(2),
      (r.fee ?? 0).toFixed(2),
      "EUR",
      "COMPLETED",
      balance.toFixed(2),
    ].join(",");
  });
  lines.push(`CARD_PAYMENT,Current,${ts(monthsAgo(1, 5))},,Netflix.com,-15.99,0.00,EUR,DECLINED,`);

  return `${[header, ...lines].join("\n")}\n`;
}
