# Sector colours repeat across categories

* Status: Resolved
* Last verified: 2026-11-16
* Environment: PD-056 frontend, all three themes; local stack and Vitest
* Related: [DD-013](../designs/DD-013-holding-sectors.md),
  [PRD-013](../prds/PRD-013-holding-sectors.md)

## Problem and trigger

An owner with 8 sector categories saw their badges, sector table headings and
allocation pie use only three colours (yellow, green, blue). Different sectors
shared a colour, and pie slices of the same colour sat side by side.

## Reproduction and diagnostic aids

The old `sectorColor` hashed each label into a 5-colour list. Hashing Yahoo's
standard sectors shows the collisions without running the app:

```bash
cd frontend
node -e 'const P=["blue","green","purple","yellow","red"];const c=l=>{let h=0;for(const ch of l.toLowerCase())h=(Math.imul(h,31)+ch.codePointAt(0))>>>0;return P[h%P.length]};for(const s of ["Technology","Financial Services","Consumer Defensive","Energy","Industrials","Healthcare"])console.log(s,c(s))'
```

Four sectors map to blue and two to green.

## Cause and evidence

`frontend/src/features/holdings/classification.ts` hashed the case-folded label
into `['var(--blue)', 'var(--green)', 'var(--purple)', 'var(--yellow)', 'var(--red)']`.
Five colours cannot keep eight sectors apart, and three of them also meant
something else: yellow is Needs review, blue is ETF, purple is Mutual fund.

## Solution

Sector colours are now assigned per portfolio, not hashed per label (owner
decisions, 2026-11-16):

* `sectorPalette.ts`: 30 colours per theme (dark, light, cyberpunk), ordered
  most-distinguishable first. They were picked by farthest-point selection in
  OKLab, inside each theme's lightness band, at >= 3:1 contrast on the card
  surface, and away from the status colours. Each slot carries its OKLCH hue.
* `sectorColors.ts`: `sectorColorsByCurrency` assigns colours per currency, in
  pie order (largest slice first). Each sector takes the earliest unused slot
  whose hue is at least 40 degrees from its pie neighbours. The check includes
  the wrap-around and the fixed-colour ETF, Mutual fund and Needs review slices.
  Sectors without a slice follow alphabetically.
* `DashboardPage` computes the map once from the whole portfolio and passes it
  to the tables (a context feeds the badges) and to the pie. Search and view
  filters therefore never repaint sectors. Colours may change between loads as
  the portfolio changes; that is accepted.

Measured limits, from the dataviz palette validator: the worst all-pairs
OKLab Delta E x100 over the first 8 slots is 15.6 (dark), 13.1 (light) and
17.2 (cyberpunk). Over all 30 it falls to 8.4, 6.7 and 8.9. Colour-blind
separation fails from about 8 hues in any palette. Every dot therefore keeps
its text label, as PRD-013 already requires.

## Verification

* `npx vitest run src/features/holdings`: the new `sectorColors.test.ts` covers
  8 sectors getting 8 colours, uniqueness up to 30, the largest slice getting
  slot 1, 200 random portfolios with no same-family neighbours (wrap and status
  slices included), per-currency scope, case-insensitive labels and theme
  selection. Render tests check that table badges, sector headings and pie
  legend dots use the map. The full frontend suite passes.
* A local stack screenshot of a throwaway portfolio (9 Yahoo sectors plus a
  Needs review ETF) in the dark and light themes showed 9 distinct slice
  colours, no adjacent pinks or greens, and tables matching the pie. The
  throwaway user and its data were deleted afterwards.

### Review follow-ups (2026-11-17)

* **Wrap-around with a fixed-colour last slice.** In cyberpunk, a pie of
  `[sector, sector, Needs review]` gave the first sector 136° next to Needs
  review's 101°: 35°, under the 40° rule. The wrap check only ran when the
  *last* slice was a sector. Each sector slice now checks both circular
  neighbours whose hue is known. The property test, which had only run the
  dark theme (where slot 1 happens to sit 48° away), now runs every theme.
  Deterministic tests cover a fixed-colour slice first and last; both failed
  before the fix.
* **Unreadable pie tooltip in dark and cyberpunk.** The Sectors tooltip set
  `background: var(--bg-primary)` (near black) and no text colour, so Recharts
  drew black text (`rgb(0, 0, 0)` on `rgb(10, 12, 22)`, measured in Chrome). It
  now uses the shared `chartTooltipProps` (card surface, primary text) like the
  other charts. `SectorAllocationTooltip.test.tsx` pins the styles, and a
  Chrome check showed `rgb(238, 241, 248)` text on `rgb(23, 27, 46)`.

## Follow-up

None. If an owner ever exceeds 30 sectors, colours repeat from slot 1.
