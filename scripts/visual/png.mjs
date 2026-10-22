/**
 * Tiny PNG reader for the visual probe: enough for Chrome screenshots
 * (8-bit RGB/RGBA, non-interlaced) — inflate, undo the per-row filters, and
 * expose a luminance grid. No dependencies, no decoding of exotic PNGs: if
 * Chrome ever changes its output shape the probe fails loudly instead of
 * silently measuring the wrong pixels.
 */

import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Decode a PNG buffer to `{ width, height, rgba }`.
 * @param {Buffer} buffer
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG')

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`)
  if (interlace !== 0) throw new Error('interlaced PNG is not supported')
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (channels === 0) throw new Error(`unsupported PNG color type ${colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const current = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let value = line[x]
      switch (filter) {
        case 0: break
        case 1: value = (value + left) & 0xff; break
        case 2: value = (value + up) & 0xff; break
        case 3: value = (value + ((left + up) >> 1)) & 0xff; break
        case 4: {
          const p = left + up - upLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - up)
          const pc = Math.abs(p - upLeft)
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
          value = (value + predictor) & 0xff
          break
        }
        default: throw new Error(`unsupported PNG filter ${filter}`)
      }
      current[x] = value
    }
    previous = current
  }

  return { width, height, channels, data: out }
}

/**
 * Reduce an image to a `cols`×`rows` grid of mean sRGB luma (0–255).
 * @param {{ width: number, height: number, channels: number, data: Buffer }} image
 */
export function lumaGrid(image, cols = 48, rows = 27) {
  const { width, height, channels, data } = image
  const grid = new Float64Array(cols * rows)
  const counts = new Float64Array(cols * rows)
  // Iterate every pixel; the images are small enough that this stays cheap
  // next to the PNG inflate itself.
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(cols - 1, Math.floor((x * cols) / width))
      const index = (y * width + x) * channels
      const luma = channels === 1
        ? data[index]
        : 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
      const cell = row * cols + col
      grid[cell] += luma
      counts[cell] += 1
    }
  }
  for (let cell = 0; cell < grid.length; cell += 1) grid[cell] /= counts[cell] || 1
  return { cols, rows, grid }
}

/** Mean luma of a grid. */
export function gridMean(grid) {
  let sum = 0
  for (const value of grid.grid) sum += value
  return sum / grid.grid.length
}

/** Share of cells whose luma differs by more than `threshold` between two grids. */
export function changedShare(a, b, threshold = 24) {
  let changed = 0
  for (let i = 0; i < a.grid.length; i += 1) {
    if (Math.abs(a.grid[i] - b.grid[i]) > threshold) changed += 1
  }
  return changed / a.grid.length
}

/** Mean absolute luma difference between two grids (0–255). */
export function gridDistance(a, b) {
  let sum = 0
  for (let i = 0; i < a.grid.length; i += 1) sum += Math.abs(a.grid[i] - b.grid[i])
  return sum / a.grid.length
}
