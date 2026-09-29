import { Tabs } from 'radix-ui'
import { Bot, Database, Gauge, Info, Link2, Megaphone, Smartphone, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '../../ui/PageHeader'
import { AthleteSection } from './AthleteSection'
import { TrainerSection } from './TrainerSection'
import { CoachSection } from './CoachSection'
import { IntegrationsSection } from './IntegrationsSection'
import { AiSection } from './AiSection'
import { RemoteSection } from './RemoteSection'
import { AboutSection } from './AboutSection'
import { DataSection } from './DataSection'

const TABS = [
  { id: 'athlete', label: 'Athlete & FTP', icon: Gauge, el: <AthleteSection /> },
  { id: 'trainer', label: 'Trainer feel', icon: SlidersHorizontal, el: <TrainerSection /> },
  { id: 'coach', label: 'Coach', icon: Megaphone, el: <CoachSection /> },
  { id: 'integrations', label: 'Strava & sync', icon: Link2, el: <IntegrationsSection /> },
  { id: 'ai', label: 'AI', icon: Bot, el: <AiSection /> },
  { id: 'remote', label: 'Remote & mini-HUD', icon: Smartphone, el: <RemoteSection /> },
  { id: 'data', label: 'Data & backup', icon: Database, el: <DataSection /> },
  { id: 'about', label: 'About', icon: Info, el: <AboutSection /> },
] as const

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl px-8 pb-12">
      <PageHeader title="Settings" subtitle="Everything is stored on this Mac. Keys and tokens are encrypted with your macOS Keychain." />
      <Tabs.Root defaultValue="athlete" orientation="vertical" className="flex gap-6">
        <Tabs.List className="flex w-52 shrink-0 flex-col gap-1" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="no-drag flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-dim hover:bg-panel-2 hover:text-ink data-[state=active]:bg-panel-3 data-[state=active]:text-ink"
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
