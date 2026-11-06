// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { ClientModule, JsonValue } from 'claude-code'

// The Custom ceiling's slider, a region that draws itself, so dragging redraws
// only the slider, not the panel and its buttons. It draws the track between
// the panel's rounded ends and the knob; each stop reached goes to the hooks,
// so the numbers under it follow the drag.

type SliderProps = {
  value: number
  min: number
  max: number
  top: number
  step: number
  highAt: number
  colors: { fill: string; high: string; empty: string; closed: string; thumb: string }
}
type State = { drag: number | null; isDown: boolean }

// As tall as the bars' strips, so the panel's rounded ends fit it exactly.
const TRACK_HEIGHT = '40%'

// The newest props, for the pointer listener set at the first draw (after the
// props, so they are always there). The engine draws again with the same
// surface and state, so only the props change.
let latest!: SliderProps

function valueAt(props: SliderProps, columns: number, x: number): number {
  const { min, max, top, step } = props
  const share = columns > 0 ? Math.max(0, Math.min(1, (x + 0.5) / columns)) : 0
  const stopped = min + Math.round((share * (max - min)) / step) * step

  return Math.min(stopped, top)
}

const RESTING: State = { drag: null, isDown: false }

const Slider: ClientModule<SliderProps & { [k: string]: JsonValue }, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  latest = props
  if (state === undefined) {
    state = RESTING
    surface.setState(state)
    surface.onPointer(e => {
      const now = surface.state ?? RESTING
      if (!(e.type === 'down' && e.button === 'left') && !now.isDown) return
      if (e.type !== 'down' && e.type !== 'move' && e.type !== 'up') return
      const value = valueAt(latest, surface.columns, e.x)
      if (value !== (now.drag ?? latest.value)) surface.post({ ceiling: value })
      surface.setState({ drag: value, isDown: e.type !== 'up' })
    })
  } else if (!state.isDown && state.drag === props.value) {
    // The panel has taken the value: the slider follows its props again.
    state = RESTING
    surface.setState(state)
  }
  const value = state.drag ?? props.value
  const at = (n: number) => ((n - props.min) / (props.max - props.min)) * 100
  const filled = Math.max(0, Math.min(100, at(value)))
  const open = Math.max(filled, Math.min(100, at(props.top)))
  const { fill, high, empty, closed, thumb } = props.colors

  // The three stretches share the track by flexGrow, so its length stays the
  // same wherever the knob sits, from the lowest stop to the highest.
  return (
    <Box flexDirection="row" alignItems="center" height={1}>
      <Box flexGrow={filled} width={0} height={TRACK_HEIGHT} backgroundColor={value >= props.highAt ? high : fill} />
      <Text color={thumb}>●</Text>
      <Box flexGrow={open - filled} width={0} height={TRACK_HEIGHT} backgroundColor={empty} />
      <Box flexGrow={100 - open} width={0} height={TRACK_HEIGHT} backgroundColor={closed} />
    </Box>
  )
}

export default Slider
