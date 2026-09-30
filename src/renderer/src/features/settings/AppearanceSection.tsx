import type { AppSettings } from '@shared/settings'
import { unitPreset } from '@core/units'
import { useTheme } from '../../app/theme'
import { patchSettings, useSettings } from '../../stores/settings'
import { Segmented } from '../../ui/Segmented'
import { Field, Section } from '../../ui/form'

const THEMES: { value: AppSettings['appearance']; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follow macOS (System Settings → Appearance)' },
  { value: 'light', label: 'Light', hint: 'Bright surfaces, dark text' },
  { value: 'dark', label: 'Dark', hint: 'The pain cave' },
]

const UNITS: { value: AppSettings['units']; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
]

const SPEEDS: { value: AppSettings['speedUnit']; label: string }[] = [
  { value: 'kmh', label: 'km/h' },
  { value: 'mph', label: 'mph' },
]

const WEIGHTS: { value: AppSettings['weightUnit']; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
]

export function AppearanceSection() {
  const appearance = useSettings((s) => s.appearance)
  const units = useSettings((s) => s.units)
  const speedUnit = useSettings((s) => s.speedUnit)
  const weightUnit = useSettings((s) => s.weightUnit)
  const theme = useTheme()
  return (
    <Section title="Appearance" description="Charts, zones and the HUD switch with the theme. The mini-HUD always stays dark so it reads over video.">
      <Field label="Theme" hint={appearance === 'system' ? `Following macOS: ${theme} right now.` : undefined}>
        <Segmented ariaLabel="Theme" value={appearance} onChange={(v) => void patchSettings({ appearance: v })} options={THEMES} />
      </Field>
      <Field label="Units" hint="Distance, elevation and temperature. Changing this also sets speed and weight to match. Power stays in watts, and W/kg stays W/kg.">
        <Segmented ariaLabel="Units" value={units} onChange={(v) => void patchSettings({ units: v, ...unitPreset(v) })} options={UNITS} />
      </Field>
      <Field label="Speed" hint="On the HUD, routes and ride history. Click the unit on the speed tile to switch mid-ride.">
        <Segmented ariaLabel="Speed units" value={speedUnit} onChange={(v) => void patchSettings({ speedUnit: v })} options={SPEEDS} />
      </Field>
      <Field label="Weight" hint="Your weight and the bike's. You can also switch it next to the weight field.">
        <Segmented ariaLabel="Weight units" value={weightUnit} onChange={(v) => void patchSettings({ weightUnit: v })} options={WEIGHTS} />
      </Field>
    </Section>
  )
}
