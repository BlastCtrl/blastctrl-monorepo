"use client";

import { useState } from "react";
import { StakeAccountForm } from "./stake-acc-form";
import { StakeCSVForm } from "./stake-csv-form";

type Mode = "UI" | "CSV";

export default function CreateStake() {
  const [mode, setMode] = useState<Mode>("UI");

  return (
    <div className="mx-auto max-w-2xl overflow-visible bg-white pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <header className="relative border-b border-gray-200 pb-4">
        <div className="absolute right-0 top-0">
          <div className="flex rounded-lg border border-gray-300 bg-gray-50 p-1">
            <button
              onClick={() => setMode("UI")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                mode === "UI"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-blue-700 hover:text-blue-900"
              }`}
            >
              UI
            </button>
            <button
              onClick={() => setMode("CSV")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                mode === "CSV"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-blue-700 hover:text-blue-900"
              }`}
            >
              CSV
            </button>
          </div>
        </div>

        <h1 className="font-display text-3xl font-semibold">
          Create stake account
        </h1>
        <p className="mt-4 text-sm text-gray-500">Only for advanced users.</p>
      </header>

      {mode === "UI" ? <StakeAccountForm /> : <StakeCSVForm />}
    </div>
  );
}
