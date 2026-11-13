/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? "http://localhost:8787";

const config = {
  // @juri/shared ships TypeScript source with ESM ".js" import specifiers.
  transpilePackages: ["@juri/shared"],
  // Criteria compile calls a reasoning model (30–90 s); the /api rewrite proxy would hang up at 30 s.
  experimental: { proxyTimeout: 150_000 },
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
  // Browser code calls /api/* on the same origin; Next forwards it to the Juri API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
