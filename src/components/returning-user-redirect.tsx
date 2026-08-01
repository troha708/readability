"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLastReadUrl } from "@/lib/reading-progress";
import { createClient } from "@/lib/supabase/client";

const SESSION_KEY = "bible-session-active";

export function ReturningUserRedirect() {
  const router = useRouter();

  useEffect(() => {
    // If the user has already visited any page this session (tab/window),
    // they're navigating internally — don't redirect. The flag is set by
    // this component AND by the root layout's sessionScript on every
    // non-landing page load, so a session entering on a deep link still
    // counts as "in the app" when the logo brings it to "/".
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Mark session as active so future in-app navigations to "/" won't redirect.
    sessionStorage.setItem(SESSION_KEY, "true");

    // Returning reader with local progress → jump straight to their chapter.
    const lastUrl = getLastReadUrl();
    if (lastUrl) {
      router.replace(lastUrl);
      return;
    }

    // No local history, but if they're still signed in (remembered from a
    // previous visit), take them into the app instead of the marketing page.
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session) router.replace("/try/bible/start");
      } catch {
        // not signed in / offline — stay on the landing page
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
