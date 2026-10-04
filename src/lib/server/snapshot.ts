// Process-wide memo for expensive derived data (the detection snapshot). A cheap version read
// decides whether the cached value is still valid, so warm serverless instances skip reloading
// every transaction while still seeing writes made by any other instance.

/**
 * Returns a getter that calls `load` only when `version()` changes. Concurrent callers share the
 * in-flight load; failures are not cached. Callers must treat the value as read-only.
 */
export function memoByVersion<T>(version: () => Promise<string>, load: (version: string) => Promise<T>): () => Promise<T> {
  let memo: { version: string; value: Promise<T> } | undefined;
  return async () => {
    const v = await version();
    if (memo?.version === v) return memo.value;
    const value = load(v);
    const entry = { version: v, value };
    memo = entry;
    value.catch(() => {
      if (memo === entry) memo = undefined;
    });
    return value;
  };
}
