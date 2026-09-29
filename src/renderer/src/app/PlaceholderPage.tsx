import { PageHeader } from '../ui/PageHeader'

export function PlaceholderPage({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mx-auto max-w-6xl px-8 pb-10">
      <PageHeader title={title} subtitle={blurb} />
      <div className="rounded-2xl border border-dashed border-line p-10 text-center text-ink-faint">
        Coming up in a later milestone.
      </div>
    </div>
  )
}
