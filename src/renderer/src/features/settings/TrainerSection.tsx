import type { TrainerPrefs } from '@shared/settings'
import { displaySpeedKmh, displayWeightKg, speedUnit, storedSpeedKmh, storedWeightKg, weightUnit } from '@core/units'
import { patchSettings, settingsStore, useSettings } from '../../stores/settings'
import { Segmented } from '../../ui/Segmented'
import { Field, NumberInput, Section, Slider, Switch } from '../../ui/form'

export function TrainerSection() {
  const t = useSettings((s) => s.trainer)
  const units = useSettings((s) => s.units)
  const set = (patch: Partial<TrainerPrefs>) => void patchSettings({ trainer: { ...t, ...patch } })
  const bikeShown = Math.round(displayWeightKg(t.bikeKg, units) * 10) / 10

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
        <Field label="PowerMatch" hint="With power pedals connected, ERG is corrected so your pedals read the target instead of the trainer's own sensor.">
          <Switch checked={t.powerMatch} onChange={(v) => set({ powerMatch: v })} label={t.powerMatch ? 'On' : 'Off'} />
        </Field>
        <Field label="Auto-pause" hint="Pause recording when you stop pedalling.">
          <Switch checked={t.autoPause} onChange={(v) => set({ autoPause: v })} label={t.autoPause ? 'On' : 'Off'} />
        </Field>
      </Section>

      <FanSettings />

      <Section title="Virtual bike" description="Physics for virtual speed and distance on routes and free rides.">
        <Field label="Bike weight">
          <NumberInput
            value={bikeShown}
            onChange={(v) => v && set({ bikeKg: Math.round(storedWeightKg(v, units) * 100) / 100 })}
            unit={weightUnit(units)}
            min={units === 'imperial' ? 9 : 4}
            max={units === 'imperial' ? 66 : 30}
            step={0.1}
          />
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

const FAN_MODES = [
  { value: 'off' as const, label: 'Off' },
  { value: 'fixed' as const, label: 'Fixed' },
  { value: 'hr' as const, label: 'Heart rate' },
  { value: 'speed' as const, label: 'Speed' },
  { value: 'power' as const, label: 'Power' },
]

/** KICKR Headwind: which signal sets the fan speed. */
function FanSettings() {
  const fan = useSettings((s) => s.fan)
  const units = useSettings((s) => s.units)
  const set = (patch: Partial<typeof fan>) => void patchSettings({ fan: { ...settingsStore.getState().fan, ...patch } })
  const fanSpeed = Math.round(displaySpeedKmh(fan.speedFullKmh, units))
  return (
    <Section title="Fan (KICKR Headwind)" description="Connect the fan on the Devices page; FreeGaz sets its speed as you ride.">
      <Field label="Fan follows">
        <Segmented ariaLabel="Fan mode" value={fan.mode} onChange={(mode) => set({ mode })} options={FAN_MODES} />
      </Field>
      {fan.mode === 'fixed' && (
        <Field label="Speed">
          <Slider ariaLabel="Fixed fan speed" value={fan.fixedPct} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(fixedPct) => set({ fixedPct })} />
        </Field>
      )}
      {fan.mode === 'hr' && (
        <>
          <Field label="Starts at" hint="Below this heart rate the fan is off.">
            <Slider ariaLabel="Fan start heart rate" value={fan.hrStart} min={60} max={180} step={5} format={(v) => `${v} bpm`} onChange={(hrStart) => set({ hrStart, hrFull: Math.max(fan.hrFull, hrStart + 10) })} />
          </Field>
          <Field label="Full speed at">
            <Slider ariaLabel="Fan full-speed heart rate" value={fan.hrFull} min={90} max={210} step={5} format={(v) => `${v} bpm`} onChange={(hrFull) => set({ hrFull: Math.max(hrFull, fan.hrStart + 10) })} />
          </Field>
        </>
      )}
      {fan.mode === 'speed' && (
        <Field label="Full speed at" hint="Virtual speed on routes, trainer speed otherwise.">
          <Slider
            ariaLabel="Fan full-speed road speed"
            value={fanSpeed}
            min={units === 'imperial' ? 10 : 15}
            max={units === 'imperial' ? 40 : 60}
            step={1}
            format={(v) => `${v} ${speedUnit(units)}`}
            onChange={(v) => set({ speedFullKmh: Math.round(storedSpeedKmh(v, units)) })}
          />
        </Field>
      )}
      {fan.mode === 'power' && (
        <Field label="Full speed at" hint="3-second power as a share of your FTP.">
          <Slider ariaLabel="Fan full-speed power" value={Math.round(fan.powerFull * 100)} min={60} max={200} step={5} format={(v) => `${v} % FTP`} onChange={(v) => set({ powerFull: v / 100 })} />
        </Field>
      )}
    </Section>
  )
}
