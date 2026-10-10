# Local fonts

The root layout loads these Latin-subset WOFF2 assets with `next/font/local`.
These two families need no Google Fonts requests at build time or in the browser. The existing
`--font-roboto` and `--font-roboto-slab` variables feed the shared Tailwind theme.

The third-party wallet adapter stylesheet separately imports DM Sans from
Google Fonts; that font is not managed by this layout.

- `roboto/`: supplied Roboto v51 files, normal weights 300, 400, 500, 700 and 900.
  License: `roboto/OFL.txt`.
- `roboto-slab/`: Roboto Slab v36 variable font, configured for weights 300–900.
  Downloaded from [Google Fonts](https://fonts.gstatic.com/s/robotoslab/v36/BngMUXZYTXPIvIBgJJSb6ufN5qWr4xCC.woff2).
  License: `roboto-slab/LICENSE.txt`.

The supplied repository-root `roboto-slab-latin/` files were identical to
Roboto files, including their embedded family names. They are not used here.
