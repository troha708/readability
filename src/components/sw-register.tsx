"use client";

import { useEffect } from "react";

// Registers the service worker (production only — registering in dev interferes
// with Next's hot reload and can serve stale assets). Renders nothing.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development, make sure no previously-registered service worker (from a
    // production visit on the same origin, or an on-demand push registration)
    // intercepts requests — it serves stale/cached assets and breaks HMR,
    // showing unstyled "raw HTML".
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Force an update check so a stale worker (e.g. an early PWA SW with
          // no push handler) is replaced by the current one on every visit.
          reg.update().catch(() => {});
        })
        .catch(() => {
          // registration failures shouldn't break the app
        });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
