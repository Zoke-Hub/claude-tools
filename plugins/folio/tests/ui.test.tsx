// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect, test } from 'claude-code/testing'
import type { RenderSurface } from 'claude-code'

import { callTool, mountFooter, mountPanel, savedView, stubEngine as stub, start } from './engine'
import type { Engine, On } from './engine'

// A saved chunk in the chat, summarised, as an earlier run left it: 50k tokens
// unless the test says otherwise.
const chunk = (i: number, patch: object = {}) => ({ id: `c${i}`, order: i, title: `Chunk ${i}`, tokens: 50_000, isSummarised: true, status: 'live', exactReason: null, ...patch })

// `saved` is the session's index file, as an earlier run left it. Returns what
// the engine sees of Folio: the panes it opens and the light model's prompts.
function stubEngine(on: On, saved?: object) {
  return stub(on, { files: saved === undefined ? undefined : savedView(saved), model: () => '{"found": false}' })
}

// The panel at the width and height these tests draw it.
const panel = <P extends RenderSurface = 'desktop'>($: Engine, o: { surface?: P; columns?: number } = {}) => mountPanel($, { columns: 80, rows: 60, ...o })

// The Custom slider for the slider's tests: Custom chosen, its region 100
// cells wide. A press is a down and an up at one column.
const SLIDER = { in: 'folio-custom-slider' } as const
async function customSlider($: Engine, on: On) {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'strategy-custom' })
  await ui.resize({ columns: 100, rows: 1, ...SLIDER })

  return ui
}
type Mounted = Awaited<ReturnType<typeof customSlider>>
async function dragTo(ui: Mounted, x: number) {
  await ui.pointer({ type: 'down', x, y: 0, button: 'left', ...SLIDER })
  await ui.pointer({ type: 'up', x, y: 0, button: 'left', ...SLIDER })
}
// Where the knob sits: the share of its layer before it (0 at the lowest stop,
// 100 at the highest), after the layer's 1 px edge.
async function knobAt(ui: Mounted) {
  const boxes = await ui.findAll({ type: 'Box', ...SLIDER })
  const layer = boxes.findIndex(box => box.props?.position === 'absolute')

  return Number(boxes[layer + 2]?.props?.flexGrow ?? -1)
}

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

test('the footer: Folio and the tokens saved in a dim button, with the count that folds next before it in amber', async ($, on) => {
  stubEngine(on, { savedTokens: 1300, foldNext: ['c0'], chunks: [chunk(0, { tokens: 9000, exactReason: 'exact values' })] })
  await start($)
  const footer = await mountFooter($)
  const button = await footer.find({ type: 'Button', key: 'footer-ring' })
  expect(button?.text).toBe('Folio ↓1.3k')
  expect(button?.props?.dimColor).toBe(true)
  const next = await footer.find({ type: 'Text', text: /^ 1$/ })
  expect(next?.props?.color).toBe('warning')
  expect(await footer.findAll({ type: 'Svg' })).toHaveLength(0)
  await footer.unmount()
})

test('the footer shows the count worth a look in blue while nothing folds next', async ($, on) => {
  // Four summarised chunks under the ceiling; the oldest holds exact details
  // and is undecided, so it is worth a look, but it isn't in the next fold.
  const seen = stubEngine(on, {
    savedTokens: 1300,
    foldNext: [],
    chunks: Array.from({ length: 4 }, (_, i) => chunk(i, { tokens: 9000, exactReason: i === 0 ? 'exact values' : null })),
  })
  await start($)
  const footer = await mountFooter($)
  const button = await footer.find({ type: 'Button', key: 'footer-ring' })
  expect(button?.text).toBe('Folio ↓1.3k')
  expect(button?.props?.dimColor).toBe(true)
  const look = await footer.find({ type: 'Text', text: /^ 1$/ })
  expect(look?.props?.color).toBe('suggestion')
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
    expect(await ui.find({ type: 'Text', text: /Folds only when you press Fold now/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Nothing to look at/ })).toBeTruthy()
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

test('a choice shows in the activity, and Undo puts the chunk back on the list', async ($, on) => {
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { topic: 'topic', summary: 'summary', tokens: 10_000, exactReason: i === 0 ? 'measurements' : null })) })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /^· 1$/ })).toBeTruthy()
  await ui.press({ key: 'fold-c0' })
  expect(await ui.find({ type: 'Text', text: /^· 1$/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Fine to fold: “Chunk 0”/ })).toBeTruthy()
  const undoButton = await ui.find({ type: 'Button', text: 'Undo' })
  expect(undoButton?.key?.startsWith('undo-choice-')).toBe(true)
  await ui.press({ key: undoButton!.key! })
  expect(await ui.find({ type: 'Text', text: /^· 1$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Fine to fold: “Chunk 0”/ })).toBeFalsy()
  await ui.unmount()
})

