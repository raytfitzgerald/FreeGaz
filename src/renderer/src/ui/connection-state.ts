import type { ConnectionState } from '@core/devices/types'

export const STATE_LABEL: Record<ConnectionState | 'none', string> = {
  idle: 'Idle',
  none: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  failed: 'Failed',
}
