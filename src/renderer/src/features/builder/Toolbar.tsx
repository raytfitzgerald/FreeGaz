import { ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight, CopyPlus, Redo2, Trash2, Undo2, type LucideIcon } from 'lucide-react'
import { Button } from '../../ui/Button'
import { SHORTCUTS, type BuilderCommand } from './keys'

export interface ToolbarState {
  count: number
  selected: number | null
  canUndo: boolean
  canRedo: boolean
}

const BUTTONS: { cmd: BuilderCommand; label: string; icon: LucideIcon; enabled: (s: ToolbarState) => boolean }[] = [
  { cmd: 'prev', label: 'Select previous block', icon: ChevronLeft, enabled: (s) => s.count > 0 && s.selected !== 0 },
  { cmd: 'next', label: 'Select next block', icon: ChevronRight, enabled: (s) => s.count > 0 && s.selected !== s.count - 1 },
  { cmd: 'moveLeft', label: 'Move block left', icon: ArrowLeftToLine, enabled: (s) => s.selected !== null && s.selected > 0 },
  { cmd: 'moveRight', label: 'Move block right', icon: ArrowRightToLine, enabled: (s) => s.selected !== null && s.selected < s.count - 1 },
  { cmd: 'duplicate', label: 'Duplicate block', icon: CopyPlus, enabled: (s) => s.selected !== null },
  { cmd: 'delete', label: 'Delete block', icon: Trash2, enabled: (s) => s.selected !== null },
  { cmd: 'undo', label: 'Undo', icon: Undo2, enabled: (s) => s.canUndo },
  { cmd: 'redo', label: 'Redo', icon: Redo2, enabled: (s) => s.canRedo },
]

/** Selection, arrangement and history buttons; each mirrors a keyboard shortcut. */
export function Toolbar({ state, onCommand }: { state: ToolbarState; onCommand: (cmd: BuilderCommand) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Edit blocks">
      {BUTTONS.map(({ cmd, label, icon: Icon, enabled }, i) => (
        <span key={cmd} className="flex items-center">
          {(i === 2 || i === 4 || i === 6) && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
          <Button
            size="iconSm"
            variant="ghost"
            title={`${label} (${SHORTCUTS[cmd]})`}
            aria-label={label}
            aria-keyshortcuts={SHORTCUTS[cmd]}
            disabled={!enabled(state)}
            onClick={() => onCommand(cmd)}
            data-testid={`builder-${cmd}`}
          >
            <Icon className="size-4" />
          </Button>
        </span>
      ))}
    </div>
  )
}
