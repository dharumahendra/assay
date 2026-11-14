import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 14, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

/** Trust band glyphs: filled → half → outline → dashed, so bands differ without colour. */
export const BandStrong = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" fill="currentColor" />
    <path d="M5.2 8.2 7.1 10l3.7-4" stroke="var(--surface)" />
  </svg>
);
export const BandSome = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
  </svg>
);
export const BandWeak = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" />
  </svg>
);
export const BandNone = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" strokeDasharray="2 2.2" />
  </svg>
);
export const LinkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
  </svg>
);
export const ArrowUpRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 11 11 5M6 5h5v5" />
  </svg>
);
export const ArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);
export const External = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 3H13v3.5M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />
  </svg>
);
export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);
export const Info = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2V11M8 5h.01" />
  </svg>
);
export const Unmapped = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8h3M10 8h3M6.5 5.5l3 5" />
  </svg>
);
export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" />
    <path d="M10.5 3H4a1 1 0 0 0-1 1v6.5" />
  </svg>
);
