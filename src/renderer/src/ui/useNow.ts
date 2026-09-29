import { useEffect, useState } from 'react'

/** The current time, refreshed every `refreshMs` (render stays pure). */
export function useNow(refreshMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), refreshMs)
    return () => clearInterval(id)
  }, [refreshMs])
  return now
}
