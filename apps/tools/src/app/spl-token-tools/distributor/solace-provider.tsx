"use client";

import React from "react";
import build, { PlatformaticFrontendClient } from "@blastctrl/solace";

const SolaceContext = React.createContext<PlatformaticFrontendClient>(
  null as unknown as PlatformaticFrontendClient,
);

export function useSolace() {
  return React.useContext(SolaceContext);
}

export function SolaceProvider({ children }: { children: React.ReactNode }) {
  const [instance, setInstance] = React.useState(() => {
    if (typeof window !== "undefined") {
      const authToken = window.localStorage.getItem("authToken");
      if (authToken) {
        try {
          const token = JSON.parse(authToken).token;
          const sdk = build("/blast-api", {
            headers: {
              authorization: `Bearer ${token}`,
            },
          });
          return sdk;
        } catch {
          console.warn("Failed to parse auth token from local storage");
          return build("/blast-api");
        }
      } else {
        return build("/blast-api");
      }
    } else {
      console.log("no window :(");
      return build("/blast-api");
    }
  });

  React.useEffect(() => {
    if (window) {
      const callback = (event: StorageEvent) => {
        if (event.key === "authToken") {
          const authToken = event.newValue;
          if (authToken) {
            try {
              const token = JSON.parse(authToken).token;
              setInstance(
                build("/blast-api", {
                  headers: {
                    authorization: `Bearer ${token}`,
                  },
                }),
              );
            } catch {
              setInstance(build("/blast-api"));
            }
          }
        }
      };
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    }
  }, []);

  return (
    <SolaceContext.Provider value={instance}>{children}</SolaceContext.Provider>
  );
}
