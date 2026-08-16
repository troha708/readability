"use client";

import { useEffect, useRef } from "react";

// A small, subtle "party cracker" burst — a handful of confetti pieces that
// pop outward from the center and fall away. Dependency-free (Web Animations
// API), non-interactive, and skipped for users who prefer reduced motion.
const COLORS = ["#f58007", "#fb9b16", "#fcab2f", "#f95d0d", "#fdbb54", "#fb7725"];

export function ConfettiBurst({ count = 16 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const pieces: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      const size = 6 + Math.random() * 4;
      Object.assign(piece.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${size}px`,
        height: `${size * 0.6}px`,
        backgroundColor: COLORS[i % COLORS.length],
        borderRadius: "1px",
        willChange: "transform, opacity",
      } satisfies Partial<CSSStyleDeclaration>);
      host.appendChild(piece);
      pieces.push(piece);

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const distance = 55 + Math.random() * 70;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 18; // slight upward pop, then gravity
      const rot = (Math.random() - 0.5) * 600;
      const duration = 850 + Math.random() * 650;

      const anim = piece.animate(
        [
          { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`,
            opacity: 1,
            offset: 0.7,
          },
          {
            transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 44}px)) rotate(${rot}deg)`,
            opacity: 0,
          },
        ],
        { duration, easing: "cubic-bezier(0.2, 0.65, 0.3, 1)", fill: "forwards" },
      );
      anim.onfinish = () => piece.remove();
    }

    return () => pieces.forEach((p) => p.remove());
  }, [count]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
    />
  );
}
