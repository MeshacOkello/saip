import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Every page in this application is behind sign-in and renders per-member data, so
   * there is nothing to prerender. Cache Components would only require marking each
   * route dynamic by hand. Re-enable it if a public page is ever added.
   */
  cacheComponents: false,

  /**
   * pdfkit reads its font metrics (.afm files) from disk at runtime, by a path it
   * builds itself. Next's tracing follows imports, not runtime paths, so those files
   * are left out of the function bundle and the handover PDF route fails in
   * production while working perfectly on a laptop. Name them explicitly.
   */
  outputFileTracingIncludes: {
    "/api/handover/[positionId]": ["./node_modules/pdfkit/js/data/**"],
  },

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
