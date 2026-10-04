import { defaultShouldDehydrateQuery, isServer, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Server-prefetched data is fresh on arrival; don't immediately refetch on the client.
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        // Also dehydrate *pending* queries so server prefetches stream to the client
        // and useSuspenseQuery picks up the in-flight promise instead of refetching.
        shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === "pending",
        shouldRedactErrors: () => false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) return makeQueryClient(); // a fresh client per server render
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
