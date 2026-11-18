import type { MetadataRoute } from "next";

// Makes the app installable on phones and desktops. It opens straight into the workspace.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Products OS",
    short_name: "Products OS",
    description: "Strategy, ideas, roadmap and AI agents for product teams.",
    id: "/app",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fbfaf8",
    theme_color: "#fbfaf8",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Submit an idea", url: "/app/ideas/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Command Centre", url: "/app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ask Copilot", url: "/app/copilot", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