test('the meter counts work against the ceiling, and FolioPack opens from its button', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: 'Hover for each part' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Folds back to 100k|Automatic folds it back to 100k/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /newest 40k stays word for word/ })).toBeTruthy()
  await ui.press({ key: 'folio-pack' })
  expect(await ui.find({ type: 'Button', text: 'Pack up' })).toBeTruthy()
  await ui.press({ key: 'pack-close' })
  expect(await ui.find({ type: 'Button', text: 'Pack up' })).toBeFalsy()
  // Closing keeps the form: it opens again as it was, with no new scan.
  await ui.press({ key: 'folio-pack' })
  expect(await ui.find({ type: 'Button', text: 'Close' })).toBeTruthy()
  await ui.unmount()
})

test('What fills the context shows its rows from the start, and folds away', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /Work · counts toward the fold/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Summaries and kept parts · \S+ of / })).toBeTruthy()
  await ui.press({ key: 'open-context-closed' })
  expect(await ui.find({ type: 'Text', text: /Summaries and kept parts · \S+ of / })).toBeFalsy()
  await ui.unmount()
})

test('the footer count always shows: dim at 0, red once the work is past the ceiling', async ($, on) => {
  stubEngine(on, { settings: { mode: 'watch', strategy: 'balanced' }, foldNext: [], chunks: [chunk(0, { tokens: 9000 })] })
  await start($)
  const footer = await mountFooter($)
  const zero = await footer.find({ type: 'Text', text: /^ 0$/ })
  expect(zero?.props?.dimColor).toBe(true)
  expect(zero?.props?.color).toBeUndefined()
  await footer.unmount()
})

test('over the ceiling the count turns red, even at 0', async ($, on) => {
  stubEngine(on, { settings: { mode: 'watch', strategy: 'balanced' }, foldNext: [], chunks: Array.from({ length: 8 }, (_, i) => chunk(i, { tokens: 30_000 })) })
  await start($)
  const footer = await mountFooter($)
  const count = await footer.find({ type: 'Text', text: /^ \d+$/ })
  expect(count?.props?.color).toBe('error')
  await footer.unmount()
})

test('the Custom slider shows only while Custom is chosen, and its value sets the numbers', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  const ui = await panel($)
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeFalsy()
  await ui.press({ key: 'strategy-custom' })
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /at 500k, back to 250k · newest 100k/ })).toBeTruthy()
  // A drag ends on a stop, and the numbers follow it.
  await ui.resize({ columns: 100, rows: 1, ...SLIDER })
  await dragTo(ui, 99)
  expect(await ui.find({ type: 'Text', text: /at 700k, back to 350k · newest 140k/ })).toBeTruthy()
  await dragTo(ui, 29)
  expect(await ui.find({ type: 'Text', text: /at 450k, back to 225k/ })).toBeTruthy()
  // Any other strategy takes the slider away.
  await ui.press({ key: 'strategy-lean' })
  expect(await ui.find({ key: 'folio-custom-slider' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /at 150k, back to 70k/ })).toBeTruthy()
  await ui.unmount()
})

test('Worth a look, Recent activity and the brief start open, fold up, and stay as left', async ($, on) => {
  stubEngine(on, { chunks: [chunk(0)] })
  await start($)
  let ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /Nothing to look at/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Folds, trims, tidies/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Empty so far|fills as chunks/ })).toBeTruthy()
  await ui.press({ key: 'section-looks' })
  await ui.press({ key: 'section-activity' })
  await ui.press({ key: 'section-brief' })
  expect(await ui.find({ type: 'Text', text: /Nothing to look at/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Folds, trims, tidies/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /fills as chunks/ })).toBeFalsy()
  // Closing and opening the panel leaves them folded; their titles stay.
  await ui.unmount()
  ui = await panel($)
  expect(await ui.find({ type: 'Text', text: /Folds, trims, tidies/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Recent activity ▸/ })).toBeTruthy()
  await ui.press({ key: 'section-activity' })
  expect(await ui.find({ type: 'Text', text: /Folds, trims, tidies/ })).toBeTruthy()
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

test('an opened chunk has one way back under it, and its name still shuts it', async ($, on) => {
  stubEngine(on, { chunks: [0, 1, 2].map(i => chunk(i, { topic: 'topic', summary: 'summary', tokens: 10_000 })) })
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'chunk-c1' })
  expect(await ui.findAll({ type: 'Button', text: /^← Back to all 3 chunks$/ })).toHaveLength(1)
  expect(await ui.find({ key: 'chunks-back' })).toBeTruthy()
  // Pressing the chunk's name again shuts it, back to the whole list.
  await ui.press({ key: 'chunk-c1' })
  expect(await ui.findAll({ type: 'Button', text: /^← Back to all/ })).toHaveLength(0)
  expect(await ui.find({ key: 'chunk-c0' })).toBeTruthy()
})

