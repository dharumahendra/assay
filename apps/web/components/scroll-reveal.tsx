"use client";

import { useEffect } from "react";

/**
 * Scroll motion for every page, without touching the pages themselves.
 *
 * Elements in <main> and the footer are sorted into kinds, and each kind gets its own family of moves:
 *   text   headings wipe in or slide in from the left / right, paragraphs alternate left, right and a soft blur,
 *          eyebrows unpack their letter-spacing, the hand-written labels tip in;
 *   cards  rise from below (straight up, tilted back, scaled up or with a slight swing), small tiles pop;
 *   media  images, canvases and large drawings zoom out of a frame or open like a curtain;
 *   rows   table rows and list items slide in one after another.
 * They animate out again when they leave the viewport, towards the edge they leave by, and back in when they return.
 *
 * State lives in data attributes (data-rv, data-rv-s), never in className, so React re-renders cannot drop it.
 * The moves are CSS keyframes in globals.css that only describe the hidden state, so an element always settles on
 * its own styles. Nothing runs with prefers-reduced-motion.
 *
 * data-rv-s: "hide" waiting for its first entrance · "in" animating in / shown · "out" animated out ·
 *            "rest" was already on screen when the page first loaded (never hidden, so nothing flashes).
 */

type Kind = "text" | "card" | "media" | "row";

const TEXT = "h1,h2,h3,h4,h5,p,blockquote,dt,dd,figcaption";
const CARD = "section,article,aside,header,figure,div,a,form";
const MEDIA = "img,video,canvas,svg";
const ROW = "tbody > tr,li";
// never inside these: fixed / sticky layers, dialogs, decoration, explicit opt-outs
const SKIP = '[class*="fixed"],[class*="sticky"],[role="dialog"],[aria-modal="true"],[aria-hidden="true"],[data-rv-skip],nav';

const CARD_MOVES = ["up", "tilt", "scale", "swing"];
const PARA_MOVES = ["left", "right", "blur"];
const MEDIA_MOVES = ["zoom", "curtain"];

const pick = (list: string[], i: number) => list[i % list.length] ?? list[0] ?? "up";
const opaque =(c: string) => c !== "transparent" && !/rgba?\([^)]*,\s*0\)$/.test(c);

