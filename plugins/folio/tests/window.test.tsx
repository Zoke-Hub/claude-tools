// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect } from 'claude-code/testing'

import { HOME, openPanel, savedView, start, stubEngine, test } from './engine'
import type { Engine } from './engine'
import { startSettings } from '../hooks/store'

// Claude Code's own auto-compact window follows Folio's mode: a million in
// Automatic (`/autocompact 1000000`), and in Watch what it was before.

const KEPT = `${HOME}/.claude/folio/autocompact.json`
type Usage = { tokens: number; fixed: number; window?: number; raw?: number; source?: string }

function setUp(on: Parameters<typeof stubEngine>[0], usage: Usage, mode: 'watch' | 'auto' = 'watch', command?: (command: string, args: string) => void | Promise<void>) {
  const engine = stubEngine(on, { files: savedView({ chunks: [], settings: { mode, strategy: 'balanced' } }), usage, ...(command === undefined ? {} : { command }) })
  const runs = () => engine.commands.filter(c => c.startsWith('autocompact '))
  // Waits for the press's command, or a little while when none comes.
  const settle = async (n: number) => {
    for (let i = 0; i < 30 && runs().length < n; i++) await engine.clock.advance(20)
  }
  const kept = () => JSON.parse(engine.files.get(KEPT) ?? '{}') as Record<string, string>

  return { ...engine, runs, settle, kept }
}
const panel = ($: Engine) => openPanel($, { columns: 100, rows: 60 })

test("Automatic raises Claude Code's window to a million, and Watch puts back the auto window it had", async ($, on) => {
  const u: Usage = { tokens: 120_000, fixed: 20_000, window: 1_000_000, raw: 400_000, source: 'experiment' }
  const e = setUp(on, u)
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'mode-auto' })
  await e.settle(1)
  expect(e.runs()).toEqual(['autocompact 1000000'])
  expect(e.kept()).toEqual({ 'test-model': 'auto' })
  // As the command leaves it: saved in the settings.
  Object.assign(u, { raw: 1_000_000, source: 'settings' })
  await ui.press({ key: 'mode-watch' })
  await e.settle(2)
  expect(e.runs()).toEqual(['autocompact 1000000', 'autocompact auto'])
  expect(e.kept()).toEqual({})
  await ui.unmount()
})

test('a window set by hand is put back as it was; one changed by hand after Automatic is left alone', async ($, on) => {
  const u: Usage = { tokens: 120_000, fixed: 20_000, window: 1_000_000, raw: 600_000, source: 'settings' }
  const e = setUp(on, u)
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'mode-auto' })
  await e.settle(1)
  expect(e.kept()).toEqual({ 'test-model': '600000' })
  u.raw = 1_000_000
  await ui.press({ key: 'mode-watch' })
  await e.settle(2)
  expect(e.runs()).toEqual(['autocompact 1000000', 'autocompact 600000'])
  // Automatic again, then the person sets 800k themselves: Watch leaves it.
  u.raw = 600_000
  await ui.press({ key: 'mode-auto' })
  await e.settle(3)
  u.raw = 800_000
  await ui.press({ key: 'mode-watch' })
  await e.settle(4)
  expect(e.runs()).toEqual(['autocompact 1000000', 'autocompact 600000', 'autocompact 1000000'])
  expect(e.kept()).toEqual({})
  await ui.unmount()
})

test('nothing runs when the window is a million already, the model takes fewer, or CLAUDE_CODE_AUTO_COMPACT_WINDOW sets it', async ($, on) => {
  const u: Usage = { tokens: 120_000, fixed: 20_000, window: 1_000_000, raw: 1_000_000, source: 'auto' }
  const e = setUp(on, u)
  await start($)
  // The chat's start-up work done first, so each line below is a press's.
  await e.clock.advance(1000)
  const ui = await panel($)
  await ui.press({ key: 'mode-auto' })
  await e.settle(1)
  // Watch with nothing Folio raised changes nothing either.
  await ui.press({ key: 'mode-watch' })
  await e.settle(1)
  Object.assign(u, { window: 200_000, raw: 160_000, source: 'model-default' })
  await ui.press({ key: 'mode-auto' })
  await e.settle(1)
  await ui.press({ key: 'mode-watch' })
  await e.settle(1)
  Object.assign(u, { window: 1_000_000, raw: 500_000, source: 'env' })
  await ui.press({ key: 'mode-auto' })
  await e.settle(1)
  expect(e.runs()).toEqual([])
  expect(e.kept()).toEqual({})
  // The log says why each time.
  for (let i = 0; i < 20 && leftNotes(e.files).length < 5; i++) await e.clock.advance(100)
  expect(leftNotes(e.files)).toEqual([
    'auto: already a million or more (1000000 tokens, set by auto)',
    'watch: Folio raised nothing to put back (1000000 tokens, set by auto)',
    'auto: the model takes 200000 tokens, under a million (160000 tokens, set by model-default)',
    'watch: Folio raised nothing to put back (160000 tokens, set by model-default)',
    "auto: CLAUDE_CODE_AUTO_COMPACT_WINDOW sets it (500000 tokens), which /autocompact can't change",
  ])
  await ui.unmount()
})

