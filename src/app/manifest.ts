import type { MetadataRoute } from "next";

/**
 * What a phone needs to install SAIP as an app. Served by Next at
 * /manifest.webmanifest with the right content type.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SAIP Board",
    short_name: "SAIP",
    description:
      "The executive board workspace for the Society for African Internationals at Princeton.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f7f3",
    theme_color: "#172e25",
    categories: ["productivity", "business"],
    lang: "en-GB",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Messages", url: "/messages" },
      { name: "My tasks", url: "/tasks" },
      { name: "Events", url: "/events" },
    ],
  };
}