test("the slider's knob is a large disc on the track that covers a rounded end at the lowest and highest stop", async ($, on) => {
  const ui = await customSlider($, on)
  // A large disc at the caption size (about 10 px, a little past the 8 px track), with a 2 px spacer under it that
  // lifts it 1 px, onto the track's centre.
  const knob = await ui.find({ type: 'Text', text: '⬤', ...SLIDER })
  expect(knob?.props?.size).toBe('caption')
  expect(JSON.stringify(await ui.drawn({ ...SLIDER }))).toContain('"height":0.1')
  // The rounded ends' colours: the slider's "start", and the first "end" after it (the bars have "end" caps too).
  const ends = async () => {
    const svgs = await ui.findAll({ type: 'Svg' })
    const start = svgs.findIndex(svg => svg.props?.alt === 'start')
    const fillOf = (source: unknown) => /fill="([^"]+)"/.exec(String(source ?? ''))?.[1] ?? null
    return [fillOf(svgs[start]?.props?.source), fillOf(svgs.slice(start + 1).find(svg => svg.props?.alt === 'end')?.props?.source)]
  }
  expect(await ends()).toEqual(['#6e8fc7', '#6e6e6e'])
  // At the highest stop the knob is at the far end, over the rounded end. Neither end changes colour with the value
  // (the panel doesn't redraw during a drag): the start stays blue, where the fill's gradient starts.
  await dragTo(ui, 99)
  expect(await knobAt(ui)).toBe(100)
  expect(await ends()).toEqual(['#6e8fc7', '#6e6e6e'])
  // At the lowest stop it is over the start.
  await dragTo(ui, 0)
  expect(await knobAt(ui)).toBe(0)
  expect(await ends()).toEqual(['#6e8fc7', '#6e6e6e'])
  await ui.unmount()
})

test("the slider's fill is a gradient fixed to the track: blue to 500k, stripes to amber at 550k, amber past it", async ($, on) => {
  const ui = await customSlider($, on)
  // The fill's colours in order: every painted stretch of the track but the open and closed rest.
  const fills = async () =>
    (await ui.findAll({ type: 'Box', ...SLIDER }))
      .map(box => box.props?.backgroundColor)
      .filter((color): color is string => typeof color === 'string' && color !== '#6e6e6e' && color !== '#333333')
  const red = (hex: string) => parseInt(hex.slice(1, 3), 16)
  // At 500k the fill is all blue: the gradient starts where it ends.
  await dragTo(ui, 42)
  expect(await ui.find({ type: 'Text', text: /at 500k, back to/ })).toBeTruthy()
  expect(await fills()).toEqual(['#6e8fc7'])
  // At 550k the stripes follow the blue, warming step by step to nearly amber at the knob.
  await dragTo(ui, 56)
  expect(await ui.find({ type: 'Text', text: /at 550k, back to/ })).toBeTruthy()
  const at550 = await fills()
  expect(at550).toHaveLength(33)
  expect(at550[0]).toBe('#6e8fc7')
  const stripes = at550.slice(1)
  expect(stripes.every((color, i) => i === 0 || red(color) > red(stripes[i - 1]!))).toBe(true)
  expect(red(stripes[0]!)).toBeLessThan(0x80)
  expect(red(stripes[31]!)).toBeGreaterThan(0xd8)
  // At the top stop the same blue and stripes, then amber to the knob.
  await dragTo(ui, 99)
  const at700 = await fills()
  expect(at700.slice(0, 33)).toEqual(at550)
  expect(at700.slice(33)).toEqual(['#e3b063'])
  await ui.unmount()
})

test('a drag moves the knob with every stop, and the panel ends on the last one', async ($, on) => {
  const ui = await customSlider($, on)
  await ui.pointer({ type: 'down', x: 10, y: 0, button: 'left', ...SLIDER })
  const first = await knobAt(ui)
  await ui.pointer({ type: 'move', x: 60, y: 0, button: 'left', ...SLIDER })
  const moved = await knobAt(ui)
  await ui.pointer({ type: 'move', x: 90, y: 0, button: 'left', ...SLIDER })
  await ui.pointer({ type: 'up', x: 90, y: 0, button: 'left', ...SLIDER })
  expect(moved).toBeGreaterThan(first)
  expect(await knobAt(ui)).toBeGreaterThan(moved)
  expect(await ui.find({ type: 'Text', text: /at 650k, back to/ })).toBeTruthy()
  // A press with no drag afterwards still lands.
  await ui.pointer({ type: 'down', x: 30, y: 0, button: 'left', ...SLIDER })
  await ui.pointer({ type: 'up', x: 30, y: 0, button: 'left', ...SLIDER })
  expect(await ui.find({ type: 'Text', text: /at 450k, back to/ })).toBeTruthy()
  await ui.unmount()
})
