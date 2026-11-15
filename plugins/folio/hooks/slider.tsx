// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { ClientModule, JsonValue } from 'claude-code'

// The Custom ceiling's slider, a region that draws itself, so dragging redraws
// only the slider, not the panel and its buttons. It draws the track between
// the panel's rounded ends and the knob; each stop reached goes to the hooks,
// and the panel shows the last one when the pointer comes up (it doesn't
// redraw while the button is held).

type SliderProps = {
  value: number
  min: number
  max: number
  top: number
  step: number
  highAt: number
  colors: { fill: string; high: string; empty: string; closed: string; thumb: string }
}

// Where a drag stands:
//   resting   drag null: the knob shows the panel's value
//   held      isDown: the knob follows the pointer, each new stop posted
//   let go    drag set, not down: the knob stays at the last stop until the
//             panel's value comes back as that stop, or changes some other way
//             (it is no longer `base`, the panel's value when the drag ended)
// `load` names the load of this file that set the pointer listener.
type State = { drag: number | null; isDown: boolean; base: number | null; load: string }

// As tall as the bars' strips, so the panel's rounded ends fit it exactly.
const TRACK_HEIGHT = '40%'

// The slider is drawn in two layers over the panel's rounded ends (which lie
// under its two edges): the track, and over it the knob. The knob's box is 11
// px, the disc's whole width with its soft edge, and it travels the slider to
// 1 px short of each edge (the slider's edge cuts off whatever reaches it), so
// at the lowest or the highest stop it covers that rounded end. The track
// leaves that 1 px and half the knob free at each end, over the rounded ends:
// then the fill always ends at the knob's centre, whatever the slider's width
// (the knob's centre and the track's stops share one scale).
const KNOB_COLUMNS = 11 / 8.8
const EDGE_COLUMNS = 1 / 8.8
const END_COLUMNS = EDGE_COLUMNS + KNOB_COLUMNS / 2

// The knob: a large disc at the caption size, about 10 px across, a little
// taller than the 8 px track. The disc sits low on its line: a spacer under
// it, centred with it, lifts it by half its own height (2 px of a 20 px row,
// so 1 px), onto the track's centre (measured in the app).
const KNOB = '⬤'
const KNOB_LIFT_ROWS = 2 / 20
// This load of the file. The pointer listener is set once, at the first draw,
// and again only at the first draw after the file is reloaded (the instance
// keeps its state through a reload, and the listener set by the code before
// would keep that code's props). Never on every draw: a listener replaced
// while the button is down loses the drag in the app.
const LOAD = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

// Each instance's newest props, for its listener (every draw of an instance
// gets the same surface).
const propsOf = new WeakMap<object, SliderProps>()

// The stop under the pointer: where the knob's centre would be, along its
// travel (END_COLUMNS in from each edge).
function valueAt(props: SliderProps, columns: number, x: number): number {
  const { min, max, top, step } = props
  const travel = columns - 2 * END_COLUMNS
  const share = travel > 0 ? Math.max(0, Math.min(1, (x + 0.5 - END_COLUMNS) / travel)) : 0
  const stopped = min + Math.round((share * (max - min)) / step) * step

  return Math.min(stopped, top)
}

const RESTING = { drag: null, isDown: false, base: null } as const

// Where a value falls along the track, 0 to 100.
function shareOf(props: SliderProps, n: number): number {
  return Math.max(0, Math.min(100, ((n - props.min) / (props.max - props.min)) * 100))
}

// The fill is a gradient fixed to the track: the bars' blue up to the stop
// before highAt, amber from highAt, and between them thin stripes, each a step
// from blue to amber (mixed as plain RGB, which stays warmer and cleaner in
// the middle than mixing in light or perceptual space). A longer fill shows
// more of it, so the fill's start never changes colour during a drag.
const BLEND_STRIPES = 32

function mixHex(from: string, to: string, share: number): string {
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const a = channels(from)
  const b = channels(to)

  return `#${a.map((c, i) => Math.round(c + (b[i]! - c) * share).toString(16).padStart(2, '0')).join('')}`
}

