# Business Suite design system

Shared visual and interaction rules for every client: browser (`apps/web`, operations mode),
Windows/macOS desktop (`apps/desktop`, which bundles the web renderer) and Android/iOS
(`apps/mobile`). The web implementation lives in `apps/web/src/operations/operations.css`
(CSS custom properties); the native implementation mirrors the same values in
`apps/mobile/src/theme.ts`. Change a token here first, then in both files.

## Direction

A working tool, not a brochure. Neutral surfaces, one accent, system typography, dense but
breathable layouts, and status communicated with words plus colour. No decorative shapes,
no serif display headlines, no slogans inside the product. Copy is functional: say what the
screen holds and what a button does.

Design principles that follow from the product rules in `AGENTS.md`:

- Saved, pending, approved and paid are different states and must look different.
- Pending local work is always visible (badge in navigation, banner above content).
- Destructive or financial actions confirm in a dialog that explains the consequence.
- Forms keep the user's input on failure; the error appears next to the actions.
- Every screen works at 360px wide with no horizontal scroll, and with a keyboard only.

## Colour

Semantic tokens only; components never use raw hex values. Light and dark are both
first-class. The theme follows the OS (`prefers-color-scheme`) unless the user chooses one
in Settings → Appearance (`data-theme="light" | "dark"` on the `.operations` root, stored as
`suite-theme` in `localStorage`; on native, `useColorScheme()` plus the same stored override).

| Token             | Light     | Dark      | Use                                            |
| ----------------- | --------- | --------- | ---------------------------------------------- |
| `--bg`            | `#f5f6f8` | `#0f1115` | App canvas                                     |
| `--surface`       | `#ffffff` | `#171a20` | Cards, tables, sidebar                         |
| `--surface-2`     | `#f0f1f4` | `#1e222a` | Hover rows, inset fields, secondary chips      |
| `--surface-3`     | `#e6e8ec` | `#262b34` | Pressed states, skeletons                      |
| `--border`        | `#e3e5ea` | `#2a2f3a` | Default hairline                               |
| `--border-strong` | `#c9ccd4` | `#3a404c` | Inputs, focused cards                          |
| `--text`          | `#15171c` | `#e8eaee` | Primary text                                   |
| `--text-2`        | `#5b6170` | `#a0a7b4` | Secondary text, labels                         |
| `--text-3`        | `#8a90a0` | `#6f7684` | Placeholders, metadata                         |
| `--accent`        | `#2f6ae6` | `#5c8cf5` | Primary actions, active nav, links, focus ring |
| `--accent-hover`  | `#285dcc` | `#79a1f7` | Hover on primary actions                       |
| `--accent-soft`   | `#e8effd` | `#1c2a47` | Active nav background, info chips              |
| `--on-accent`     | `#ffffff` | `#0b1220` | Text on accent                                 |
| `--success`       | `#1d8a4e` | `#43c47a` | Approved, completed, synced                    |
| `--success-soft`  | `#e4f5ea` | `#13301f` | Chip background                                |
| `--warning`       | `#b26a00` | `#f0b24a` | Submitted / awaiting review, overdue, offline  |
| `--warning-soft`  | `#fff3dc` | `#3a2a0d` | Chip background                                |
| `--danger`        | `#c9323c` | `#f0717a` | Rejected, void, errors, destructive confirm    |
| `--danger-soft`   | `#fdeaec` | `#3d1519` | Chip / alert background                        |

Contrast: all text tokens on their intended backgrounds meet WCAG AA (≥ 4.5:1 for body,
≥ 3:1 for large text and UI borders). Status chips always include a text label — colour alone
never carries meaning.

## Typography

