---
name: Hoard
description: A private, self-hosted read-back of your Revolut statement, showing only what recurs.
colors:
  signal-blue: "#2a78d6"
  ink: "#0b0b0b"
  graphite: "#52514e"
  ash: "#6f6d68"
  paper: "#f9f9f7"
  surface: "#fcfcfb"
  popover: "#ffffff"
  hairline: "oklch(0.145 0 0 / 10%)"
  grid: "#e1e0d9"
  axis: "#c3c2b7"
  primary-ink: "oklch(0.205 0 0)"
  status-good: "#0ca30c"
  status-warning: "#fab219"
  status-serious: "#ec835a"
  status-critical: "#d03b3b"
  delta-good: "#006300"
  delta-bad: "#b42828"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-text: "#b42828"
  night-paper: "#0d0d0d"
  night-surface: "#1a1a19"
  night-ink: "#ffffff"
  night-graphite: "#c3c2b7"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  stat:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.375
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "26px"
spacing:
  xs: "4px"
  sm: "8px"
  card-sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  input:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
    height: "32px"
  nav-link:
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    typography: "{typography.body}"
  badge:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    height: "20px"
    typography: "{typography.label}"
---

# Design System: Hoard

## Overview

**Creative North Star: "The Statement, Decoded"**

The app takes the owner's own Revolut statement, a long and noisy list of every charge, and reads it back with the recurring signal pulled out. Every screen should feel like that statement made legible: the same plain paper and ink, but with the money that repeats lifted to the surface, sized by importance and colored only where something needs attention.

The mood is **calm, exact, and private**. Surfaces are warm-neutral paper and near-black ink. Numbers carry the hierarchy: one large figure per screen (the monthly total), then compact stat values, then quiet muted labels. Color is rationed. The Hoard mark (a gold ring on a near-black tile) is the only ornamental object. Signal Blue is the one interface attention hue, the eight series hues identify subscriptions in charts, and the status colors appear only next to an icon and a label. Nothing looks like a fintech marketing page: no gradients, no glow, no hero imagery, no upsell.

Density is moderate. It's a tool the owner opens often and knows well, so information sits close together, but each group keeps a clear edge. The interface works equally as a quick phone check and a desktop review session.

**Key Characteristics:**
- Warm-neutral paper/ink surfaces; the gold Hoard mark is the only ornament, Signal Blue the only attention hue
- Numbers lead the hierarchy; labels recede into graphite and ash
- Flat cards edged by a 10% ink hairline, not shadows
- A validated, colorblind-safe chart palette with fixed per-subscription slots
- Status is never color alone: icon + label + color
- Light and dark themes are equal citizens

## Colors

A quiet paper-and-ink neutral system with a single blue signal, a gold logo, and a strictly functional data palette.

