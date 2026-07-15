"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** NY wall-clock date + seconds elapsed into that day. */
function nyNow(): { date: string; secondsIntoDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = Number(g("hour"));
  if (hour === 24) hour = 0; // some ICU builds report midnight as 24
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    secondsIntoDay: hour * 3600 + Number(g("minute")) * 60 + Number(g("second")),
  };
}

/** Re-render when the tab regains focus, so "today" is always current. */
export function FocusRefresher() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}

/**
 * Re-render an idle open tab when the NY calendar day rolls over. Recomputes the
 * remaining time on each tick (DST-robust) and only refreshes when the date
 * actually changed.
 */
export function MidnightRefresher() {
  const router = useRouter();
  const lastDate = useRef<string | null>(null);

  useEffect(() => {
    lastDate.current = nyNow().date;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const { date, secondsIntoDay } = nyNow();
      if (lastDate.current && date !== lastDate.current) {
        lastDate.current = date;
        router.refresh();
      }
      const secondsLeft = Math.max(30, 24 * 3600 - secondsIntoDay + 2);
      timer = setTimeout(tick, secondsLeft * 1000);
    };

    const { secondsIntoDay } = nyNow();
    timer = setTimeout(tick, Math.max(30, 24 * 3600 - secondsIntoDay + 2) * 1000);
    return () => clearTimeout(timer);
  }, [router]);

  return null;
}

/** Convenience: mount both refreshers. */
export function AutoRefresh() {
  return (
    <>
      <FocusRefresher />
      <MidnightRefresher />
    </>
  );
}
