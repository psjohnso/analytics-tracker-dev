# DESIGN.md — City of Tucson Brand Guide
## For UI design exploration within official brand requirements

> ## ⚠️ App redesign in progress (2026) — read alongside this guide
>
> The **Project & Task Tracker** is prototyping an alternative visual language — the **"OE Redesign"** (design handoff from Laura Sharp, in [`design_handoff/`](design_handoff/README.md)). It **intentionally deviates from this brand guide** in two ways:
> - **Type:** Instrument Serif + Hanken Grotesk + JetBrains Mono — *not* the mandated **Lato + Cardo**.
> - **Color:** a subdued (~55%) version of the palette (e.g. primary navy `#1f3b6b` vs. official Innovation Blue `#002669`), with saturation reserved for status + data-viz.
>
> **Status:** prototype only — shipped behind a theme toggle ("OE Redesign (preview)", app `v1.62.0.0`) on the **dev** line; desktop-first; dark mode in scope. **Not** the production default.
>
> **Authority:** *this document remains the City's official brand standard.* The redesign is an app-specific direction adopted by the Data Intelligence team; the font/color deviation should get **formal brand sign-off** before it becomes the production default. Implementation: [`src/theme-oe.css`](src/theme-oe.css). The app's own design-system kit (which tracks both the current "Tucson Classic" theme and the OE redesign): [`design-system/`](design-system/README.md).

---

## Organization

- **Name:** City of Tucson
- **Brand guide version:** 02.15.22
- **Context:** Internal web application for city employees
- **Geographic identity:** Tucson, Arizona — Sonoran Desert Southwest

---

## Color Palette

### Primary Brand Colors

These four colors form the core identity and should drive the dominant visual tone of any design:

| Name | Hex | Typical Role |
|---|---|---|
| Innovation Blue | `#002669` | Primary brand navy — the most important color |
| Sunset Orange | `#C24200` | Energy, action, warmth |
| Sun Yellow | `#FFDB22` | Highlights and brightness — use sparingly |
| Saguaro Green | `#83AC16` | Balance, vitality |

### Secondary Brand Colors

Supporting palette — use to add depth, variety, or to differentiate content areas:

| Name | Hex | Notes |
|---|---|---|
| Night Sky | `#140233` | Deep background — darker than Innovation Blue |
| Sky Blue | `#0088FF` | Links and interactive elements |
| Cactus Fruit | `#9E0059` | Bold accent alternative to orange |
| Sonoran Sand | `#E5D086` | Warm, earthy — good for backgrounds or highlights |
| Monsoon Gray | `#E1E2DD` | Neutral — borders, subtle backgrounds |
| Brand Black | `#002855` | Body text (this is a deep navy-black, not pure black) |

### Color Rules (from official brand guide)

- Innovation Blue is the anchor — every design should be clearly grounded in it
- Sun Yellow should be used sparingly; it is a highlight, not a background color
- For department or section color coding, use only: Innovation Blue, Sunset Orange, Saguaro Green, Sky Blue, or Cactus Fruit — never Sun Yellow, Night Sky, Monsoon Gray, or Sonoran Sand for text
- Brand Black (`#002855`) can be paired with any branded color
- On dark backgrounds, ensure sufficient contrast — use white or light tones for text
- The full-color logo must be used on light backgrounds; the reverse (white) logo on dark backgrounds

---

## Typography

### Fonts

The City of Tucson uses **Lato** and **Cardo** as its official digital typefaces, loaded from Google Fonts.

| Role | Font | Fallback | Notes |
|---|---|---|---|
| Headlines, titles, labels, navigation | **Lato** | Arial, sans-serif | Use Bold (700) or Black (900) weight for headings; uppercase for subheadings and labels |
| Body copy, long-form text | **Cardo** | Georgia, serif | Regular weight; use italic sparingly for emphasis |

### Google Fonts import

```html
<link href="https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet"/>
```

### Typography Rules

- Lato Black (900) for major headings — bold, confident, clear
- Lato Bold (700) for subheadings, navigation, labels, and UI elements
- Cardo Regular for body copy and descriptive text
- Headlines and section labels may be set in uppercase with letter-spacing for formality
- Never use Sun Yellow as a text color on white backgrounds (insufficient contrast)
- Minimum text size: 13px — do not go below this

---

## Logo

### Versions available

The City of Tucson logo exists in several versions:

| Version | When to use |
|---|---|
| Horizontal full-color | Default — use whenever space allows |
| Vertical full-color | When a square or tall layout requires it |
| Full-color reverse | On dark or colored backgrounds |
| One-color (navy) | Single-color print or restricted applications |
| One-color reverse (white) | On dark backgrounds when full-color isn't possible |

### Logo rules (non-negotiable)

- Always maintain a clear zone around the logo — no other graphics, text, or elements within this space
- Never alter, distort, stretch, or rotate the logo
- Never add drop shadows, outlines, or graphic effects to the logo
- Never change the logo's typeface or colors
- Never place the logo on a background with insufficient contrast
- Never use the icon mark with a different typeface than the official one
- The minimum digital size is 40px tall for the horizontal logo, 72px tall for the vertical

---

## Visual Identity Motifs

These patterns are drawn from the official brand guide and reflect Tucson's visual character. Designs may incorporate them but are not required to use all of them:

- **Mountain / roofline silhouettes** — angular white shapes suggesting the Tucson skyline or desert ridgelines; used as decorative header elements
- **Terracotta / rust warm tones** — Sunset Orange and Sonoran Sand evoke the desert landscape; warm-toned sections feel distinctly Tucsonan
- **Desert color story** — the palette as a whole tells a story of sky (Innovation Blue, Sky Blue), sun (Sun Yellow, Sonoran Sand), earth (Sunset Orange, Brand Black), and life (Saguaro Green, Cactus Fruit)
- **Bold, graphic color blocks** — large areas of solid brand color rather than gradients; clean and confident
- **Horizontal accent bars** — short bands of color used as decorative dividers or section markers

---

## Platform Requirements (Igloo Intranet)

All designs built for the City's internal intranet must meet these technical constraints:

- Export as a single self-contained HTML file — all CSS inside a `<style>` block, no external stylesheets
- No inline `style=""` attributes — Igloo strips them; use CSS classes for everything
- No CSS `gap` shorthand — use `grid-column-gap` and `grid-row-gap` separately
- No inline SVG — use PNG images instead
- No React, Vue, or build-tool-dependent frameworks — vanilla HTML/CSS/JS only
- All custom CSS must be scoped under a wrapper class (e.g., `.cot-datahub`) with `!important` on all properties to prevent Igloo's base styles from overriding
- Google Fonts loaded via `<link>` tag with Arial/Georgia fallbacks
- Layouts must work from 768px to 1920px width

---

## Accessibility

The City of Tucson must meet WCAG 2.1 AA:

- Minimum contrast ratio 4.5:1 for normal text, 3:1 for large text
- All images must have descriptive alt text
- Interactive elements must be keyboard navigable
- Use semantic HTML elements (`<nav>`, `<main>`, `<section>`, `<header>`, `<footer>`, `<h1>`–`<h6>`)
- Never convey meaning through color alone

---

## What this file does NOT specify

This file intentionally leaves the following open for design exploration:

- Page layout and section structure
- Navigation patterns
- Component styles (cards, buttons, tables)
- Spacing and grid choices
- Visual hierarchy approach
- Use of photography, illustration, or iconography
- Overall "feel" — modern, editorial, utilitarian, warm, etc.

These decisions should be made during the design process in Stitch. The constraints above define the brand boundaries; everything within those boundaries is open.
