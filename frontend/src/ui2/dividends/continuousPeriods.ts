// continuousPeriods turns the server's payment buckets (only periods with a
// payment) into an unbroken run from the first to the last period, filling
// the quiet ones with zero, so a time chart's spacing matches time.
// Periods are YYYY-MM (month) or YYYY (year).
export function continuousPeriods(
  buckets: ReadonlyArray<{ period: string; total: number }>,
  kind: 'month' | 'year',
): Array<{ period: string; total: number }> {
  if (buckets.length === 0) return []
  const totals = new Map(buckets.map(bucket => [bucket.period, bucket.total]))
  const sorted = [...totals.keys()].sort()
  const out: Array<{ period: string; total: number }> = []
  if (kind === 'year') {
    for (let year = Number(sorted[0]); year <= Number(sorted.at(-1)); year++) {
      out.push({ period: String(year), total: totals.get(String(year)) ?? 0 })
    }
    return out
  }
  const index = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1
  for (let month = index(sorted[0]); month <= index(sorted.at(-1)!); month++) {
    const period = `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`
    out.push({ period, total: totals.get(period) ?? 0 })
  }
  return out
}
