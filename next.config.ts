import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Every page in this application is behind sign-in and renders per-member data, so
   * there is nothing to prerender. Cache Components would only require marking each
   * route dynamic by hand. Re-enable it if a public page is ever added.
   */
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
