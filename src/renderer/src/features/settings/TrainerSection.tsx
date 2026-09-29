import type { TrainerPrefs } from '@shared/settings'
import { patchSettings, useSettings } from '../../stores/settings'
import { Field, NumberInput, Section, Slider, Switch } from '../../ui/form'

export function TrainerSection() {
  const t = useSettings((s) => s.trainer)
  const set = (patch: Partial<TrainerPrefs>) => void patchSettings({ trainer: { ...t, ...patch } })

  return (
    <>
      <Section title="Gradient feel (SIM mode)" description="Like FulGaz's slope scaling: changes how hard hills feel, never your speed. Zwift's default is roughly 50 % up and 25 % down.">
        <Field label="Uphill" hint="100 % = the real gradient.">
          <Slider ariaLabel="Uphill scaling" value={t.uphillPct} min={0} max={150} step={5} format={(v) => `${v} %`} onChange={(v) => set({ uphillPct: v })} />
        </Field>
        <Field label="Downhill" hint="Lower keeps descents from spinning you out.">
          <Slider ariaLabel="Downhill scaling" value={t.downhillPct} min={0} max={150} step={5} format={(v) => `${v} %`} onChange={(v) => set({ downhillPct: v })} />
        </Field>
        <Field label="Grade limit" hint="Caps what the trainer is asked to simulate. Lower it if your wheel slips.">
          <Slider ariaLabel="Grade limit" value={t.gradeLimitPct} min={2} max={25} step={1} format={(v) => `±${v} %`} onChange={(v) => set({ gradeLimitPct: v })} />
        </Field>
      </Section>

      <Section title="ERG behaviour" description="Protections against the classic ERG annoyances.">
        <Field label="Soft start" hint="Ramp into the target after starting, resuming or recovering.">
          <Slider ariaLabel="Soft start" value={t.ergSoftStartS} min={0} max={30} step={1} format={(v) => (v === 0 ? 'off' : `${v} s`)} onChange={(v) => set({ ergSoftStartS: v })} />
        </Field>
        <Field label="Spiral-of-death guard" hint="If cadence collapses under a high ERG load, release resistance so you can spin back up.">
          <Switch checked={t.spiralGuard} onChange={(v) => set({ spiralGuard: v })} label={t.spiralGuard ? 'On' : 'Off'} />
        </Field>
        <Field label="Auto-pause" hint="Pause recording when you stop pedalling.">
          <Switch checked={t.autoPause} onChange={(v) => set({ autoPause: v })} label={t.autoPause ? 'On' : 'Off'} />
        </Field>
      </Section>

      <Section title="Virtual bike" description="Physics for virtual speed and distance on routes and free rides.">
        <Field label="Bike weight">
          <NumberInput value={t.bikeKg} onChange={(v) => v && set({ bikeKg: v })} unit="kg" min={4} max={30} step={0.1} />
        </Field>
        <Field label="CdA" hint="Aerodynamic drag area. 0.35 ≈ hoods, 0.30 ≈ drops, 0.25 ≈ TT bike.">
          <NumberInput value={t.cda} onChange={(v) => v && set({ cda: v })} unit="m²" min={0.15} max={0.7} step={0.01} />
        </Field>
        <Field label="Rolling resistance (Crr)" hint="0.0033 ≈ good road tyres on smooth tarmac.">
          <NumberInput value={t.crr} onChange={(v) => v && set({ crr: v })} min={0.001} max={0.02} step={0.0001} />
        </Field>
      </Section>
    </>
  )
}
