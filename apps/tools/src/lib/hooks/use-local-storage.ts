/* eslint-disable @typescript-eslint/no-unsafe-return */
import { useState, useEffect } from "react";

type UseLocalStorageStateHook<T> = [T, React.Dispatch<React.SetStateAction<T>>];

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
): UseLocalStorageStateHook<T> {
  const [state, setState] = useState<T>(() => {
    try {
      if (typeof window === "undefined") {
        return initialValue;
      }
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(
        `Unable to get value from localStorage for key "${key}":`,
        error,
      );
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      let newValue = JSON.stringify(state);
      window.localStorage.setItem(key, newValue);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
    } catch (error) {
      console.error(
        `Unable to set value to localStorage for key "${key}":`,
        error,
      );
    }
  }, [key, state]);

  return [state, setState];
}
