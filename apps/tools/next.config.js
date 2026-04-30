import { fileURLToPath } from "node:url";
import createJiti from "jiti";
const jiti = createJiti(fileURLToPath(import.meta.url));
import webpack from "webpack";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";

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
  transpilePackages: ["@blastctrl/ui", "@blastctrl/octane-core"],
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "arweave.net",
        port: "",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/blast-api/:path*",
        destination: `${process.env.BLAST_BACKEND_URL}/:path*`,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new NodePolyfillPlugin({
          additionalAliases: ["process"],
        }),
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      // Things NodePolyfillPlugin doesn't cover that arbundles needs:
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        "fs/promises": false,
        "stream/promises": false,
        "tmp-promise": false,
        multistream: false,
      };
    }
    return config;
  },
};

export default nextConfig;
