// Derives a consistent, visually distinct color pair from the ticker symbol.
// Used by any UI_2.0 component that renders a holding's stock icon badge.
export function stockIconStyle(symbol: string): { background: string; color: string } {
  const ticker = (symbol ?? '').split('.')[0]
  let hash = 0
  for (const char of ticker.toUpperCase()) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return { background: `hsl(${hash},55%,92%)`, color: `hsl(${hash},60%,38%)` }
}
