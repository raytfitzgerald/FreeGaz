import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bike, Gauge, ListChecks, Mountain } from 'lucide-react'
import type { InvokeRes } from '@shared/ipc/contract'
import { PageHeader } from '../../ui/PageHeader'

const QUICK_START = [
  { to: '/ride', title: 'Just ride', text: 'ERG, level or slope. No plan, just watts.', icon: Bike },
  { to: '/workouts', title: 'Workouts', text: 'Structured intervals, scaled to your FTP.', icon: ListChecks },
  { to: '/ride', title: 'FTP test', text: 'The classic 20-minute test. Auto-saves your FTP.', icon: Gauge },
  { to: '/routes', title: 'Routes', text: 'Ride a GPX in SIM mode: Reactive or Steady.', icon: Mountain },
] as const

export function HomePage() {
  const [info, setInfo] = useState<InvokeRes<'app.info'> | null>(null)

  useEffect(() => {
    let alive = true
    void window.freegaz.invoke('app.info', {}).then((i) => {
      if (alive) setInfo(i)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-8 pb-10">
      <PageHeader title="Ready to suffer?" subtitle="Pick your poison. Everything is recorded locally, second by second." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {QUICK_START.map(({ to, title, text, icon: Icon }) => (
          <Link
            key={title}
            to={to}
            className="group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong hover:bg-panel-2"
          >
            <Icon className="mb-6 size-6 text-accent" aria-hidden />
            <div className="font-display text-lg font-semibold">{title}</div>
            <p className="mt-1 text-sm text-ink-dim">{text}</p>
          </Link>
        ))}
      </section>

      <footer className="mt-10 text-xs text-ink-faint" data-testid="app-info">
        {info ? `FreeGaz ${info.version} · Electron ${info.electron} · Chrome ${info.chrome}` : 'Loading...'}
      </footer>
    </div>
  )
}
