// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

import { categoriesPath } from '../hooks/categories'
import { hash } from '../hooks/chunks'
import { logPath } from '../hooks/debug'
import { cardName, loadChat } from '../hooks/store'
import type { Ledger, TaskList } from '../types'
import { DIR, HOME, mountPanel, request, saved, savedView, seed, start, stubEngine, talk, test } from './engine'
import type { Engine, On } from './engine'

// The store (S1 to S9): a small index of the parts' state, one card per part,
// the tasks and the ledger in files of their own; a change writes only the
// file it changes; names Windows takes.

// The test's disk, counting each write by its path.
class Counted extends Map<string, string> {
  writes: string[] | undefined

  override set(path: string, text: string) {
    ;(this.writes ??= []).push(path)

    return super.set(path, text)
  }
}

// Reads files as the engine does, for what a hook reads outside a hook.
const reader = (files: Map<string, string>) =>
  ({
    fs: {
      read: async (path: string) => {
        const text = files.get(path)
        if (text === undefined) throw new Error(`no file ${path}`)

        return text
      },
    },
  }) as never

const card = (files: Map<string, string>, id: string) => JSON.parse(files.get(`${DIR}/parts/${cardName(id)}`)!) as Record<string, unknown>

test('a chat is kept as a small index, a card per part, its tasks and its ledger', async ($, on) => {
  const messages = talk(3)
  const files = seed(messages, 'watch')
  stubEngine(on, { files, messages })
  await start($)
  const index = saved(files)
  expect(index.version).toBe(3)
  const first = index.chunks[0]!
  // The index holds where each part is and how it stands; the card holds what was said of it.
  expect(Object.keys(first).sort()).toEqual(['decision', 'id', 'isSummarised', 'keptAtFold', 'opening', 'order', 'prompt', 'recalls', 'status', 'task', 'taskWhy', 'title', 'tokens'].sort())
  expect(card(files, first.id)).toMatchObject({ version: 1, id: first.id, order: 0, title: 'chunk 0', task: 'T1', topic: 'topic 0', summary: 'summary of chunk 0', outline: [], files: [] })
  expect(JSON.parse(files.get(`${DIR}/tasks.json`)!)).toMatchObject({ version: 1, next: 4 })
  // Version 3: the values of parts saved before values were kept are in it, by the tighter rule (none here).
  expect(JSON.parse(files.get(`${DIR}/ledger.json`)!)).toMatchObject({ version: 3, items: [] })
})

test('a change writes only the files it changes; a load that changes nothing writes nothing', async ($, on) => {
  const messages = talk(3)
  const files = new Counted(seed(messages, 'watch'))
  const { clock } = stubEngine(on, { files, messages })
  await start($)
  await clock.advance(1000)
  files.writes = []
  // The person switches the mode: the chat's state, in the index, is all that changes.
  const ui = await mountPanel($)
  await ui.press({ key: 'mode-auto' })
  await clock.advance(1000)
  expect(files.writes.filter(p => !p.includes('/log/'))).toEqual([`${DIR}/index.json`])
  await ui.unmount()
})

test('a second load of a saved chat writes none of its files again', async ($, on) => {
  const messages = talk(3)
  const first = new Counted(seed(messages, 'watch'))
  const once = stubEngine(on, { files: first, messages })
  on('session.end', () => ({ sessionId: 'test-session' }) as never)
  await start($)
  await once.clock.advance(1000)
  // The same disk, opened again by a new session of the mod.
  await $.session.end({ reason: 'exit' } as never)
  first.writes = []
  await start($)
  await once.clock.advance(1000)
  // The index, the cards, the tasks and the ledger (the newest part's original is saved again as it grows, as before).
  expect(first.writes.filter(p => p.startsWith(`${DIR}/`) && !p.includes('/originals/'))).toEqual([])
})

