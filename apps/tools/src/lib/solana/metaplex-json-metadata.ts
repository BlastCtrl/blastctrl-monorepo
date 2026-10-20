import { mimeTypeToCategory } from "@/lib/utils";

/** The off-chain fields of an NFT, as the mint forms collect them. */
export type NftMetadataInput = {
  name: string;
  symbol: string;
  description?: string;
  external_url?: string;
  image?: File | null;
  animation_url?: File | null;
  attributes?: { trait_type: string; value: string }[];
};

/** Uploads `file` and resolves with its URI; `label` names it in progress UI. */
export type FileUploader = (file: File, label: string) => Promise<string>;

/**
 * The Metaplex JSON metadata for `input`, with the media at the given URIs.
 * @see https://developers.metaplex.com/token-metadata/token-standard
 */
export function buildNftMetadata(
  input: NftMetadataInput,
  uris: { image?: string; animation?: string },
) {
  const { name, symbol, description, external_url, attributes } = input;
  const files: { uri: string; type?: string }[] = [];
  if (uris.image) files.push({ uri: uris.image, type: input.image?.type });
  if (uris.animation) {
    files.push({ uri: uris.animation, type: input.animation_url?.type });
  }
  // The animation file decides the category; it has precedence over the image.
  const category = input.animation_url
    ? mimeTypeToCategory(input.animation_url)
    : input.image
      ? mimeTypeToCategory(input.image)
      : undefined;

  return {
    name,
    symbol,
    description,
    external_url,
    ...(attributes && { attributes }),
    ...(uris.image && { image: uris.image }),
    ...(uris.animation && { animation_url: uris.animation }),
    ...(files.length > 0 && { properties: { category, files } }),
  };
}

/**
 * Uploads the media files of an NFT, then its JSON metadata pointing at them.
 * Resolves with the URI of the JSON. Each upload is a wallet interaction, so
 * they run one after another.
 */
export async function uploadNftMetadata(
  input: NftMetadataInput,
  upload: FileUploader,
): Promise<string> {
  const image = input.image ? await upload(input.image, "image") : undefined;
  const animation = input.animation_url
    ? await upload(input.animation_url, "animation file")
    : undefined;

  const json = buildNftMetadata(input, { image, animation });
  const file = new File([JSON.stringify(json)], "metadata.json", {
    type: "application/json",
  });
  return upload(file, "metadata");
}
