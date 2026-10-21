import type {
  NftCreator,
  TokenMetadata,
} from "@/lib/solana/metaplex-token-metadata";
import { TokenStandard } from "@/lib/solana/metaplex-token-metadata";
import { getAddressDecoder, type Address } from "@solana/kit";

/** A random address; not necessarily on the curve, which nothing here minds. */
export const address = (): Address =>
  getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

export const creator = (
  address: Address,
  share: number,
  verified = false,
): NftCreator => ({ address, share, verified });

/** Only the fields the tool reads are meaningful. */
export function metadata(
  overrides: Partial<TokenMetadata> = {},
): TokenMetadata {
  return {
    updateAuthority: address(),
    name: "Test NFT",
    symbol: "TEST",
    uri: "https://example.com/nft.json",
    sellerFeeBasisPoints: 500,
    creators: [],
    isMutable: true,
    primarySaleHappened: false,
    tokenStandard: TokenStandard.NonFungible,
    collection: null,
    ...overrides,
  };
}
