import type { MetadataRoute } from "next";

// Web app manifest (/manifest.webmanifest): lets phones install the app to the home screen, which
// iOS (16.4+) requires before it delivers Web Push. Public in src/proxy.ts, like the icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Subscriptions",
    short_name: "Subscriptions",
    description: "Self-hosted subscription tracker",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#f9f9f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
