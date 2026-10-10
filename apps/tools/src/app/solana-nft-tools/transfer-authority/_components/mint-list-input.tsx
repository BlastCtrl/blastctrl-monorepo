import { notify } from "@/components";
import { Button } from "@blastctrl/ui";
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from "@heroicons/react/20/solid";
import { useRef } from "react";
import type { MintList } from "./mint-list";

type Props = {
  value: string;
  onChange: (value: string) => void;
  parsed: MintList | { error: string };
  disabled?: boolean;
};

export function MintListInput({ value, onChange, parsed, disabled }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File) => {
    try {
      onChange(await file.text());
    } catch {
      notify({ type: "error", description: `Couldn't read ${file.name}` });
    }
  };

  const download = () => {
    if ("error" in parsed) return;
    const blob = new Blob([JSON.stringify(parsed.mints, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nft-mints.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor="mints" className="text-sm font-medium text-gray-700">
          NFT mint addresses
        </label>
        <div className="flex gap-2">
          {!("error" in parsed) && parsed.mints.length > 0 && (
            <Button plain onClick={download} disabled={disabled}>
              <ArrowDownTrayIcon className="size-4 text-gray-500" />
              Save as JSON
            </Button>
          )}
          <Button
            outline
            onClick={() => fileInput.current?.click()}
            disabled={disabled}
          >
            <ArrowUpTrayIcon className="size-4 text-gray-500" />
            Load JSON file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.txt,.csv,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <textarea
        id="mints"
        rows={6}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={
          'One mint address per line, or a JSON array: ["mint1", "mint2"] or [{ "mint": "mint1" }]'
        }
        className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-50"
      />
      <p className="mt-1 text-xs text-gray-500">
        {"error" in parsed ? (
          <span className="text-red-700">{parsed.error}</span>
        ) : (
          <>
            {parsed.mints.length} {parsed.mints.length === 1 ? "mint" : "mints"}
            {parsed.duplicates > 0 &&
              `, ${parsed.duplicates} duplicates skipped`}
            {parsed.invalid.length > 0 && (
              <span className="text-red-700">
                , {parsed.invalid.length} invalid:{" "}
                {parsed.invalid.slice(0, 3).join(", ")}
                {parsed.invalid.length > 3 && ", …"}
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
