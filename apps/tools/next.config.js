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
  transpilePackages: ["@blastctrl/ui", "@blastctrl/octane-core"],
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
};

export default nextConfig;