// The log's lines for each time Folio left the window as it was: "<mode>: <why>".
function leftNotes(files: Map<string, string>): string[] {
  const LEFT = /^Claude Code's auto-compact window left as it is \((\w+)\): (.*)$/
  const text = files.get(`${HOME}/.claude/folio/log/1970-01-01/test-session.jsonl`) ?? ''

  return text
    .split('\n')
    .filter(Boolean)
    .map(l => String((JSON.parse(l) as { text?: unknown }).text ?? ''))
    .map(t => LEFT.exec(t))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => `${m[1]}: ${m[2]}`)
}

test('a chat that opens in Automatic raises the window once; pressing Automatic again runs nothing more', async ($, on) => {
  const u: Usage = { tokens: 120_000, fixed: 20_000, window: 1_000_000, raw: 400_000, source: 'experiment' }
  const e = setUp(on, u, 'auto')
  await start($)
  await e.settle(1)
  for (let i = 0; i < 10 && e.runs().length === 0; i++) await e.clock.advance(200)
  expect(e.runs()).toEqual(['autocompact 1000000'])
  Object.assign(u, { raw: 1_000_000, source: 'settings' })
  const ui = await panel($)
  await ui.press({ key: 'mode-auto' })
  await e.settle(2)
  expect(e.runs()).toEqual(['autocompact 1000000'])
  await ui.unmount()
})

test("a Watch pressed while Automatic's command still waits for the chat to be idle puts the window back once it has run", async ($, on) => {
  const u: Usage = { tokens: 120_000, fixed: 20_000, window: 1_000_000, raw: 400_000, source: 'experiment' }
  let release = () => {}
  const held = new Promise<void>(go => (release = go))
  // The command waits as it would mid-reply, then changes the window as /autocompact does.
  const e = setUp(on, u, 'watch', async (_, args) => {
    if (args === '1000000') {
      await held
      Object.assign(u, { raw: 1_000_000, source: 'settings' })
    } else Object.assign(u, { raw: 400_000, source: 'auto' })
  })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'mode-auto' })
  await e.settle(1)
  await ui.press({ key: 'mode-watch' })
  await e.settle(2)
  expect(e.runs()).toEqual(['autocompact 1000000'])
  release()
  await e.settle(2)
  expect(e.runs()).toEqual(['autocompact 1000000', 'autocompact auto'])
  expect(e.kept()).toEqual({})
  await ui.unmount()
})

test('the setting picked last, in any chat, is the one a new chat starts with until another is picked', async ($, on) => {
  const PREFS = `${HOME}/.claude/folio/prefs.json`
  const u: Usage = { tokens: 120_000, fixed: 20_000, window: 1_000_000, raw: 1_000_000, source: 'auto' }
  // A new chat (no index of its own) with Automatic and Lean picked last, and Saves to kept beside them.
  const files = new Map([[PREFS, JSON.stringify({ saveTo: '/Work/Packs', settings: { mode: 'auto', strategy: 'lean', bogus: 1 } })]])
  const e = stubEngine(on, { files, usage: u })
  await start($)
  const ui = await panel($)
  // Only the settings Folio knows are taken.
  expect(startSettings({ mode: 'auto', strategy: 'lean', bogus: 1, customReal: 'x' })).toEqual({ mode: 'auto', strategy: 'lean' })
  // A pick here is kept for the next new chat, Saves to untouched.
  await ui.press({ key: 'mode-watch' })
  for (let i = 0; i < 10; i++) await e.clock.advance(20)
  expect(JSON.parse(e.files.get(PREFS) ?? '{}')).toEqual({ saveTo: '/Work/Packs', settings: { mode: 'watch', strategy: 'lean', bogus: 1 } })
  await ui.unmount()
})
