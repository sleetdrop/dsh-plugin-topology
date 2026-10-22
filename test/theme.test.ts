import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme } from '../src/client/theme.ts'

test('the resolved dark flag wins over everything else', () => {
  assert.equal(resolveTheme({ darkFlag: true, dataTheme: 'light', bodyBackground: 'rgb(255, 255, 255)' }), 'dark')
})

test('html[data-theme] is honoured when the flag is absent', () => {
  assert.equal(resolveTheme({ darkFlag: false, dataTheme: 'dark', bodyBackground: 'rgb(255, 255, 255)' }), 'dark')
  assert.equal(resolveTheme({ darkFlag: false, dataTheme: 'light', bodyBackground: 'rgb(0, 0, 0)' }), 'light')
})

test('a transparent body falls back to light instead of guessing dark', () => {
  // The desktop makes body transparent for vibrancy; the colour says nothing.
  assert.equal(resolveTheme({ darkFlag: false, dataTheme: null, bodyBackground: 'rgba(0, 0, 0, 0)' }), 'light')
})

test('a painted body background is the last resort', () => {
  assert.equal(resolveTheme({ darkFlag: false, dataTheme: null, bodyBackground: 'rgb(24, 25, 28)' }), 'dark')
  assert.equal(resolveTheme({ darkFlag: false, dataTheme: null, bodyBackground: 'rgb(255, 255, 255)' }), 'light')
})
