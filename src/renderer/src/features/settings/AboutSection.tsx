import { useEffect, useState } from 'react'
import type { InvokeRes } from '@shared/ipc/contract'
import { Wordmark } from '../../brand/Wordmark'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { openBugReport } from '../support/open'
import { Field, Section } from '../../ui/form'

export function AboutSection() {
  const [info, setInfo] = useState<InvokeRes<'app.info'> | null>(null)
  useEffect(() => {
    void bridge().invoke('app.info', {}).then(setInfo)
  }, [])
  return (
    <Section title="About FreeGaz" description="A personal, open-source indoor cycling trainer. MIT licensed.">
      <div className="pb-4 pt-1">
        <Wordmark className="h-14 w-auto text-ink" />
      </div>
      <Field label="Version">
        <div className="pt-2 text-sm">{info ? `${info.version} · Electron ${info.electron} · Chrome ${info.chrome} · Node ${info.node}` : '…'}</div>
      </Field>
      <Field label="Your data">
        <div className="pt-2 text-sm text-ink-dim">
          App data: <code className="text-xs">{info?.userData}</code>
          <br />
          Ride files: <code className="text-xs">{info?.documents}/FreeGaz/Rides</code>
        </div>
      </Field>
      <Field label="Source">
        <button type="button" className="pt-2 text-sm text-accent underline" onClick={() => void bridge().invoke('files.openUrl', { url: 'https://github.com/raytfitzgerald/FreeGaz' })}>
          github.com/raytfitzgerald/FreeGaz
        </button>
      </Field>
      <Field label="Found a bug?" hint="Opens a pre-filled GitHub issue, so it reaches the developer with the details that help.">
        <Button size="sm" onClick={openBugReport} data-testid="about-report-bug">
          Report a bug
        </Button>
      </Field>
      <Field label="Type">
        <div className="pt-2 text-sm text-ink-dim">
          Saira (the Saira Project Authors) and Atkinson Hyperlegible Next (the Atkinson Hyperlegible Next Project Authors), both under the SIL Open Font License 1.1.
        </div>
      </Field>
    </Section>
  )
}
