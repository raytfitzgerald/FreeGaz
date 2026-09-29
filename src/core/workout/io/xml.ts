// A typed element tree over fast-xml-parser's preserveOrder output, and the
// reverse for export. preserveOrder keeps interleaved siblings (SteadyState,
// IntervalsT, SteadyState...) in document order.

import { XMLBuilder, XMLParser, XMLValidator, type X2jOptions } from 'fast-xml-parser'
import { WorkoutFormatError } from './errors'

export interface XmlAttr {
  /** Attribute name as written. */
  name: string
  value: string
}

export interface XmlElement {
  /** Tag name, lower-cased: workout files are matched case-insensitively. */
  name: string
  /** Tag name as written. */
  rawName: string
  /** Attributes keyed by lower-cased name (the first spelling wins). Values are trimmed. */
  attrs: Map<string, XmlAttr>
  children: XmlElement[]
  /** Text content directly inside this element, trimmed. */
  text: string
}

const PARSER_OPTIONS: X2jOptions = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  // Numeric character references (&#233;) are plain XML, but fast-xml-parser
  // v5 only decodes them in this mode. It also decodes HTML names like &nbsp;.
  htmlEntities: true,
  // Workout files never need DOCTYPE entities; keep expansion tiny.
  processEntities: { enabled: true, maxEntityCount: 20, maxEntitySize: 1000, maxTotalExpansions: 200, maxExpandedLength: 20_000 },
}

/** Parse XML into top-level elements (declaration, PIs and comments dropped). Throws on malformed input. */
export function parseXml(xml: string): XmlElement[] {
  const text = xml.replace(/^\uFEFF/, '')
  if (text.trim() === '') throw new WorkoutFormatError('The file is empty.')
  const check = XMLValidator.validate(text)
  if (check !== true) throw new WorkoutFormatError(`Not valid XML (line ${check.err.line}): ${check.err.msg}`)
  let parsed: unknown
  try {
    parsed = new XMLParser(PARSER_OPTIONS).parse(text)
  } catch (e) {
    // e.g. entity limits, or constructs the validator lets through.
    throw new WorkoutFormatError(`Could not read the XML: ${e instanceof Error ? e.message : String(e)}`)
  }
  return toElements(parsed)
}

function toElements(nodes: unknown): XmlElement[] {
  if (!Array.isArray(nodes)) return []
  const out: XmlElement[] = []
  for (const node of nodes) {
    if (!isRecord(node)) continue
    for (const [key, value] of Object.entries(node)) {
      if (key === ':@' || key === '#text' || key === '#comment' || key.startsWith('?') || key.startsWith('!')) continue
      out.push({ name: key.toLowerCase(), rawName: key, attrs: toAttrs(node[':@']), children: toElements(value), text: textOf(value) })
    }
  }
  return out
}

function toAttrs(raw: unknown): Map<string, XmlAttr> {
  const attrs = new Map<string, XmlAttr>()
  if (!isRecord(raw)) return attrs
  for (const [name, value] of Object.entries(raw)) {
    const key = name.toLowerCase()
    if (!attrs.has(key) && (typeof value === 'string' || typeof value === 'number')) {
      attrs.set(key, { name, value: String(value).trim() })
    }
  }
  return attrs
}

function textOf(children: unknown): string {
  if (!Array.isArray(children)) return ''
  const parts: string[] = []
  for (const c of children) {
    const t = isRecord(c) ? c['#text'] : undefined
    if (typeof t === 'string' || typeof t === 'number') parts.push(String(t))
  }
  return parts.join(' ').trim()
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// ---------------------------------------------------------------------------

/** An element to serialize. Attribute order is kept as given. */
export interface XmlNode {
  name: string
  attrs?: [string, string][]
  children?: XmlNode[]
  text?: string
}

/** Pretty-printed XML document (UTF-8 declaration, two-space indent, trailing newline). Escapes text and attributes. */
export function buildXml(root: XmlNode): string {
  const builder = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true,
    processEntities: true,
  })
  const decl = { '?xml': [{ '#text': '' }], ':@': { version: '1.0', encoding: 'UTF-8' } }
  const body = String(builder.build([decl, toOrdered(root)]))
  return `${body.trim()}\n`
}

function toOrdered(n: XmlNode): Record<string, unknown> {
  const children: unknown[] = n.text !== undefined && n.text !== '' ? [{ '#text': xmlSafe(n.text) }] : []
  for (const c of n.children ?? []) children.push(toOrdered(c))
  const node: Record<string, unknown> = { [n.name]: children }
  if (n.attrs && n.attrs.length > 0) {
    const attrs: Record<string, string> = {}
    for (const [k, v] of n.attrs) attrs[k] = xmlSafe(v)
    node[':@'] = attrs
  }
  return node
}

/** Drop characters XML 1.0 forbids outright (control codes other than tab/newline/CR). */
function xmlSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
}
