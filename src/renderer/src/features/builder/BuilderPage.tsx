import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { PageHeader } from '../../ui/PageHeader'
import { BuilderEditor } from './BuilderEditor'
import { openDoc, type OpenDoc } from './load'

/**
 * /builder and /builder?id=…: opens the workout for the URL (a new one
 * without an id; a copy for a read-only built-in) in a fresh editor.
 */
export function BuilderPage() {
  const { id } = useSearch({ from: '/builder' })
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  // The stored workout the editor has open. A save updates the URL to its id,
  // and that must not reopen it (which would drop the undo history).
  const openId = useRef<string | null>(null)

  useEffect(() => {
    if (id !== undefined && id === openId.current) return
    let live = true
    void openDoc(id).then((d) => {
      if (!live) return
      openId.current = d.stored ? d.workout.id : null
      setDoc(d)
    })
    return () => {
      live = false
    }
  }, [id])

  if (!doc) {
    return (
      <div className="mx-auto max-w-7xl px-4 md:px-8 pb-12">
        <PageHeader title="Workout builder" subtitle="Opening…" />
      </div>
    )
  }
  return (
    <BuilderEditor
      key={doc.key}
      doc={doc}
      urlId={id}
      onSaved={(savedId) => {
        openId.current = savedId
      }}
    />
  )
}
