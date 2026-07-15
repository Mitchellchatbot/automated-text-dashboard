"use client";

import { useEffect } from "react";

/** Compile a spring → CSS linear() easing (Motion-style) for --spring vars. */
function springLinear(zeta: number, durSec: number): string {
  const w0 = -Math.log(0.008) / (zeta * durSec);
  const wd = w0 * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const n = 34;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (durSec * i) / n;
    const env = Math.exp(-zeta * w0 * t);
    const x =
      zeta < 1
        ? 1 - env * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
        : 1 - env * (1 + w0 * t);
    pts.push(`${(i === n ? 1 : x).toFixed(4)} ${((100 * i) / n).toFixed(1)}%`);
  }
  return `linear(${pts.join(",")})`;
}

/** Upgrades --spring / --spring-soft to real spring easings once, on the client. */
export function MotionInit() {
  useEffect(() => {
    try {
      if (
        window.CSS &&
        CSS.supports &&
        CSS.supports("transition-timing-function", "linear(0, 1)")
      ) {
        const root = document.documentElement;
        root.style.setProperty("--spring", springLinear(0.72, 0.34));
        root.style.setProperty("--spring-soft", springLinear(1.0, 0.26));
      }
    } catch {
      /* no-op */
    }
  }, []);
  return null;
}
