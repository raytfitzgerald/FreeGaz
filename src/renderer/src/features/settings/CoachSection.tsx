import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { PACKS } from '@core/persona'
import type { CoachPrefs } from '@shared/settings'
import { listVoices, onVoicesChanged, speak } from '../../audio/tts'
import { patchSettings, useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Field, Section, Select, Slider, Switch } from '../../ui/form'
import { cn } from '../../ui/cn'

const SPICE = ['', 'Gentle', 'Cheeky', 'Snarky', 'Savage', 'Unhinged']

export function CoachSection() {
  const c = useSettings((s) => s.coach)
  const set = (patch: Partial<CoachPrefs>) => void patchSettings({ coach: { ...c, ...patch } })
  const [voices, setVoices] = useState(() => listVoices())
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), [])

  const persona = PACKS.find((p) => p.meta.id === c.personaId) ?? PACKS[0]!

  const sample = () => {
    const line =
      persona.lines.find((l) => l.triggers.includes('under_target') && l.spice <= c.spice && (!l.profanity || c.profanity)) ??
      persona.lines.find((l) => l.spice <= c.spice) ??
      persona.lines[0]
    const text = (line?.text ?? 'Pedal harder.').replace(/\{targetW\}/g, '250').replace(/\{power\}/g, '231').replace(/\{[a-zA-Z]+\}/g, '42')
    speak(text, { prefs: c, hint: persona.meta.voiceHint, interrupt: true })
  }

  return (
    <>
      <Section title="Coach persona" description="Who's yelling at you. Canned lines work offline; with AI on, lines are tailored to each ride.">
        <Field label="Persona">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {PACKS.map((p) => (
              <button
                key={p.meta.id}
                type="button"
                onClick={() => set({ personaId: p.meta.id })}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition-colors',
                  p.meta.id === c.personaId ? 'border-accent bg-accent/10' : 'border-line bg-panel-2 hover:border-line-strong',
                )}
              >
                <div className="text-sm font-semibold">{p.meta.name}</div>
                <div className="mt-0.5 text-xs text-ink-dim">{p.meta.tagline}</div>
                {p.meta.parody && <div className="mt-1 text-[10px] uppercase tracking-wider text-warn">Parody</div>}
              </button>
            ))}
          </div>
          {persona.meta.disclaimer && <div className="mt-2 text-xs text-ink-faint">{persona.meta.disclaimer}</div>}
        </Field>
        <Field label="Spice" hint="How hard it roasts you.">
          <Slider ariaLabel="Spice level" value={c.spice} min={1} max={5} step={1} format={(v) => SPICE[v] ?? String(v)} onChange={(v) => set({ spice: v })} />
        </Field>
        <Field label="Profanity" hint="Mild words only. Never slurs.">
          <Switch checked={c.profanity} onChange={(v) => set({ profanity: v })} label={c.profanity ? 'Allowed' : 'Clean'} />
        </Field>
        <Field label="Coach on">
          <Switch checked={c.enabled} onChange={(v) => set({ enabled: v })} label={c.enabled ? 'Talking' : 'Silent'} />
        </Field>
      </Section>

      <Section title="Voice" description="Spoken with your Mac's built-in voices. Press C during a ride to mute.">
        <Field label="Speak lines">
          <Switch checked={c.voice} onChange={(v) => set({ voice: v })} label={c.voice ? 'On' : 'Text only'} />
        </Field>
        <Field label="Voice">
          <div className="flex items-center gap-2">
            <Select value={c.voiceName ?? ''} onChange={(e) => set({ voiceName: e.target.value || null })}>
              <option value="">Persona default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={sample}>
              <Volume2 className="size-3.5" /> Test
            </Button>
          </div>
        </Field>
        <Field label="Speed">
          <Slider ariaLabel="Speech rate" value={c.rate} min={0.6} max={1.6} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ rate: v })} />
        </Field>
        <Field label="Volume">
          <Slider ariaLabel="Speech volume" value={c.volume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => set({ volume: v })} />
        </Field>
        <Field label="AI lines" hint="Needs an AI provider (Settings → AI). Falls back to canned lines instantly if the AI is slow.">
          <Switch checked={c.useAi} onChange={(v) => set({ useAi: v })} label={c.useAi ? 'On' : 'Off'} />
        </Field>
      </Section>
    </>
  )
}
