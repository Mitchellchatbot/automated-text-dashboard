"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll-reveal: observes every `[data-reveal]` descendant and fades/rises it in
 * once as it enters the viewport (staggered by `data-reveal-delay` ms). Markers
 * that are `.due` also pulse. Degrades to instant-visible without IntersectionObserver
 * or under prefers-reduced-motion.
 */
export function RevealScope({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof window.IntersectionObserver !== "function") {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    els.forEach((e) => e.classList.add("reveal"));
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const e = en.target as HTMLElement;
          const d = parseInt(e.getAttribute("data-reveal-delay") || "0", 10);
          timers.push(
            window.setTimeout(() => {
              e.classList.add("in");
              if (e.classList.contains("marker") && e.classList.contains("due"))
                e.classList.add("pulse");
            }, d),
          );
          io.unobserve(e);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );
    els.forEach((e) => io.observe(e));
    return () => {
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
