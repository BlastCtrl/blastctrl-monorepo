import { useEffect, useState } from "react";

/**
 * What `promise` resolves to, or undefined while it is pending or null. A
 * new promise hides the previous one's value at once, so a stale value is
 * never shown for new inputs. Memoize the promise, or this never settles.
 */
export function useResolved<T>(promise: Promise<T> | null): T | undefined {
  const [settled, setSettled] = useState<{
    promise: Promise<T>;
    value: T;
  } | null>(null);

  useEffect(() => {
    if (!promise) return;
    let current = true;
    void promise.then((value) => {
      if (current) setSettled({ promise, value });
    });
    return () => {
      current = false;
    };
  }, [promise]);

  return settled && settled.promise === promise ? settled.value : undefined;
}
