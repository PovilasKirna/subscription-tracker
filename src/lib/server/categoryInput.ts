import {
  BUILTIN_CATEGORIES,
  CATEGORY_KINDS,
  type Category,
  type CategoryKind,
  canHide,
  isBuiltinCategoryId,
  isCategoryIconName,
  MAX_CATEGORY_NAME,
  NO_CATEGORY_COLOR,
} from "../categories";
import { isColorSlot } from "../color";
import type { CategoryChanges } from "./db";

// Validation for the category API bodies. Pure, so the rules are unit tested and the route handlers
// stay thin.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false, error }) as const;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Is `name` another category's (case-insensitive)? */
export const nameTaken = (categories: readonly Category[], exceptId?: string) => (name: string) =>
  categories.some((c) => c.id !== exceptId && c.label.toLowerCase() === name.toLowerCase());

/** A colour from the body: a palette slot, or 0 / null for none. undefined = not given. */
function parseColor(v: unknown): number | undefined | false {
  if (v === undefined) return undefined;
  if (v === null || v === NO_CATEGORY_COLOR) return NO_CATEGORY_COLOR;
  return isColorSlot(v) ? v : false;
}

/**
 * The changes a body asks for: a new custom category (`target` null), or edits to `target`. Built-ins
 * keep their kind and can't be deleted; a name, icon or colour equal to the built-in's own is stored
 * as null so it follows the default. `taken` says whether another category already has a name.
 */
export function parseCategoryInput(body: unknown, target: Category | null, taken: (name: string) => boolean): Result<CategoryChanges> {
  if (!isObject(body)) return fail("Invalid request");
  const out: CategoryChanges = {};

  if (body.name !== undefined || !target) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name && !target?.builtIn) return fail("Give the category a name");
    if (name.length > MAX_CATEGORY_NAME) return fail(`Keep the name under ${MAX_CATEGORY_NAME} characters`);
    const builtIn = target && isBuiltinCategoryId(target.id) ? BUILTIN_CATEGORIES[target.id] : null;
    // A cleared built-in name means its own again, which must be free too.
    const shown = name || builtIn?.label || "";
    if (shown && taken(shown)) return fail(`There's already a category called ${shown}`);
    out.label = builtIn && (!name || name === builtIn.label) ? null : name;
  }

  if (body.kind !== undefined || !target) {
    if (!(CATEGORY_KINDS as readonly unknown[]).includes(body.kind)) return fail("Choose what the category counts as");
    if (target?.builtIn) {
      if (body.kind !== target.kind) return fail("A built-in category's kind can't change");
    } else out.kind = body.kind as CategoryKind;
  }

  if (body.icon !== undefined) {
    if (!isCategoryIconName(body.icon)) return fail("Unknown icon");
    const builtIn = target && isBuiltinCategoryId(target.id) ? BUILTIN_CATEGORIES[target.id] : null;
    out.icon = builtIn?.icon === body.icon ? null : body.icon;
  } else if (!target) out.icon = "shapes";

  const color = parseColor(body.color);
  if (color === false) return fail("Unknown colour");
  if (color !== undefined) {
    const builtIn = target && isBuiltinCategoryId(target.id) ? BUILTIN_CATEGORIES[target.id] : null;
    out.color = builtIn && color === (builtIn.color ?? NO_CATEGORY_COLOR) ? null : color;
  }

  if (body.hidden !== undefined) {
    if (typeof body.hidden !== "boolean") return fail("Invalid request");
    if (body.hidden && !(target && canHide(target.id))) {
      return fail(
        target?.builtIn ? `${target.label} can't be hidden: other payments fall back to it` : "Only built-in categories can be hidden",
      );
    }
    if (target?.builtIn) out.hidden = body.hidden;
  }
  return { ok: true, value: out };
}
