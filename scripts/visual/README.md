# Visual probe

Zero-dependency browser automation for the topology page: it drives the real
client in a throwaway Chrome, records the composited output, and reports what
each interaction costs in frames, layers and DOM work. It exists because the
symptom this guards against — a one-frame flash of the whole window — cannot be
caught by unit tests or by reading a screenshot.

## Run it

The probe needs a live `dsh web` instance. A workspace-local `DSH_HOME` keeps the
profile and its state out of your real `~/.dsh`:

```sh
mkdir -p .e2e/home/profiles
cp -a ~/.dsh/profiles/pt-test .e2e/home/profiles/
ln -sfn ~/.dsh/profiles/node_modules .e2e/home/profiles/node_modules

pnpm build
DSH_HOME=$PWD/.e2e/home dsh --profile pt-test --no-open --port 0
# → dsh web: http://127.0.0.1:PORT/?token=…

node scripts/visual/flicker-probe.mjs 'http://127.0.0.1:PORT/?token=…' --out .e2e/flicker
```

It prints a per-phase table (`mut`, `layout`, `task`, `layers`) plus the largest
frame-to-frame changes, and writes `report.json` and any flagged frames to the
output directory. A clean run ends with `flashes: 0` and single-digit `layers`.

## What it measures

- **Frames.** `Page.startScreencast` captures the compositor's output. Headless
  Chrome only issues BeginFrames when the page damages itself, which leaves
  multi-second gaps and can hide a one-frame glitch; a 2 px, pointer-transparent
  dot with a compositor opacity animation keeps a ~60 Hz frame stream. Frames are
  reduced to a 48×27 luma grid; a flash is a frame that departs from both
  neighbours while they agree with each other.
- **Layers.** `LayerTree` reports the composited layer count. This is the
  regression guard that matters: an `opacity` transition on the mass highlight
  classes promotes one layer per element (measured 4 → 455 for a selection) and
  a layer storm is what flashes a transparent, vibrancy-backed window.
- **DOM and engine work.** A page-side `MutationObserver` plus
  `Performance.getMetrics` deltas (`LayoutCount`, `RecalcStyleCount`,
  `TaskDuration`), and `PerformanceObserver` for long tasks / long animation
  frames / layout shifts.

## Limits

`dsh web` is not the desktop shell. The desktop window is a transparent
`BrowserWindow` with macOS vibrancy, so a compositor problem can be invisible in
Chrome and dramatic there. The probe proves the *mechanism* (layer promotion,
paint storms, layout churn) in the client; confirming the window-level flash
still needs a desktop smoke test.

`cdp.mjs` is a small CDP client (Node's built-in `WebSocket`/`fetch`), `png.mjs`
a minimal PNG reader for screenshots, `session.mjs` the boot/open-the-page
helpers.
