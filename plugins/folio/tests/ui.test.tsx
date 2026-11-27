// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect } from 'claude-code/testing'
import type { RenderSurface } from 'claude-code'

import { callTool, mountFooter, openPanel, request, savedView, stubEngine as stub, start, test } from './engine'
import type { Engine, On } from './engine'

// A saved chunk in the chat, summarised, as an earlier run left it: 50k tokens
// unless the test says otherwise.
const chunk = (i: number, patch: object = {}) => ({ id: `c${i}`, order: i, title: `Chunk ${i}`, tokens: 50_000, isSummarised: true, status: 'live', ...patch })

// `saved` is the session's index file, as an earlier run left it; `usage`, what
// Claude Code measures of the context. Returns what the engine sees of Folio:
// the panes it opens and the light model's prompts.
function stubEngine(on: On, saved?: object, usage?: { tokens: number; fixed: number }) {
  return stub(on, { files: saved === undefined ? undefined : savedView(saved), model: () => '{"found": false}', usage })
}

// The panel at the width and height these tests draw it, opened as the app opens it.
const panel = <P extends RenderSurface = 'desktop'>($: Engine, o: { surface?: P; columns?: number } = {}) => openPanel($, { columns: 80, rows: 60, ...o })

test('the footer ring opens the panel beside the chat', async ($, on) => {
  const seen = stubEngine(on)
  await start($)
  const footer = await mountFooter($)
  // With nothing waiting and nothing saved yet, it names Folio.
  expect(await footer.find({ type: 'Button', text: /^Folio$/ })).toBeTruthy()
  await footer.press({ key: 'footer-ring' })
  await footer.unmount()
  expect(seen.opened.at(-1)).toBe('folio-panel')
})

test('the footer: Folio and the tokens saved in a dim button, with no count after it', async ($, on) => {
  // An older Folio's flagged part, set to fold next, and a context past the ceiling.
  const seen = stubEngine(on, { savedTokens: 1300, foldNext: ['c0'], chunks: [chunk(0, { tokens: 9000, exactReason: 'exact values' }), ...Array.from({ length: 8 }, (_, i) => chunk(i + 1, { tokens: 60_000 }))] })
  await start($)
  const footer = await mountFooter($)
  const button = await footer.find({ type: 'Button', key: 'footer-ring' })
  expect(button?.text).toBe('Folio ↓1.3k')
  expect(button?.props?.dimColor).toBe(true)
  expect(await footer.find({ type: 'Text', text: /^ \d+$/ })).toBeFalsy()
  expect(await footer.findAll({ type: 'Svg' })).toHaveLength(0)
  // Pressing it opens the panel.
  await footer.press({ key: 'footer-ring' })
  await footer.unmount()
  expect(seen.opened.at(-1)).toBe('folio-panel')
})

test('the panel starts in Watch with nothing to ask, on every surface', async ($, on) => {
  stubEngine(on)
  await start($)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await panel($, { surface })
    // The title is drawn heavy where the surface draws pictures, else as text;
    // its credit is always text.
    expect(await ui.find({ type: 'Text', text: 'by Zoke' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^Folds only when you press Fold now; Claude Code's own compaction still runs\.$/ })).toBeTruthy()
    // The strip no longer marks what would fold, so Watch's line doesn't say it does.
    expect(await ui.find({ type: 'Text', text: /Shows what it would fold/ })).toBeFalsy()
    // With nothing open and nothing to suggest, neither section shows.
    expect(await ui.find({ key: 'section-open-tasks' })).toBeFalsy()
    expect(await ui.find({ key: 'open-suggestions' })).toBeFalsy()
    await ui.unmount()
  }
})

test('Automatic in the panel switches the mode', async ($, on) => {
  stubEngine(on)
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'mode-auto' })
  expect(await ui.find({ type: 'Text', text: /Folds the oldest work by itself/ })).toBeTruthy()
  await ui.unmount()
})

test('recall answers through the tool, even with nothing folded yet', async ($, on) => {
  const seen = stubEngine(on)
  await start($)
  const ran = await callTool($, { tool: 'mcp__folio__recall', query: 'table column widths' })
  expect(JSON.stringify(ran)).toContain('Nothing in the saved parts')
  expect(seen.prompts).toEqual([])
})

