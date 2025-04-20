import React from "react";

export function usePasteAddresses(
  amount: string,
  setRecipients: React.Dispatch<
    React.SetStateAction<Array<{ address: string; amount: string }>>
  >,
) {
  React.useEffect(() => {
    async function handler(event: ClipboardEvent) {
      if (!document.activeElement) return;
      const match = document.activeElement.id.match(
        /^recipient-address-\[(\d+)\]$/,
      );
      if (!match) return;
      const text = await navigator.clipboard.readText();
      if (!text.includes("\n")) return;

      // paste into multiple lines
      const index = parseInt(match[1]!);
      const addresses = text.split("\n");

      setRecipients((prev) => {
        // the index + 1 is on purpose, because I don't think we can fully prevent the paste event
        const [left, right] = [prev.slice(0, index), prev.slice(index + 1)];
        return [
          ...left,
          ...addresses.map((address) => ({ address, amount })),
          ...right,
        ];
      });
    }
    window.addEventListener("paste", handler);
    return () => {
      window.removeEventListener("paste", handler);
    };
  }, [amount]);
}
