const FLAGS: Record<string, string> = { INR: '🇮🇳', EUR: '🇪🇺' }

export function currencyFlag(currency: string): string {
  return FLAGS[currency] ?? ''
}

export function TransactionCurrency({ currency }: { currency: string }) {
  const flag = currencyFlag(currency)
  return <>{flag && <span aria-hidden="true">{flag} </span>}{currency}</>
}
