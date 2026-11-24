// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { EngineInterface } from 'claude-code'

import { errorText, note } from './debug'
import { folioDir, homeDir, readJson } from './store'

// Claude Code's own compaction under Folio's Automatic: Folio folds the chat
// itself, so Claude Code's auto-compact window goes up to a million tokens
// (`/autocompact 1000000`), on a model that takes that many; Watch puts back
// what was there before. The command saves the window for the model, so it
// covers every chat on that model, and the last chat switched decides.

export const FOLIO_WINDOW = 1_000_000

// What the window was before Folio raised it, per model: `auto` or a token
// count. Kept until Watch puts it back, or the window is changed by hand.
type Kept = Record<string, string>

const keptPath = (home: string) => `${folioDir(home)}/autocompact.json`

// The window Claude Code compacts at now, and the model's own limit, as the
// session measures them; null before the session has a size.
async function windowNow($: EngineInterface): Promise<{ model: string; limit: number; window: number; source: string } | null> {
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  const breakdown = usage?.context.breakdown
  if (usage === null || breakdown === undefined) return null

  return { model: breakdown.model, limit: usage.context.window, window: breakdown.rawMaxTokens, source: breakdown.autocompactSource }
}

async function autocompact($: EngineInterface, args: string, why: string) {
  await $.command.run({ command: 'autocompact', args })
  await note($, `Claude Code's auto-compact window set to ${args}: ${why}`)
}

// The change asked for last. A command waits until the session is idle, so
// each change waits for the one before it: a Watch pressed while Automatic's
// command is still waiting then reads the window that command set.
let queue: Promise<void> = Promise.resolve()

// Sets Claude Code's window for the mode: a million in Automatic, what it was
// before in Watch. Nothing changes when the window is already right, when the
// model takes fewer tokens, when CLAUDE_CODE_AUTO_COMPACT_WINDOW sets it (the
// command can't overrule that), or in Watch when the person changed the window
// after Folio raised it. Never rejects; a failure is a line in the log.
export function matchWindow($: EngineInterface, mode: 'watch' | 'auto'): Promise<void> {
  queue = queue.then(() => setWindow($, mode))

  return queue
}

async function setWindow($: EngineInterface, mode: 'watch' | 'auto') {
  // Each time Folio changes nothing, the log says why.
  const leave = (why: string) => note($, `Claude Code's auto-compact window left as it is (${mode}): ${why}`)
  try {
    const now = await windowNow($)
    if (now === null) return await leave('the chat has no size yet')
    const at = `${now.window} tokens, set by ${now.source}`
    if (now.source === 'env') return await leave(`CLAUDE_CODE_AUTO_COMPACT_WINDOW sets it (${now.window} tokens), which /autocompact can't change`)
    const path = keptPath(await homeDir($))
    const kept = (await readJson<Kept>($, path)) ?? {}
    const before = kept[now.model]
    if (mode === 'auto') {
      if (now.limit < FOLIO_WINDOW) return await leave(`the model takes ${now.limit} tokens, under a million (${at})`)
      if (now.window >= FOLIO_WINDOW) return await leave(`already a million or more (${at})`)
      await $.fs.write(path, JSON.stringify({ ...kept, [now.model]: now.source === 'settings' ? String(now.window) : 'auto' }))
      await autocompact($, String(FOLIO_WINDOW), `Folio folds this chat in Automatic (was ${at})`)
    } else if (before === undefined) await leave(`Folio raised nothing to put back (${at})`)
    else {
      const { [now.model]: _, ...rest } = kept
      await $.fs.write(path, JSON.stringify(rest))
      if (now.window === FOLIO_WINDOW) await autocompact($, before, 'back to what it was before Automatic')
      else await leave(`changed by hand after Automatic (${at})`)
    }
  } catch (err) {
    await note($, `Claude Code's auto-compact window could not be set: ${errorText(err)}`)
  }
}