System stack so each platform looks native and nothing is downloaded:
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial,
sans-serif`. Native uses the platform default (San Francisco / Roboto).

| Role            | Size / line | Weight | Notes                                                           |
| --------------- | ----------- | ------ | --------------------------------------------------------------- |
| Page title      | 22 / 28     | 600    | One per screen, sentence case                                   |
| Section title   | 15 / 20     | 600    | Panel and dialog headings                                       |
| Body            | 14 / 20     | 400    | 15 / 22 on touch devices                                        |
| Small           | 12.5 / 16   | 400    | Metadata, hints, table secondary line                           |
| Label           | 12 / 16     | 500    | Form labels, column headers, stat labels; no uppercase tracking |
| Stat value      | 24 / 28     | 600    | `font-variant-numeric: tabular-nums`                            |
| Money in tables | body        | 500    | tabular numerals, right-aligned on desktop                      |

Letter spacing is default everywhere. Sentence case for all UI text. No italic.

## Spacing, shape, elevation

4px base scale: 4, 8, 12, 16, 20, 24, 32, 40. Page gutter 16 on phone, 24 on tablet,
32 on desktop. Max content width 1240px.

Radius: `--r-sm` 6 (controls, chips), `--r-md` 10 (cards, panels), `--r-lg` 14 (dialogs,
sheets), pill for status chips.

Elevation is expressed with borders first. Shadows only on floating layers:
`--shadow-pop` `0 8px 24px rgba(10,12,20,.12)` (dialogs, menus); dark theme uses
`0 8px 24px rgba(0,0,0,.5)`.

Motion: 150ms ease-out for hover/press, 220ms for sheets and dialogs; everything disabled
under `prefers-reduced-motion`.

## Layout and navigation

- **Desktop (≥ 1024px):** fixed 240px sidebar (workspace switcher, primary navigation,
  account) and a 56px top bar (search, sync status, theme toggle). Content column max 1240px.
- **Tablet (640–1023px):** sidebar collapses to a 68px icon rail with labels under icons.
- **Phone (< 640px):** top app bar (workspace name, search, sync dot) and a bottom tab bar
  with the first four modules plus **More**, which opens a sheet with the remaining
  destinations, workspace switching and sign-out. Safe-area insets are respected.
- Forms open as a centred dialog (max 560px) on desktop/tablet and as a full-height bottom
  sheet on phone. Escape and the close button cancel; input is preserved on error.
- Tables become stacked cards below 640px: the first column is the card title, remaining
  columns render as `label: value` rows, actions as a button row.
- Pipeline boards scroll horizontally with scroll-snap on touch; columns are 272px.
- Minimum touch target 44×44 on touch devices, 32px row height on desktop pointer devices.

## Components

- **Button** — primary (accent fill), secondary (surface + border), text (no border, accent
  text), icon (square 36). Height 36 desktop / 44 touch. Disabled at 50% opacity with
  `cursor: not-allowed`. Busy state swaps the label ("Saving…") and disables.
- **Chip / Badge** — pill, 12px/500 text, soft background per tone (`neutral`, `good`,
  `attention`, `danger`, `info`). Always has a readable label.
- **Stat tile** — label (12/500 muted) above value (24/600 tabular); optional detail line.
  Tiles sit in a responsive grid (`auto-fit, minmax(160px, 1fr)`), each on `--surface` with
  a hairline border.
- **Panel** — surface card with 16px padding and a header row (title + optional action).
- **Table** — header row in `--text-2` 12/500, row divider hairlines, hover `--surface-2`,
  secondary line in `--text-3`. Money columns right-aligned with tabular numerals.
- **Form field** — label above control; 36/44 high inputs with `--border-strong`, focus ring
  2px accent outline offset 2px; hint below in small text; required marked with `*`.
- **Dialog / Sheet** — heading, optional description, fields in a 1–2 column grid, actions
  right-aligned (primary first on desktop; full-width stacked on phone). Overlay
  `rgba(10,12,20,.45)`.
- **Banner** — full-width strip under the top bar for example mode, pending local work, and
  errors; icon + one sentence + optional action. Tones: info, warning, danger.
- **Toast** — bottom-centre on phone, bottom-right on desktop; dismissible; auto-hides after
  6s unless it describes an error.
- **Empty state** — title, one sentence, optional primary action; never decorative art.
- **Skeleton** — `--surface-3` blocks, 10px radius, no shimmer under reduced motion.

## Iconography

24px grid, 1.6px stroke, round joins, `currentColor`. One icon set shared by all clients
(web: inline SVG `Icon` component; native: identical paths through `react-native-svg` or the
platform's SF Symbols / Material Symbols equivalents). Icons always have a text label or
`aria-label`.

## Copy

Sentence case; verbs on buttons ("Record expense", "Invite member"); no exclamation marks;
no slogans. Describe states precisely: "Saved on this device · not yet accepted by the server"
rather than "Synced". Money always shows the currency code the first time it appears on a
screen. Dates are ISO (`2026-10-31`) in tables and relative ("Due in 3 days") in summaries.
