import { cn } from "@blastctrl/ui";
import { useState } from "react";

export function TokenAvatar({
  symbol,
  image,
  muted,
}: {
  symbol: string;
  image?: string;
  muted: boolean;
}) {
  // DAS image links are often dead; fall back to the symbol badge when
  // the image fails to load.
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (image && image !== failedImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        loading="lazy"
        width={32}
        height={32}
        onError={() => setFailedImage(image)}
        className={cn(
          "size-8 shrink-0 rounded-full bg-zinc-100 object-cover",
          muted && "opacity-50 grayscale",
        )}
      />
    );
  }
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) % 360;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-content-center rounded-full text-[11px] font-semibold",
        muted && "opacity-50 grayscale",
      )}
      style={{
        backgroundColor: `hsl(${hash} 60% 90%)`,
        color: `hsl(${hash} 55% 28%)`,
      }}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}
