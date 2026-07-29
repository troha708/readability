"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const RESEND_COOLDOWN_SECONDS = 60;

type Copy = {
  heading: string;
  subheading: string;
  switchPrompt: string;
  switchLabel: string;
  switchPath: "/login" | "/signup";
};

const COPY: Record<"login" | "signup", Copy> = {
  login: {
    heading: "Welcome back",
    subheading: "Enter your email and we'll send you a six-digit code. No password needed.",
    switchPrompt: "Don't have an account?",
    switchLabel: "Sign up",
    switchPath: "/signup",
  },
  signup: {
    heading: "Create your account",
    subheading:
      "Free forever. Enter your email and we'll send you a six-digit code — no password to remember.",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchPath: "/login",
  },
};

export function EmailAuthForm({ mode }: { mode: "login" | "signup" }) {
  const copy = COPY[mode];
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "auth") {
      setMessage({ type: "error", text: "That sign-in link didn't work. Enter your email to get a fresh code." });
    }
  }, [searchParams]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const next = searchParams.get("next");

  const sendCode = async () => {
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;
    return supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: callback },
    });
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await sendCode();
    setLoading(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setStep("code");
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setMessage(null);

    const { error } = await sendCode();
    setLoading(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setMessage({ type: "success", text: "New code sent." });
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });

    if (error) {
      const friendly = /expired|invalid/i.test(error.message)
        ? "That code didn't match. Check the digits or request a new one."
        : error.message;
      setMessage({ type: "error", text: friendly });
      setLoading(false);
      return;
    }

    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/try/bible/start");
    router.refresh();
  };

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const switchHref = next
    ? `${copy.switchPath}?next=${encodeURIComponent(next)}`
    : copy.switchPath;

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
        {step === "email" ? copy.heading : "Check your email"}
      </h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {step === "email" ? (
          copy.subheading
        ) : (
          <>
            We sent a six-digit code to <span className="font-medium text-neutral-700 dark:text-neutral-300">{email}</span>.
          </>
        )}
      </p>

      {step === "email" ? (
        <form onSubmit={handleSendCode} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500"
            />
          </div>
          {message && (
            <p
              role="alert"
              aria-live="polite"
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === "error"
                  ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              }`}
            >
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-600 px-4 py-3 font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-700 hover:shadow-xl hover:shadow-amber-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-amber-600"
          >
            {loading ? "Sending code..." : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="mt-8 space-y-4">
          <div>
            <label htmlFor="otp-code" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Six-digit code
            </label>
            <input
              id="otp-code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              placeholder="123456"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-center text-xl tracking-[0.4em] text-neutral-900 outline-none transition-colors placeholder:tracking-[0.4em] placeholder:text-neutral-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-600"
            />
          </div>
          {message && (
            <p
              role="alert"
              aria-live="polite"
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === "error"
                  ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              }`}
            >
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full rounded-xl bg-amber-600 px-4 py-3 font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-700 hover:shadow-xl hover:shadow-amber-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-amber-600"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setMessage(null);
              }}
              className="font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              className="font-medium text-amber-600 hover:text-amber-700 disabled:cursor-not-allowed disabled:text-neutral-400 dark:text-amber-400 dark:hover:text-amber-300 dark:disabled:text-neutral-600"
            >
              {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        {copy.switchPrompt}{" "}
        <Link
          href={switchHref}
          className="font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        >
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}