test('file names are lower-case, prefixed and free of what Windows refuses; on Windows they sit under USERPROFILE', async ($, on) => {
  expect(cardName('1mr1dyo-3')).toBe('p-1mr1dyo-3.json')
  expect(cardName('Odd:Name/CON')).toBe('p-odd-name-con.json')
  const files = new Map<string, string>()
  const { clock } = stubEngine(on, { files, messages: talk(2), env: { USERPROFILE: 'D:\\home\\me' } })
  await start($, 'C:\\w')
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  const written = [...files.keys()].filter(k => k.includes('/parts/'))
  expect(written.length).toBeGreaterThan(0)
  expect(written.every(k => /D:\/home\/me\/\.claude\/folio\/sessions\/test-session\/parts\/p-[a-z0-9.-]+\.json$/.test(k))).toBe(true)
})

test('a part whose card never got written takes its summary from the index copy an upgrade kept, and gets its card again', async ($, on) => {
  const messages = talk(3)
  const files = seed(messages, 'watch')
  // A folded part: nothing the chat does changes its card, so only the fix writes it again.
  savedView({ ...saved(files), chunks: saved(files).chunks.map((c, i) => (i === 0 ? { ...c, status: 'folded' } : c)) }, files)
  const { clock } = stubEngine(on, { files, messages })
  on('session.end', () => ({ sessionId: 'test-session' }) as never)
  await start($)
  await clock.advance(1000)
  const id = saved(files).chunks[0]!.id
  files.delete(`${DIR}/parts/${cardName(id)}`)
  expect((await loadChat(reader(files), DIR))!.chunks!.find(c => c.id === id)).toMatchObject({ isSummarised: true, summary: 'summary of chunk 0' })
  await $.session.end({ reason: 'exit' } as never)
  await start($)
  const ui = await mountPanel($)
  await ui.press({ key: 'mode-auto' })
  await clock.advance(1000)
  expect(card(files, id)).toMatchObject({ summary: 'summary of chunk 0' })
  await ui.unmount()
})

test("another chat's parts are read with their cards, for a whole-project pack", async ($, on) => {
  const messages = talk(2)
  const files = seed(messages, 'watch')
  const { clock } = stubEngine(on, { files, messages })
  await start($)
  await clock.advance(1000)
  // The chat as another chat's Folio finds it: saved as version 3.
  const other = `${HOME}/.claude/folio/sessions/other`
  for (const [k, v] of [...files]) if (k.startsWith(`${DIR}/`)) files.set(k.replace(DIR, other), v)
  const chat = await loadChat(reader(files), other)
  expect(chat!.version).toBe(3)
  expect(chat!.chunks!.map(c => c.summary)).toEqual(['summary of chunk 0', 'summary of chunk 1'])
})

// The test's disk, where reads or writes of the paths `fails` names throw, as
// a disk that is gone, full or locked would.
class Failing extends Map<string, string> {
  fails: ((path: string, how: 'read' | 'write') => boolean) | undefined

  override get(path: string) {
    if (this.fails?.(path, 'read')) throw new Error(`can't read ${path}`)

    return super.get(path)
  }

  override set(path: string, text: string) {
    if (this.fails?.(path, 'write')) throw new Error(`can't write ${path}`)

    return super.set(path, text)
  }
}

// What the chat's folder holds, the log left out.
const chatFiles = (files: Map<string, string>) => new Map([...files].filter(([path]) => path.startsWith(`${DIR}/`)))

test('a load that fails leaves every file as it was: no change, press or request writes over the chat (SB1)', async ($, on) => {
  const messages = talk(3)
  const files = new Failing(seed(messages, 'watch'))
  const before = chatFiles(files)
  // The copy of the index an upgrade keeps can't be written.
  files.fails = (path, how) => how === 'write' && path.endsWith('/index.v1.json')
  const engine = stubEngine(on, { files, messages })
  const { clock, toasts } = engine
  await start($)
  await clock.advance(1000)
  expect(toasts.some(t => t.startsWith("Folio couldn't open this chat's saved parts (") && t.endsWith('changes none of its files until Claude Code starts again.'))).toBe(true)
  // A request's size, a press and a turn's end each come and go.
  await request($, engine, 100_000)
  const ui = await mountPanel($)
  await ui.press({ key: 'mode-auto' }).catch(() => {})
  await ui.unmount()
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  expect(chatFiles(files)).toEqual(before)
})

