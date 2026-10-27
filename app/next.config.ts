import type { NextConfig } from "next";

// Wallet SDKs pulled in by RainbowKit/wagmi connectors import optional x402 payment packages that
// we never use. Stub them so the bundler doesn't fail on the unresolved optional peers.
const stub = "./src/lib/empty-module.ts";
const optionalPeers = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
];

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: Object.fromEntries(optionalPeers.map((p) => [p, stub])),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
