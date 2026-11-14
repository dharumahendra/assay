"use client";

import { useEffect } from "react";

/**
 * Scroll motion for every page, without touching the pages themselves.
 *
 * Elements in <main> and the footer are sorted into kinds, and each kind gets its own family of moves:
 *   text   headings wipe in or slide in from the left / right, paragraphs alternate left, right and a soft blur,
 *          eyebrows unpack their letter-spacing, the hand-written labels tip in;
 *   cards  rise from below (straight up, tilted back, scaled up or with a slight swing), small tiles pop;
 *   media  images, canvases and large drawings zoom out of a blur or open like a curtain;
 *   rows   table rows and list items slide in one after another.
 * They animate out again when they leave the viewport, towards the edge they leave by, and back in when they return.
 *
 * Visibility is decided from each element's layout position (offsetTop / offsetHeight), never from its painted box:
 * the moves themselves shift the painted box by up to 80px, and judging by it made an element that had just come in
 * look like it had left again, so it flickered at the edge. Coming in and going out also use different lines
 * (in once it is 8% inside the viewport, out only when it has all but left), so nothing can toggle in between.
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
// moves that push an element down; at the very end of the page that would grow the scroll area, so they settle instead
const DOWNWARD = new Set(["up", "tilt", "scale", "swing", "pop", "zoom", "curtain", "blur"]);

const ENTER = 0.08; // comes in once its edge is this far (share of the viewport) inside
const GONE = 24; // goes out once no more than this many px of it are left on screen

const pick = (list: string[], i: number) => list[i % list.length] ?? list[0] ?? "up";
const opaque = (c: string) => c !== "transparent" && !/rgba?\([^)]*,\s*0\)$/.test(c);

/** Layout box in page coordinates; transforms (ours included) do not move it. */
function layoutBox(el: Element): { top: number; h: number } | null {
  let host: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement; // an <svg> is measured by its parent
  if (!host || (!host.offsetParent && getComputedStyle(host).position !== "fixed")) return null;
  // inside a closed <details>: wait until it is opened, then animate in
  const shut = host.closest("details:not([open])");
  if (shut && shut !== host) return null;
  const h = host.offsetHeight;
  if (h < 1) return null;
  let top = 0;
  for (let n: HTMLElement | null = host; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
  return { top, h };
}

export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const seen = new WeakSet<Element>();
    const n = { card: 0, para: 0, head: 0, media: 0, list: 0 };
    const listSide = new WeakMap<Element, string>();
    const tracked = new Set<HTMLElement>();
    const box = new Map<HTMLElement, { top: number; h: number } | null>();
    let first = true;

    // ---- geometry -------------------------------------------------------------------------------------------
    const measure = () => {
      for (const el of tracked) {
        if (!el.isConnected) {
          tracked.delete(el);
          box.delete(el);
        } else box.set(el, layoutBox(el));
      }
    };

    let raf = 0;
    let dirty = true;
    const update = () => {
      raf = 0;
      if (dirty) {
        measure();
        dirty = false;
      }
      const vh = window.innerHeight;
      const y = window.scrollY;
      const coming: [HTMLElement, number, number][] = [];
      for (const el of tracked) {
        const b = box.get(el);
        if (!b) continue;
        const top = b.top - y;
        const bottom = top + b.h;
        const s = el.dataset.rvS;
        if (s === "hide" || s === "out") {
          if (top < vh * (1 - ENTER) && bottom > vh * ENTER) coming.push([el, top, bottom]);
        } else if (top > vh - GONE || bottom < GONE) {
          el.style.setProperty("--rv-d", bottom < GONE ? "-1" : "1");
          el.style.setProperty("--rv-delay", "0ms");
          el.dataset.rvS = "out";
        }
      }
      coming.sort((a, b) => a[1] - b[1]);
      coming.forEach(([el, top, bottom], i) => {
        // through the top edge when scrolling back up, through the bottom otherwise
        const fromTop = el.dataset.rvS === "out" ? (top + bottom) / 2 < vh / 2 : top < 0 && bottom < vh / 2;
        el.style.setProperty("--rv-d", fromTop ? "-1" : "1");
        el.style.setProperty("--rv-delay", `${Math.min(i, 8) * 70}ms`);
        el.dataset.rvS = "in";
      });
    };
    const schedule = (remeasure = false) => {
      if (remeasure) dirty = true;
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onScroll = () => schedule();
    const onResize = () => schedule(true);

    // ---- tagging ---------------------------------------------------------------------------------------------
    const tag = (el: HTMLElement, kind: Kind, move: string) => {
      const b = layoutBox(el);
      const docH = document.documentElement.scrollHeight;
      seen.add(el);
      el.dataset.rv = b && DOWNWARD.has(move) && b.top + b.h > docH - 140 ? "settle" : move;
      el.dataset.rvK = kind;
      // what the server already painted on the first load stays put; everything else waits for its entrance
      const top = b ? b.top - window.scrollY : Infinity;
      const onScreen = !!b && top < window.innerHeight - GONE && top + b.h > GONE;
      el.dataset.rvS = first && onScreen ? "rest" : "hide";
      tracked.add(el);
      box.set(el, b);
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
        tag(el, "card", small ? "pop" : pick(CARD_MOVES, n.card++));
      }
      // 2. pictures, canvases and large drawings
      for (const el of all(MEDIA)) {
        if (el.parentElement?.closest("svg")) continue;
        const u = usable(el);
        if (!u || u.r.width < 96 || u.r.height < 64) continue;
        tag(el, "media", pick(MEDIA_MOVES, n.media++));
      }
      // 3. table rows and list items cascade in; each list picks a side
      for (const el of all(ROW)) {
        if (!usable(el)) continue;
        let move = "row";
        if (el.matches("li") && el.parentElement) {
          if (!listSide.has(el.parentElement)) listSide.set(el.parentElement, n.list++ % 2 ? "row-r" : "row");
          move = listSide.get(el.parentElement) ?? "row";
        }
        tag(el, "row", move);
      }
      // 4. text
      for (const el of all(TEXT)) {
        if (el.closest("button,table,label,a[class*='rounded-full']") || !el.textContent?.trim()) continue;
        if (!usable(el)) continue;
        let move: string;
        if (el.matches("h1")) move = "wipe";
        else if (el.matches("h2,h3,h4,h5")) move = n.head++ % 2 ? "right" : "left";
        else if (el.classList.contains("hand")) move = "tip";
        else if (el.classList.contains("eyebrow")) move = "track";
        else if (el.matches("dt")) move = "left";
        else if (el.matches("dd")) move = "right";
        else move = pick(PARA_MOVES, n.para++);
        tag(el, "text", move);
      }
    };

    const roots = () => [document.getElementById("main"), document.querySelector("body > footer")].filter((x): x is HTMLElement => !!x);

    // new content (another page, data that arrived, the next wizard step) is scanned in the frame it appears in,
    // before it is painted, so it waits hidden and then animates in
    let scanRaf = 0;
    const pending = new Set<HTMLElement>();
    const flush = () => {
      scanRaf = 0;
      for (const el of pending) if (el.isConnected) scan(el);
      pending.clear();
      dirty = true;
      update();
    };
    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        // removed nodes forget their state; React's streaming moves nodes into place, and a moved node is scanned
        // again as new when it is added back
        rec.removedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const el = node as HTMLElement;
          for (const d of [el, ...el.querySelectorAll<HTMLElement>("[data-rv]")]) {
            if (!d.dataset.rv) continue;
            tracked.delete(d);
            box.delete(d);
            seen.delete(d);
            delete d.dataset.rv;
            delete d.dataset.rvK;
            delete d.dataset.rvS;
          }
        });
        rec.addedNodes.forEach((node) => {
          if (node.nodeType === 1) pending.add(node as HTMLElement);
        });
      }
      if (pending.size && !scanRaf) scanRaf = requestAnimationFrame(flush);
    });

    // anything that changes the page height moves what sits below it; a slow sweep catches the rest
    const ro = new ResizeObserver(() => schedule(true));
    const sweep = window.setInterval(() => schedule(true), 1500);

    // first pass once hydration has settled, so sizes are final
    const start = window.setTimeout(() => {
      roots().forEach(scan);
      first = false;
      roots().forEach((r) => mo.observe(r, { childList: true, subtree: true }));
      ro.observe(document.body);
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      schedule(true);
    }, 80);

    return () => {
      window.clearTimeout(start);
      window.clearInterval(sweep);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scanRaf);
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
