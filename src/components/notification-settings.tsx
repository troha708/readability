"use client";

import { useEffect, useState } from "react";
import {
  getReminderPrefs,
  enableReminder,
  disableReminder,
  formatTime,
  isNativeApp,
} from "@/lib/notifications";

export function NotificationSettings() {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  // Reminders are native-app only. Detected on the client after mount so SSR
  // markup stays stable; until then we render nothing.
  const [mounted, setMounted] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNative(isNativeApp());
    const p = getReminderPrefs();
    setEnabled(p.enabled);
    setHour(p.hour);
    setMinute(p.minute);
  }, []);

  const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  async function handleToggle() {
    if (busy) return;
    setBusy(true);
    setDenied(false);
    try {
      if (enabled) {
        await disableReminder();
        setEnabled(false);
      } else {
        const r = await enableReminder(hour, minute);
        if (r.ok) {
          setEnabled(true);
        } else {
          setEnabled(false);
          if (r.reason === "denied") setDenied(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTimeChange(value: string) {
    const [h, m] = value.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    setHour(h);
    setMinute(m);
    if (enabled) {
      setBusy(true);
      try {
        await enableReminder(h, m);
      } finally {
        setBusy(false);
      }
    }
  }

  if (!mounted) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-paper p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            Daily reading reminder
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Get a gentle nudge to read each day.
          </p>
        </div>

        {/* Toggle switch (native app only) */}
        {native && (
          <button
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle daily reminder"
            disabled={busy}
            onClick={handleToggle}
            className={`relative mt-1 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-amber-600" : "bg-neutral-300 dark:bg-neutral-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        )}
      </div>

      {!native ? (
        <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-400">
          Daily reminders are available in the Readability mobile app.
        </p>
      ) : (
        <>
          {/* Time picker */}
          <div className="mt-4 flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3 dark:bg-neutral-900/50">
            <label htmlFor="reminder-time" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Remind me at
            </label>
            <input
              id="reminder-time"
              type="time"
              value={timeValue}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="rounded-md border border-neutral-300 bg-paper px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {enabled && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              ✓ Reminder set for {formatTime(hour, minute)} every day.
            </p>
          )}

          {denied && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <p className="font-semibold">Notifications are blocked</p>
              <p className="mt-1">
                Allow notifications for Readability in your device settings, then
                turn the reminder on again.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
