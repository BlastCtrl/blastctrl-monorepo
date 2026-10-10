import { TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { some } from "@metaplex-foundation/umi";
import { describe, expect, it } from "vitest";
import { address, creator, metadata } from "./fixtures";
import type { TransferSettings } from "./plan";
import { planTransfer, planVerify } from "./plan";

const wallet = address();
const newAuthority = address();
const other = address();
const mint = address();

const settings = (
  overrides: Partial<TransferSettings> = {},
): TransferSettings => ({
  wallet,
  newAuthority,
  newCreator: newAuthority,
  creatorMode: "swap",
  ...overrides,
});

const owned = (creators = [creator(wallet, 100, true)]) =>
  metadata({ updateAuthority: wallet, creators });

describe("planTransfer", () => {
  it("swaps the wallet's verified creator for an unverified new one", () => {
    const plan = planTransfer(mint, owned(), settings());
    expect(plan).toMatchObject({
      status: "ready",
      creators: [creator(newAuthority, 100, false)],
    });
  });

  it("keeps the other creators, their order and their status when swapping", () => {
    const plan = planTransfer(
      mint,
      owned([creator(other, 30, true), creator(wallet, 70, true)]),
      settings(),
    );
    expect(plan).toMatchObject({
      status: "ready",
      creators: [creator(other, 30, true), creator(newAuthority, 70, false)],
    });
  });

  it("adds the wallet's share to a new creator who is already listed", () => {
    const plan = planTransfer(
      mint,
      owned([creator(wallet, 60, true), creator(newAuthority, 40, true)]),
      settings(),
    );
    expect(plan).toMatchObject({
      status: "ready",
      creators: [creator(newAuthority, 100, true)],
    });
  });

  it("can't swap when the wallet isn't a creator", () => {
    const plan = planTransfer(mint, owned([creator(other, 100)]), settings());
    expect(plan).toMatchObject({ status: "error" });
  });

  it("replaces every creator with the new one at 100%", () => {
    const plan = planTransfer(
      mint,
      owned([creator(wallet, 50, true), creator(other, 50, false)]),
      settings({ creatorMode: "replace" }),
    );
    expect(plan).toMatchObject({
      status: "ready",
      creators: [creator(newAuthority, 100, false)],
    });
  });

  it("can't replace a creator someone else verified", () => {
    const plan = planTransfer(
      mint,
      owned([creator(wallet, 50, true), creator(other, 50, true)]),
      settings({ creatorMode: "replace" }),
    );
    expect(plan).toMatchObject({ status: "error" });
    if (plan.status === "error") expect(plan.reason).toContain(other);
  });

  it("leaves the creators alone in keep mode", () => {
    const plan = planTransfer(mint, owned(), settings({ creatorMode: "keep" }));
    expect(plan).toMatchObject({ status: "ready", creators: null });
  });

  it("puts a separate new creator in place, not the new authority", () => {
    const newCreator = address();
    const plan = planTransfer(mint, owned(), settings({ newCreator }));
    expect(plan).toMatchObject({
      status: "ready",
      creators: [creator(newCreator, 100, false)],
    });
  });

  it("is done once the new authority holds it", () => {
    const plan = planTransfer(
      mint,
      metadata({ updateAuthority: newAuthority }),
      settings(),
    );
    expect(plan.status).toBe("done");
  });

  it("can't touch NFTs another wallet controls", () => {
    const plan = planTransfer(
      mint,
      metadata({ updateAuthority: other }),
      settings(),
    );
    expect(plan).toMatchObject({ status: "error" });
  });

  it("can't touch immutable NFTs", () => {
    const plan = planTransfer(
      mint,
      metadata({ updateAuthority: wallet, isMutable: false }),
      settings(),
    );
    expect(plan).toMatchObject({ status: "error", reason: "Immutable" });
  });

  it("skips fungible tokens", () => {
    const plan = planTransfer(
      mint,
      metadata({
        updateAuthority: wallet,
        tokenStandard: some(TokenStandard.Fungible),
        creators: [creator(wallet, 100, true)],
      }),
      settings(),
    );
    expect(plan).toMatchObject({ status: "error" });
  });

  it("reports a missing metadata account", () => {
    expect(planTransfer(mint, null, settings())).toMatchObject({
      status: "error",
    });
  });

  it("trims the null padding off names", () => {
    const plan = planTransfer(
      mint,
      metadata({ name: "Padded\0\0\0" }),
      settings(),
    );
    expect(plan.name).toBe("Padded");
  });
});

describe("planVerify", () => {
  it("is ready while the wallet's creator is unverified", () => {
    const plan = planVerify(
      mint,
      metadata({ creators: [creator(wallet, 100)] }),
      wallet,
    );
    expect(plan.status).toBe("ready");
  });

  it("is done once verified", () => {
    const plan = planVerify(
      mint,
      metadata({ creators: [creator(wallet, 100, true)] }),
      wallet,
    );
    expect(plan.status).toBe("done");
  });

  it("can't verify a wallet that isn't a creator", () => {
    const plan = planVerify(
      mint,
      metadata({ creators: [creator(other, 100)] }),
      wallet,
    );
    expect(plan).toMatchObject({ status: "error" });
  });

  it("can't verify on an NFT without creators", () => {
    const plan = planVerify(mint, metadata({ creators: null }), wallet);
    expect(plan).toMatchObject({
      status: "error",
      reason: "It has no creators",
    });
  });
});
