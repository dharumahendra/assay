# Assay design tokens (from Assay.pen)

Source: the Pencil file `Assay.pen`. Values are copied exactly from its variables.

## Colors

| Token | Hex | Use |
|---|---|---|
| `bg` | `#EEF0F4` | page background |
| `surface` | `#FFFFFF` | cards |
| `surface-2` | `#F6F7FA` | inset/secondary surfaces |
| `ink` | `#0D0F14` | primary text, primary button, black deco squares |
| `ink-2` | `#4A4F5C` | secondary text (muted) |
| `ink-3` | `#8A8F9C` | tertiary text, captions |
| `line` | `#D9DCE3` | borders, dividers |
| `navy` | `#12151F` | dark bands (Problem band, jury panel, stage) |
| `navy-2` | `#1C2030` | surfaces on navy |
| `blue` | `#1D3BFF` | accent, logo tile, links |
| `lime` | `#C8F24A` | block color / PASS chip |
| `salmon` | `#F98F68` | block color / FAIL, refunded |
| `sky` | `#BDE5F7` | block color |
| `sage` | `#A9C3A9` | block color |
| `peach` | `#F2BC75` | block color / warning |
| `steel` | `#9FC3D6` | block color |

The navy band also uses a radial glow: `radial-gradient(90% 110% at 50% 55%, #1D3BFF66 0%, #1D3BFF00 100%)` over `navy`.

## Type

| Token | Family | Weights used |
|---|---|---|
| `f-display` | Inter Tight | 600 (headings), 700, 500 |
| `f-body` | Inter | 400, 500, 600, 700 |
| `f-mono` | JetBrains Mono | 400 (most labels, hashes, eyebrows), 500, 600, 700 |
| `f-hand` | Caveat | 600 (handwritten eyebrow, e.g. "job explorer") |

## Radius

Most common values: 12, 6, 16, 8, 24, 28, 14, 10 px.
- Use 6–8 for chips and badges.
- Use 12–16 for inputs, buttons and small cards.
- Use 24–28 for big cards and bands.
- The logo tile uses 22% of its size (35 at 160px).

## Grid texture (all screens)

- Lines are 1px `#E8A0A8` (pinkish red), in 48px square cells, starting at the page's top-left (0,0).
- They cover the top of the page (up to ~900–1100px) and sit behind the content.
- They fade out with a radial overlay in `bg` color, centered at the top-left corner:
  `radial-gradient(140% 200% at 0 0, #EEF0F400 0%, #EEF0F4B0 35%, #EEF0F4 70%)`
  (hero uses 160%/160%, stops 0 / 35% / 75%).

CSS sketch:
```css
.grid-bg {
  background:
    radial-gradient(140% 200% at 0 0, #EEF0F400 0%, #EEF0F4B0 35%, #EEF0F4 70%),
    linear-gradient(#E8A0A8 1px, transparent 1px) 0 0 / 48px 48px,
    linear-gradient(90deg, #E8A0A8 1px, transparent 1px) 0 0 / 48px 48px,
    #EEF0F4;
}
```

## Decorations

- **Hero:** 14 small black (`ink`) squares, 6–22px, centered on grid intersections, mostly in the right half and top.
- **Big blocks:** flat squares, no radius, partly clipped by the section edge.
  - Problem: `lime` 380 at top-right, `sky` 240 at bottom-left.
  - How It Works: `salmon` 330 at top-left, `sage` 150 at the right.
  - CTA: `peach` 420 at the right.
- **No blocks:** Metrics strip and Proof strip.

## Logo

- `assay-mark.svg` (160×160) is a `blue` rounded tile with a white "A" whose crossbar is a check mark.
- Wordmark: "assay" in lowercase, Inter Tight 700, next to the mark.
  - Navbar: 28px, letter-spacing -1.2px, `ink`.
  - Footer (dark): 64px, white.
- In the navbar the mark is 34px; in the footer it is 56px.
