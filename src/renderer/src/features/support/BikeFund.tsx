import { useState } from 'react'
import { Bike, ExternalLink } from 'lucide-react'
import { BIKE_FUND_BLURB, BIKE_FUND_TITLE, bikeFundLinks, hasBikeFund } from '@core/support/bike-fund'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'

// "Contribute to the developer's bike fund": optional tip links, opened in the
// browser. Nothing is unlocked by tipping. Hidden until a handle is set in
// src/core/support/bike-fund.ts.

const links = bikeFundLinks()

/** One button per tip service. */
export function BikeFundButtons({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(({ service, label, url }) => (
        <Button key={service} size={size} onClick={() => void bridge().invoke('files.openUrl', { url })} data-testid={`bike-fund-${service}`}>
          {label} <ExternalLink className="size-3.5" aria-hidden />
        </Button>
      ))}
    </div>
  )
}

export function BikeFundDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={BIKE_FUND_TITLE} description={BIKE_FUND_BLURB}>
      <BikeFundButtons size="md" />
    </Dialog>
  )
}

/** The small sidebar link, under Report a bug. */
export function BikeFundLink() {
  const [open, setOpen] = useState(false)
  if (!hasBikeFund()) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-drag mx-2 -mt-2 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-faint hover:bg-panel-2 hover:text-ink"
        data-testid="bike-fund"
      >
        <Bike className="size-3.5" aria-hidden /> Bike fund
      </button>
      <BikeFundDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
