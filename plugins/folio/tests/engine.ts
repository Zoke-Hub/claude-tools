// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { mock } from 'claude-code/testing'

import { chunksOf, splitChunks, transcriptText } from '../hooks/chunks'
import { applyChanges, emptyLedger, noChanges } from '../hooks/ledger'
import type { LedgerChanges } from '../hooks/ledger'
import type { Ledger, PickerView } from '../types'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, ModelForkResult, ModelUsage, On, RenderSurface, SessionMessage } from 'claude-code'

import { HISTORY_BLOCK } from '../hooks/fold'

// What every test file builds on: the engine beneath Folio, the panel as a
// surface mounts it, and the chats Folio works on. Not a test file itself.

export type { Engine, On }

export const HOME = '/tmp/folio-test-home'
// Where Folio keeps the test chat.
export const DIR = `${HOME}/.claude/folio/sessions/test-session`
// Where a pack goes by default: the test project's Work/Folio/Folio packs.
export const PACKS = '/w/Work/Folio/Folio packs'
// A model call's usage, for an answer that cost nothing.
const NO_USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

type StubOptions = {
  // The disk: every read, write and check goes to it. A folder is there when a
  // file sits in it.
  files?: Map<string, string>
  // What each folder lists.
  tree?: Record<string, FsEntry[]>
  // The environment, HOME alone unless given.
  env?: Record<string, string>
  // An answer of its own to whether a path is there.
  exists?: (path: string) => boolean
  // The chat, as the session holds it.
  messages?: SessionMessage[]
  // The light model's answer to a prompt; null for none.
  model?: (prompt: string) => string | null | Promise<string | null>
  // What Claude Code measures of the context: its size and its own fixed part,
  // and where it compacts; `raw` and `source`: the compaction window it measures
  // against and who set it (`env` when CLAUDE_CODE_AUTO_COMPACT_WINDOW lowered it).
  usage?: { tokens: number; fixed: number; window?: number; compactAt?: number; raw?: number; source?: string; unreadFirst?: number }
  // Claude's answer to a fork of the chat ($.model.fork), as the session gives it.
  fork?: (prompt: string) => ModelForkResult | Promise<ModelForkResult>
  // The session's id as the engine reads it now ("test-session" unless given),
  // so a test can play a /clear, which goes on under a new id.
  id?: () => string
}

// A path from a file event in the form the test wrote it, on any system. The
// engine hands hooks the system's own form: on Windows, backslashes, and a drive
// letter put before a path that starts at the root, so "/tmp/x" arrives as
// "D:\tmp\x". A test of a Windows computer writes drive letters of its own, so
// `isWindows` keeps them.
const pathOf = (path: string, isWindows = false) => {
  const slashed = path.replace(/\\/g, '/')

  return isWindows ? slashed : slashed.replace(/^[A-Za-z]:(?=\/)/, '')
}

// Whether the test describes a Windows computer: Windows says so in OS, and a
// home folder on a drive letter says so too.
const describesWindows = (env: Record<string, string>) => env.OS === 'Windows_NT' || /^[A-Za-z]:/.test(env.HOME ?? env.USERPROFILE ?? '')

