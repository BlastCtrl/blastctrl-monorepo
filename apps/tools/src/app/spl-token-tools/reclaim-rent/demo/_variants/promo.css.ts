/** Shared bits of the promo video's look, used by the two promo variants. */

export const INK = "#1b2232";
export const RED = "#d6392f";
export const RED_DARK = "#b92f27";
export const GREEN = "#2f855a";

/** The video's off-white stage with a faint dot grid. */
export const DOT_GRID =
  "bg-[#fafafa] bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:22px_22px]";

/** Red-hatched fill for the part of a deposit that can leave. */
export const HATCH =
  "bg-[repeating-linear-gradient(135deg,#fecaca_0_5px,#fff5f5_5px_10px)]";

export const POP_KEYFRAMES = `
  @keyframes promo-pop {
    0% { transform: scale(0.85); opacity: 0; }
    60% { transform: scale(1.04); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes promo-grow { from { width: 0; } }
  .promo-pop { animation: promo-pop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
  .promo-grow { animation: promo-grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  @media (prefers-reduced-motion: reduce) {
    .promo-pop, .promo-grow { animation: none; }
  }
`;