test('a choice shows in the activity, and Undo takes it back', async ($, on) => {
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { topic: 'topic', summary: 'summary', tokens: 10_000 })) })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'task-T1' })
  await ui.press({ key: 'chunk-c0' })
  await ui.press({ key: 'fold-chunk-c0' })
  expect(await ui.find({ type: 'Text', text: /Fine to fold: “Chunk 0”/ })).toBeTruthy()
  const undoButton = await ui.find({ type: 'Button', text: 'Undo' })
  expect(undoButton?.key?.startsWith('undo-choice-')).toBe(true)
  await ui.press({ key: undoButton!.key! })
  expect(await ui.find({ type: 'Text', text: /Fine to fold: “Chunk 0”/ })).toBeFalsy()
  await ui.unmount()
})

test('the meter counts the whole context against the ceiling, and FolioPack opens from its button', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: 'Hover for each part' })).toBeTruthy()
  // In Watch the line under the strategies names the two numbers, and the
  // figures have no hover note saying them again.
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 400k, down to 250k$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /folds it back to|Folds back to/ })).toBeFalsy()
  // In Automatic the figures' hover note says them.
  await ui.press({ key: 'mode-auto' })
  expect(await ui.find({ type: 'Text', text: 'Folds back to 250k when it reaches 400k' })).toBeTruthy()
  await ui.press({ key: 'mode-watch' })
  await ui.press({ key: 'folio-pack' })
  expect(await ui.find({ type: 'Button', text: 'Pack up' })).toBeTruthy()
  await ui.press({ key: 'pack-close' })
  expect(await ui.find({ type: 'Button', text: 'Pack up' })).toBeFalsy()
  // Closing keeps the form: it opens again as it was, with no new scan.
  await ui.press({ key: 'folio-pack' })
  expect(await ui.find({ type: 'Button', text: 'Close' })).toBeTruthy()
  await ui.unmount()
})

test('the meter reads the whole context, Claude Code\'s own part and the kept parts included', async ($, on) => {
  const { clock } = stubEngine(on, { chunks: [chunk(0)] }, { tokens: 300_000, fixed: 100_000 })
  await start($)
  // The context is measured just after the chat opens.
  await clock.advance(1000)
  const ui = await panel($)
  // The figure is a picture on the desktop; its text is what it says.
  expect((await ui.findAll({ type: 'Svg' })).some(p => p.props?.alt === '300k of 400k')).toBe(true)
  await ui.unmount()
})

test('What fills the context starts shut each time the panel opens, and opens and shuts from its title', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  let ui = await panel($)
  expect(await ui.find({ type: 'Button', text: 'What fills the context ▸' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Work · what a fold can take/ })).toBeFalsy()
  await ui.press({ key: 'open-context' })
  expect(await ui.find({ type: 'Text', text: /Work · what a fold can take/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Summaries and kept parts · \S+ of / })).toBeTruthy()
  await ui.press({ key: 'open-context' })
  expect(await ui.find({ type: 'Text', text: /Summaries and kept parts · \S+ of / })).toBeFalsy()
  // Left open, it is shut again the next time the panel opens.
  await ui.press({ key: 'open-context' })
  await ui.unmount()
  ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /Work · what a fold can take/ })).toBeFalsy()
  await ui.unmount()
})

test('the Custom slider shows only while Custom is chosen, and its value sets the numbers', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeFalsy()
  await ui.press({ key: 'strategy-custom' })
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 500k, down to 313k$/ })).toBeTruthy()
  // A drag ends on a stop, and the numbers follow it.
  await ui.resize({ columns: 100, rows: 1, in: 'folio-custom-slider' })
  await ui.pointer({ type: 'down', x: 99, y: 0, button: 'left', in: 'folio-custom-slider' })
  await ui.pointer({ type: 'up', x: 99, y: 0, button: 'left', in: 'folio-custom-slider' })
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 800k, down to 500k$/ })).toBeTruthy()
  // From 650k up the fill turns light amber; below it stays the bars' blue.
  expect(JSON.stringify(await ui.drawn({ in: 'folio-custom-slider' }))).toContain('#e3b063')
  await ui.pointer({ type: 'down', x: 29, y: 0, button: 'left', in: 'folio-custom-slider' })
  await ui.pointer({ type: 'up', x: 29, y: 0, button: 'left', in: 'folio-custom-slider' })
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 500k, down to 313k$/ })).toBeTruthy()
  expect(JSON.stringify(await ui.drawn({ in: 'folio-custom-slider' }))).not.toContain('#e3b063')
  // Any other strategy takes the slider away.
  await ui.press({ key: 'strategy-lean' })
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 300k, down to 180k$/ })).toBeTruthy()
  await ui.unmount()
})

