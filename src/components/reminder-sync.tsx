"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  syncReminderOnLaunch,
  initReminderTapHandler,
  applyPendingDeepLink,
} from "@/lib/notifications";

/**
 * On app launch: registers the notification tap handler, applies any pending
 * reminder deep-link (re-asserting it if the cold-start load landed elsewhere
 * first), and re-arms the daily reminder. No UI; no-op on web.
 */
export function ReminderSync() {
  const router = useRouter();
  useEffect(() => {
    const navigate = (url: string) => router.push(url);
    void initReminderTapHandler(navigate);
    applyPendingDeepLink(navigate);
    void syncReminderOnLaunch();
  }, [router]);
  return null;
}
