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
  /** Opening clause of the disclosure — the rest is shared. */
  handled: string;
};

const COPY: Record<"login" | "signup", Copy> = {
  login: {
    heading: "Welcome back",
    subheading: "Enter your email and we'll send you a six-digit code. No password needed.",
    switchPrompt: "Don't have an account?",
    switchLabel: "Sign up",
    switchPath: "/signup",
    handled: "Sign-in is handled by",
  },
  signup: {
    heading: "Create your account",
    subheading:
      "Free forever. Enter your email and we'll send you a six-digit code — no password to remember.",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchPath: "/login",
    handled: "Your account is created and held by",
  },
};

// Shared field and button styling. The form used to sit on the body's Arial
// with a glossy amber-600 button — heavy drop shadow, a hover shadow on top of
// it, and an active scale — which matched nothing else on the site. It's on
// Bitter and the display face now like every other document page, and the button takes
// the same muted gold fill as the library's resume button.
//
// The fill also fixes a real defect: amber-600 (#d3a83c) under white text
// measures 2.2:1, far below the 4.5:1 floor. gold.fill under neutral-950 is
// 10.6:1.
const FIELD =
  "w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 font-scripture text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-gold focus:ring-2 focus:ring-gold/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500";
const SUBMIT =
  "w-full rounded-lg bg-gold-fill px-4 py-3 font-bold text-neutral-950 transition-colors hover:bg-gold-fill-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-gold-fill";
const LABEL =
  "mb-1.5 block font-scripture text-sm font-medium text-neutral-700 dark:text-neutral-300";

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
      <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
        {step === "email" ? copy.heading : "Check your email"}
      </h1>
      <p className="mt-2 font-scripture text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
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
            <label htmlFor="email" className={LABEL}>
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
              className={FIELD}
            />
          </div>
          {message && (
            <p
              role="alert"
              aria-live="polite"
              className={`rounded-lg px-3 py-2 font-scripture text-sm ${
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
            className={SUBMIT}
          >
            {loading ? "Sending code..." : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="mt-8 space-y-4">
          <div>
            <label htmlFor="otp-code" className={LABEL}>
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
              className={`${FIELD} text-center text-xl tracking-[0.4em] placeholder:tracking-[0.4em]`}
            />
          </div>
          {message && (
            <p
              role="alert"
              aria-live="polite"
              className={`rounded-lg px-3 py-2 font-scripture text-sm ${
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
            className={SUBMIT}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <div className="flex items-center justify-between font-scripture text-sm">
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

      <p className="mt-6 text-center font-scripture text-sm text-neutral-600 dark:text-neutral-400">
        {copy.switchPrompt}{" "}
        <Link
          href={switchHref}
          className="font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        >
          {copy.switchLabel}
        </Link>
      </p>

      {/* Named third parties, not "we use trusted partners". Someone handing
          over an email address should be able to see where it goes before
          they type it, not after, and the providers here are the same three
          the privacy policy lists. */}
      <div className="mt-8 border-t border-neutral-200 pt-4 font-scripture text-[13px] leading-relaxed text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <p>
          {copy.handled}{" "}
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-neutral-700 underline underline-offset-2 hover:text-gold dark:text-neutral-300 dark:hover:text-gold-bright"
          >
            Supabase
          </a>
          , a third-party authentication and database service. Your email
          address is stored with them, and the six-digit code is delivered by{" "}
          <a
            href="https://resend.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-neutral-700 underline underline-offset-2 hover:text-gold dark:text-neutral-300 dark:hover:text-gold-bright"
          >
            Resend
          </a>
          .
        </p>
        <p className="mt-2">
          We keep your email address and your reading progress. There is no
          password to store, no advertising, no third-party tracking, and your
          data is never sold. You can ask us to delete the account and
          everything in it at any time.
        </p>
        <p className="mt-2">
          <Link
            href="/privacy"
            className="font-medium underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            Privacy policy
          </Link>
          {" · "}
          <Link
            href="/terms"
            className="font-medium underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
