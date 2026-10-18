/**
 * Locale parity tests: the English and Chinese dictionaries must stay in sync.
 *
 * Locale drift is silent in the browser (a missing key falls back to the key
 * name), so it belongs in CI rather than in a release checklist.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { en, zh } from '../src/client/locales.ts'

const placeholders = (value: string): string[] =>
  [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort()

describe('locales', () => {
  it('defines the same keys in en and zh', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  })

  it('has no empty message values', () => {
    for (const [locale, messages] of [['en', en], ['zh', zh]] as const) {
      for (const [key, value] of Object.entries(messages)) {
        assert.ok(value.trim() !== '', `${locale}.${key} is empty`)
      }
    }
  })

  it('keeps interpolation placeholders aligned', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), key)
    }
  })
})
