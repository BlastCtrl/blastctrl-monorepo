/**
 * Reveal styles for the results block. Each mode is a class on the wrapper;
 * `data-reveal` elements carry `--i`, their place in the sequence, which the
 * staggered modes turn into a delay. Whole-block modes ignore `--i`.
 */
export const REVEAL_MODES = [
  { id: "fade", name: "Fade", keys: "Whole block fades in." },
  { id: "rise", name: "Rise", keys: "Whole block slides up and fades in." },
  { id: "slide", name: "Slide", keys: "Whole block slides in from the right." },
  {
    id: "stagger",
    name: "Stagger",
    keys: "Each element rises in turn, headline first, tables last.",
  },
  {
    id: "pop",
    name: "Bubbly",
    keys: "Each element pops in with a little overshoot, like the video.",
  },
  {
    id: "rise-pop",
    name: "Rise, then pop",
    keys: "Block slides up, then the amount and the button pop.",
  },
] as const;

export type RevealMode = (typeof REVEAL_MODES)[number]["id"];

export const REVEAL_CSS = `
  @keyframes rv-fade { from { opacity: 0; } }
  @keyframes rv-rise { from { opacity: 0; transform: translateY(24px); } }
  @keyframes rv-slide { from { opacity: 0; transform: translateX(48px); } }
  @keyframes rv-pop {
    0% { opacity: 0; transform: scale(0.8); }
    60% { opacity: 1; transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }

  .rv-fade > [data-reveal-root] { animation: rv-fade 600ms ease-out both; }
  .rv-rise > [data-reveal-root] { animation: rv-rise 550ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .rv-slide > [data-reveal-root] { animation: rv-slide 550ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }

  .rv-stagger [data-reveal] {
    animation: rv-rise 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(var(--i) * 90ms);
  }
  .rv-pop [data-reveal] {
    animation: rv-pop 520ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
    animation-delay: calc(var(--i) * 100ms);
  }

  .rv-rise-pop > [data-reveal-root] { animation: rv-rise 550ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .rv-rise-pop [data-reveal="pop"] {
    animation: rv-pop 520ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
    animation-delay: calc(350ms + var(--i) * 120ms);
  }

  @media (prefers-reduced-motion: reduce) {
    [data-reveal-root], [data-reveal] { animation: none !important; }
  }
`;
