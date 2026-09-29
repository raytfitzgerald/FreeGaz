import type { ReactNode } from 'react'
import { AlertTriangle, CircleAlert, MousePointerClick } from 'lucide-react'
import type { WorkoutIssue } from '@core/workout/validate'
import { withDuration, withPower, type DurationField, type PowerField } from '@core/workout/edit'
import type { CadenceTarget, IntervalPart, IntervalsSegment, PowerTarget, RampSegment, Segment } from '@core/workout/model'
import { Field, Input, Select, Switch } from '../../ui/form'
import { zoneIndexForFraction, zoneVar, POWER_ZONE_LABELS } from '../../ui/zones'
import { kindLabel, pct, segmentSummary } from './blocks'
import { CommitInput } from './CommitInput'
import {
  formatCadenceInput,
  formatDurationInput,
  formatPercentInput,
  formatWattsInput,
  parseCadenceInput,
  parseDurationInput,
  parsePercentInput,
  parseRepeatInput,
  parseWattsInput,
  withOptional,
} from './fields'
import { TextEvents } from './TextEvents'

export interface InspectorProps {
  segment: Segment | undefined
  index: number | null
  count: number
  ftpW: number
  /** Issues for this segment (from workoutIssues). */
  issues: WorkoutIssue[]
  onChange: (next: Segment, group?: string) => void
}

/** Edits the selected segment. Keyed by selection, so half-typed fields never leak to another block. */
export function Inspector({ segment, index, count, ftpW, issues, onChange }: InspectorProps) {
  if (!segment || index === null) {
    return (
      <div className="flex items-start gap-3 px-4 py-6 text-sm text-ink-dim" data-testid="inspector-empty">
        <MousePointerClick className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
        {count === 0 ? 'Add a block from the palette to start. Its settings show up here.' : 'Select a block on the canvas (or press ← →) to edit it here.'}
      </div>
    )
  }
  return <SegmentInspector key={`${index}:${segment.kind}`} seg={segment} index={index} count={count} ftpW={ftpW} issues={issues} onChange={onChange} />
}

