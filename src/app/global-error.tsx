"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Last-resort boundary for errors thrown in the root layout itself. It replaces
 * the entire document, so it renders its own <html>/<body> and uses inline
 * styles (global CSS may not have loaded). Route errors use error.tsx instead.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportError(error, "global-error");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#a3a3a3", maxWidth: "24rem", margin: 0 }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            cursor: "pointer",
            borderRadius: "0.75rem",
            border: "none",
            background: "#d97706",
            color: "#0a0a0a",
            padding: "0.75rem 1.5rem",
            fontSize: "1rem",
            fontWeight: 700,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
