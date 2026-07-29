"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Catches what the error boundaries can't: exceptions in event handlers and
 * timers, and unhandled promise rejections. Mounted once in the root layout.
 */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Cross-origin scripts and extensions surface as an opaque
      // "Script error." with no stack — noise, not signal.
      if (!event.message || event.message === "Script error.") return;
      reportError(event.error ?? new Error(event.message), "window");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason, "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
