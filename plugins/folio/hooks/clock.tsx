// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { ClientModule, JsonValue } from 'claude-code'

// The time since `since` (milliseconds since the epoch), counting up on its
// own each second in the app, so FolioPack's loading box shows the time
// passing without the panel being drawn again.

type ClockProps = {
  since: number
  size: 'footnote' | 'caption'
}

// How long, as FolioPack's loading box writes it: 0:06, 1:24, 12:05.
export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const Clock: ClientModule<ClockProps & { [k: string]: JsonValue }, number> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(1000, () => surface.setState((surface.state ?? 0) + 1))
  }

  return (
    <Text size={props.size} dimColor tabular wrap="clip">
      {elapsedText(Date.now() - props.since)}
    </Text>
  )
}

export default Clock
