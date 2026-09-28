import type { ComponentType } from "react";
import { PromoCardVariant } from "./promo-card";
import { PromoStageVariant } from "./promo-stage";
import type { VariantProps } from "./types";

export type { VariantProps } from "./types";

export const VARIANTS: {
  id: string;
  name: string;
  Component: ComponentType<VariantProps>;
  /** Put the token account and mint sections on a grey sheet. */
  detailsOnSheet?: boolean;
}[] = [
  { id: "promo-stage", name: "Stage", Component: PromoStageVariant },
  { id: "promo-card", name: "Card", Component: PromoCardVariant },
];