// The engine beneath Folio: a disk in memory, the chat, a clock that moves only
// when the test moves it, and the light model. What Folio shows, runs and asks
// comes back for the test to check.
export function stubEngine(on: On, o: StubOptions = {}) {
  const files = o.files ?? new Map<string, string>()
  const env = o.env ?? { HOME }
  const isWindows = describesWindows(env)
  // The ways the test may have written an event's path: as the engine gives it;
  // and, on a Windows computer, a path the test wrote from the root (a project
  // folder such as /w) without the drive letter the engine put before it.
  const formsOf = (path: string) => [...new Set([pathOf(path, isWindows), pathOf(path)])]
  // The key the test's disk holds an event's path under, or the one it gets.
  const keyOf = (path: string) => formsOf(path).find(p => files.has(p)) ?? pathOf(path, isWindows)
  const toasts: string[] = []
  const commands: string[] = []
  const prompts: string[] = []
  const systems: string[] = []
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'folio' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__folio__recall' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: o.id?.() ?? 'test-session' }))
  if (o.messages !== undefined) {
    const messages = o.messages
    on('session.messages', () => ({ value: messages }))
  }
  // The folder the test chat opens in is always there, as a real project's is.
  on('fs.exists', (_, e) => {
    const forms = formsOf(e.path)
    const isThere = (path: string) => o.exists?.(path) ?? (path === '/w' || files.has(path) || [...files.keys()].some(k => k.startsWith(`${path}/`)))

    return { value: forms.some(isThere) }
  })
  on('fs.read', (_, e) => {
    const key = keyOf(e.path)
    if (!files.has(key)) throw new Error(`no file ${e.path}`)

    return { value: files.get(key)! }
  })
  on('fs.write', (_, e) => {
    files.set(keyOf(e.path), e.text)

    return { value: undefined }
  })
  on('fs.list', (_, e) => ({ value: formsOf(e.path).map(path => o.tree?.[path]).find(entries => entries !== undefined) ?? [] }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('command.run', (_, e) => {
    commands.push(`${e.command} ${e.args ?? ''}`)

    return { text: '' }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  // The model beneath each request of a turn: its response reports `reply`.
  let reply: ModelUsage = NO_USAGE
  on('turn.step', async function* (_, e) {
    const usage = { ...reply, model: 'test' }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage }

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  if (o.usage !== undefined) {
    const u = o.usage
    const breakdown = {
      categories: [{ name: 'System prompt', tokens: u.fixed, isDeferred: false }],
      totalTokens: u.tokens,
      mcpTools: [],
      isAutoCompactEnabled: u.compactAt !== undefined,
      autoCompactThreshold: u.compactAt,
      rawMaxTokens: u.raw ?? u.window ?? 1_000_000,
      autocompactSource: u.source ?? 'auto',
    }
    // The first `unreadFirst` reads fail, as before the session has a size.
    let reads = 0
    on('session.usage', () => {
      reads += 1
      if (reads <= (u.unreadFirst ?? 0)) throw new Error('no size yet')

      return { value: { startedAt: 0, context: { tokens: u.tokens, window: u.window ?? 1_000_000, breakdown }, rateLimits: [] } as never }
    })
  }
  on('model.complete', async (_, e) => {
    prompts.push(e.prompt)
    systems.push(typeof e.system === 'string' ? e.system : JSON.stringify(e.system ?? ''))
    const text = (await o.model?.(e.prompt)) ?? null

    return { value: text === null ? { isAnswered: false, reason: 'empty-reply', text: '', usage: NO_USAGE } : { isAnswered: true, text, usage: NO_USAGE } }
  })
  const forks: string[] = []
  on('model.fork', async (_, e) => {
    forks.push(e.prompt)

    return { value: o.fork === undefined ? { isAnswered: false as const, reason: 'nothing-to-fork' as const } : await o.fork(e.prompt) }
  })
  mock.env(on, env)

  // The next response reports `tokens` of context, `cacheRead` of them from
  // the prompt cache and the rest written to it.
  const respondWith = (tokens: number, cacheRead = 0) => {
    reply = { input_tokens: 0, output_tokens: 100, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: tokens - cacheRead }
  }

  return { files, clock: mock.clock(on), toasts, commands, prompts, systems, opened, respondWith, forks }
}

// One request of the main chat, its response reporting `tokens` of context
// (`cacheRead` of them read from the cache), as a turn's step makes it.
export async function request($: Engine, engine: { respondWith: (tokens: number, cacheRead?: number) => void }, tokens: number, cacheRead = 0, turnId = 't1') {
  engine.respondWith(tokens, cacheRead)
  const stream = $.turn.step({ turnId, index: 0, model: 'test', messageCount: 1 })
  for await (const _ of stream) {
    // Read to its end.
  }

  return stream.result
}

// Calls one of Folio's tools as Claude would. The kit types each tool's call
// in more depth than the type checker can follow, so the call goes in plain.
export function callTool($: Engine, input: { tool: string } & Record<string, unknown>): Promise<unknown> {
  return ($.tool.call as unknown as (input: object) => Promise<unknown>)(input)
}

// The folded history Claude reads now: Folio's context block, as the engine
// asks for the context blocks after a compaction; '' when there is none.
export async function historyNow($: Engine): Promise<string> {
  const { blocks } = await $.prompt.context({ blocks: [] })

  return blocks.find(b => b.name === HISTORY_BLOCK)?.text ?? ''
}

// Opens the test chat in the desktop app, in `cwd`.
export const start = ($: Engine, cwd = '/w') => $.session.start({ cwd, surface: 'desktop', isInteractive: true })

// A chunk's saved original in the test chat.
export function savedOriginal(files: Map<string, string>, id: string, o: { text: string; messages?: string[] }): void {
  files.set(`${DIR}/originals/${id}.json`, JSON.stringify({ messages: [], toolResults: {}, ...o }))
}

// The saved index of the test chat, as an earlier run left it.
export function savedView(view: object, files = new Map<string, string>()): Map<string, string> {
  files.set(`${DIR}/index.json`, JSON.stringify(view))

  return files
}

// A session whose chunks were all summarised by an earlier run, each on a
// topic of its own, with its original on disk.
export function seed(messages: SessionMessage[], mode: 'watch' | 'auto'): Map<string, string> {
  const files = new Map<string, string>()
  const slices = chunksOf(splitChunks(messages))
  const chunks = slices.map((s, order) => ({
    id: s.id,
    ...(s.prompt === undefined ? {} : { prompt: s.prompt, opening: s.opening }),
    ...(s.firstCall === undefined ? {} : { firstCall: s.firstCall, lastCall: s.lastCall }),
    order,
    title: `chunk ${order}`,
    topic: `topic ${order}`,
    summary: `summary of chunk ${order}`,
    tokens: s.tokens,
    isSummarised: true,
    status: 'live',
  }))
  for (const s of slices) savedOriginal(files, s.id, { text: transcriptText(messages.slice(s.start, s.end)) })

  return savedView({ settings: { mode, strategy: 'balanced' }, chunks, briefDigest: { ids: chunks.map(c => c.id), rules: [], decisions: [], terms: [], files: [], openTasks: [] } }, files)
}

// The engine beneath Folio, with the chat open and a second gone by; the
// light model's calls wait for `gate` while a test holds it. As Claude Code
// does, a compaction a plugin asks for is raised again as the compaction event,
// through every plugin's hook; one that carries the transcript is the engine's
// own, and `compacted` keeps what was on disk then.
export async function openChat($: Engine, on: On, files: Map<string, string>, messages: SessionMessage[], gate = Promise.resolve(), usage?: StubOptions['usage'], fork?: StubOptions['fork']) {
  const engine = stubEngine(on, { files, messages, model: () => gate.then(() => null), usage, fork })
  const compacted: Array<Map<string, string>> = []
  // What a plugin asked to compact with, in order.
  const pluginAsks: string[] = []
  on('session.compact', (_, e) => {
    // The engine hands every compaction the transcript; so does this one.
    if (!Array.isArray(e.messages)) {
      pluginAsks.push(e.instructions ?? '')

      return $.session.compact({ instructions: e.instructions, messages } as never)
    }
    compacted.push(new Map(files))

    return { messages: [{ role: 'user', text: 'The summary.', toolUses: [] }] }
  })
  await start($)
  await engine.clock.advance(1000)

  return { clock: engine.clock, toasts: engine.toasts, asked: engine.commands, compacted, engine, pluginAsks }
}

export const saved = (files: Map<string, string>) => JSON.parse(files.get(`${DIR}/index.json`)!) as PickerView

// Folio's panel, mounted as a surface draws it (the desktop's, unless given).
export function mountPanel<P extends RenderSurface = 'desktop'>($: Engine, o: { surface?: P; columns?: number; rows?: number } = {}) {
  return $.ui.mount({
    plugin: 'folio',
    component: 'Pane',
    requestId: 'folio-panel',
    surface: (o.surface ?? 'desktop') as P,
    props: { title: 'Folio', isFocused: false, bodyColumns: o.columns ?? 100, placement: 'dock', scroll: { offset: 0, bodyRows: o.rows ?? 80 }, view: {} },
  })
}

// Folio's panel as the app opens it: the footer ring pressed (which shuts What
// fills the context and measures the context again), then the panel drawn.
export async function openPanel<P extends RenderSurface = 'desktop'>($: Engine, o: { surface?: P; columns?: number; rows?: number } = {}) {
  const footer = await mountFooter($)
  await footer.press({ key: 'footer-ring' })
  await footer.unmount()

  return mountPanel($, o)
}

// Pack up as the person presses it: FolioPack opened and looked through, then
// Pack up, and the pack written.
export async function packUpNow($: Engine, clock: { advance: (ms: number) => Promise<unknown> }) {
  const ui = await mountPanel($)
  await ui.press({ key: 'folio-pack' })
  await clock.advance(1000)
  await ui.press({ key: 'pack-up' })
  await clock.advance(1000)
  await ui.unmount()
}

// Folio's footer button, as the desktop draws it.
export function mountFooter($: Engine) {
  return $.ui.mount({ plugin: 'folio', component: 'SessionMode', surface: 'desktop', props: { modes: [] } })
}

// A large tool result, so a chat of a few turns has chunks to fold.
const big = 'x'.repeat(20_000)

// A chat of `turns` prompts, each with one tool call whose result is large.
export function chat(turns: number): SessionMessage[] {
  const out: SessionMessage[] = []
  for (let i = 0; i < turns; i++) {
    out.push({ role: 'user', text: `prompt ${i}`, toolUses: [] })
    out.push({ role: 'assistant', text: `working on ${i}`, toolUses: [{ tool_use_id: `t${i}`, tool: 'Read', input: { file_path: `/f${i}` } }] })
    out.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `t${i}`, text: `line one of ${i}\n${big}`, isError: false }] })
    out.push({ role: 'assistant', text: `done ${i}`, toolUses: [] })
  }

  return out
}

// A chat of long replies and no tool output, so only whole chunks can fold.
export function talk(turns: number, size = 20_000): SessionMessage[] {
  return Array.from({ length: turns }, (_, i): SessionMessage[] => [
    { role: 'user', text: `question ${i}`, toolUses: [] },
    { role: 'assistant', text: `answer ${i}: ${'y'.repeat(size)}`, toolUses: [] },
  ]).flat()
}

// A ledger as these parts, in order, changed it: what each opened, closed and
// added (`words`: the parts' own words, which a close's evidence must be in).
export function ledgerOf(parts: Array<Partial<LedgerChanges>>, words = '', isHouseRule = (_: string) => false): Ledger {
  return parts.reduce((l, changes, order) => applyChanges(l, { order }, { ...noChanges(), ...changes }, words, isHouseRule).ledger, emptyLedger())
}
