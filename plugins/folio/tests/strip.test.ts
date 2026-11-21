// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect, test } from 'claude-code/testing'
import type { EngineInterface, SessionMessage } from 'claude-code'

import { REBUILD_ASK } from '../hooks/actions'
import { chunksOf, messageTexts, splitChunks, toolResultsOf } from '../hooks/chunks'
import { buildFolded, isPaired, noPlan, planFold, protectedIds } from '../hooks/fold'
import type { Original } from '../hooks/store'
import { cardName, EMPTY_VIEW, normaliseChunk } from '../hooks/store'
import { inputNote } from '../hooks/strip'
import type { ChunkRecord, PickerView } from '../types'
import { DIR, mountPanel, openChat, request, saved, savedView, seed, start, stubEngine } from './engine'
import type { Engine } from './engine'

// The stripped stage (F8): a part between word for word and folded, its words
// kept, its big tool inputs and results each a one-line note.

const noFs = {} as EngineInterface
const user = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })

// A turn that writes a file of `size` characters with a long command after it,
// a short command, and a small edit, each with its result.
function writes(n: number, size = 20_000): SessionMessage[] {
  const call = (id: string, tool: string, input: Record<string, unknown>, result: string): SessionMessage[] => [
    { role: 'assistant', text: `step ${id}`, toolUses: [{ tool_use_id: id, tool, input }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: result, isError: false }] },
  ]

  return [
    user(`write file ${n}`),
    ...call(`w${n}`, 'Write', { file_path: `/p/file${n}.py`, content: `# file ${n}\n${'print(1)\n'.repeat(size / 9)}` }, 'File created.'),
    ...call(`b${n}`, 'Bash', { command: `python3 - <<'EOF'\n${'x = 1\n'.repeat(500)}EOF`, description: `Run the long script ${n}` }, `ran ${n}\n${'out\n'.repeat(1000)}`),
    ...call(`s${n}`, 'Bash', { command: 'ls -la', description: 'List files' }, 'a\nb'),
    ...call(`e${n}`, 'Edit', { file_path: `/p/file${n}.py`, old_string: 'print(1)', new_string: 'print(2)' }, 'Edited.'),
    { role: 'assistant', text: `wrote ${n}`, toolUses: [] },
  ]
}

function chatOf(turns: number): SessionMessage[] {
  return Array.from({ length: turns }, (_, n) => writes(n)).flat()
}

function viewOf(messages: SessionMessage[], patch: (c: ChunkRecord) => Partial<ChunkRecord> = () => ({})): PickerView {
  const chunks = chunksOf(splitChunks(messages)).map((s, order) => {
    const c = normaliseChunk({ ...s, order, title: `part ${order}`, summary: `summary ${order}`, tokens: s.tokens, isSummarised: true })

    return { ...c, ...patch(c) }
  })

  return { ...EMPTY_VIEW, chunks }
}

const useOf = (out: readonly SessionMessage[], id: string) => out.flatMap(m => m.toolUses).find(u => u.tool_use_id === id)!

test('a stripped input keeps its keys, only its long values become a note naming the part, and its words stay', async () => {
  const messages = chatOf(20)
  const v = viewOf(messages)
  // Just over the floor: the oldest part is stripped and nothing folds.
  const plan = planFold(messages, v, 260_000)
  expect(plan.foldIds).toEqual([])
  expect(plan.trimIds[0]).toBe(v.chunks[0]!.id)
  const { messages: out } = await buildFolded(noFs, messages, v, plan)
  expect(isPaired(out)).toBe(true)
  const write = useOf(out, 'w0')
  const before = useOf(messages, 'w0')
  expect(Object.keys(write.input)).toEqual(Object.keys(before.input))
  expect(write.input.file_path).toBe('/p/file0.py')
  const length = (before.input.content as string).length
  expect(write.input.content).toBe(`[Folio stripped this input to save room: ${length.toLocaleString('en-US')} characters. Recall part 1 for it word for word; don't rebuild it from memory.]`)
  expect(write.input.content).toBe(inputNote(length, 1))
  // A long command goes too; its description stays.
  const script = useOf(out, 'b0')
  expect(script.input.command).toBe(inputNote((useOf(messages, 'b0').input.command as string).length, 1))
  expect(script.input.description).toBe('Run the long script 0')
  // The big result is a note naming the part; the person's and Claude's words are as they were.
  const result = out.flatMap(m => m.toolResults ?? []).find(r => r.tool_use_id === 'b0')!
  expect(result.text.startsWith('[Folio stripped this Bash result to save room: ')).toBe(true)
  expect(result.text).toContain('Recall part 1 for it word for word')
  for (const text of ['write file 0', 'step w0', 'step b0', 'wrote 0']) expect(out.some(m => m.text === text)).toBe(true)
})

