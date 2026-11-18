"use client";

import { useEffect } from "react";

// Registers the service worker that makes Products OS installable and gives it an offline page.
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