test('Recent activity and the brief start open, fold up, and stay as left (Open tasks does the same: C2)', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  let ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /Folds, strips, recalls/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Empty so far: it fills as parts are summarised\.$/ })).toBeTruthy()
  await ui.press({ key: 'section-activity' })
  await ui.press({ key: 'section-brief' })
  expect(await ui.find({ type: 'Text', text: /Folds, strips, recalls/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Empty so far/ })).toBeFalsy()
  // Closing and opening the panel leaves them folded; their titles stay.
  await ui.unmount()
  ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /Folds, strips, recalls/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Recent activity ▸/ })).toBeTruthy()
  await ui.press({ key: 'section-activity' })
  expect(await ui.find({ type: 'Text', text: /Folds, strips, recalls/ })).toBeTruthy()
  await ui.unmount()
})

test('as the panel narrows the slider number goes first, then the slider, and thin parts stay', async ($, on) => {
  const chunks = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, order: i, title: `Chunk ${i}`, tokens: i === 39 ? 900_000 : 3000, isSummarised: true, status: 'live' }))
  stubEngine(on, { chunks, settings: { mode: 'watch', strategy: 'custom' } })
  await start($)
  const at = async (bodyColumns: number) => {
    const ui = await panel($, { columns: bodyColumns })
    const shown = { slider: Boolean(await ui.find({ key: 'folio-custom-slider' })), value: Boolean(await ui.find({ type: 'Text', text: /^500k$/ })), drawn: JSON.stringify(await ui.drawn()) }
    await ui.unmount()

    return shown
  }
  expect(await at(70)).toMatchObject({ slider: true, value: true })
  expect(await at(55)).toMatchObject({ slider: true, value: false })
  expect(await at(48)).toMatchObject({ slider: false, value: false })
  // Every part in the strip keeps at least its minimum width, at the narrowest.
  const widths = [...(await at(46)).drawn.matchAll(/"width":"(\d+)%"/g)].map(m => Number(m[1]))
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(5)
})

test('an opened part has one way back under it, and its name still shuts it', async ($, on) => {
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { topic: 'topic', summary: 'summary', tokens: 10_000 })) })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'task-T1' })
  await ui.press({ key: 'chunk-c1' })
  expect(await ui.findAll({ type: 'Button', text: /^← Back to all 3 parts of T1$/ })).toHaveLength(1)
  expect(await ui.find({ key: 'chunks-back' })).toBeTruthy()
  // Pressing the chunk's name again shuts it, back to the whole list.
  await ui.press({ key: 'chunk-c1' })
  expect(await ui.findAll({ type: 'Button', text: /^← Back to all/ })).toHaveLength(0)
  expect(await ui.find({ key: 'chunk-c0' })).toBeTruthy()
})

test('the line beside What fills the context reads the same whole context as the meter', async ($, on) => {
  const engine = stub(on, { files: savedView({ chunks: [chunk(0)] }), model: () => '{"found": false}', usage: { tokens: 300_000, fixed: 100_000 } })
  await start($)
  await engine.clock.advance(1000)
  // The last request came to more than the engine measured before it.
  await request($, engine, 350_000)
  const ui = await panel($)
  expect((await ui.findAll({ type: 'Svg' })).some(p => p.props?.alt === '350k of 400k')).toBe(true)
  expect(await ui.find({ type: 'Text', text: '350k of 1M' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '300k of 1M' })).toBeFalsy()
  await ui.unmount()
})

test('a stripped part marked Keep reads as kept in its row and in the strip', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0, { status: 'trimmed', decision: 'keep', topic: 'topic', summary: 'summary', tokens: 10_000 }), chunk(1, { topic: 'topic', summary: 'summary', tokens: 10_000 })] })
  await start($)
  const ui = await panel($)
  // The strip's hover line, and its colour key, which says kept.
  expect(await ui.find({ type: 'Text', text: /^Chunk 0 · \S+ · kept · stripped until the next fold$/ })).toBeTruthy()
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'task-T1' })
  expect(await ui.find({ type: 'Text', text: /^\S+ · kept · stripped until the next fold$/ })).toBeTruthy()
  await ui.unmount()
})

