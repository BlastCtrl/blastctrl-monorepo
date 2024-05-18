import type { Preview } from "@storybook/react";
import React from "@storybook/react";
import { Roboto, Roboto_Slab } from "next/font/google";
import "../src/styles/globals.css";

const roboto = Roboto({
  display: "swap",
  style: "normal",
  variable: "--font-roboto",
  weight: ["300", "400", "500", "700", "900"],
  subsets: ["latin"],
});

const roboto_slab = Roboto_Slab({
  display: "swap",
  style: "normal",
  variable: "--font-roboto-slab",
  weight: ["300", "400", "500", "700", "900"],
  subsets: ["latin"],
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <section
        data-id="font-wrapper"
        className={`${roboto.variable} ${roboto_slab.variable} font-sans`}
      >
        <Story />
      </section>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
