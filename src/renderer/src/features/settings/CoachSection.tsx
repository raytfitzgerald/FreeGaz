import { useEffect, useState } from 'react'
import { Check, Drama, Volume2 } from 'lucide-react'
import { previewLine } from '@core/coach'
import { PACKS, PROFESSIONAL, packById, type CoachLine, type CoachTrigger } from '@core/persona'
import type { CoachPrefs, FuelingPrefs } from '@shared/settings'
import { listVoices, onVoicesChanged, resolveVoice, speak } from '../../audio/tts'
import { PersonaAvatar } from '../../coach/PersonaAvatar'
import { aiReady } from '../../coach/quips'
import { patchSettings, useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { Field, Section, Select, Slider, Switch } from '../../ui/form'
import { Segmented, type SegmentedOption } from '../../ui/Segmented'

const SPICE: readonly { label: string; hint: string }[] = [
  { label: 'Gentle', hint: 'Encouragement with a wink.' },
  { label: 'Cheeky', hint: 'Light teasing.' },
  { label: 'Snarky', hint: 'A proper roast, still friendly.' },
  { label: 'Savage', hint: 'No mercy for your excuses.' },
  { label: 'Unhinged', hint: 'Everything the persona has.' },
]
const SPICE_OPTIONS: SegmentedOption<string>[] = SPICE.map((s, i) => ({ value: String(i + 1), label: `${i + 1} ${s.label}`, hint: s.hint }))

const MOMENT: Partial<Record<CoachTrigger, string>> = {
  segment_start: 'Interval start',
  countdown_10s: '10-second countdown',
  halfway: 'Halfway',
  last_minute: 'Last minute',
  under_target: 'Under target',
  cadence_sag: 'Cadence sagging',
  segment_end_success: 'Interval done',
  segment_end_failed: 'Interval missed',
  pr: 'New record',
  ride_start: 'Ride start',
  workout_complete: 'Workout done',
  idle_banter: 'Banter',
}

export function CoachSection() {
  const c = useSettings((s) => s.coach)
  const fuel = useSettings((s) => s.fueling)
  const set = (patch: Partial<CoachPrefs>) => void patchSettings({ coach: { ...c, ...patch } })
  const setFuel = (patch: Partial<FuelingPrefs>) => void patchSettings({ fueling: { ...fuel, ...patch } })

  const [voices, setVoices] = useState(() => listVoices())
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), [])

  // "Use AI" only makes sense once a provider is set up (Settings → AI)
  const [ai, setAi] = useState(false)
  useEffect(() => {
    let live = true
    void aiReady().then((ok) => {
      if (live) setAi(ok)
    })
    return () => {
      live = false
    }
  }, [])

  const [sample, setSample] = useState<{ personaId: string; line: CoachLine | null } | null>(null)

  const persona = packById(c.personaId) ?? PROFESSIONAL
  const meta = persona.meta
  const personaVoice = resolveVoice(voices, null, meta.voiceHint)
  const shown = sample?.personaId === meta.id ? sample : null
  const spice = SPICE[c.spice - 1] ?? SPICE[2]!

  const preview = () => {
    const line = previewLine(persona, { spice: c.spice, profanity: c.profanity })
    setSample({ personaId: meta.id, line })
    if (line) speak(line.speech, { prefs: c, hint: meta.voiceHint, interrupt: true })
  }

  return (
    <>
      <Section title="Coach" description="Who talks to you during rides, and how hard they roast you. The canned lines work offline. Body, weight and health are never joke material, and signs of distress switch any persona to calm, plain support.">
        <Field label="Coach on">
          <Switch checked={c.enabled} onChange={(v) => set({ enabled: v })} label={c.enabled ? 'Talking' : 'Silent'} />
        </Field>
        <Field label="Persona">
          {/* columns follow the space the field has, not the window */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2" role="group" aria-label="Persona">
            {PACKS.map((p) => {
              const selected = p.meta.id === meta.id
              return (
                <button
                  key={p.meta.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set({ personaId: p.meta.id })}
                  data-testid={`persona-${p.meta.id}`}
                  className={cn(
                    'no-drag flex min-w-0 items-start gap-3 rounded-xl border px-3 pb-3 pt-2.5 text-left transition-colors',
                    selected ? 'border-accent bg-accent/10' : 'border-line bg-panel-2 hover:border-line-strong',
                  )}
                >
                  <PersonaAvatar persona={p.meta} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      {p.meta.name}
                      {selected && <Check className="size-3.5 text-accent" aria-label="Selected" />}
                    </div>
                    <div className="mt-0.5 text-xs leading-snug text-ink-dim">{p.meta.tagline}</div>
                    {p.meta.parody && p.meta.disclaimer && <div className="mt-1.5 text-[11px] leading-snug text-ink-faint">{p.meta.disclaimer}</div>}
                  </div>
                </button>
              )
            })}
          </div>
          {meta.parody && meta.disclaimer && (
            <div role="note" data-testid="parody-disclaimer" className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/50 bg-warn/10 px-3.5 py-2.5 text-sm font-medium text-ink">
              <Drama className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <span>{meta.disclaimer}</span>
            </div>
          )}
        </Field>
        <Field label="Sample" hint="A line from a typical moment of a ride, at your spice level.">
          <div className="flex items-center gap-3">
            <PersonaAvatar persona={meta} size="lg" />
            <div className="min-w-0">
              <div className="font-semibold">{meta.name}</div>
              <div className="text-xs text-ink-dim">Voice: {c.voiceName ?? personaVoice?.name ?? 'system default'}</div>
            </div>
            <Button size="sm" className="ml-auto" onClick={preview} data-testid="coach-preview">
              <Volume2 className="size-3.5" /> Hear a sample
            </Button>
          </div>
          {shown?.line && (
            <figure className="mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3" data-testid="coach-sample">
              <blockquote className="text-sm leading-relaxed">“{shown.line.text}”</blockquote>
              <figcaption className="mt-1 text-xs text-ink-faint">{MOMENT[shown.line.trigger] ?? shown.line.trigger}</figcaption>
            </figure>
          )}
          {shown && !shown.line && <div className="mt-3 text-xs text-ink-faint">Nothing fits this spice level. Try another one.</div>}
        </Field>
        <Field label="Spice" hint={persona === PROFESSIONAL ? 'Professional ignores spice: always straight cues.' : spice.hint}>
          <Segmented ariaLabel="Spice level" className="flex-wrap" value={String(c.spice)} options={SPICE_OPTIONS} onChange={(v) => set({ spice: Number(v) })} />
        </Field>
        <Field label="Profanity" hint={meta.parody ? 'Mild words only, never slurs or strong language. The parody never swears either way.' : 'Mild words only (damn, hell). Never slurs or strong language.'}>
          <Switch checked={c.profanity} onChange={(v) => set({ profanity: v })} label={c.profanity ? 'Mild words allowed' : 'Clean'} />
        </Field>
        {ai && (
          <Field label="Use AI for fresh lines" hint="At the start of each ride, asks your AI provider for new lines in this persona's style. Every line passes the same filters as the canned ones; if the AI is slow or says no, the canned lines carry the ride.">
            <Switch checked={c.useAi} onChange={(v) => set({ useAi: v })} label={c.useAi ? 'On' : 'Off'} />
          </Field>
        )}
      </Section>

      <Section title="Voice" description="Spoken with your Mac's built-in voices; nothing leaves this Mac. Press C during a ride to mute. Safety prompts still come through.">
        <Field label="Speak lines">
          <Switch checked={c.voice} onChange={(v) => set({ voice: v })} label={c.voice ? 'On' : 'Text only'} />
        </Field>
        <Field label="Voice" hint={`${meta.name} picks its favourite from the voices on this Mac unless you choose one.`}>
          <div className="flex items-center gap-2">
            <Select aria-label="Voice" className="min-w-0 max-w-sm flex-1" value={c.voiceName ?? ''} onChange={(e) => set({ voiceName: e.target.value || null })}>
              <option value="">Persona default{personaVoice ? ` (${personaVoice.name})` : ''}</option>
              {c.voiceName && !voices.some((v) => v.name === c.voiceName) && <option value={c.voiceName}>{c.voiceName} (not installed)</option>}
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={preview}>
              <Volume2 className="size-3.5" /> Test
            </Button>
          </div>
          {voices.length === 0 && <div className="mt-2 text-xs text-ink-faint">No voices listed yet; macOS loads them on first use.</div>}
        </Field>
        <Field label="Speed">
          <Slider ariaLabel="Speech rate" value={c.rate} min={0.6} max={1.6} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ rate: v })} />
        </Field>
        <Field label="Volume">
          <Slider ariaLabel="Speech volume" value={c.volume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => set({ volume: v })} />
        </Field>
      </Section>

      <Section title="Fuel and drink reminders" description="Said by your coach, in easy moments only: never in the middle of a hard effort or in the last five minutes.">
        <Field label="Reminders">
          <Switch checked={fuel.enabled} onChange={(v) => setFuel({ enabled: v })} label={fuel.enabled ? 'On' : 'Off'} />
        </Field>
        <Field label="Carbs per hour" hint="For rides planned longer than an hour: one reminder per 20 g, every 15 to 40 minutes.">
          <Slider ariaLabel="Carbs per hour" value={fuel.carbsPerHourG} min={0} max={120} step={5} format={(v) => (v === 0 ? 'off' : `${v} g/h`)} onChange={(v) => setFuel({ carbsPerHourG: v })} />
        </Field>
        <Field label="Drink every">
          <Slider ariaLabel="Drink every" value={fuel.drinkEveryMin} min={5} max={60} step={5} format={(v) => `${v} min`} onChange={(v) => setFuel({ drinkEveryMin: v })} />
        </Field>
      </Section>
    </>
  )
}
