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
}

// The engine beneath Folio: a disk in memory, the chat, a clock that moves only
// when the test moves it, and the light model. What Folio shows, runs and asks
// comes back for the test to check.
export function stubEngine(on: On, o: StubOptions = {}) {
  const files = o.files ?? new Map<string, string>()
  const toasts: string[] = []
  const commands: string[] = []
  const prompts: string[] = []
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'folio' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__folio__recall' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'test-session' }))
  if (o.messages !== undefined) {
    const messages = o.messages
    on('session.messages', () => ({ value: messages }))
  }
  on('fs.exists', (_, e) => ({ value: o.exists?.(e.path) ?? (files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`))) }))
  on('fs.read', (_, e) => {
    if (!files.has(e.path)) throw new Error(`no file ${e.path}`)

    return { value: files.get(e.path)! }
  })
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('fs.list', (_, e) => ({ value: o.tree?.[e.path] ?? [] }))
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
  mock.env(on, o.env ?? { HOME })

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