function SegmentInspector({ seg, index, count, ftpW, issues, onChange }: { seg: Segment; index: number; count: number; ftpW: number; issues: WorkoutIssue[]; onChange: InspectorProps['onChange'] }) {
  const power = (field: PowerField) => (v: number, stepping: boolean) => onChange(withPower(seg, field, v), stepping ? `nudge:power:${field}` : undefined)
  const duration = (field: DurationField) => (v: number, stepping: boolean) => onChange(withDuration(seg, field, v), stepping ? `nudge:duration:${field}` : undefined)
  const swatch = headerSwatch(seg, ftpW)

  return (
    <div className="space-y-1 px-4 pb-4 pt-3" data-testid="inspector">
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: swatch }} aria-hidden />
            <span data-testid="inspector-kind">{kindLabel(seg)}</span>
            {seg.kind === 'steady' && <span className="text-sm font-normal text-ink-dim">· {POWER_ZONE_LABELS[zoneIndexForFraction(frac(seg.power, ftpW))]}</span>}
          </div>
          <div className="tabular mt-0.5 text-xs text-ink-dim">{segmentSummary(seg, ftpW)}</div>
        </div>
        <span className="tabular shrink-0 pt-1 text-[11px] text-ink-faint">
          Block {index + 1} of {count}
        </span>
      </div>

      {seg.kind === 'steady' && (
        <>
          <PowerRow label="Power" target={seg.power} ftpW={ftpW} onCommit={power('power')} testId="inspector-power" />
          <DurationRow value={seg.durationS} onCommit={duration('duration')} />
        </>
      )}

      {seg.kind === 'ramp' && (
        <>
          <Row label="Type">
            <Select value={seg.role} onChange={(e) => onChange({ ...seg, role: e.target.value as RampSegment['role'] })} aria-label="Ramp type" className="h-9 w-full">
              <option value="warmup">Warm-up</option>
              <option value="ramp">Ramp</option>
              <option value="cooldown">Cool-down</option>
            </Select>
          </Row>
          <PowerRow label="From" target={seg.from} ftpW={ftpW} onCommit={power('from')} testId="inspector-from" />
          <PowerRow label="To" target={seg.to} ftpW={ftpW} onCommit={power('to')} testId="inspector-to" />
          <DurationRow value={seg.durationS} onCommit={duration('duration')} />
        </>
      )}

      {seg.kind === 'intervals' && <IntervalsFields seg={seg} ftpW={ftpW} onChange={onChange} power={power} duration={duration} />}

      {(seg.kind === 'freeride' || seg.kind === 'maxeffort') && (
        <>
          <p className="pb-1 text-xs text-ink-dim">
            {seg.kind === 'freeride' ? 'ERG is off: the rider sets the effort. The stats count it as 60 % FTP.' : 'ERG is off for an all-out effort. The stats count it as 150 % FTP.'}
          </p>
          <DurationRow value={seg.durationS} onCommit={duration('duration')} />
        </>
      )}

      <Row label="Cadence" hint={seg.kind === 'intervals' ? 'Both halves, unless set for a half above' : undefined}>
        <CadenceInput value={seg.cadence} onCommit={(c) => onChange(withOptional(seg, 'cadence', c))} testId="inspector-cadence" />
      </Row>
      <Row label="Label">
        <Input
          value={seg.label ?? ''}
          onChange={(e) => onChange(withOptional(seg, 'label', e.target.value === '' ? undefined : e.target.value), 'label')}
          placeholder={seg.kind === 'intervals' ? 'e.g. Main set' : 'e.g. Settle in'}
          className="h-9"
          aria-label="Label"
          data-testid="inspector-label"
        />
      </Row>
      <Row label="Average">
        <Switch checked={seg.showAverage === true} onChange={(v) => onChange(withOptional(seg, 'showAverage', v ? true : undefined))} label="Show the running average" />
      </Row>
      {seg.kind === 'freeride' && (
        <Row label="Flat road">
          <Switch checked={seg.flatRoad ?? true} onChange={(v) => onChange({ ...seg, flatRoad: v })} label="Hold a flat 0 % grade" />
        </Row>
      )}

      <TextEvents seg={seg} onChange={onChange} />

      {issues.length > 0 && (
        <ul className="space-y-1 pt-2" aria-label="Problems with this block">
          {issues.map((i, k) => (
            <li key={k} className="flex items-start gap-2 text-xs text-ink">
              {i.severity === 'error' ? <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />}
              <span>
                <span className="font-medium">{i.severity === 'error' ? 'Error' : 'Warning'}:</span> {i.message.replace(/^Step \d+ \([^)]*\): /, '')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function IntervalsFields({
  seg,
  ftpW,
  onChange,
  power,
  duration,
}: {
  seg: IntervalsSegment
  ftpW: number
  onChange: InspectorProps['onChange']
  power: (f: PowerField) => (v: number, stepping: boolean) => void
  duration: (f: DurationField) => (v: number, stepping: boolean) => void
}) {
  const part = (which: 'on' | 'off', p: IntervalPart) => (
    <div className="rounded-xl border border-line bg-panel-2/60 px-3 py-1" data-testid={`inspector-${which}`}>
      <div className="pt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">{which === 'on' ? 'On (work)' : 'Off (recovery)'}</div>
      <PowerRow label="Power" target={p.power} ftpW={ftpW} onCommit={power(which)} testId={`inspector-${which}-power`} />
      <DurationRow value={p.durationS} onCommit={duration(which)} testId={`inspector-${which}-duration`} />
      <Row label="Cadence">
        <CadenceInput value={p.cadence} onCommit={(c) => onChange({ ...seg, [which]: withOptional(p, 'cadence', c) })} testId={`inspector-${which}-cadence`} />
      </Row>
      <Row label="Label">
        <Input
          value={p.label ?? ''}
          onChange={(e) => onChange({ ...seg, [which]: withOptional(p, 'label', e.target.value === '' ? undefined : e.target.value) }, `label:${which}`)}
          placeholder={which === 'on' ? 'e.g. Over' : 'e.g. Under'}
          className="h-9"
          aria-label={`${which === 'on' ? 'On' : 'Off'} label`}
        />
      </Row>
    </div>
  )
  return (
    <>
      <Row label="Repeat" hint={`Total ${formatDurationInput(seg.repeat * (seg.on.durationS + seg.off.durationS))}`}>
        <div className="flex items-center gap-2">
          <CommitInput
            value={seg.repeat}
            format={String}
            parse={parseRepeatInput}
            nudge={(v, dir, big) => parseRepeatInput(String(v + dir * (big ? 5 : 1)))}
            onCommit={(v, stepping) => onChange({ ...seg, repeat: v }, stepping ? 'nudge:repeat' : undefined)}
            className="w-20"
            aria-label="Repeat"
            data-testid="inspector-repeat"
          />
          <span className="text-sm text-ink-dim">×</span>
        </div>
      </Row>
      <div className="space-y-2 py-1">
        {part('on', seg.on)}
        {part('off', seg.off)}
      </div>
    </>
  )
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Field label={<span className="text-xs">{label}</span>} className="grid-cols-[76px_minmax(0,1fr)] items-center gap-3 py-1.5 [&>div:first-child]:pt-0">
      {children}
      {hint && <div className="mt-1 text-[11px] text-ink-faint">{hint}</div>}
    </Field>
  )
}

/** % FTP (or watts, for absolute targets from imports) with the other unit live beside it. */
function PowerRow({ label, target, ftpW, onCommit, testId }: { label: string; target: PowerTarget; ftpW: number; onCommit: (v: number, stepping: boolean) => void; testId: string }) {
  const ftp = target.unit === 'ftp'
  const hasRange = target.low !== undefined && target.high !== undefined
  return (
    <Row label={label} hint={hasRange ? `Range ${rangeText(target)}, moves with the target` : undefined}>
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <CommitInput
          value={target.value}
          format={ftp ? formatPercentInput : formatWattsInput}
          parse={ftp ? parsePercentInput : parseWattsInput}
          nudge={(v, dir, big) => Math.max(0, ftp ? Math.round((v + dir * (big ? 0.05 : 0.01)) * 1e4) / 1e4 : v + dir * (big ? 5 : 1))}
          onCommit={onCommit}
          className="w-16 shrink-0"
          aria-label={`${label} (${ftp ? '% FTP' : 'watts'})`}
          data-testid={testId}
        />
        <span className="text-sm text-ink-dim">{ftp ? '% FTP' : 'W'}</span>
        <span className="tabular ml-auto text-xs text-ink-faint" data-testid={`${testId}-other`}>
          = {ftp ? `${Math.round(target.value * ftpW)} W` : `${pct(target.value / ftpW)} FTP`}
        </span>
      </div>
    </Row>
  )
}

function DurationRow({ value, onCommit, testId = 'inspector-duration' }: { value: number; onCommit: (v: number, stepping: boolean) => void; testId?: string }) {
  return (
    <Row label="Duration">
      <CommitInput
        value={value}
        format={formatDurationInput}
        parse={(t) => parseDurationInput(t)}
        nudge={(v, dir, big) => Math.max(1, v + dir * (big ? 60 : 5))}
        onCommit={onCommit}
        className="w-24"
        placeholder="mm:ss"
        aria-label="Duration (mm:ss)"
        title="mm:ss, or 5m30s, 90s, 1h…"
        data-testid={testId}
      />
    </Row>
  )
}

function CadenceInput({ value, onCommit, testId }: { value: CadenceTarget | undefined; onCommit: (c: CadenceTarget | undefined) => void; testId: string }) {
  return (
    <div className="flex items-center gap-2">
      <CommitInput<CadenceTarget | undefined>
        value={value}
        format={formatCadenceInput}
        parse={parseCadenceInput}
        onCommit={(c) => onCommit(c)}
        className="w-24"
        placeholder="—"
        aria-label="Cadence (rpm or low-high)"
        title="One rpm (90) or a range (85-95); empty for none"
        data-testid={testId}
      />
      <span className="text-sm text-ink-dim">rpm</span>
    </div>
  )
}

function rangeText(p: PowerTarget): string {
  const f = (v: number) => (p.unit === 'ftp' ? formatPercentInput(v) : formatWattsInput(v))
  return `${f(p.low ?? 0)}–${f(p.high ?? 0)}${p.unit === 'ftp' ? ' %' : ' W'}`
}

function frac(p: PowerTarget, ftpW: number): number {
  return p.unit === 'ftp' ? p.value : p.value / ftpW
}

function headerSwatch(seg: Segment, ftpW: number): string {
  switch (seg.kind) {
    case 'steady':
      return zoneVar(zoneIndexForFraction(frac(seg.power, ftpW)))
    case 'ramp':
      return zoneVar(zoneIndexForFraction(Math.max(frac(seg.from, ftpW), frac(seg.to, ftpW))))
    case 'intervals':
      return zoneVar(zoneIndexForFraction(frac(seg.on.power, ftpW)))
    case 'freeride':
      return 'var(--color-line-strong)'
    case 'maxeffort':
      return zoneVar(6)
  }
}
