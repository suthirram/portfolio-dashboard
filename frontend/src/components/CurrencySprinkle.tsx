import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

// CurrencySprinkle scatters faint currency glyphs across the viewport as a
// decorative background layer behind every page. Rendered at runtime (not a
// baked SVG) so the glyphs pick up the active theme's tokens and the layout
// stays easy to extend. Placement is pseudo-random but seeded, so the
// arrangement is stable across renders and testable.

const SYMBOLS = ['₹', '€', '$', '£', '¥', '₩', '₣', '₿'] as const

// Colour tokens cycled through the glyphs; all theme-aware.
const TONES = [
  'var(--blue)', 'var(--green)', 'var(--purple)',
  'var(--yellow)', 'var(--red)', 'var(--text-muted)',
] as const

// mulberry32: tiny deterministic PRNG — same seed, same sprinkle.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SprinkleItem {
  sym: string
  left: number   // vw %
  top: number    // vh %
  size: number   // px
  rotate: number // deg
  opacity: number
  tone: string
  delay: number  // s — entrance-animation stagger, random so glyphs pop in scattered order
}

// Exported for tests: the deterministic layout behind the component.
export function sprinkleLayout(count: number, seed: number): SprinkleItem[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: count }, () => ({
    sym: SYMBOLS[Math.floor(rnd() * SYMBOLS.length)],
    left: rnd() * 96,
    top: rnd() * 94,
    size: 20 + rnd() * 44,
    rotate: -32 + rnd() * 64,
    opacity: 0.12 + rnd() * 0.16,
    tone: TONES[Math.floor(rnd() * TONES.length)],
    delay: rnd() * 0.9,
  }))
}

export default function CurrencySprinkle({ count = 28, seed = 46 }: { count?: number; seed?: number }) {
  const items = useMemo(() => sprinkleLayout(count, seed), [count, seed])
  // Entrance animation on every dashboard visit: bumping the key remounts
  // the layer, restarting the staggered pop-in. Other routes keep the last
  // key, so navigating between non-dashboard pages doesn't re-animate.
  const { pathname } = useLocation()
  const [dashVisit, setDashVisit] = useState(0)
  useEffect(() => {
    if (pathname === '/') setDashVisit(v => v + 1)
  }, [pathname])
  const animate = pathname === '/'
  return (
    <div key={dashVisit} className={animate ? 'currency-sprinkle sprinkle-animate' : 'currency-sprinkle'} aria-hidden="true">
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            left: `${it.left}%`,
            top: `${it.top}%`,
            fontSize: it.size,
            opacity: it.opacity,
            color: it.tone,
            transform: `rotate(${it.rotate}deg)`,
            animationDelay: `${it.delay}s`,
          }}
        >
          {it.sym}
        </span>
      ))}
    </div>
  )
}
