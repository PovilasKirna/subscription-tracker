"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type CategoryLookup, categoryLookup } from "../categories";
import { categoriesQuery } from "./options";

/**
 * The user's spending categories (labels, kinds, icons, colours), looked up by id. Prefetched by the
 * app layout, so it's there on every page without a loading state.
 */
export function useCategories(): CategoryLookup {
  const { data } = useSuspenseQuery(categoriesQuery());
  return useMemo(() => categoryLookup(data.categories), [data]);
}
