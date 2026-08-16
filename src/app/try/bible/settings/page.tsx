import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { NotificationSettings } from "@/components/notification-settings";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Readability reading reminders and preferences.",
};

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-paper dark:bg-neutral-925">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <Link
            href="/try/bible/start"
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            ← Back
          </Link>
        </div>

        <h1 className="mb-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">
          Settings
        </h1>

        <NotificationSettings />
      </div>
    </main>
  );
}
