// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { EngineInterface, RenderChildren } from 'claude-code'

import { GREY, LIGHT } from './colors'

// The bars are drawn from the panel's own boxes, so a change updates them in
// place instead of reloading a picture. They keep the look of a drawn bar: a
// thin strip of coloured parts with rounded ends, thin light marks, and one
// line under it that names the part under the pointer. Box sizes are in lines or percents, so the
// bar is one line tall and its parts are shares of it. A change shows at once:
// a slide redrew the panel for every frame, and the app rebuilt the button
// under the pointer each time, so its hover highlight flickered.

export type BarPart = {
  key: string
  // Size in any unit; parts share the bar's width by size. A part of size 0 isn't drawn.
  size: number
  color: string
  // What the line under the bar says while this part is hovered.
  tip: string | null
}

// A thin upright mark across the bar: the ceiling, or where a fold brings the
// work back to.
export type BarMark = { key: string; mark: true; wide?: boolean }


// A part is a thin row (a share of the line's height) holding a small drawn
// half-disc at each end and a box between them that fills the row's height,
// so the caps and the box are the same height. The row's height is set, so
// the caps never decide it. A cap changes only with its colour, so a part
// resizing never redraws a picture.
export const PART_HEIGHT = '40%'
// The strip's height in pixels at 40% of a line (measured in the app), so
// each cap is a half-disc exactly as tall as the box between them.
export const PART_PX = 8
export const CAP_PX = PART_PX / 2
// The narrowest a part may be, in cells: its two ends and a small gap, so a
// thin part never vanishes and the bar never leaves its box.
export const MIN_PART_COLUMNS = 2

// Kept short: every part draws two, and the panel's whole drawing must stay
// small for the app to take it.
// A half-disc as tall as the strip, its flat side against the box.
export function capSvg(color: string, side: 'left' | 'right'): string {
  const d = side === 'left' ? `M${CAP_PX} 0A${CAP_PX} ${CAP_PX} 0 0 0 ${CAP_PX} ${PART_PX}Z` : `M0 0A${CAP_PX} ${CAP_PX} 0 0 1 0 ${PART_PX}Z`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CAP_PX}" height="${PART_PX}"><path d="${d}" fill="${color}"/></svg>`
}

// The hover line is drawn over the resting line on the panel's own
// background, in the same grey, so it reads as the line changing.
const LINE_BACK = '#191919'

// One bar with its hover line. Parts and marks are drawn in the order given;
// `right` sits at the line's right end (a button).
export function drawBar(
  elements: ReturnType<EngineInterface['ui']['resolve']>,
  name: string,
  parts: Array<BarPart | BarMark>,
  idle: RenderChildren,
  columns: number,
  right?: RenderChildren,
): RenderChildren {
  const { Box, Text } = elements
  const shown = parts.filter((p): p is BarPart => !('mark' in p) && p.size > 0)
  // Each part's width as a whole percent of the bar (the panel takes no
  // fractions), the leftover given to the largest parts, so the widths add up
  // to exactly 100. The hover areas use the same numbers, so each one ends
  // exactly where its part does.
  const total = shown.reduce((sum, p) => sum + p.size, 0) || 1
  const raw = shown.map(p => (p.size / total) * 100)
  const least = Math.max(1, Math.min(Math.floor(100 / (shown.length || 1)), Math.ceil((MIN_PART_COLUMNS / columns) * 100)))
  const pct = raw.map(x => Math.max(least, Math.floor(x)))
  let left = 100 - pct.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (let n = 0; left > 0 && order.length > 0; n = (n + 1) % order.length, left--) pct[order[n]![1]]! += 1
  for (let n = 0; left < 0; n = (n + 1) % pct.length) {
    const at = pct.indexOf(Math.max(...pct))
    pct[at]! -= 1
    left++
  }
  const widthOf = new Map(shown.map((p, i) => [p.key, pct[i]!]))
  // A mark sits at the start of the part after it (or the end of the last).
  const markBefore = new Map<string, BarMark>()
  let pending: BarMark | null = null
  for (const p of parts) {
    if ('mark' in p) pending = p
    else if (widthOf.has(p.key) && pending !== null) {
      markBefore.set(p.key, pending)
      pending = null
    }
  }
  // The mark's box has no width and sits where the part before ends and this
  // one begins, the middle of the gap between them (each side gives the gap
  // the same padding). Its line is centred on that point, spilling equally
  // both ways, so it stands at the very centre between the two parts.
  const mark = (m: BarMark, side: 'left' | 'right') => (
    <Box position="absolute" top={0} {...(side === 'left' ? { left: 0 } : { right: 0 })} width={0} height="100%" flexDirection="row" justifyContent="center" alignItems="center">
      <Text color={LIGHT} weight={m.wide ? 'bold' : 'regular'}>
        {m.wide ? '┃' : '│'}
      </Text>
    </Box>
  )

  // A part: a box of its exact width holding its strip (left cap, box, right
  // cap) with a small gap after it, and a mark at its start when one falls there.
  const leaf = (p: BarPart, isLast: boolean) => {
    const m = markBefore.get(p.key)

    return (
      // The part's box is the line's full height, so its strip's share of that
      // height has something to be a share of.
      <Box position={m || isLast ? 'relative' : undefined} alignItems="center" width={`${widthOf.get(p.key)}%`} flexShrink={0} height="100%" paddingLeft={m ? 'xs' : undefined} paddingRight={isLast ? undefined : 'xs'}>
        <Box flexDirection="row" flexGrow={1} minWidth={0} height={PART_HEIGHT}>
          {'Svg' in elements ? <elements.Svg source={capSvg(p.color, 'left')} alt={(p.tip ?? p.key).split(' · ')[0]!} width={CAP_PX} height={PART_PX} /> : null}
          <Box flexGrow={1} minWidth={0} height="100%" backgroundColor={p.color} />
          {'Svg' in elements ? <elements.Svg source={capSvg(p.color, 'right')} alt="end" width={CAP_PX} height={PART_PX} /> : null}
        </Box>
        {m && mark(m, 'left')}
        {/* A mark after the last part sits at the bar's end. */}
        {isLast && pending !== null && mark(pending, 'right')}
      </Box>
    )
  }

  // Each part's hover line belongs to a clear area laid over the bar, from
  // the bar's start to where that part ends. The areas are stacked with the
  // shortest on top, so the one under the pointer is the hovered part's own;
  // its line starts exactly where the resting line does and covers it while
  // it shows. They sit side by side in the tree, keeping it shallow.
  let reach = 0
  const areas = shown.flatMap(p => {
    reach += widthOf.get(p.key)!
    if (p.tip === null) return []

    return [
      <Box key={`${name[0]}${p.key}`} position="absolute" top={0} left={0} width={`${reach}%`} height="100%">
        <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }} backgroundColor={LINE_BACK}>
          <Text size="caption" color={GREY} wrap="truncate-end">
            {p.tip}
          </Text>
        </Box>
      </Box>,
    ]
  })

  return (
    <Box flexDirection="column">
      <Box position="relative" flexDirection="row" alignItems="center" height={1}>
        {shown.map((p, i) => leaf(p, i === shown.length - 1))}
        {areas.reverse()}
      </Box>
      <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start" gap="sm">
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="caption" color={GREY}>
            {idle}
          </Text>
        </Box>
        {right}
      </Box>
    </Box>
  )
}
