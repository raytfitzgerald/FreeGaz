import type { AppSettings } from '@shared/settings'
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

export function AppearanceSection() {
  const appearance = useSettings((s) => s.appearance)
  const units = useSettings((s) => s.units)
  const theme = useTheme()
  return (
    <Section title="Appearance" description="Charts, zones and the HUD switch with the theme. The mini-HUD always stays dark so it reads over video.">
      <Field label="Theme" hint={appearance === 'system' ? `Following macOS: ${theme} right now.` : undefined}>
        <Segmented ariaLabel="Theme" value={appearance} onChange={(v) => void patchSettings({ appearance: v })} options={THEMES} />
      </Field>
      <Field label="Units" hint="Distance, speed, elevation, weight and temperature. Power stays in watts, and W/kg stays W/kg.">
        <Segmented ariaLabel="Units" value={units} onChange={(v) => void patchSettings({ units: v })} options={UNITS} />
      </Field>
    </Section>
  )
}