test('an entry in Recent activity names its parts as runs, as recall does', async ($, on) => {
  const activity = [{ id: 'a1', kind: 'undo', at: 1, text: 'Restored 3 parts word for word', detail: 'kept from now on', chunkIds: ['c0', 'c1', 'c3'] }]
  stubEngine(on, { chunks: [0, 1, 2, 3].map(i => chunk(i, { decision: i === 2 ? null : 'keep', tokens: 10_000 })), activity })
  await start($)
  const ui = await panel($)
  // On the desktop its mark is an icon beside the words.
  expect(await ui.find({ type: 'Text', text: /^1–2, 4 Restored 3 parts word for word$/ })).toBeTruthy()
  await ui.unmount()
})

// The buttons and lines no other test reaches.

test('a context too small for Custom: pressing it says why', async ($, on) => {
  // Claude Code compacts this chat near 193k, so Custom's ceiling could go no higher than 100k.
  const usage = { tokens: 100_000, fixed: 20_000, window: 200_000 }
  const { clock, toasts } = stub(on, { files: savedView({ chunks: [chunk(0)] }), model: () => '{"found": false}', usage })
  await start($)
  await clock.advance(1000)
  const ui = await panel($)
  await ui.press({ key: 'strategy-custom' })
  expect(toasts).toEqual(["Custom needs room for a 350k ceiling, and this chat's context has room for 100k."])
  expect(await ui.find({ type: 'Text', text: /too small for Custom/ })).toBeFalsy()
  await ui.unmount()
})

test('a chat set to Custom whose context is too small for it says it is using Balanced', async ($, on) => {
  const usage = { tokens: 100_000, fixed: 20_000, window: 200_000 }
  const { clock } = stub(on, { files: savedView({ chunks: [chunk(0)], settings: { mode: 'watch', strategy: 'custom' } }), model: () => '{"found": false}', usage })
  await start($)
  await clock.advance(1000)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: "This chat's context is too small for Custom, so it's using Balanced." })).toBeTruthy()
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeFalsy()
  // Balanced's numbers, under what this chat can hold.
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 100k, down to 63k$/ })).toBeTruthy()
  await ui.unmount()
})

test("a kept part nobody uses is suggested: Not now puts it off, Undo brings it back, Summarise it marks it fine to fold", async ($, on) => {
  const kept = chunk(0, { title: 'Old spec', tokens: 12_000, decision: 'keep', keptAtFold: 1, paths: ['/p/spec-notes.md'], summary: 'short' })
  const later = [1, 2, 3, 4].map(i => chunk(i, { title: `Later ${i}`, summary: 'other work', paths: ['/p/other.ts'], tokens: 5000 }))
  stubEngine(on, { chunks: [kept, ...later], folds: 5 })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-suggestions' })
  expect(await ui.find({ type: 'Text', text: /^Summarise “Old spec” this time\?$/ })).toBeTruthy()
  await ui.press({ key: 'keep-keep:c0' })
  expect(await ui.find({ type: 'Text', text: /^Summarise “Old spec” this time\?$/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Put off: Summarise “Old spec” this time\?/ })).toBeTruthy()
  const undo = (await ui.findAll({ type: 'Button', text: 'Undo' })).find(b => b.key?.startsWith('undo-choice-'))
  await ui.press({ key: undo!.key! })
  expect(await ui.find({ type: 'Text', text: /^Summarise “Old spec” this time\?$/ })).toBeTruthy()
  await ui.press({ key: 'sum-keep:c0' })
  expect(await ui.find({ type: 'Text', text: /Fine to fold: “Old spec”/ })).toBeTruthy()
  await ui.unmount()
})

test('idle connectors are suggested, and Got it puts them off for good', async ($, on) => {
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { tokens: 10_000 })) })
  const breakdown = { categories: [{ name: 'System prompt', tokens: 20_000, isDeferred: false }], totalTokens: 100_000, mcpTools: [{ name: 'big_tool', serverName: 'big-server', tokens: 9000, isLoaded: true }], isAutoCompactEnabled: false, rawMaxTokens: 1_000_000, autocompactSource: 'auto' }
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 100_000, window: 1_000_000, breakdown }, rateLimits: [] } as never }))
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-suggestions' })
  expect(await ui.find({ type: 'Text', text: /^1 connector wasn’t used in this chat$/ })).toBeTruthy()
  await ui.press({ key: 'connectors-ok' })
  expect(await ui.find({ type: 'Text', text: /^1 connector wasn’t used in this chat$/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /won’t be suggested again/ })).toBeTruthy()
  await ui.unmount()
})

