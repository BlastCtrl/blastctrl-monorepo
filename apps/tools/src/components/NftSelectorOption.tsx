import type { NftAsset } from "@/state/queries/use-owner-nfts";
import { cn } from "@blastctrl/ui";
import Image from "next/image";

type NftSelectorProp = {
  selected: boolean;
  nft: NftAsset;
};

export const NftSelectorOption = ({ nft, selected }: NftSelectorProp) => {
  return (
    <div className="flex items-center">
      {/* TODO: default image if the json is invalid */}
      {nft.content?.links?.image && (
        <Image
          src={nft.content.links.image}
          alt=""
          height={24}
          width={24}
          className="size-6 shrink-0 rounded object-cover object-center"
        />
      )}

      <span className={cn("ml-3 truncate", selected && "font-semibold")}>
        {nft?.content?.metadata?.name}
      </span>
    </div>
  );
};