test('an upgrade cut short is done again at the next load, its tasks and ledger with it (SB2)', async ($, on) => {
  const messages = talk(3)
  const files = new Failing(seed(messages, 'watch'))
  savedView({ ...saved(files), briefDigest: { ids: [], rules: ['Number every render'], decisions: [], terms: [], files: [], openTasks: [] } }, files)
  // The ledger can't be written in the first session, as if the app quit in
  // the middle of the upgrade's save.
  let isFirst = true
  files.fails = (path, how) => how === 'write' && path === `${DIR}/ledger.json` && isFirst
  const { clock } = stubEngine(on, { files, messages })
  on('session.end', () => ({ sessionId: 'test-session' }) as never)
  await start($)
  await clock.advance(1000)
  await $.session.end({ reason: 'exit' } as never)
  isFirst = false
  await start($)
  await clock.advance(1000)
  expect(saved(files).version).toBe(3)
  expect((JSON.parse(files.get(`${DIR}/ledger.json`)!) as Ledger).items.map(x => x.text)).toEqual(['Number every render'])
  expect((JSON.parse(files.get(`${DIR}/tasks.json`)!) as TaskList).tasks.length).toBeGreaterThan(0)
})

// A chat saved by this Folio (version 3, upgraded from version 1) with a
// fourth part saved since the upgrade, and the disk's listing of its cards.
async function savedChat($: Engine, on: On) {
  const messages = talk(3)
  const files = seed(messages, 'watch')
  const tree: Record<string, FsEntry[]> = {}
  const { clock, toasts } = stubEngine(on, { files, messages, tree })
  on('session.end', () => ({ sessionId: 'test-session' }) as never)
  await start($)
  await clock.advance(1000)
  messages.push(...talk(5).slice(6))
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  await $.session.end({ reason: 'exit' } as never)
  tree[`${DIR}/parts`] = [...files.keys()].filter(k => k.startsWith(`${DIR}/parts/`)).map(k => ({ name: k.slice(k.lastIndexOf('/') + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false }))

  return { files, clock, toasts }
}

const KEPT = `${DIR}/damaged-1970-01-01T00-00-02-000Z`

test('a damaged index is kept aside and the copy an upgrade kept stands in; no part number is given twice (SB3)', async ($, on) => {
  const { files, clock } = await savedChat($, on)
  const index = files.get(`${DIR}/index.json`)!
  const [tasks, ledger] = [files.get(`${DIR}/tasks.json`)!, files.get(`${DIR}/ledger.json`)!]
  const numbers = saved(files).chunks.map(c => c.order)
  expect(Math.max(...numbers)).toBeGreaterThanOrEqual(3)
  // A write cut short: the index ends half way.
  files.set(`${DIR}/index.json`, index.slice(0, Math.round(index.length / 2)))
  await start($)
  await clock.advance(1000)
  expect(files.get(`${KEPT}/index.json`)).toBe(index.slice(0, Math.round(index.length / 2)))
  // The upgrade builds the tasks and the ledger again; those it replaces are kept beside it.
  expect([files.get(`${KEPT}/tasks.json`), files.get(`${KEPT}/ledger.json`)]).toEqual([tasks, ledger])
  const now = saved(files)
  expect(now.version).toBe(3)
  expect(now.chunks.length).toBeGreaterThan(0)
  expect(now.nextPart).toBeGreaterThan(Math.max(...numbers))
  const logged = (files.get(`${HOME}/.claude/folio/log/1970-01-01/test-session.jsonl`) ?? '').split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  expect(logged.find(l => l.kind === 'damaged')).toMatchObject({ files: ['index.json', 'tasks.json', 'ledger.json'] })
})

test('a damaged ledger or task list is kept aside, and no id is given twice (SB3)', async ($, on) => {
  const { files, clock } = await savedChat($, on)
  const ledger = JSON.stringify({ version: 2, next: { R: 4, D: 2 }, items: [{ id: 'R3', kind: 'rule', text: 'a rule', status: 'open', from: 0, touched: 0 }] })
  const tasks = JSON.parse(files.get(`${DIR}/tasks.json`)!) as TaskList
  files.set(`${DIR}/ledger.json`, ledger.slice(0, -20))
  files.set(`${DIR}/tasks.json`, JSON.stringify(tasks).slice(0, -5))
  await start($)
  await clock.advance(1000)
  expect(files.get(`${KEPT}/ledger.json`)).toBe(ledger.slice(0, -20))
  expect(files.get(`${KEPT}/tasks.json`)).toBe(JSON.stringify(tasks).slice(0, -5))
  const now = JSON.parse(files.get(`${DIR}/ledger.json`)!) as Ledger
  expect(now.next.R).toBe(4)
  // The tasks the parts name are back, and the next task's number is past them all.
  const rebuilt = JSON.parse(files.get(`${DIR}/tasks.json`)!) as TaskList
  expect(rebuilt.tasks.map(t => t.id)).toEqual(tasks.tasks.map(t => t.id))
  expect(rebuilt.next).toBe(tasks.next)
})

test('an index a newer Folio saved is left as it was (SC4)', async ($, on) => {
  const messages = talk(3)
  const files = seed(messages, 'watch')
  savedView({ ...saved(files), version: 4, somethingNew: [1, 2] }, files)
  const before = chatFiles(files)
  const { clock, toasts } = stubEngine(on, { files, messages })
  await start($)
  await clock.advance(1000)
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  expect(chatFiles(files)).toEqual(before)
  expect(toasts.some(t => t.includes('a newer Folio saved this chat (index version 4; this one reads up to 3): update Folio'))).toBe(true)
})

test('a part saved with an outline section missing its points reads as one with none, and the panel still lists its task', async ($, on) => {
  const { files, clock } = await savedChat($, on)
  const id = saved(files).chunks[0]!.id
  const path = `${DIR}/parts/${cardName(id)}`
  // A card another or an older Folio wrote, or one edited by hand.
  files.set(path, JSON.stringify({ ...card(files, id), outline: [{ heading: 'Routes', body: 'the routes', from: 0, to: 1 }] }))
  // It is folded, so the meter and the folded history count its outline.
  savedView({ ...saved(files), folds: 1, chunks: saved(files).chunks.map(c => (c.id === id ? { ...c, status: 'folded' } : c)) }, files)
  expect((await loadChat(reader(files), DIR))!.chunks!.find(c => c.id === id)!.sections).toEqual([{ heading: 'Routes', body: 'the routes', points: [], from: 0, to: 1 }])
  await start($)
  await clock.advance(1000)
  const ui = await mountPanel($)
  await ui.press({ key: 'open-chunks' })
  expect(await ui.find({ key: 'task-T1' })).toBeTruthy()
  await ui.unmount()
})

test("a part's card, a chat's log and a project's categories keep the very names they had before one maker named them all (SU3)", () => {
  // The rules each kept apart, as they were.
  const oldCard = (id: string) => `p-${id.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}.json`
  const oldLog = (id: string) => id.replace(/[^A-Za-z0-9.-]/g, '-').toLowerCase() || 'unknown'
  const oldSlug = (root: string) => root.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(-60)
  const parts = ['1mr1dyo-3', 'xonuz2', '15vthog', 'p0-2', 'c12', 'a', 'Odd:Name/CON', 'o1']
  const chats = ['6edd0f98-4e6f-4908-a93d-cbebc6996f6c', 'test-session', 'ABC_123', '', 'other-chat']
  const roots = ['/Users/me/Projects/Video Edits', '/w', 'C:/Users/Me/Projects/My Film (2026)', 'D:/Folio Packs/v1.2-final', '/Users/zoë/Projekte/İşler', `/home/me/${'deep/'.repeat(20)}project`]
  for (const id of parts) expect(cardName(id)).toBe(oldCard(id))
  for (const id of chats) expect(logPath('/h', '2026-11-21T00:00:00.000Z', id)).toBe(`/h/.claude/folio/log/2026-11-21/${oldLog(id)}.jsonl`)
  for (const root of roots) expect(categoriesPath('/h', root)).toBe(`/h/.claude/folio/categories/${oldSlug(root)}-${hash(root)}.json`)
})
