import type {
  Creator,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import type { PublicKey } from "@metaplex-foundation/umi";
import { isSome, unwrapOption } from "@metaplex-foundation/umi";

/**
 * What to do with the creators while the update authority moves:
 * - `swap`: put the new creator where your wallet is, with your share. The
 *   other creators stay as they are.
 * - `replace`: the new creator becomes the only one, with 100%.
 * - `keep`: leave the creators alone.
 *
 * Whoever ends up in the list starts unverified, and verifies themselves in
 * step 2. The program only lets the update authority remove a *verified*
 * creator when that creator is itself, so `replace` fails on NFTs where
 * someone else is verified.
 */
export type CreatorMode = "swap" | "replace" | "keep";

export type TransferSettings = {
  /** The connected wallet, the current update authority. */
  wallet: string;
  newAuthority: string;
  /** Used in the `swap` and `replace` modes. */
  newCreator: string;
  creatorMode: CreatorMode;
};

type Base = { mint: string; name: string };

export type TransferPlan = Base &
  (
    | { status: "ready"; metadata: Metadata; creators: Creator[] | null }
    | { status: "done" }
    | { status: "error"; reason: string }
  );

export type VerifyPlan = Base &
  (
    | { status: "ready"; metadata: Metadata }
    | { status: "done" }
    | { status: "error"; reason: string }
  );

/** Metadata strings from older programs are padded with null bytes. */
export const trimNulls = (value: string) => value.replace(/\0+$/, "");

const nameOf = (metadata: Metadata | null) =>
  metadata ? trimNulls(metadata.name) : "";

const creatorsOf = (metadata: Metadata) =>
  unwrapOption(metadata.creators) ?? [];

const isFungible = (metadata: Metadata) => {
  const standard = unwrapOption(metadata.tokenStandard);
  return (
    standard === TokenStandard.Fungible ||
    standard === TokenStandard.FungibleAsset
  );
};

/**
 * Step 1, for one NFT: whether the connected wallet can hand it over, and
 * the creator list it will have afterwards (`null` leaves it untouched).
 */
export function planTransfer(
  mint: string,
  metadata: Metadata | null,
  settings: TransferSettings,
): TransferPlan {
  const base = { mint, name: nameOf(metadata) };
  if (!metadata) {
    return { ...base, status: "error", reason: "No Token Metadata account" };
  }
  if (metadata.updateAuthority === settings.newAuthority) {
    return { ...base, status: "done" };
  }
  if (metadata.updateAuthority !== settings.wallet) {
    return {
      ...base,
      status: "error",
      reason: `Update authority is ${metadata.updateAuthority}`,
    };
  }
  if (!metadata.isMutable) {
    return { ...base, status: "error", reason: "Immutable" };
  }
  if (isFungible(metadata)) {
    return { ...base, status: "error", reason: "Fungible token, not an NFT" };
  }

  const result = nextCreators(metadata, settings);
  if ("error" in result) {
    return { ...base, status: "error", reason: result.error };
  }
  return { ...base, status: "ready", metadata, creators: result.creators };
}

function nextCreators(
  metadata: Metadata,
  { wallet, newCreator, creatorMode }: TransferSettings,
): { creators: Creator[] | null } | { error: string } {
  if (creatorMode === "keep") return { creators: null };

  const current = creatorsOf(metadata);
  const existing = current.find((c) => c.address === newCreator);

  if (creatorMode === "replace") {
    const blocking = current.filter(
      (c) => c.verified && c.address !== wallet && c.address !== newCreator,
    );
    if (blocking.length > 0) {
      return {
        error: `Other verified ${blocking.length === 1 ? "creator" : "creators"} (${blocking.map((c) => c.address).join(", ")}) must unverify first`,
      };
    }
    return {
      creators: [
        {
          address: newCreator as PublicKey,
          // An existing creator keeps their status; the program rejects
          // any change to it that the creator didn't sign.
          verified: existing?.verified ?? false,
          share: 100,
        },
      ],
    };
  }

  const mine = current.find((c) => c.address === wallet);
  if (!mine) {
    return {
      error: "Your wallet isn't a creator; use “Replace all creators”",
    };
  }
  if (newCreator === wallet) return { creators: null };

  // The new creator takes your place in the list. If they were already in
  // it, they get your share on top of theirs instead.
  const creators = current.flatMap((c): Creator[] => {
    if (c.address === wallet) {
      return existing
        ? []
        : [
            {
              address: newCreator as PublicKey,
              verified: false,
              share: c.share,
            },
          ];
    }
    if (c.address === newCreator)
      return [{ ...c, share: c.share + mine.share }];
    return [c];
  });
  return { creators };
}

/** Step 2, for one NFT: whether the connected wallet has a creator to verify. */
export function planVerify(
  mint: string,
  metadata: Metadata | null,
  wallet: string,
): VerifyPlan {
  const base = { mint, name: nameOf(metadata) };
  if (!metadata) {
    return { ...base, status: "error", reason: "No Token Metadata account" };
  }
  const creator = creatorsOf(metadata).find((c) => c.address === wallet);
  if (!creator) {
    return {
      ...base,
      status: "error",
      reason: isSome(metadata.creators)
        ? "Your wallet isn't one of its creators"
        : "It has no creators",
    };
  }
  if (creator.verified) return { ...base, status: "done" };
  return { ...base, status: "ready", metadata };
}
