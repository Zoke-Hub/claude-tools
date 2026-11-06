// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { EngineInterface } from 'claude-code'

import { folioDir, homeDir } from './store'

// A short log of presses and panel draws, to find clicks that do nothing:
// ~/.claude/folio/debug.log, the newest 300 lines.
const KEPT_LINES = 300
let lines: string[] = []
let isWriting = false

// An error as one line of text; `withPlace` adds the line it was thrown from.
export function errorText(err: unknown, withPlace = false): string {
  if (!(err instanceof Error)) return String(err)

  return withPlace ? `${err.message} ${err.stack?.split('\n')[1]?.trim() ?? ''}` : err.message
}

// Work run just after the calling hook returns, off the turn, so nothing waits
// on it. A failure is logged, never thrown at the person.
export function later($: EngineInterface, work: () => Promise<unknown>) {
  $.clock.after(500, () => {
    void work().catch(err => note($, `after-reply work failed: ${errorText(err, true)}`))
  })
}

export async function note($: EngineInterface, text: string) {
  lines = [...lines, `${new Date().toISOString().slice(11, 23)} ${text}`].slice(-KEPT_LINES)
  if (isWriting) return
  isWriting = true
  try {
    const home = await homeDir($)
    await $.fs.write(`${folioDir(home)}/debug.log`, `${lines.join('\n')}\n`)
  } catch {
    // The log is a help, never a cause of failure.
  } finally {
    isWriting = false
  }
}
