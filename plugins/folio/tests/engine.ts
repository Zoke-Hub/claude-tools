// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, On, RenderSurface, SessionMessage } from 'claude-code'

// What every test file builds on: the engine beneath Folio, the panel as a
// surface mounts it, and the chats Folio works on. Not a test file itself.

export type { Engine, On }

export const HOME = '/tmp/folio-test-home'
// Where Folio keeps the test chat.
export const DIR = `${HOME}/.claude/folio/sessions/test-session`
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
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'folio' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__folio__recall' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: o.id?.() ?? 'test-session' }))
  if (o.messages !== undefined) {
    const messages = o.messages
    on('session.messages', () => ({ value: messages }))
  }
  on('fs.exists', (_, e) => {
    const forms = formsOf(e.path)
    const isThere = (path: string) => o.exists?.(path) ?? (files.has(path) || [...files.keys()].some(k => k.startsWith(`${path}/`)))

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
  on('model.complete', async (_, e) => {
    prompts.push(e.prompt)
    const text = (await o.model?.(e.prompt)) ?? null

    return { value: text === null ? { isAnswered: false, reason: 'empty-reply', text: '', usage: NO_USAGE } : { isAnswered: true, text, usage: NO_USAGE } }
  })
  mock.env(on, env)

  return { files, clock: mock.clock(on), toasts, commands, prompts, opened }
}

// Calls one of Folio's tools as Claude would. The kit types each tool's call
// in more depth than the type checker can follow, so the call goes in plain.
export function callTool($: Engine, input: { tool: string } & Record<string, unknown>): Promise<unknown> {
  return ($.tool.call as unknown as (input: object) => Promise<unknown>)(input)
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
