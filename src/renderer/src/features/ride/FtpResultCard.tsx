import { Trophy, X } from 'lucide-react'
import { getRuntime } from '../../runtime/composition'
import { rideStore, useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'

/** After an FTP test: the result, whether it was saved, and undo / confirm. */
export function FtpResultCard() {
  const t = useRide((s) => s.ftpTest)
  if (!t) return null
  const { decision, result } = t
  const prev = t.previousFtpW
  const delta = prev !== null ? decision.newFtpW - prev : null
  const saved = t.savedEntryId !== null
  return (
    <div className="rounded-2xl border border-accent/50 bg-accent/5 px-5 py-4" data-testid="ftp-result">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4 text-accent" /> {t.testName}
        </div>
        <Button size="iconSm" variant="ghost" aria-label="Dismiss" onClick={() => rideStore.setState({ ftpTest: null })}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular font-display text-5xl font-bold" data-testid="ftp-result-value">
          {decision.newFtpW} W
        </span>
        {delta !== null && (
          <span className="tabular text-sm text-ink-dim">
            {delta >= 0 ? '+' : ''}
            {delta} W vs {prev} W
          </span>
        )}
        <span className="text-sm text-ink-dim">{result.basis}</span>
      </div>
      {decision.reasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-ink-dim">
          {decision.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {saved ? (
          <>
            <span className="text-good">Saved as your FTP. Zones and workouts now use {decision.newFtpW} W.</span>
            <Button size="sm" variant="ghost" onClick={() => void getRuntime().rides.undoFtpTest()}>
              Undo
            </Button>
          </>
        ) : decision.action === 'none' ? (
          <span className="text-ink-dim">Your FTP was not changed.</span>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => void getRuntime().rides.acceptFtpTest()} data-testid="accept-ftp">
              Use {decision.newFtpW} W as my FTP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => rideStore.setState({ ftpTest: null })}>
              Keep {prev ?? 'my current'} {prev !== null ? 'W' : 'FTP'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