test('a short command and a small edit are never stripped, even in a stripped part', async () => {
  const messages = chatOf(20)
  const v = viewOf(messages)
  const plan = planFold(messages, v, 260_000)
  const { messages: out } = await buildFolded(noFs, messages, v, plan)
  // The very messages, handle and all: nothing in them changed.
  for (const id of ['s0', 'e0']) {
    const at = messages.findIndex(m => m.toolUses.some(u => u.tool_use_id === id))
    expect(out).toContain(messages[at]!)
    expect(out).toContain(messages[at + 1]!)
  }
  // An input just under 2,000 characters stays whole too, in a part stripped.
  const near: SessionMessage[] = [user('one more'), { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'n1', tool: 'Bash', input: { command: 'y'.repeat(1_900) } }] }, { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'n1', text: 'ok', isError: false }] }]
  const both = [...near, ...chatOf(20)]
  const w = viewOf(both)
  const out2 = (await buildFolded(noFs, both, w, { ...noPlan(), trimIds: [w.chunks[0]!.id] })).messages
  expect(out2).toContain(near[1]!)
})

test('a kept part is never stripped or folded, and neither is the newest work', async () => {
  const messages = chatOf(20)
  const first = chunksOf(splitChunks(messages))[0]!.id
  const v = viewOf(messages, c => (c.id === first ? { decision: 'keep' } : {}))
  const plan = planFold(messages, v, 900_000)
  expect(plan.trimIds).not.toContain(first)
  expect(plan.foldIds).not.toContain(first)
  const newest = protectedIds(messages, v)
  for (const id of newest) expect([...plan.trimIds, ...plan.foldIds]).not.toContain(id)
  const { messages: out } = await buildFolded(noFs, messages, v, plan)
  expect(useOf(out, 'w0')).toBe(useOf(messages, 'w0'))
})

test('the order of removal: side turns, then the oldest live parts stripped, then the oldest stripped parts folded', async () => {
  const whole = chatOf(24)
  const ids = chunksOf(splitChunks(whole)).map(s => s.id)
  // Parts 1 and 2 were stripped at an earlier fold; part 3 is a side turn.
  // The parts are found again by their calls, where they were saved.
  const messages = (await buildFolded(noFs, whole, viewOf(whole), { ...noPlan(), trimIds: [ids[0]!, ids[1]!] })).messages
  const v = viewOf(whole, c => (c.order === 2 ? { isSide: true } : c.order <= 1 ? { status: 'trimmed' } : {}))
  expect(chunksOf(splitChunks(messages, v.chunks)).map(s => s.id)).toEqual(ids)
  // A small excess: the side turn folds, then the oldest live part is stripped.
  const small = planFold(messages, v, 260_000)
  expect(small.foldIds).toEqual([ids[2]])
  expect(small.trimIds).toEqual([ids[3]])
  // A large one: every live part past the newest work is stripped, oldest first,
  // and only the parts stripped before fold, oldest first; no live part folds (F8).
  const large = planFold(messages, v, 900_000)
  expect(large.foldIds[0]).toBe(ids[2])
  expect(large.foldIds.slice(1)).toEqual([ids[0], ids[1]])
  const live = ids.slice(3).filter(id => !protectedIds(messages, v).has(id))
  expect(large.trimIds).toEqual(live)
  // The person's own Fold now may take a live part straight to folded.
  const now = planFold(messages, v, 900_000, undefined, { isPersonFold: true })
  expect(now.foldIds).toEqual([ids[2], ids[0], ids[1], ...live])
  // A part held back (Claude's fold note) is neither stripped nor folded.
  const held = planFold(messages, v, 900_000, undefined, { held: new Set([ids[1]!, ids[4]!]) })
  expect([...held.foldIds, ...held.trimIds]).not.toContain(ids[1])
  expect([...held.foldIds, ...held.trimIds]).not.toContain(ids[4])
})

const compact = async ($: Engine, messages: SessionMessage[], instructions?: string) =>
  (await $.session.compact({ ...(instructions === undefined ? { trigger: 'auto' } : { instructions }), messages } as never)) as { messages: SessionMessage[] }

