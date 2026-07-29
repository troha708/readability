import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { EmailAuthForm } from "@/components/email-auth-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <Suspense>
          <EmailAuthForm mode="signup" />
        </Suspense>
      </div>
    </main>
  );
}
