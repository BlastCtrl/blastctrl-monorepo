import { fileURLToPath } from "node:url";
import createJiti from "jiti";
const jiti = createJiti(fileURLToPath(import.meta.url));

// Import env here to validate during build. Using jiti we can import .ts files :)
jiti("./src/env/server.ts");
jiti("./src/env/client.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // images: {
  //   loader: "cloudinary",
  //   path: "https://res.cloudinary.com/doz0obwb0/image/fetch/",
  // },
  transpilePackages: [
    "@blastctrl/ui",
    "@blastctrl/octane-core",
    "@blastctrl/rent-reclaimer",
    "@blastctrl/token-scans",
    "@blastctrl/solace-sdk",
    "@blastctrl/mpl-core",
    "@blastctrl/mpl-token-metadata",
    "@blastctrl/squads",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "arweave.net",
        port: "",
      },
    ],
  },
  async redirects() {
    return [
      {
        // The BONK swap is now the gasless swap with BONK selected.
        source: "/gasless-bonk-swap",
        destination: "/gasless-swap?token=bonk",
        permanent: true,
      },
      ...["tools\\.blastctrl\\.com", "reclaim\\.blastctrl\\.com"].map(
        (host) => ({
          // Next.js emits this image URL in metadata; serve it directly so
          // social crawlers can fetch it without the page migration redirect.
          source: "/reclaim-sol/:path((?!opengraph-image\\.png(?:/|$)).*)?",
          has: [{ type: /** @type {const} */ ("host"), value: host }],
          destination: "https://reclaim.blastctrl.com/:path*",
          permanent: true,
        }),
      ),
      {
        // Keep other pages on the toolbox domain. Leave framework requests,
        // APIs, and files (including the sitemap) on their original host.
        source:
          "/:path((?!_next(?:/|$)|api(?:/|$)|blast-api(?:/|$)|.*\\.[^/]+$).+)",
        has: [{ type: "host", value: "reclaim\\.blastctrl\\.com" }],
        destination: "https://tools.blastctrl.com/:path",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      // Run before the existing homepage and toolbox sitemap are resolved.
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "reclaim\\.blastctrl\\.com" }],
          destination: "/reclaim-sol",
        },
        {
          source: "/sitemap.xml",
          has: [{ type: "host", value: "reclaim\\.blastctrl\\.com" }],
          destination: "/reclaim-sol/sitemap.xml",
        },
      ],
      afterFiles: [
        {
          source: "/blast-api/:path*",
          destination: `${process.env.BLAST_BACKEND_URL}/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