// Each part's original as Folio saves it now: each message, each result.
function wholeOriginals(files: Map<string, string>, messages: SessionMessage[]) {
  for (const s of chunksOf(splitChunks(messages))) {
    const part = messages.slice(s.start, s.end)
    const texts = messageTexts(part)
    files.set(`${DIR}/originals/${s.id}.json`, JSON.stringify({ version: 2, text: texts.join('\n'), messages: texts, toolResults: toolResultsOf(part) }))
  }
}

// Strips the oldest part by Claude Code's own compaction (which Automatic
// answers with a fold), saves the chat at a turn's end, and undoes the strip
// as the person does in Recent activity: what the rebuild gives back, and the
// part's original after the save.
async function stripSaveUndo($: Engine, on: Parameters<typeof openChat>[1], messages: SessionMessage[], files: Map<string, string>) {
  const { clock, engine } = await openChat($, on, files, messages)
  await request($, engine, 260_000)
  const done = await compact($, messages)
  const first = saved(files).chunks[0]!
  expect(first.status).toBe('trimmed')
  messages.splice(0, messages.length, ...done.messages)
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  const original = JSON.parse(files.get(`${DIR}/originals/${first.id}.json`)!) as Original
  const strip = saved(files).activity.find(a => a.kind === 'trim')!
  expect(strip.text).toMatch(/^Stripped long tool calls in \d+ parts?$/)
  const ui = await mountPanel($)
  await ui.press({ key: `undo-${strip.id}` })
  await clock.advance(1000)
  await ui.unmount()

  return { done, original, back: await compact($, messages, REBUILD_ASK) }
}

test('an original saved by an older Folio, one text with no messages or results, still gives a strip back whole', async ($, on) => {
  const messages = chatOf(20)
  const whole = JSON.parse(JSON.stringify(useOf(messages, 'w0').input)) as Record<string, unknown>
  const result = messages.flatMap(m => m.toolResults ?? []).find(r => r.tool_use_id === 'b0')!.text
  const { original, back } = await stripSaveUndo($, on, messages, seed(messages, 'auto'))
  expect(original.text).toContain(JSON.stringify(whole.content).slice(1, 200))
  expect(original.text).not.toContain('[Folio stripped this')
  expect(original.toolResults.b0).toBe(result)
  expect(useOf(back.messages, 'w0').input).toEqual(whole)
  expect(back.messages.flatMap(m => m.toolResults ?? []).find(r => r.tool_use_id === 'b0')!.text).toBe(result)
})

test('Undo gives a stripped part its inputs and outputs back word for word, after a save in between', async ($, on) => {
  const messages = chatOf(20)
  // A private value in the script: saved as a placeholder, given back as it was.
  const at = messages.findIndex(m => m.toolUses.some(u => u.tool_use_id === 'w0'))
  const use = messages[at]!.toolUses[0]!
  messages[at] = { ...messages[at]!, toolUses: [{ ...use, input: { ...use.input, content: `password = hunter2secret\n${use.input.content as string}` } }] }
  const files = seed(messages, 'auto')
  wholeOriginals(files, messages)
  const whole = JSON.parse(JSON.stringify(useOf(messages, 'w0').input)) as Record<string, unknown>
  const result = messages.flatMap(m => m.toolResults ?? []).find(r => r.tool_use_id === 'b0')!.text
  const { done, original, back } = await stripSaveUndo($, on, messages, files)
  expect(useOf(done.messages, 'w0').input.content).toBe(inputNote((whole.content as string).length, 1))
  // The save kept the words and the whole input, its private value set apart.
  expect(JSON.stringify(original.toolInputs?.w0)).not.toContain('hunter2secret')
  expect(original.toolInputs?.w0).toEqual({ ...whole, content: (whole.content as string).replace('hunter2secret', '[private:password 1]') })
  expect(original.toolResults.b0).toBe(result)
  expect(original.text).toContain(JSON.stringify(whole.content).slice(1, 200))
  expect(original.text).not.toContain('[Folio stripped this')
  expect(original.messages.join('\n')).not.toContain('[Folio stripped this')
  expect(useOf(back.messages, 'w0').input).toEqual(whole)
  expect(back.messages.flatMap(m => m.toolResults ?? []).find(r => r.tool_use_id === 'b0')!.text).toBe(result)
  expect(saved(files).chunks[0]!.status).toBe('live')
})

