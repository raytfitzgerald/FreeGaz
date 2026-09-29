import { describe, expect, it } from 'vitest'
import { parseBuilderSearch } from './search'

describe('builder search params', () => {
  it('keeps a workout id and drops anything else', () => {
    expect(parseBuilderSearch({ id: 'user:1b2c' })).toEqual({ id: 'user:1b2c' })
    expect(parseBuilderSearch({ id: 42 })).toEqual({ id: '42' })
    expect(parseBuilderSearch({})).toEqual({})
    expect(parseBuilderSearch({ id: '  ' })).toEqual({})
    expect(parseBuilderSearch({ id: { nested: true }, other: 'x' })).toEqual({})
  })
})
