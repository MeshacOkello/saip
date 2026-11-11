import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Every page in this application is behind sign-in and renders per-member data, so
   * there is nothing to prerender. Cache Components would only require marking each
   * route dynamic by hand. Re-enable it if a public page is ever added.
   */
  cacheComponents: false,

  experimental: {
    /*
     * Server Actions reject request bodies over 1 MB by default, and the
     * rejection happens in the framework before any of our code runs — so a
     * 1.5 MB photo returned a bare 413 and took the page down with it, while the
     * 2 MB check in the profile service never got a chance to speak.
     *
     * 3 MB leaves room for a 2 MB photo plus multipart overhead. The real limit
     * a person meets is still the 2 MB one, which is checked in the browser
     * before anything is uploaded and again on the server.
     */
    serverActions: { bodySizeLimit: "3mb" },
  },

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