// The fill's stretches as [share of the track, colour], up to `filled`.
function fillParts(props: SliderProps, filled: number): Array<[number, string]> {
  const { fill, high } = props.colors
  const blendFrom = shareOf(props, props.highAt - props.step)
  const blendTo = shareOf(props, props.highAt)
  const stripe = (blendTo - blendFrom) / BLEND_STRIPES
  const parts: Array<[number, string]> = []
  const add = (from: number, to: number, color: string) => {
    const share = Math.min(to, filled) - from
    if (share > 0) parts.push([share, color])
  }
  add(0, blendFrom, fill)
  for (let i = 0; i < BLEND_STRIPES; i++) add(blendFrom + i * stripe, blendFrom + (i + 1) * stripe, mixHex(fill, high, (i + 0.5) / BLEND_STRIPES))
  add(blendTo, 100, high)

  return parts
}

const Slider: ClientModule<SliderProps & { [k: string]: JsonValue }, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  propsOf.set(surface, props)
  let state = surface.state
  if (state === undefined || state.load !== LOAD) {
    const fresh: State = { ...RESTING, load: LOAD }
    state = fresh
    surface.setState(fresh)
    surface.onPointer(e => {
      const now = surface.state ?? fresh
      const p = propsOf.get(surface)!
      if (!(e.type === 'down' && e.button === 'left') && !now.isDown) return
      if (e.type !== 'down' && e.type !== 'move' && e.type !== 'up') return
      const value = valueAt(p, surface.columns, e.x)
      // Each new stop is posted; the last one again when the drag ends, unless
      // the panel already has it, so a post replaced or lost on the way is sent.
      if (value !== (now.drag ?? p.value) || (e.type === 'up' && value !== p.value)) surface.post({ ceiling: value })
      surface.setState({ drag: value, isDown: e.type !== 'up', base: p.value, load: LOAD })
    })
  } else if (!state.isDown && state.drag !== null && (state.drag === props.value || props.value !== state.base)) {
    // The panel has taken the stop, or moved on from where the drag ended: the
    // knob follows its props again.
    state = { ...RESTING, load: state.load }
    surface.setState(state)
  }
  const value = state.drag ?? props.value
  const filled = shareOf(props, value)
  const open = Math.max(filled, shareOf(props, props.top))
  const { empty, closed, thumb } = props.colors

  // The stretches share the track by flexGrow, so its length stays the same
  // wherever the knob sits; the knob's layer shares its own row the same way.
  return (
    <Box flexDirection="row" alignItems="center" height={1}>
      <Box width={END_COLUMNS} />
      {fillParts(props, filled).map(([share, color], i) => (
        <Box key={`fill-${i}`} flexGrow={share} width={0} height={TRACK_HEIGHT} backgroundColor={color} />
      ))}
      <Box flexGrow={open - filled} width={0} height={TRACK_HEIGHT} backgroundColor={empty} />
      <Box flexGrow={100 - open} width={0} height={TRACK_HEIGHT} backgroundColor={closed} />
      <Box width={END_COLUMNS} />
      {/* The knob's layer spans the whole slider (the app places a layer
          against the slider), and the knob sits in it by flexGrow. */}
      <Box position="absolute" top={0} left={0} width="100%" height={1} flexDirection="row" alignItems="center">
        <Box width={EDGE_COLUMNS} flexShrink={0} />
        <Box flexGrow={filled} width={0} />
        <Box width={KNOB_COLUMNS} height={1} flexShrink={0} flexDirection="column" alignItems="center" justifyContent="center">
          <Text color={thumb} size="caption">
            {KNOB}
          </Text>
          <Box height={KNOB_LIFT_ROWS} />
        </Box>
        <Box flexGrow={100 - filled} width={0} />
        <Box width={EDGE_COLUMNS} flexShrink={0} />
      </Box>
    </Box>
  )
}

export default Slider