### Primary
- **Signal Blue** (#2a78d6; dark #3987e5): the interface's one attention hue. It is chart series 1, the unread dot in the notification bell, the "syncing" connection state, dropzone hover/drag borders, and the email accent. It's the only saturated color outside data, status, and the logo.

### Brand mark
- **Hoard Gold** (gradient #fff1b0 → #f2c14e → #b9801f → #f5d06a on a #12100e tile): lives only inside the Hoard mark (`HoardMark`, `src/app/icon.svg`, PWA icons). It is a logo asset, not a UI color; never reuse the gold or its gradient on interface elements.

### Neutral
- **Ink** (#0b0b0b; dark #ffffff): primary text and big figures.
- **Graphite** (#52514e; dark #c3c2b7): secondary text, card labels, inactive nav links (`--muted-foreground`).
- **Ash** (#6f6d68; dark #898781): tertiary context: axis labels, calendar day numbers, sublines that only explain. It is the faintest text role and still passes 4.5:1 on Paper and Surface in both themes. Anything the owner acts on (overdue, due soon, a price change) uses Graphite instead.
- **Paper** (#f9f9f7; dark #0d0d0d): page background.
- **Surface** (#fcfcfb; dark #1a1a19): cards and the nav rail.
- **Popover** (#ffffff; dark #222220): tooltips, menus, popovers. They sit one step above Surface.
- **Hairline** (ink at 10%; dark white at 10%): every border and card ring.
- **Grid / Axis** (#e1e0d9 / #c3c2b7; dark #2c2c2a / #383835): chart gridlines and axes only.
- **Primary Ink** (oklch 0.205 0 0; dark oklch 0.922 0 0): the filled primary button. The UI's main action color is ink, not blue.

### Data and status
- **Series 1–8** (`--series-1…8`, plus `--series-other` #b4b2aa): chart identity colors, validated for light and dark mode and color-vision deficiency. Slot order is the safety mechanism; never reorder it.
- **Status good / warning / serious / critical** (#0ca30c / #fab219 / #ec835a / #d03b3b): subscription health, always paired with an icon and label.
- **Delta good / bad** (#006300 / #b42828; dark #0ca30c / #e66767): price-change direction in text.

### Named Rules
**The Ink-Not-Blue Rule.** Primary actions are filled with ink, not Signal Blue. Blue signals "new or in progress" and series 1; it does not mean "click here".

**The Gold-Stays-In-The-Ring Rule.** The Hoard gold gradient appears only in the logo. Gradients anywhere else in the UI are off-system.

**The Fixed Slot Rule.** A subscription's chart color is set by its first-seen date and never changes when filters change. Don't reassign series colors per view.

**The Never-Color-Alone Rule.** Status and delta colors always come with an icon, a sign (+/−), or a text label.

## Typography

**Body Font:** Geist (with ui-sans-serif, system-ui)

**Character:** One neutral grotesk does everything. Hierarchy comes from size and weight, plus tight tracking on figures, never from a second family. Numeric tables use tabular figures (`.tabular`); headline stat figures keep proportional digits.

### Hierarchy
- **Display** (600, 48px, line-height 1, tracking −0.025em): the one hero figure per screen, e.g. the Overview's monthly total. One per page.
- **Headline** (600, 24px, tracking −0.025em): large display headings. Page titles (`PageHeader` h1) are 600/16px in the top bar, with no subtitle.
- **Stat** (600, 26px, tracking −0.025em): secondary stat-tile values.
- **Title** (500, 16px): card and chart titles.
- **Body** (400, 14px): default UI text, table cells, descriptions.
- **Label** (400, 12.5–13px): stat sublines, status badges, tooltip text, footnotes. It's the smallest role; don't go below 12px.

### Named Rules
**The One Hero Number Rule.** Each screen has at most one Display-size figure. Everything else steps down to Stat or Body.

## Layout

- **Shell:** on `md` (768px) and up, a fixed 224px left rail (`AppNav`, sticky, full height) beside a `minmax(0,1fr)` main column. Below `md`, the shell splits into a 48px sticky top bar (Hoard mark, muted "Hoard /" and the page title, bell on the right; the page's `h1` is screen-reader only there and its actions sit in a right-aligned row above the content) and a fixed bottom tab bar with all four destinations, each an icon over a 12px label, at least 56px tall, padded for the safe area. Nothing in the shell ever scrolls sideways.
- **Page bar (`md` and up):** `PageHeader` is a slim sticky bar (min 48px, `bg-card`, bottom border) at the top of the main column with the `h1` on the left and page actions on the right. Its background and border bleed to the column edges via a clipped box-shadow, so it never causes horizontal scroll; the rail paints over the left bleed.
- **Skip link:** a "Skip to content" link is the first focus stop and targets `<main id="main">`.
- **Main column:** max width 1240px, centered. Side padding 16px on mobile and 32px from `md`; top padding 20px on mobile and none from `md` (the page bar sits flush); bottom padding 64px.
- **Rhythm:** 16px gap between cards and tiles; 16px card padding (12px for `size="sm"` cards); 20px under the page header.
- **Overview:** a grid of widgets the owner arranges per device (stored in localStorage). Edit (in the page header) makes them wiggle; each gets a minus badge, a grip (drag, or arrow keys) and, where it has more than one size, a resize badge; "Add widget" brings back removed ones. Sizes: small (stat tiles), half and full. The grid is a container query on the widget area: 2 columns below 56rem (stat tiles pair up; the monthly total and price increase take the row under 32rem; charts take the row), 4 columns from 56rem. The default: the four stat tiles, Upcoming renewals beside Monthly recurring spend, then the timeline and spend by merchant across the row. On narrow cards the timeline opens on its last year (1y / 2y / All). Time-based nudges (overdue, price increases, renewals, reimbursements) belong in the notification feed under the bell, not in an Overview card.
- **Data lists:** tables switch to two-line list rows when their card is narrower than 36rem (a container query, not a viewport breakpoint). Line 1 carries the name and the money; line 2 carries the date, status or type. The row menu is a separate 44px target, and a "Sort:" menu replaces column headers. Wider cards show the table, adding columns as the card grows.
- **Settings:** on phones, `/settings` is a list of sections (icon, name, one-line description, chevron), and each section page opens with a "‹ Settings" back link. From `md`, a section column sits beside the content and the rail links straight to the first section.
- **Charts** sit in `ChartCard`s with an `h2` title, a description and optional range controls. The controls drop to their own row when the card is narrower than 28rem.

## Elevation & Depth

The system is flat. Cards, the nav rail, and tables sit on the page separated by tone (Surface on Paper) and a 1px hairline ring (ink at 10%). There are no resting shadows. The only shadow is on floating layers that must lift above content.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 28px rgb(0 0 0 / 0.14)`): chart tooltips (`.chart-tooltip`) and other floating panels.

### Named Rules
**The Hairline-Not-Shadow Rule.** Grouping comes from tone and a 10% hairline. A shadow means "floating above the page" and nothing else.

## Shapes

Softly rounded rectangles from one radius base (`--radius` 10px): small controls at 6–8px, cards at 14px, and badges as full pills. Chart bars are at most 24px wide; the top segment of each stack has a 4px rounded end, and stacked segments are separated by a 2px surface-colored gap. Icons are Lucide at a 16px default (14px inside badges, 20px beside stat values).

## Components

### Buttons
- **Shape:** gently rounded (8px), 32px tall by default (`sm` 28px, `xs` 24px, `lg` 36px).
- **Primary:** Primary Ink fill with paper text. Hover drops to 80% opacity.
- **Outline:** hairline border on the page color; hover fills with muted.
- **Ghost:** text only in graphite; hover fills with muted. Used for nav-adjacent and row actions.
- **Destructive:** a 10% destructive tint with Destructive Text (#b42828; dark #ff8a8a, at least 5:1 on the tint). It's never a solid red fill.
- **Focus:** a 2px solid ink outline, offset 2px (`--ring` is ink; at least 13:1 in both themes). Inside lists and bars the outline is inset instead. Pressed buttons shift down 1px only when motion is allowed.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** Surface.
- **Shadow Strategy:** none (see Elevation).
- **Border:** a 1px ring of ink at 10%.
- **Internal Padding:** 16px (12px for small cards).

### Inputs / Fields
- **Style:** hairline input border, transparent fill (dark: white at 30%), 8px radius, 32px tall, 16px text on mobile and 14px from `md` (prevents iOS zoom).
- **Focus:** the same 2px ink outline as buttons.
- **Error:** destructive border with a 20% destructive ring (`aria-invalid`).

### Badges / Status
- **Badge:** a 20px pill with 12px medium text. Variants follow the button colors.
- **StatusBadge:** a colored 14px icon plus a graphite label at 12.5px. Only the icon carries the status color.

### Navigation
- **Rail links (md+):** Body text in graphite with a 16px icon, 8px radius, and 6px/10px padding. Hover fills with muted and switches to ink. The active link has a muted fill, ink text, medium weight, and `aria-current="page"`.
- **Bottom tab bar (phones):** four equal columns, each a 20px icon above a 12px label. The active tab shows an ink label and a muted pill behind the icon. Toasts sit above the bar.
- **Brand mark:** the 28px Hoard mark plus the "Hoard" wordmark, at the top of the rail on desktop and on the left of the phone top bar. The notification bell sits beside it on desktop and at the right end of the phone top bar (44px target on touch).
- **Footer of rail:** Privacy/Terms links (12px). Theme and log out live in Settings.

### Chart Card (signature)
A card whose header holds an `h2` title, a description, and optional range controls (one shared 12m / YTD period, or month stepping for renewals). There is no table view. Instead:
- Each chart is **one tab stop** with roving focus: arrows move between marks, Home/End jump to the ends, and the tooltip follows.
- The SVG is a `group` and each mark is a named `img` ("Jun 2026: €211.41 — Lemon Gym €34.99, …").
- The focused mark gets a 2px ink focus stroke.
- Tooltips render in a portal (Popover background, Float shadow, 12.5px text) and open on hover, focus or tap.
- Uncoloured "Other" marks get a 1px graphite edge so they meet 3:1.
- All chart text is at least 12px.
- On phones, the renewals calendar becomes a dated agenda list ("Wed 7 Oct · Netflix · €15.99 · in 2 days").

## Do's and Don'ts

### Do:
- **Do** lead each screen with the money figure, at Display size once, then step down.
- **Do** use the `--series-N` slot assigned to a subscription everywhere it appears.
- **Do** pair every status or delta color with an icon, a sign, or a label.
- **Do** separate groups with tone and the 10% hairline.
- **Do** give every new chart a tooltip that works on hover, focus and tap; one tab stop with arrow-key roving; and named marks.
- **Do** give every new data table a two-line `renderMobileRow` so it never scrolls sideways on a phone.
- **Do** design the mobile layout as a primary layout. The owner often checks on a phone.

### Don't:
- **Don't** fill primary buttons or links with Signal Blue; actions are ink.
- **Don't** reuse the Hoard gold or its gradient outside the logo.
- **Don't** add resting shadows, gradients, glows, or decorative imagery.
- **Don't** reorder the series palette or add hues outside the validated set.
- **Don't** set text below 12px or use Ash for information the owner needs to act on.
- **Don't** build phone navigation as a sideways scroller (`overflow-x-auto` strips of links or tabs). Use the bottom tab bar, a list, or wrapping that stays on one line.
- **Don't** add promotional or growth copy ("connect more accounts", "upgrade"). The tone is factual and private.
