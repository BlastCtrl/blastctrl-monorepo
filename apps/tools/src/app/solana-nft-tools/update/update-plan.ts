import type {
  NftCreator,
  TokenMetadata,
  UpdateNftFields,
} from "@/lib/solana/metaplex-token-metadata";
import { address, type Address } from "@solana/kit";

/** The form's values; `creators` as rows, shares in percent. */
export type UpdateFormValues = {
  name: string;
  symbol: string;
  uri: string;
  updateAuthority: string;
  isMutable: boolean;
  primarySaleHappened: boolean;
  creators: { address: string; share: number }[];
  sellerFeeBasisPoints: number;
};

/** Which fields the user touched (react-hook-form's `dirtyFields`, loosely typed). */
export type DirtyFields = { [K in keyof UpdateFormValues]?: unknown };

/**
 * What to send `updateV1` for `form` against the metadata as it is on chain:
 * each field only when the user touched it and it differs from the current
 * value, so loading the current values into the form and submitting sends
 * nothing, and an untouched empty field never blanks anything. The `data`
 * struct is sent as a whole only when one of its fields changes, because
 * immutable metadata refuses a data write even when it changes nothing.
 * Returns null when there is nothing to update.
 */
export function planUpdate(
  form: UpdateFormValues,
  dirty: DirtyFields,
  current: TokenMetadata,
  wallet: Address,
): UpdateNftFields | null {
  const changed = <K extends keyof UpdateFormValues>(
    key: K,
    currentValue: UpdateFormValues[K],
  ) => Boolean(dirty[key]) && form[key] !== currentValue;
  // Empty strings mean "leave as is", whether or not the field was touched.
  const text = (key: "name" | "symbol" | "uri") =>
    form[key] !== "" && changed(key, current[key]);

  const creators = dirty.creators
    ? formCreators(form.creators, current, wallet)
    : current.creators;
  const creatorsChanged =
    Boolean(dirty.creators) && !sameCreators(creators, current.creators);

  const dataChanged =
    text("name") ||
    text("symbol") ||
    text("uri") ||
    changed("sellerFeeBasisPoints", current.sellerFeeBasisPoints) ||
    creatorsChanged;

  const fields: UpdateNftFields = {
    data: dataChanged
      ? {
          name: text("name") ? form.name : current.name,
          symbol: text("symbol") ? form.symbol : current.symbol,
          uri: text("uri") ? form.uri : current.uri,
          sellerFeeBasisPoints: changed(
            "sellerFeeBasisPoints",
            current.sellerFeeBasisPoints,
          )
            ? form.sellerFeeBasisPoints
            : current.sellerFeeBasisPoints,
          creators,
        }
      : undefined,
    newUpdateAuthority:
      form.updateAuthority !== "" &&
      changed("updateAuthority", current.updateAuthority)
        ? address(form.updateAuthority)
        : undefined,
    isMutable: changed("isMutable", current.isMutable)
      ? form.isMutable
      : undefined,
    primarySaleHappened: changed(
      "primarySaleHappened",
      current.primarySaleHappened,
    )
      ? form.primarySaleHappened
      : undefined,
  };

  return Object.values(fields).some((value) => value !== undefined)
    ? fields
    : null;
}

/**
 * Why the program would refuse `plan` on `current`, in the user's terms, or
 * null when it wouldn't. Each of these is a one-way flag the program
 * enforces; checking here saves a wallet prompt and a bare error number.
 */
export function updateRefusal(
  plan: UpdateNftFields,
  current: TokenMetadata,
): string | null {
  if (plan.data && !current.isMutable) {
    return "This metadata is immutable: its name, symbol, URI, royalties and creators can't be changed anymore.";
  }
  if (plan.isMutable === true && !current.isMutable) {
    return "Immutable metadata can't be made mutable again.";
  }
  if (plan.primarySaleHappened === false && current.primarySaleHappened) {
    return '"Primary sale happened" can be turned on, but never off again.';
  }
  return null;
}

/**
 * The creator list to write. Verification is kept for creators already on
 * the NFT and granted to the wallet, which signs; the program rejects
 * anything else. An empty list is written as no creators, which the program
 * accepts where `[]` is refused.
 */
function formCreators(
  rows: UpdateFormValues["creators"],
  current: TokenMetadata,
  wallet: Address,
): NftCreator[] | null {
  if (rows.length === 0) return null;
  return rows.map((row) => {
    const creator = address(row.address);
    return {
      address: creator,
      share: row.share,
      verified:
        current.creators?.find((c) => c.address === creator)?.verified ??
        creator === wallet,
    };
  });
}

const sameCreators = (a: NftCreator[] | null, b: NftCreator[] | null) =>
  (a ?? []).length === (b ?? []).length &&
  (a ?? []).every((creator, i) => {
    const other = (b ?? [])[i];
    return (
      other !== undefined &&
      other.address === creator.address &&
      other.share === creator.share &&
      other.verified === creator.verified
    );
  });
