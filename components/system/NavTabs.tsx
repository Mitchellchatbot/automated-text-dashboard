"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS = [
  { href: "/", label: "Due today" },
  { href: "/alumni", label: "All alumni" },
  { href: "/settings", label: "Template" },
];

export function NavTabs() {
  const pathname = usePathname();
  const activeHref = pathname.startsWith("/alumni")
    ? "/alumni"
    : pathname.startsWith("/settings")
      ? "/settings"
      : "/";
  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const nav = navRef.current,
      ind = indRef.current;
    if (!nav || !ind) return;
    const btn = nav.querySelector<HTMLElement>(`[data-href="${activeHref}"]`);
    if (!btn || !btn.offsetWidth) {
      ind.style.opacity = "0";
      return;
    }
    ind.style.opacity = "1";
    ind.style.width = `${btn.offsetWidth}px`;
    ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  }, [activeHref]);

  return (
    <nav className="nav" aria-label="Primary" ref={navRef}>
      <span className="nav-ind" aria-hidden="true" ref={indRef} />
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          data-href={l.href}
          className="navbtn"
          aria-current={l.href === activeHref ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
