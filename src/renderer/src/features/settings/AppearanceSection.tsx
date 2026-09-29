import type { AppSettings } from '@shared/settings'
import { useTheme } from '../../app/theme'
import { patchSettings, useSettings } from '../../stores/settings'
import { Segmented } from '../../ui/Segmented'
import { Field, Section } from '../../ui/form'

const OPTIONS: { value: AppSettings['appearance']; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follow macOS (System Settings → Appearance)' },
  { value: 'light', label: 'Light', hint: 'Bright surfaces, dark text' },
  { value: 'dark', label: 'Dark', hint: 'The pain cave' },
]

export function AppearanceSection() {
  const appearance = useSettings((s) => s.appearance)
  const theme = useTheme()
  return (
    <Section title="Appearance" description="Charts, zones and the HUD switch with the theme. The mini-HUD always stays dark so it reads over video.">
      <Field label="Theme" hint={appearance === 'system' ? `Following macOS: ${theme} right now.` : undefined}>
        <Segmented ariaLabel="Theme" value={appearance} onChange={(v) => void patchSettings({ appearance: v })} options={OPTIONS} />
      </Field>
    </Section>
  )
}
