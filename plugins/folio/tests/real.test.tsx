// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect, test } from 'claude-code/testing'

import { mountPanel, savedView, stubEngine, start } from './engine'

// A long chat: more chunks than the panel's tree may nest boxes deep, some
// folded, kept, flagged and fine to fold.
const saved = {
  chunks: Array.from({ length: 45 }, (_, i) => ({
    id: `c${i}`,
    order: i,
    title: `Chunk ${i}`,
    tokens: 8000 + i * 300,
    isSummarised: i < 44,
    status: i < 10 ? 'folded' : i < 14 ? 'compacted' : 'live',
    decision: i === 20 ? 'keep' : i === 21 ? 'fold' : null,
    exactReason: i === 25 ? 'values still in use' : null,
    brief: {
      requests: [`request ${i}`],
      rules: [`rule ${i}`],
      decisions: Array.from({ length: 3 }, (_, n) => `decision ${i}.${n}`),
      terms: Array.from({ length: 2 }, (_, n) => `term ${i}.${n}`),
      files: Array.from({ length: 3 }, (_, n) => `/w/file-${i}-${n}.md`),
      openTasks: [`task ${i}`],
    },
  })),
  foldNext: ['c25'],
}

test('the panel draws a long chat (more chunks than boxes may nest)', async ($, on) => {
  stubEngine(on, { files: savedView(saved) })
  await start($)
  const ui = await mountPanel($, { columns: 110, rows: 60 })
  expect(await ui.find({ type: 'Text', text: 'by Zoke' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Too much was open/ })).toBeFalsy()
  // Opening the brief of a long chat still draws, and buttons still answer.
  await ui.press({ key: 'open-brief:decisions' })
  expect(await ui.find({ type: 'Text', text: /decision 44\.2/ })).toBeTruthy()
  // Next and Previous step through the list a page at a time, showing the range.
  expect(await ui.find({ type: 'Text', text: /^1–8$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Next 30' })).toBeTruthy()
  await ui.press({ key: 'brief:decisions:next' })
  expect(await ui.find({ type: 'Text', text: /^9–38$/ })).toBeTruthy()
  await ui.press({ key: 'brief:decisions:next' })
  expect(await ui.find({ type: 'Text', text: /^39–68$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /decision 44\.2/ })).toBeFalsy()
  await ui.press({ key: 'brief:decisions:prev' })
  expect(await ui.find({ type: 'Text', text: /^9–38$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Previous 8' })).toBeTruthy()
  await ui.press({ key: 'brief:decisions:prev' })
  expect(await ui.find({ type: 'Text', text: /decision 44\.2/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Too much was open/ })).toBeFalsy()
  // Opening the chunks shuts the brief's list: one open at a time.
  await ui.press({ key: 'open-chunks' })
  expect(await ui.find({ type: 'Button', text: /^Chunk 40 ▸$/ })).toBeTruthy()
  // Each row starts with its part number, as recall and the history use it.
  expect(await ui.find({ type: 'Text', text: /^41$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /decision 44\.2/ })).toBeFalsy()
  // An opened chunk shows alone; Browse all, shut and opened again, shows the list.
  await ui.press({ key: 'chunk-c40' })
  expect(await ui.find({ type: 'Button', text: /^Chunk 41 ▸$/ })).toBeFalsy()
  await ui.press({ key: 'open-chunks' })
  await ui.press({ key: 'open-chunks' })
  expect(await ui.find({ type: 'Button', text: /^Chunk 41 ▸$/ })).toBeTruthy()
  await ui.press({ key: 'chunks:next' })
  expect(await ui.find({ type: 'Text', text: /^13–24$/ })).toBeTruthy()
  await ui.unmount()
})
