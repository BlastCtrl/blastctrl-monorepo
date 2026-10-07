import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False on the server and the hydrating render, true after: for anything
 * only the browser knows (localStorage, media queries), so the first client
 * render matches the server's.
 */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
