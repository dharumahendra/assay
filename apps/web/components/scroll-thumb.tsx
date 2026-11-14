"use client";

import { useEffect, useRef, useState } from "react";

const THUMB = 62; // px, a fixed-length pill like sohub.digital's, not proportional to the page
const PAD = 8; // px kept clear at the top and bottom of the viewport

/**
 * Custom page scrollbar: the native one is hidden in globals.css and this draggable pill stands in for it.
 * White with mix-blend-difference, so it reads dark on paper and light over the navy bands and footer.
 * Wheel, keyboard and touch scrolling are untouched; the pill only mirrors and drags window scroll.
 */
export function ScrollThumb() {
  const thumb = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = thumb.current;
    if (!el) return undefined;
    let raf = 0;
    let idle = 0;
    let drag: { y: number; top: number } | null = null;

    const metrics = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const travel = window.innerHeight - THUMB - PAD * 2;
      return { max, travel };
    };
    const place = () => {
      raf = 0;
      const { max, travel } = metrics();
      setScrollable(max > 4);
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `translate3d(0, ${PAD + p * travel}px, 0)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    const onScroll = () => {
      schedule();
      setActive(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => !drag && setActive(false), 900);
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, top: window.scrollY };
      setActive(true);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const { max, travel } = metrics();
      window.scrollTo({ top: drag.top + ((e.clientY - drag.y) * max) / Math.max(1, travel), behavior: "instant" });
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      idle = window.setTimeout(() => setActive(false), 900);
    };

    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    place();

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
      resize.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-y-0 right-1.5 z-[60] w-2 mix-blend-difference ${scrollable ? "" : "hidden"}`}>
      <div
        ref={thumb}
        style={{ height: THUMB }}
        className={`pointer-events-auto absolute right-0 top-0 w-2 cursor-grab touch-none select-none rounded-full bg-white transition-opacity duration-300 will-change-transform active:cursor-grabbing hover:opacity-100 ${
          active ? "opacity-100" : "opacity-60"
        }`}
      />
    </div>
  );
}
