"use client";

import { useEffect, useRef } from "react";

/**
 * Barely-there interactive dot field, used only as a background. Accent-tinted dots
 * (from --dot-a/--dot-b), a whisper at rest that wakes gently on cursor movement.
 * No-op without canvas 2D or under prefers-reduced-motion; pauses when the tab is hidden.
 */
export function DotField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) return;
    const c = ctx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0,
      H = 0,
      dots: { ax: number; ay: number; sx: number; sy: number }[] = [],
      eng = 0,
      running = true,
      rafId = 0,
      resizeTimer = 0;
    const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, speed: 0 };
    const P = { dotRadius: 1.3, dotSpacing: 26, cursorRadius: 240, bulgeStrength: 16 };
    let colA = "rgba(91,91,214,0.11)",
      colB = "rgba(91,91,214,0.05)";

    const refreshColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colA = (cs.getPropertyValue("--dot-a") || colA).trim();
      colB = (cs.getPropertyValue("--dot-b") || colB).trim();
    };
    const build = () => {
      const step = P.dotRadius + P.dotSpacing;
      const cols = Math.floor(W / step),
        rows = Math.floor(H / step);
      const padX = (W % step) / 2,
        padY = (H % step) / 2;
      dots = [];
      for (let r = 0; r < rows; r++)
        for (let col = 0; col < cols; col++) {
          const ax = padX + col * step + step / 2,
            ay = padY + r * step + step / 2;
          dots.push({ ax, ay, sx: ax, sy: ay });
        }
    };
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };
    const tick = () => {
      if (!running) return;
      const target = Math.min(mouse.speed / 6, 1);
      eng += (target - eng) * 0.05;
      if (eng < 0.001) eng = 0;
      canvas.style.opacity = (0.4 + 0.6 * eng).toFixed(3);
      c.clearRect(0, 0, W, H);
      const grad = c.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, colA);
      grad.addColorStop(1, colB);
      c.fillStyle = grad;
      const cr = P.cursorRadius,
        crSq = cr * cr,
        rad = P.dotRadius / 2;
      c.beginPath();
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i],
          dx = mouse.x - d.ax,
          dy = mouse.y - d.ay,
          distSq = dx * dx + dy * dy;
        if (distSq < crSq && eng > 0.01) {
          const dist = Math.sqrt(distSq),
            tt = 1 - dist / cr,
            push = tt * tt * P.bulgeStrength * eng,
            ang = Math.atan2(dy, dx);
          d.sx += (d.ax - Math.cos(ang) * push - d.sx) * 0.12;
          d.sy += (d.ay - Math.sin(ang) * push - d.sy) * 0.12;
        } else {
          d.sx += (d.ax - d.sx) * 0.08;
          d.sy += (d.ay - d.sy) * 0.08;
        }
        c.moveTo(d.sx + rad, d.sy);
        c.arc(d.sx, d.sy, rad, 0, Math.PI * 2);
      }
      c.fill();
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 120);
    };
    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const speedTimer = window.setInterval(() => {
      const dx = mouse.px - mouse.x,
        dy = mouse.py - mouse.y;
      mouse.speed += (Math.sqrt(dx * dx + dy * dy) - mouse.speed) * 0.5;
      if (mouse.speed < 0.001) mouse.speed = 0;
      mouse.px = mouse.x;
      mouse.py = mouse.y;
    }, 20);
    const themeObs = new MutationObserver(refreshColors);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    refreshColors();
    resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(speedTimer);
      clearTimeout(resizeTimer);
      themeObs.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} id="dotfield" aria-hidden="true" />;
}
