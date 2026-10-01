import { describe, expect, it } from "vitest";
import { keepOpenReason } from "./types";

describe("keepOpenReason", () => {
  const owner = "Owner1111111111111111111111111111111111111";
  const open = { state: "initialized" };

  it("lets a plain empty account close", () => {
    expect(keepOpenReason(open, owner)).toBeUndefined();
    expect(
      keepOpenReason(
        { ...open, extensions: [{ extension: "immutableOwner" }] },
        owner,
      ),
    ).toBeUndefined();
  });

  it("keeps a frozen account open", () => {
    expect(keepOpenReason({ state: "frozen" }, owner)).toBeDefined();
  });

  it("keeps it open when someone else holds the close authority", () => {
    expect(
      keepOpenReason({ ...open, closeAuthority: owner }, owner),
    ).toBeUndefined();
    expect(
      keepOpenReason({ ...open, closeAuthority: "Someone" }, owner),
    ).toBeDefined();
  });

  it("keeps it open while it holds withheld transfer fees", () => {
    const fees = (withheldAmount: number) => ({
      ...open,
      extensions: [
        { extension: "transferFeeAmount", state: { withheldAmount } },
      ],
    });
    expect(keepOpenReason(fees(0), owner)).toBeUndefined();
    expect(keepOpenReason(fees(12), owner)).toBeDefined();
  });

  it("keeps it open with confidential transfers, whatever they hold", () => {
    for (const extension of [
      "confidentialTransferAccount",
      "confidentialTransferFeeAmount",
    ]) {
      expect(
        keepOpenReason({ ...open, extensions: [{ extension }] }, owner),
      ).toBeDefined();
    }
  });
});
