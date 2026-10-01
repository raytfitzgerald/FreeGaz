import { Tabs } from 'radix-ui'
import { useSearch } from '@tanstack/react-router'
import { Bot, Database, Gauge, Info, Link2, MapPinned, Megaphone, Smartphone, SlidersHorizontal, SunMoon } from 'lucide-react'
import { PageHeader } from '../../ui/PageHeader'
import { AthleteSection } from './AthleteSection'
import { TrainerSection } from './TrainerSection'
import { CoachSection } from './CoachSection'
import { IntegrationsSection } from './IntegrationsSection'
import { AiSection } from './AiSection'
import { AppearanceSection } from './AppearanceSection'
import { RemoteSection } from './RemoteSection'
import { AboutSection } from './AboutSection'
import { DataSection } from './DataSection'
import { JourneysSection } from './JourneysSection'

const TABS = [
  { id: 'athlete', label: 'Athlete & FTP', icon: Gauge, el: <AthleteSection /> },
  { id: 'trainer', label: 'Trainer feel', icon: SlidersHorizontal, el: <TrainerSection /> },
  { id: 'coach', label: 'Coach', icon: Megaphone, el: <CoachSection /> },
  { id: 'integrations', label: 'Strava & sync', icon: Link2, el: <IntegrationsSection /> },
  { id: 'journeys', label: 'Journeys', icon: MapPinned, el: <JourneysSection /> },
  { id: 'ai', label: 'AI', icon: Bot, el: <AiSection /> },
  { id: 'remote', label: 'Remote & mini-HUD', icon: Smartphone, el: <RemoteSection /> },
  { id: 'appearance', label: 'Appearance', icon: SunMoon, el: <AppearanceSection /> },
  { id: 'data', label: 'Data & backup', icon: Database, el: <DataSection /> },
  { id: 'about', label: 'About', icon: Info, el: <AboutSection /> },
] as const

export function SettingsPage() {
  const { tab } = useSearch({ from: '/settings' })
  const initial = TABS.some((t) => t.id === tab) ? tab! : 'athlete'
  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 pb-12">
      <PageHeader title="Settings" subtitle={__FREEGAZ_WEB__ ? 'Everything is stored in this browser, on this device.' : 'Everything is stored on this Mac. Keys and tokens are encrypted with your macOS Keychain.'} />
      <Tabs.Root defaultValue={initial} orientation="vertical" className="flex flex-col gap-4 md:flex-row md:gap-6">
        <Tabs.List className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 md:mx-0 md:w-52 md:flex-col md:overflow-visible md:px-0" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="no-drag flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-ink-dim hover:bg-panel-2 hover:text-ink data-[state=active]:bg-panel-3 data-[state=active]:text-ink"
            >
              <Icon className="size-4" /> {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="min-w-0 flex-1">
          {TABS.map(({ id, el }) => (
            <Tabs.Content key={id} value={id} className="space-y-6 focus:outline-none">
              {el}
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </div>
  )
}
