import type { ConnectionState } from '@core/devices/types'
import { cn } from './cn'
import { STATE_LABEL } from './connection-state'

const COLORS: Record<ConnectionState | 'none', string> = {
  idle: 'bg-ink-faint',
  none: 'bg-ink-faint/50',
  connecting: 'bg-warn animate-pulse',
  connected: 'bg-good',
  reconnecting: 'bg-warn animate-pulse',
  failed: 'bg-bad',
}


export function StatusDot({ state, className }: { state: ConnectionState | 'none'; className?: string }) {
  return <span role="img" aria-label={STATE_LABEL[state]} className={cn('inline-block size-2 shrink-0 rounded-full', COLORS[state], className)} />
}
