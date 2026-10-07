import type { CategoryId } from "../categories";
import type {
  AssignOptionsPayload,
  Subscription,
  SubscriptionDetailPayload,
  SubscriptionRow,
  SubscriptionsPayload,
  SubscriptionsTablePayload,
  TransactionItem,
  TransactionsPayload,
} from "../types";

// What an edit changes in data already on screen, so the page shows it at once while the server
// recomputes. Only what the edit decides by itself is patched; anything derived from it (totals,
// facets, an automatic category) waits for the background refetch. Pure, and unchanged inputs
// come back as the same object so React skips them.

/** A category pick as the cache sees it: the payment and its merchant (scope "merchant" covers all of them). */
export type CategoryEdit = { txId: string; merchantKey: string; scope: "payment" | "merchant"; category: CategoryId | null };

/**
 * The payment's new category, and its merchant's other payments too for scope "merchant" (except
 * those with a pick of their own, which wins over the merchant's). Back to automatic (null) can't
 * be known here: detection decides it.
 */
export function categorizeItem<T extends TransactionItem>(t: T, edit: CategoryEdit): T {
  if (edit.category === null) return t;
  const hit = t.id === edit.txId || (edit.scope === "merchant" && t.merchantKey === edit.merchantKey && t.categoryChosen !== "payment");
  if (!hit || (t.category === edit.category && t.categoryChosen === edit.scope)) return t;
  return { ...t, category: edit.category, categoryChosen: edit.scope };
}

/** Maps `list` through `fn`, returning `list` itself when nothing changed. */
function mapSame<T>(list: T[], fn: (item: T) => T): T[] {
  let changed = false;
  const out = list.map((item) => {
    const next = fn(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : list;
}

/** Returns `data` itself unless one of the listed fields changed. */
function patchFields<T extends object>(data: T, next: Partial<T>): T {
  return Object.entries(next).some(([k, v]) => v !== data[k as keyof T]) ? { ...data, ...next } : data;
}

export function categorizeTransactions(data: TransactionsPayload, edit: CategoryEdit): TransactionsPayload {
  return patchFields(data, { items: mapSame(data.items, (t) => categorizeItem(t, edit)) });
}

export function categorizeDetail(data: SubscriptionDetailPayload, edit: CategoryEdit): SubscriptionDetailPayload {
  const fn = <T extends TransactionItem>(t: T) => categorizeItem(t, edit);
  return patchFields(data, {
    transactions: mapSame(data.transactions, fn),
    excluded: mapSame(data.excluded, fn),
    related: mapSame(data.related, fn),
  });
}

export function categorizeAssignOptions(data: AssignOptionsPayload, edit: CategoryEdit): AssignOptionsPayload {
  return patchFields(data, {
    transaction: categorizeItem(data.transaction, edit),
    related: mapSame(data.related, (t) => categorizeItem(t, edit)),
  });
}

/**
 * A subscription edit (see OverrideInput) as far as it can be shown before detection reruns: the
 * name, category, logo website and group. Clearing one (back to the detected value) and status
 * changes, which move it between lists and totals, are left to the refetch.
 */
export type OverrideEdit = {
  key: string;
  displayName?: string | null;
  category?: string | null;
  website?: string | null;
  group?: string | null;
};

/** Whether overrideSubscription shows all of `edit` (other fields, e.g. status or cadence, need detection). */
export function overrideShownAtOnce(edit: OverrideEdit): boolean {
  return Object.entries(edit).every(
    ([field, value]) =>
      field === "key" ||
      value === undefined ||
      field === "group" ||
      (Boolean(value) && ["displayName", "category", "website"].includes(field)),
  );
}

export function overrideSubscription<T extends Subscription>(s: T, edit: OverrideEdit): T {
  if (s.key !== edit.key) return s;
  const next: Partial<Subscription> = {};
  if (edit.displayName) next.name = edit.displayName;
  if (edit.category) next.category = edit.category;
  if (edit.website) Object.assign(next, { website: edit.website, websiteChosen: true });
  // Leaving a group needs nothing from detection; "" and null both mean ungrouped.
  if (edit.group !== undefined) next.group = edit.group || null;
  return patchFields(s, next as Partial<T>);
}

export function overrideSubscriptions(data: SubscriptionsPayload, edit: OverrideEdit): SubscriptionsPayload {
  const fn = (s: Subscription) => overrideSubscription(s, edit);
  return patchFields(data, { subscriptions: mapSame(data.subscriptions, fn), ignored: mapSame(data.ignored, fn) });
}

/** Table rows, including members of a group's row (the group rows themselves are rebuilt by the refetch). */
export function overrideTable(data: SubscriptionsTablePayload, edit: OverrideEdit): SubscriptionsTablePayload {
  const row = (r: SubscriptionRow): SubscriptionRow =>
    r.members ? patchFields(r, { members: mapSame(r.members, row) }) : overrideSubscription(r, edit);
  return patchFields(data, { items: mapSame(data.items, row) });
}

export function overrideDetail(data: SubscriptionDetailPayload, edit: OverrideEdit): SubscriptionDetailPayload {
  return data.subscription ? patchFields(data, { subscription: overrideSubscription(data.subscription, edit) }) : data;
}
