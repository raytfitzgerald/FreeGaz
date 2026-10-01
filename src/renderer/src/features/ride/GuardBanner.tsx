import { DEFAULT_CONTROLLER_SETTINGS } from '@core/control/trainer-controller'
import { useLive } from '../../stores/live'
import { cn } from '../../ui/cn'

/** What the trainer guard is doing right now: ERG released for low cadence, easing in, paused, or another app has control. */
export function GuardBanner() {
  const guard = useLive((f) => f.trainer.guard)
  const controlLost = useLive((f) => f.trainer.controlLost)
  if (controlLost) {
    return (
      <div className="rounded-2xl border border-bad/40 bg-bad/10 px-5 py-3 text-sm">
        Another app has control of your trainer. Close Zwift, the Wahoo app or any head unit paired as a controller.
      </div>
    )
  }
  if (guard === 'none') return null
  const text =
    guard === 'spiral'
      ? `Low cadence: ERG released so you can spin back up. It takes the load back smoothly once you hold ${DEFAULT_CONTROLLER_SETTINGS.spiralGuard.recoverCadenceRpm} rpm.`
      : guard === 'soft-start'
        ? 'Easing into the target…'
        : 'Paused: resistance released.'
  return <div className={cn('rounded-2xl border px-5 py-3 text-sm', guard === 'spiral' ? 'border-warn/40 bg-warn/10' : 'border-line bg-panel-2')}>{text}</div>
}