test("a stripped part's card keeps what it ran, after a save in between", async ($, on) => {
  const messages = chatOf(20)
  const files = seed(messages, 'auto')
  wholeOriginals(files, messages)
  const { clock, engine } = await openChat($, on, files, messages)
  const first = saved(files).chunks[0]!
  const did = () => (JSON.parse(files.get(`${DIR}/parts/${cardName(first.id)}`)!) as { did?: string[] }).did ?? []
  const ran = did().find(d => d.startsWith("ran: python3 - <<'EOF'"))
  expect(ran).toBeDefined()
  await request($, engine, 260_000)
  const done = await compact($, messages)
  expect(saved(files).chunks[0]!.status).toBe('trimmed')
  // The chat now holds the strip's notes; the turn's end saves it.
  messages.splice(0, messages.length, ...done.messages)
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  expect(did()).toContain(ran)
  expect(did().join('\n')).not.toContain('[Folio stripped this')
})

test('a part stripped before its summary came is summarised from its saved words, not the notes', async ($, on) => {
  const messages = chatOf(20)
  const files = seed(messages, 'auto')
  wholeOriginals(files, messages)
  // The oldest part's summary never came back.
  const index = saved(files)
  savedView({ ...index, chunks: index.chunks.map((c, i) => (i === 0 ? { ...c, isSummarised: false } : c)) }, files)
  let answer: string | null = null
  const engine = stubEngine(on, { files, messages, model: () => answer })
  on('session.compact', (_, e) => (Array.isArray(e.messages) ? { messages: [user('The summary.')] } : $.session.compact({ instructions: e.instructions, messages } as never)))
  await start($)
  await engine.clock.advance(1000)
  await request($, engine, 260_000)
  const done = await compact($, messages)
  expect(saved(files).chunks[0]).toMatchObject({ status: 'trimmed', isSummarised: false })
  messages.splice(0, messages.length, ...done.messages)
  // Haiku answers now: the part is summarised at the turn's end.
  answer = JSON.stringify({ title: 'Wrote file 0', topic: 'Files', carriesOn: false, summary: 'Wrote file 0 and ran a script.' })
  const before = engine.prompts.length
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await engine.clock.advance(1000)
  const prompt = engine.prompts.slice(before).find(p => p.includes('write file 0'))
  expect(prompt).toBeDefined()
  expect(prompt).toContain('x = 1')
  expect(prompt).not.toContain('[Folio stripped this')
  expect(saved(files).chunks[0]!.isSummarised).toBe(true)
})

// A disk that runs `onRead` once, at the next read of the file `at`.
class Midway extends Map<string, string> {
  at = ''
  onRead: (() => void) | null = null

  override get(path: string) {
    const run = path === this.at ? this.onRead : null
    if (run !== null) {
      this.onRead = null
      run()
    }

    return super.get(path)
  }
}

test('a fold writes its changes onto the view as it stands: a press made while it read the originals is kept', async ($, on) => {
  const messages = chatOf(20)
  const files = new Midway(seed(messages, 'auto'))
  wholeOriginals(files, messages)
  const { clock, engine } = await openChat($, on, files, messages)
  const ui = await mountPanel($)
  await request($, engine, 260_000)
  // While the fold reads the parts' originals, the person picks Watch: the
  // oldest part's original is read only there.
  let press: Promise<unknown> = Promise.resolve()
  files.at = `${DIR}/originals/${saved(files).chunks[0]!.id}.json`
  files.onRead = () => {
    press = ui.press({ key: 'mode-watch' })
  }
  await compact($, messages)
  await press
  await clock.advance(1000)
  await ui.unmount()
  expect(files.onRead).toBeNull()
  expect(saved(files).chunks[0]!.status).toBe('trimmed')
  expect(saved(files).settings.mode).toBe('watch')
})

test('Keep on a stripped part gives its words back at once, as Undo does', async ($, on) => {
  const messages = chatOf(20)
  const files = seed(messages, 'auto')
  wholeOriginals(files, messages)
  const { clock, engine, pluginAsks } = await openChat($, on, files, messages)
  await request($, engine, 260_000)
  const done = await compact($, messages)
  const first = saved(files).chunks[0]!
  expect(first.status).toBe('trimmed')
  messages.splice(0, messages.length, ...done.messages)
  const ui = await mountPanel($)
  await ui.press({ key: 'open-chunks' })
  // The oldest task is on the last page of the list, newest first.
  while (!(await ui.find({ key: `task-${first.task}` }))) await ui.press({ key: 'chunks:next' })
  await ui.press({ key: `task-${first.task}` })
  await ui.press({ key: `chunk-${first.id}` })
  await ui.press({ key: `keep-chunk-${first.id}` })
  await clock.advance(1000)
  await ui.unmount()
  expect(pluginAsks).toEqual([REBUILD_ASK])
  expect(saved(files).chunks[0]).toMatchObject({ decision: 'keep', status: 'live' })
})
