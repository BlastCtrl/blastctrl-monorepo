import type {
  Creator,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import type { PublicKey } from "@metaplex-foundation/umi";
import { none, some } from "@metaplex-foundation/umi";
import { Keypair } from "@solana/web3.js";

export const address = () =>
  Keypair.generate().publicKey.toBase58() as PublicKey;

export const creator = (
  addr: string,
  share: number,
  verified = false,
): Creator => ({ address: addr as PublicKey, share, verified });

/** Only the fields the tool reads are meaningful. */
export function metadata(
  overrides: Partial<Omit<Metadata, "creators">> & {
    creators?: Creator[] | null;
  } = {},
): Metadata {
  const { creators = [], ...rest } = overrides;
  return {
    publicKey: address(),
    updateAuthority: address(),
    mint: address(),
    name: "Test NFT",
    symbol: "TEST",
    uri: "https://example.com/nft.json",
    sellerFeeBasisPoints: 500,
    primarySaleHappened: false,
    isMutable: true,
    tokenStandard: some(TokenStandard.NonFungible),
    ...rest,
    creators: creators ? some(creators) : none(),
  } as Metadata;
}
