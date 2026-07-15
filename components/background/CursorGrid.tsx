"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor-reactive grid background (canvas). Grid cells near the cursor light up
 * and fade out. Fixed + full-viewport + pointer-events:none, so clicks pass
 * through to the page (record cards still open the detail modal). Reads its line
 * color from the themed `--accent` CSS variable and recolors on theme change.
 * No-op under prefers-reduced-motion; pauses while the tab is hidden; sleeps when
 * idle. Adapted from the React Bits CursorGrid, mirroring DotField's lifecycle.
 */

type Falloff = "linear" | "smooth" | "sharp";

const CFG = {
  cellSize: 46,
  radius: 130,
  falloff: "smooth" as Falloff,
  holdTime: 200,
  fadeDuration: 700,
  lineWidth: 1,
  maxOpacity: 0.55,
  fillOpacity: 0,
  gridOpacity: 0, // no always-on lattice — pure cursor reveal
  cellRadius: 0,
  clickPulse: false, // off: don't fire a ring every time staff click a record
  pulseSpeed: 600,
};

const FALLOFF_CURVES: Record<Falloff, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  sharp: (t) => t * t * t,
};

const FALLBACK_COLOR = "#5b5bd6";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const num = parseInt(v, 16);
  if (Number.isNaN(num)) return [91, 91, 214];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function CursorGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef<string>(FALLBACK_COLOR);

  useEffect(() => {
    const canvas = canvasRef.current;
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

    // Grid state: one alpha + last-touched timestamp per cell, row-major.
    let cols = 0, rows = 0, offX = 0, offY = 0;
    let alphas = new Float32Array(0);
    let touched = new Float64Array(0);
    let w = 0, h = 0;
    const pulses: { x: number; y: number; t0: number }[] = [];
    let raf = 0;
    let running = false;
    let lastFrame = 0;
    let resizeTimer = 0;

    const refreshColor = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      colorRef.current = v || FALLBACK_COLOR;
    };

    const rebuild = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CFG.cellSize) + 1;
      rows = Math.ceil(h / CFG.cellSize) + 1;
      offX = (w - cols * CFG.cellSize) / 2;
      offY = (h - rows * CFG.cellSize) / 2;
      alphas = new Float32Array(cols * rows);
      touched = new Float64Array(cols * rows);
    };

    const cellCenter = (i: number): [number, number] => {
      const cx = offX + (i % cols) * CFG.cellSize + CFG.cellSize / 2;
      const cy = offY + Math.floor(i / cols) * CFG.cellSize + CFG.cellSize / 2;
      return [cx, cy];
    };

    // Light up every cell whose center falls inside the radius, with the falloff
    // curve mapping distance-from-cursor to brightness.
    const energize = (x: number, y: number, boost = 1) => {
      const r = Math.max(CFG.radius, 1);
      const ease = FALLOFF_CURVES[CFG.falloff] ?? FALLOFF_CURVES.linear;
      const now = performance.now();
      const minCol = Math.max(0, Math.floor((x - r - offX) / CFG.cellSize));
      const maxCol = Math.min(cols - 1, Math.floor((x + r - offX) / CFG.cellSize));
      const minRow = Math.max(0, Math.floor((y - r - offY) / CFG.cellSize));
      const maxRow = Math.min(rows - 1, Math.floor((y + r - offY) / CFG.cellSize));
      for (let cRow = minRow; cRow <= maxRow; cRow++) {
        for (let cCol = minCol; cCol <= maxCol; cCol++) {
          const i = cRow * cols + cCol;
          const [cx, cy] = cellCenter(i);
          const dist = Math.hypot(cx - x, cy - y);
          if (dist > r) continue;
          const level = ease(1 - dist / r) * CFG.maxOpacity * boost;
          if (level > alphas[i]) {
            alphas[i] = level;
            touched[i] = now;
          } else if (level > 0) {
            touched[i] = now;
          }
        }
      }
    };

    const draw = (now: number) => {
      const dt = Math.min(now - lastFrame, 50);
      lastFrame = now;
      c.clearRect(0, 0, w, h);
      const [cr, cg, cb] = hexToRgb(colorRef.current);

      if (CFG.gridOpacity > 0) {
        c.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${CFG.gridOpacity})`;
        c.lineWidth = 1;
        c.beginPath();
        for (let cCol = 0; cCol <= cols; cCol++) {
          const x = Math.round(offX + cCol * CFG.cellSize) + 0.5;
          c.moveTo(x, 0);
          c.lineTo(x, h);
        }
        for (let cRow = 0; cRow <= rows; cRow++) {
          const y = Math.round(offY + cRow * CFG.cellSize) + 0.5;
          c.moveTo(0, y);
          c.lineTo(w, y);
        }
        c.stroke();
      }

      // Expanding click pulses hand energy to cells as the ring passes.
      for (let pi = pulses.length - 1; pi >= 0; pi--) {
        const pulse = pulses[pi];
        const age = (now - pulse.t0) / 1000;
        const ringR = age * CFG.pulseSpeed;
        if (ringR > Math.hypot(w, h)) {
          pulses.splice(pi, 1);
          continue;
        }
        const band = CFG.cellSize;
        const minCol = Math.max(0, Math.floor((pulse.x - ringR - band - offX) / CFG.cellSize));
        const maxCol = Math.min(cols - 1, Math.floor((pulse.x + ringR + band - offX) / CFG.cellSize));
        const minRow = Math.max(0, Math.floor((pulse.y - ringR - band - offY) / CFG.cellSize));
        const maxRow = Math.min(rows - 1, Math.floor((pulse.y + ringR + band - offY) / CFG.cellSize));
        for (let cRow = minRow; cRow <= maxRow; cRow++) {
          for (let cCol = minCol; cCol <= maxCol; cCol++) {
            const i = cRow * cols + cCol;
            const [cx, cy] = cellCenter(i);
            const dist = Math.hypot(cx - pulse.x, cy - pulse.y);
            if (Math.abs(dist - ringR) < band / 2 && CFG.maxOpacity > alphas[i]) {
              alphas[i] = CFG.maxOpacity;
              touched[i] = now;
            }
          }
        }
      }

      let anyVisible = pulses.length > 0;
      const fadeStep = dt / Math.max(CFG.fadeDuration, 16);
      const half = CFG.cellSize / 2;

      for (let i = 0; i < alphas.length; i++) {
        let a = alphas[i];
        if (a <= 0) continue;
        if (now - touched[i] > CFG.holdTime) {
          a = Math.max(0, a - fadeStep);
          alphas[i] = a;
          if (a <= 0) continue;
        }
        anyVisible = true;

        const [cx, cy] = cellCenter(i);
        const gradient = c.createRadialGradient(cx, cy, half * 0.1, cx, cy, CFG.cellSize);
        gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
        gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

        const x = cx - half + 0.5;
        const y = cy - half + 0.5;
        const s = CFG.cellSize - 1;

        c.beginPath();
        if (CFG.cellRadius > 0) {
          c.roundRect(x, y, s, s, CFG.cellRadius);
        } else {
          c.rect(x, y, s, s);
        }
        if (CFG.fillOpacity > 0) {
          c.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${a * CFG.fillOpacity})`;
          c.fill();
        }
        c.strokeStyle = gradient;
        c.lineWidth = CFG.lineWidth;
        c.stroke();
      }

      if (anyVisible) {
        raf = requestAnimationFrame(draw);
      } else {
        running = false;
        c.clearRect(0, 0, w, h);
      }
    };

    const wake = () => {
      if (running || document.hidden) return;
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(draw);
    };

    const toLocal = (e: { clientX: number; clientY: number }): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const onMove = (e: MouseEvent) => {
      const [x, y] = toLocal(e);
      energize(x, y);
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (!CFG.clickPulse) return;
      const [x, y] = toLocal(e);
      pulses.push({ x, y, t0: performance.now() });
      wake();
    };
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        rebuild();
        wake();
      }, 120);
    };
    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const themeObs = new MutationObserver(refreshColor);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refreshColor);

    refreshColor();
    rebuild();
    window.addEventListener("mousemove", onMove, { passive: true });
    if (CFG.clickPulse) window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    wake();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      themeObs.disconnect();
      mq.removeEventListener("change", refreshColor);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={canvasRef} id="cursorgrid" aria-hidden="true" />;
}
