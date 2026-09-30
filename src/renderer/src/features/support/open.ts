// Opening the Report a bug form from anywhere (the sidebar, Settings → About).
import { createStore } from 'zustand'
import { formatDiagnostics } from '@core/support/bug-report'
import { collectDiagnostics } from '../../support/diagnostics'

export const bugReportStore = createStore<{ open: boolean; diagnostics: string | null }>(() => ({ open: false, diagnostics: null }))

/** Opens the form, with the diagnostics gathered as it opens. */
export function openBugReport(): void {
  bugReportStore.setState({ open: true, diagnostics: null })
  void collectDiagnostics()
    .then((d) => bugReportStore.setState({ diagnostics: formatDiagnostics(d) }))
    .catch(() => bugReportStore.setState({ diagnostics: 'Diagnostics unavailable.' }))
}

