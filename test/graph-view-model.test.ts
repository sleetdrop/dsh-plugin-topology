import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampK, fitView, fitsViewport, formatZoom, MAX_K, MIN_K } from '../src/client/graph-view-model.ts'

describe('fitView', () => {
  it('fits a large graph inside the padded viewport', () => {
    const fit = fitView(1000, 800, 2000, 1600)
    assert.equal(fit.k, 0.47)
    assert.equal(fit.x, 30)
    assert.equal(fit.y, 24)
  })

  it('allows a small graph to grow to fill the viewport', () => {
    const fit = fitView(1000, 800, 200, 100)
    assert.equal(fit.k, 4.76)
    assert.equal(fit.x, 24)
    assert.equal(fit.y, 162)
  })

  it('never leaves the normal zoom range', () => {
    assert.equal(fitView(10, 10, 100, 100).k, MIN_K)
    assert.equal(fitView(100000, 100000, 1, 1).k, MAX_K)
  })
})

describe('clampK', () => {
  it('clamps both ends', () => {
    assert.equal(clampK(0), MIN_K)
    assert.equal(clampK(1), 1)
    assert.equal(clampK(1000), MAX_K)
  })
})

describe('formatZoom', () => {
  it('renders actual size and percentages', () => {
    assert.equal(formatZoom(1), '100%')
    assert.equal(formatZoom(0.5), '50%')
    assert.equal(formatZoom(0.05), '5%')
  })
})

describe('fitsViewport', () => {
  it('recognizes the fit and tolerates sub-pixel drift', () => {
    const fit = fitView(1000, 800, 2000, 1600)
    assert.equal(fitsViewport(fit, 1000, 800, 2000, 1600), true)
    assert.equal(fitsViewport({ ...fit, x: fit.x + 0.5 }, 1000, 800, 2000, 1600), true)
    assert.equal(fitsViewport({ ...fit, x: fit.x + 2 }, 1000, 800, 2000, 1600), false)
    assert.equal(fitsViewport({ ...fit, k: fit.k + 0.01 }, 1000, 800, 2000, 1600), false)
  })

  it('does not call actual size a fit on a large graph', () => {
    assert.equal(fitsViewport({ k: 1, x: 0, y: 0 }, 1000, 800, 2000, 1600), false)
  })
})
