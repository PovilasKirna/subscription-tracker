import { NextResponse } from "next/server";
import { all, allTransactions, getDb } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Full JSON backup of your data (transactions + your edits).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const db = await getDb();
  const body = {
    exportedAt: new Date().toISOString(),
    transactions: await allTransactions(db),
    overrides: await all(db, "SELECT * FROM overrides"),
    exclusions: await all(db, "SELECT * FROM tx_exclusions"),
    assignments: await all(db, "SELECT * FROM tx_assignments"),
    reimbursementSources: await all(db, "SELECT * FROM reimbursement_sources"),
    reimbursementPeriods: await all(db, "SELECT * FROM reimbursement_periods"),
    reimbursements: await all(db, "SELECT * FROM reimbursements"),
    // Which bank accounts are switched off (their transactions are kept but hidden).
    bankAccounts: await all(db, "SELECT * FROM bank_accounts"),
    // Your own spending categories and changes to the built-in ones, and the categories you picked,
    // per payment and per merchant.
    categories: await all(db, "SELECT * FROM categories"),
    categoryRules: await all(db, "SELECT * FROM category_rules"),
    transactionCategories: await all(db, "SELECT * FROM tx_categories"),
    // Net worth: bank and brokerage accounts (with their latest breakdown), daily values, deposits,
    // and the exchange rates the history was converted with.
    holdings: await all(db, "SELECT * FROM holdings"),
    holdingValues: await all(db, "SELECT * FROM holding_values ORDER BY date"),
    brokerCashFlows: await all(db, "SELECT * FROM broker_cash_flows ORDER BY date"),
    fxRates: await all(db, "SELECT * FROM fx_rates ORDER BY date, currency"),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="subscription-tracker-${body.exportedAt.slice(0, 10)}.json"`,
    },
  });
}
