// Process-wide memo for expensive derived data (the detection snapshot). A cheap version read
// decides whether the cached value is still valid, so warm serverless instances skip reloading
// every transaction while still seeing writes made by any other instance.

/**
 * Returns a loader that calls `load` only when the version it's given changes, keeping the value
 * for the latest version. Concurrent callers share the in-flight load; failures are not cached.
 * Extra arguments are passed to `load` and must be the same for the same version. Callers must
 * treat the value as read-only.
 */
export function memoLatest<T, A extends unknown[] = []>(
  load: (version: string, ...args: A) => Promise<T>,
): (version: string, ...args: A) => Promise<T> {
  let memo: { version: string; value: Promise<T> } | undefined;
  return (v, ...args) => {
    if (memo?.version === v) return memo.value;
    const value = load(v, ...args);
    const entry = { version: v, value };
    memo = entry;
    value.catch(() => {
      if (memo === entry) memo = undefined;
    });
    return value;
  };
}
