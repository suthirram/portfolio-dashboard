// formatRate renders an annualized rate sent as a fraction (0.12 = 12%) as a
// percentage, "—" when the backend found no rate. Shared by the gold
// metrics panel and the stock XIRR (PD-055) so both read alike.
export const formatRate = (rate: number | null | undefined) =>
  rate == null ? '—' : `${(rate * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

// rateTone is the pos/neg/neutral class for a rate; '' when there is none.
export const rateTone = (rate: number | null | undefined): 'pos' | 'neg' | 'neutral' | '' =>
  rate == null ? '' : rate > 0 ? 'pos' : rate < 0 ? 'neg' : 'neutral'