export function ScrollReveal() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const seen = new WeakSet<Element>();
    const n = { card: 0, para: 0, head: 0, media: 0, list: 0 };
    const listSide = new WeakMap<Element, string>();
    let first = true;

    const io = new IntersectionObserver(
      (batch) => {
        const vh = window.innerHeight;
        // one batch can hold several entries for the same element (in, then out, or the reverse): keep the latest
        const latest = new Map<Element, IntersectionObserverEntry>();
        for (const e of batch) latest.set(e.target, e);
        const entries = [...latest.values()];
        const coming = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        let i = 0;
        for (const e of coming) {
          const el = e.target as HTMLElement;
          const s = el.dataset.rvS;
          if (s === "in" || s === "rest") continue;
          // through the top edge when scrolling back up, through the bottom otherwise
          const fromTop = s === "out" ? e.boundingClientRect.top < vh / 2 : e.boundingClientRect.top < 0;
          el.style.setProperty("--rv-d", fromTop ? "-1" : "1");
          el.style.setProperty("--rv-delay", `${Math.min(i++, 8) * 70}ms`);
          el.dataset.rvS = "in";
        }
        for (const e of entries) {
          if (e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          if (el.dataset.rvS !== "in" && el.dataset.rvS !== "rest") continue;
          el.style.setProperty("--rv-d", e.boundingClientRect.bottom < vh / 2 ? "-1" : "1");
          el.style.setProperty("--rv-delay", "0ms");
          el.dataset.rvS = "out";
        }
      },
      { rootMargin: "-5% 0px -5% 0px", threshold: 0 },
    );

    const tag = (el: HTMLElement, kind: Kind, move: string, r: DOMRect) => {
      seen.add(el);
      el.dataset.rv = move;
      el.dataset.rvK = kind;
      // what the server already painted on the first load stays put; everything else waits for its entrance
      // (the same band the observer watches, so nothing at the very edge animates out on load)
      const vh = window.innerHeight;
      el.dataset.rvS = first && r.bottom > vh * 0.05 && r.top < vh * 0.95 ? "rest" : "hide";
      io.observe(el);
    };

    const usable = (el: HTMLElement) => {
      if (seen.has(el) || el.closest(SKIP)) return null;
      if (el.closest("[data-rv-k='row'],[data-rv='pop']") || el.parentElement?.closest("[data-rv-k='text']")) return null;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.display === "contents" || cs.visibility === "hidden") return null;
      if (cs.transform !== "none" || cs.animationName !== "none" || cs.position === "fixed" || cs.position === "sticky") return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return { cs, r };
    };

    const scan = (root: HTMLElement) => {
      const all = <T extends HTMLElement>(sel: string) => {
        const list = [...root.querySelectorAll<T>(sel)];
        if (root.matches(sel)) list.unshift(root as T);
        return list;
      };
      // 1. cards and tiles: a surface (fill, shadow or border) with rounded corners
      for (const el of all(CARD)) {
        if (el.matches("main,footer,#main")) continue;
        const u = usable(el);
        if (!u) continue;
        const { cs, r } = u;
        if (r.width > window.innerWidth * 0.98) continue;
        const radius = parseFloat(cs.borderTopLeftRadius) || 0;
        const surface = opaque(cs.backgroundColor) || cs.boxShadow !== "none" || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none");
        if (!surface || radius < 10 || r.width < 120 || r.height < 56) continue;
        if (radius >= r.height / 2 - 1 && r.height < 64) continue; // pills and pill buttons stay still
        const small = r.width < 360 && r.height < 200;
        tag(el, "card", small ? "pop" : pick(CARD_MOVES, n.card++), r);
      }
      // 2. pictures, canvases and large drawings
      for (const el of all(MEDIA)) {
        if (el.parentElement?.closest("svg")) continue;
        const u = usable(el);
        if (!u || u.r.width < 96 || u.r.height < 64) continue;
        tag(el, "media", pick(MEDIA_MOVES, n.media++), u.r);
      }
      // 3. table rows and list items cascade in; each list picks a side
      for (const el of all(ROW)) {
        const u = usable(el);
        if (!u) continue;
        let move = "row";
        if (el.matches("li") && el.parentElement) {
          if (!listSide.has(el.parentElement)) listSide.set(el.parentElement, n.list++ % 2 ? "row-r" : "row");
          move = listSide.get(el.parentElement)!;
        }
        tag(el, "row", move, u.r);
      }
      // 4. text
      for (const el of all(TEXT)) {
        if (el.closest("button,table,label,a[class*='rounded-full']") || !el.textContent?.trim()) continue;
        const u = usable(el);
        if (!u) continue;
        let move: string;
        if (el.matches("h1")) move = "wipe";
        else if (el.matches("h2,h3,h4,h5")) move = n.head++ % 2 ? "right" : "left";
        else if (el.classList.contains("hand")) move = "tip";
        else if (el.classList.contains("eyebrow")) move = "track";
        else if (el.matches("dt")) move = "left";
        else if (el.matches("dd")) move = "right";
        else move = pick(PARA_MOVES, n.para++);
        tag(el, "text", move, u.r);
      }
    };

    const roots = () => [document.getElementById("main"), document.querySelector("body > footer")].filter((x): x is HTMLElement => !!x);

    // new content (another page, data that arrived, the next wizard step) is scanned in the frame it appears in,
    // before it is painted, so it waits hidden and then animates in
    let raf = 0;
    const pending = new Set<HTMLElement>();
    const flush = () => {
      raf = 0;
      for (const el of pending) if (el.isConnected) scan(el);
      pending.clear();
    };
    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        rec.addedNodes.forEach((node) => {
          if (node.nodeType === 1) pending.add(node as HTMLElement);
        });
        // removed nodes forget their state; React's streaming moves nodes into place, and a moved node is scanned
        // again as new when it is added back
        rec.removedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const el = node as HTMLElement;
          for (const d of [el, ...el.querySelectorAll<HTMLElement>("[data-rv]")]) {
            if (!d.dataset.rv) continue;
            io.unobserve(d);
            seen.delete(d);
            delete d.dataset.rv;
            delete d.dataset.rvK;
            delete d.dataset.rvS;
          }
        });
      }
      if (pending.size && !raf) raf = requestAnimationFrame(flush);
    });

    // first pass once hydration has settled, so sizes are final
    const start = window.setTimeout(() => {
      roots().forEach(scan);
      first = false;
      roots().forEach((r) => mo.observe(r, { childList: true, subtree: true }));
    }, 80);

    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return null;
}
