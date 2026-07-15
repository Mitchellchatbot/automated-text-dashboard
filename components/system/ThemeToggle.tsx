"use client";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

export function ThemeToggle() {
  function toggle(ev: React.MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDark =
      root.getAttribute("data-theme") === "dark" ||
      (!root.getAttribute("data-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;

    const icon = ev.currentTarget.querySelector("svg");
    if (icon && typeof icon.animate === "function" && !reduce) {
      icon.animate(
        [{ transform: "rotate(-35deg) scale(.7)", opacity: 0.4 }, { transform: "none", opacity: 1 }],
        { duration: 260, easing: "cubic-bezier(0.22,1,0.36,1)" },
      );
    }

    const apply = () => root.setAttribute("data-theme", next);
    const doc = document as VTDocument;
    if (!doc.startViewTransition || reduce) {
      apply();
      return;
    }
    const x = ev.clientX || 0,
      y = ev.clientY || 0,
      end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = doc.startViewTransition(apply);
    vt.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${end}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 300,
            easing: "cubic-bezier(0.33,1,0.68,1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
  }

  return (
    <button className="iconbtn" type="button" onClick={toggle} aria-label="Toggle light or dark theme">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 11.2A6 6 0 1 1 8.8 4a4.7 4.7 0 0 0 7.2 7.2z" />
      </svg>
    </button>
  );
}
