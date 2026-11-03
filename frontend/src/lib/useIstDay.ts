// useIstDay: today's IST calendar day as a React value that changes just
// after IST midnight — the browser twin of the server's istToday, for views
// whose data is as of the calendar day (the ledger investment delta,
// PD-052). History's trading day (08:00 IST cut-over) lives in
// useTradingClock instead.
import { useEffect, useState } from 'react'
import { todayIST } from './formDates'

const IST_OFFSET_MS = 5.5 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000

// msUntilNextIstMidnight is the time from now to the next 00:00 IST.
export function msUntilNextIstMidnight(now: Date): number {
  const istMs = now.getTime() + IST_OFFSET_MS
  return DAY_MS - (((istMs % DAY_MS) + DAY_MS) % DAY_MS)
}

export function useIstDay(): string {
  const [day, setDay] = useState(() => todayIST())
  useEffect(() => {
    // A second past midnight, so todayIST already reads the new day.
    const timer = setTimeout(() => setDay(todayIST()), msUntilNextIstMidnight(new Date()) + 1000)
    return () => clearTimeout(timer)
  }, [day])
  return day
}