test("a part's card: Keep word for word keeps it, and a folded part's Restore brings it back", async ($, on) => {
  const { toasts } = stub(on, { files: savedView({ chunks: [chunk(0, { topic: 'topic', summary: 'summary', tokens: 10_000, status: 'folded' }), chunk(1, { topic: 'topic', summary: 'summary', tokens: 10_000 }), chunk(2, { topic: 'topic', summary: 'summary', tokens: 10_000 })] }), model: () => '{"found": false}' })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'task-T1' })
  await ui.press({ key: 'chunk-c1' })
  await ui.press({ key: 'keep-chunk-c1' })
  expect(toasts).toContain('Kept “Chunk 1” word for word')
  expect(await ui.find({ type: 'Text', text: /^\S+ · kept word for word$/ })).toBeTruthy()
  await ui.press({ key: 'chunks-back' })
  await ui.press({ key: 'chunk-c0' })
  expect(await ui.find({ type: 'Button', text: 'Keep word for word' })).toBeFalsy()
  await ui.press({ key: 'restore-c0' })
  expect(await ui.find({ type: 'Text', text: /^\S+ · restored word for word$/ })).toBeTruthy()
  expect(await ui.find({ key: 'restore-c0' })).toBeFalsy()
  await ui.unmount()
})

test("an opened fold in Recent activity restores one part at a time, and Undo all stays while one is still out", async ($, on) => {
  const items = [0, 1].map(i => ({ kind: 'chunk', chunkId: `c${i}`, text: `Chunk ${i}`, detail: '10k' }))
  const activity = [{ id: 'f1', kind: 'fold', at: 1, text: 'Folded 2 parts', detail: '18k tokens out', chunkIds: ['c0', 'c1'], items }]
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { tokens: 10_000, status: i < 2 ? 'folded' : 'live' })), activity })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'act-f1' })
  expect(await ui.find({ type: 'Text', text: /^1 Chunk 0 · 10k$/ })).toBeTruthy()
  await ui.press({ key: 'restore-f1-c0' })
  expect(await ui.find({ key: 'restore-f1-c0' })).toBeFalsy()
  expect(await ui.find({ key: 'restore-f1-c1' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Undo all' })).toBeTruthy()
  await ui.unmount()
})

test('a drawing error shows what went wrong, and the reset brings the panel back', async ($, on) => {
  // A part saved with a brief that has no list of open tasks: drawing its card fails.
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { topic: 'topic', summary: 'summary', ...(i === 0 ? { brief: { rules: [], decisions: [], terms: [], files: [] } } : {}) })) })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'task-T1' })
  await ui.press({ key: 'chunk-c0' })
  expect(await ui.find({ type: 'Text', text: "Folio couldn't draw the panel" })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Close FolioPack and reset the panel' })).toBeTruthy()
  await ui.press({ key: 'panel-reset' })
  expect(await ui.find({ type: 'Text', text: "Folio couldn't draw the panel" })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /^Browse all 1 task ▸$/ })).toBeTruthy()
  expect(await ui.find({ key: 'chunk-c0' })).toBeFalsy()
  await ui.unmount()
})

test('kept parts past the aim are marked, and say nothing is removed by itself', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0, { decision: 'keep', tokens: 50_000 }), chunk(1, { tokens: 10_000 })] })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-context' })
  expect(await ui.find({ type: 'Text', text: /^Summaries and kept parts · 50k of 38k/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Over the aim. Nothing is removed by itself: the suggestions show what could go.' })).toBeTruthy()
  await ui.unmount()
})

test('the tokens saved so far, or that nothing is saved yet', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)], savedTokens: 12_000 })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: '12k tokens saved so far' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Nothing saved yet' })).toBeFalsy()
  await ui.unmount()
})

test('an empty chat: nothing measured yet, and nothing saved', async ($, on) => {
  stubEngine(on)
  // Claude Code has no size for the chat yet.
  on('session.usage', () => {
    throw new Error('no size yet')
  })
  await start($)
  const ui = await panel($)
  expect((await ui.findAll({ type: 'Svg' })).some(p => p.props?.alt === 'Not measured yet')).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'Nothing saved yet' })).toBeTruthy()
  await ui.unmount()
})

