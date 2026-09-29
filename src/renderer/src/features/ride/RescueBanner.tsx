import { useEffect, useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { getRuntime } from '../../runtime/composition'
import { rideStore, useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'

const OFFER_MS = 30_000

/** Interval rescue: 5 % easier, a 30-s breather, or carry on. */
export function RescueBanner() {
  const rescue = useRide((s) => s.rescue)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!rescue) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [rescue])
  useEffect(() => {
    if (rescue && now - rescue.at > OFFER_MS) rideStore.setState({ rescue: null })
  }, [rescue, now])
  if (!rescue) return null
  const choose = (choice: 'easier' | 'rest' | 'dismiss') => getRuntime().rides.command({ type: 'rescue', choice })
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/50 bg-warn/10 px-5 py-3" role="alert" data-testid="rescue">
      <LifeBuoy className="size-5 shrink-0 text-warn" />
      <span className="text-sm font-medium">{rescue.message}</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" onClick={() => choose('easier')}>
          5 % easier
        </Button>
        <Button size="sm" onClick={() => choose('rest')}>
          30-s breather
        </Button>
        <Button size="sm" variant="ghost" onClick={() => choose('dismiss')}>
          I've got this
        </Button>
      </div>
    </div>
  )
}
