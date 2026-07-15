"use client";

import { useEffect, useRef, useState } from "react";

/** Animated count-up (ease-out). Renders the final value under reduced motion. */
export function Counter({ to, className }: { to: number; className?: string }) {
  const [val, setVal] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof window.requestAnimationFrame !== "function" || done.current) {
      setVal(to);
      done.current = true;
      return;
    }
    done.current = true;
    const dur = 640;
    let start: number | null = null;
    let raf = 0;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);

  return <span className={className}>{val}</span>;
}