test("a choice whose part Claude Code's own compaction took since says recall still reads it", async ($, on) => {
  const activity = [{ id: 'k1', kind: 'choice', at: 1, text: 'Kept “Chunk 0” word for word', detail: "your choice; Folio won't fold it", chunkIds: ['c0'], choice: 'keep' }]
  stubEngine(on, { chunks: [chunk(0, { decision: 'keep', status: 'compacted' }), chunk(1)], activity })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /· since compacted by Claude Code; recall still reads it$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Folio won't fold it/ })).toBeFalsy()
  await ui.unmount()
})

// Each surface as it really draws: the engine hands every surface every
// element and draws one it lacks as nothing, so the panel goes by the surface.

test('on the terminal, which draws no pictures, the title and the figure are text, red past the ceiling, and the bars have no rounded ends', async ($, on) => {
  const { clock } = stub(on, { files: savedView({ chunks: [chunk(0)] }), model: () => '{"found": false}', usage: { tokens: 450_000, fixed: 100_000 } })
  await start($)
  await clock.advance(1000)
  const ui = await panel($, { surface: 'terminal' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain('"type":"Svg"')
  expect((await ui.find({ type: 'Text', text: /^Folio$/ }))?.props).toMatchObject({ size: 'title', weight: 'bold' })
  expect((await ui.find({ type: 'Text', text: /^450k of 400k$/ }))?.props).toMatchObject({ weight: 'bold', color: 'error' })
  await ui.unmount()
})

test('on the terminal, before the context is measured, the figure is a dash', async ($, on) => {
  stubEngine(on)
  on('session.usage', () => {
    throw new Error('no size yet')
  })
  await start($)
  const ui = await panel($, { surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^—$/ })).toBeTruthy()
  await ui.unmount()
})

test('pictures on the desktop, VS Code and mobile: the title and the figure are drawn, not written', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await panel($, { surface })
    const pictures = await ui.findAll({ type: 'Svg' })
    expect(pictures.some(p => p.props?.alt === 'Folio')).toBe(true)
    expect(pictures.some(p => p.props?.alt === 'end')).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^Folio$/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('Custom on the terminal: − and + step the ceiling and say where they stop, with no slider', async ($, on) => {
  const { toasts } = stub(on, { files: savedView({ chunks: [chunk(0)] }), model: () => '{"found": false}' })
  await start($)
  const ui = await panel($, { surface: 'terminal' })
  await ui.press({ key: 'strategy-custom' })
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeFalsy()
  expect(await ui.find({ key: 'folio-slider-ends' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /^500k$/ })).toBeTruthy()
  await ui.press({ key: 'custom-more' })
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 550k, down to \S+$/ })).toBeTruthy()
  // Four steps down reach 350k; a fifth says it is the lowest.
  for (let i = 0; i < 4; i++) await ui.press({ key: 'custom-less' })
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 350k, down to \S+$/ })).toBeTruthy()
  expect(toasts).toEqual([])
  await ui.press({ key: 'custom-less' })
  expect(toasts).toEqual(['350k is the lowest Custom ceiling.'])
  for (let i = 0; i < 10; i++) await ui.press({ key: 'custom-more' })
  expect(await ui.find({ type: 'Text', text: /^Automatic folds at 800k, down to \S+$/ })).toBeTruthy()
  expect(toasts.at(-1)).toBe('800k is the highest this chat can take.')
  await ui.unmount()
})

test('Custom on VS Code and mobile, which draw no slider region: − and +, and no slider ends left alone', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)], settings: { mode: 'watch', strategy: 'custom' } })
  await start($)
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await panel($, { surface })
    expect(await ui.find({ key: 'folio-slider-ends' })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /^Automatic folds at 500k, down to 313k$/ })).toBeTruthy()
    await ui.press({ key: 'custom-more' })
    expect(await ui.find({ type: 'Text', text: /^Automatic folds at 550k, down to \S+$/ })).toBeTruthy()
    await ui.press({ key: 'custom-less' })
    await ui.unmount()
  }
})

test('Custom on the desktop: the slider, with no − and +', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)], settings: { mode: 'watch', strategy: 'custom' } })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeTruthy()
  expect(await ui.find({ key: 'folio-slider-ends' })).toBeTruthy()
  expect(await ui.find({ key: 'custom-less' })).toBeFalsy()
  expect(await ui.find({ key: 'custom-more' })).toBeFalsy()
  await ui.unmount()
})
