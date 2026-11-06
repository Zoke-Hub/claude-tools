// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Brief, ChunkRecord, ContextFill, Join, PickerView, SideMessage } from '../types'
import { hash, isInChat, textTokens } from './chunks'
import { slash } from './paths'
import { CUSTOM_MAX, CUSTOM_STEP, EMPTY_VIEW, settingsOf } from './store'

const view = atom({ plugin: 'folio', key: 'view' } as const, EMPTY_VIEW)

// The breakdown rows that are the chat itself or empty room, not Claude Code's
// own fixed part.
const NOT_FIXED = /^(messages|free space|autocompact buffer|since last update)/i

// The context's size as of the last reply (right after a compaction, before
// the next reply, the engine's estimate of it, as the app's Context panel
// shows), and the part of it Claude Code holds for itself.
export async function refreshContext($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const { window, breakdown } = usage.context
  const tokens = usage.context.tokens ?? breakdown?.totalTokens
  const fixedParts = (breakdown?.categories ?? [])
    .filter(c => !c.isDeferred && !NOT_FIXED.test(c.name) && c.tokens > 0)
    .map(c => ({ name: c.name, tokens: c.tokens }))
  const servers = new Map<string, number>()
  for (const tool of breakdown?.mcpTools ?? []) {
    if (tool.isLoaded) servers.set(tool.serverName, (servers.get(tool.serverName) ?? 0) + tool.tokens)
  }
  const fill: ContextFill | null =
    tokens === undefined
      ? null
      : {
          tokens,
          window,
          compactAt: breakdown?.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null,
          fixed: fixedParts.reduce((sum, c) => sum + c.tokens, 0),
          fixedParts,
          mcpServers: [...servers].map(([name, t]) => ({ name, tokens: t })).sort((a, b) => b.tokens - a.tokens),
        }
  // Kept in memory only: the saved file leaves the context out, so writing it would change nothing.
  await update($, view, v => ({ ...v, context: fill === null ? null : { ...fill, customTop: customTopOf(fill, keptParts(v).total) } }))
}

// Claude's own compaction, where it is turned off, would run about here.
const COMPACT_SHARE = 0.965
// Room left for one long reply to run past the ceiling before a fold.
const CUSTOM_MARGIN = 50_000

// The highest ceiling this chat can take: below the point Claude compacts by
// itself, after what sits on top of the work and room for one long reply.
export function customTopOf(fill: Pick<ContextFill, 'compactAt' | 'window' | 'fixed'>, kept: number): number {
  const room = (fill.compactAt ?? fill.window * COMPACT_SHARE) - fill.fixed - kept - CUSTOM_MARGIN

  return Math.min(CUSTOM_MAX, Math.floor(room / CUSTOM_STEP) * CUSTOM_STEP)
}


export function summaryTokens(c: Pick<ChunkRecord, 'title' | 'summary' | 'sections'>): number {
  return textTokens(c.title) + textTokens(c.summary) + c.sections.reduce((sum, s) => sum + textTokens(s.heading) + textTokens(s.body) + textTokens(s.points.join(' ')) + 4, 0) + 20
}

// What a tidied side message still costs: the one-line note in its place.
const TIDY_NOTE_TOKENS = 15

// What tidying a side message saves.
export function sideSaving(s: { tokens: number } | undefined): number {
  return Math.max(0, (s?.tokens ?? 0) - TIDY_NOTE_TOKENS)
}

// What tidying these side messages saves.
export function sidesSaving(sides: ReadonlyArray<{ tokens: number }>): number {
  return sides.reduce((sum, s) => sum + sideSaving(s), 0)
}

// A chunk's side messages still in the chat: not tidied, not put back.
export function openSides(c: Pick<ChunkRecord, 'side' | 'tidied' | 'keepSide'>): SideMessage[] {
  return c.side.filter(s => !c.tidied.includes(s.n) && !c.keepSide.includes(s.n))
}

// The chunks in the chat that count as work: all of them, word for word or
// trimmed, and those the person marked fine to fold (in either state).
export function workChunks(v: PickerView): { all: ChunkRecord[]; live: ChunkRecord[]; trimmed: ChunkRecord[]; fine: ChunkRecord[] } {
  const all = v.chunks.filter(c => isInChat(c) && c.decision !== 'keep')

  return { all, live: all.filter(c => c.status === 'live'), trimmed: all.filter(c => c.status === 'trimmed'), fine: all.filter(c => c.decision === 'fold') }
}

// The tokens these chunks take word for word.
export function tokensOf(chunks: readonly ChunkRecord[]): number {
  return chunks.reduce((sum, c) => sum + c.tokens, 0)
}

// The chunks Folio holds outside the work: kept word for word, and folded to summaries.
export function keptAndFolded(v: PickerView): { kept: ChunkRecord[]; folded: ChunkRecord[] } {
  return { kept: v.chunks.filter(c => c.decision === 'keep' && c.status !== 'compacted'), folded: v.chunks.filter(c => c.status === 'folded' && c.decision !== 'keep') }
}

// The ids of the two newest chunks in the chat, which no fold takes.
export function newestInChat(chunks: readonly ChunkRecord[]): Set<string> {
  return new Set(chunks.filter(isInChat).sort((a, b) => a.order - b.order).slice(-2).map(c => c.id))
}

// The newest summarised chunk, or the newest before the order `before`.
export function newestSummarised(chunks: readonly ChunkRecord[], before = Infinity): ChunkRecord | undefined {
  return chunks.filter(c => c.isSummarised && c.order < before).sort((a, b) => b.order - a.order)[0]
}

export type BriefLists = Pick<Brief, 'rules' | 'decisions' | 'terms' | 'files'>

// The open tasks Claude reads: the merged brief's trimmed list once it covers
// the newest summary, else that summary's own list.
export function openTasksOf(v: PickerView): string[] {
  const newest = newestSummarised(v.chunks)
  const d = v.briefDigest
  if (d?.openTasks !== undefined && newest !== undefined && d.ids.includes(newest.id)) return d.openTasks

  return newest?.brief.openTasks ?? []
}

// Paths no other chat or computer has: temporary folders, a chat's own
// scratchpad, mods in development and Claude Code's per-chat folders.
const ONE_CHAT_PATH = /^(?:\/private)?\/(?:tmp|var\/folders)\/|\/appdata\/local\/temp\/|(?:^|\/)scratchpad\/|\/\.claude\/(?:dev-mods|projects)\/|<[^>]+>/i

export function isOneChatPath(item: string): boolean {
  return ONE_CHAT_PATH.test(slash(item))
}

// The brief's four lists: Haiku's merged brief once written, else every
// chunk's items with exact repeats taken out, oldest first, or newest first
// with the latest chunk's items leading. Files tied to one chat are left out.
export function briefLists(v: PickerView, chunks: readonly ChunkRecord[], isNewestFirst = false): BriefLists {
  const d = v.briefDigest
  if (d !== null) return { rules: d.rules, decisions: d.decisions, terms: d.terms, files: d.files.filter(f => !isOneChatPath(f)) }
  const ordered = isNewestFirst ? [...chunks].sort((a, b) => b.order - a.order) : chunks
  const all = (key: keyof BriefLists) => [...new Set(ordered.flatMap(c => (isNewestFirst ? [...c.brief[key]].reverse() : c.brief[key])))]

  return { rules: all('rules'), decisions: all('decisions'), terms: all('terms'), files: all('files').filter(f => !isOneChatPath(f)) }
}

// Runs of neighbouring folded chunks on one topic, oldest first: what a fold
// joins into one summary each. A chunk kept word for word, or one on another
// topic, ends a run.
// A run is cut at JOIN_MAX chunks, so one summary never stands for so much
// that its detail thins out.
const JOIN_MAX = 6

export function joinRuns(chunks: readonly ChunkRecord[]): ChunkRecord[][] {
  const runs: ChunkRecord[][] = []
  let run: ChunkRecord[] = []
  for (const c of [...chunks].sort((a, b) => a.order - b.order)) {
    const isJoinable = c.status === 'folded' && c.decision !== 'keep' && c.isSummarised && c.topic !== ''
    if (isJoinable && run.length > 0 && run.length < JOIN_MAX && run[0]!.topic === c.topic) {
      run.push(c)
      continue
    }
    if (run.length > 1) runs.push(run)
    run = isJoinable ? [c] : []
  }
  if (run.length > 1) runs.push(run)

  return runs
}

export function joinKey(run: readonly ChunkRecord[]): string {
  return hash(run.map(c => `${c.id}\n${c.summary}`).join('\n'))
}

// The joins that still match their chunks, as the next history block uses them.
export function liveJoins(v: PickerView): Join[] {
  const keys = new Set(joinRuns(v.chunks).map(joinKey))

  return v.joins.filter(j => keys.has(j.key))
}

function briefTokens(v: PickerView): number {
  const lists = briefLists(v, v.chunks.filter(c => c.status === 'folded'))

  return textTokens(Object.values(lists).flat().join('\n')) + textTokens(openTasksOf(v).join('\n'))
}

// The open tasks as of the newest summary: each summary carries the list on,
// dropping what got done, so older lists are out of date.
export function currentOpenTasks(chunks: readonly ChunkRecord[]): string[] {
  return newestSummarised(chunks)?.brief.openTasks ?? []
}

// What Folio keeps in view for good: chunks kept word for word, the folded
// chunks' summaries, the brief, and what recall brought back. None of it
// counts toward the ceiling; it aims to stay under the strategy's keptAim.
export function keptParts(v: PickerView): { keptChunks: number; summaries: number; brief: number; pinned: number; total: number } {
  const { kept, folded } = keptAndFolded(v)
  const keptChunks = tokensOf(kept)
  const joined = liveJoins(v).reduce((sum, j) => sum + j.saves, 0)
  const summaries = folded.reduce((sum, c) => sum + summaryTokens(c), 0) - joined
  const brief = v.chunks.some(c => c.status === 'folded') ? briefTokens(v) : 0
  const pinned = v.pinned.reduce((sum, p) => sum + textTokens(p.text) + 10, 0)

  return { keptChunks, summaries, brief, pinned, total: keptChunks + summaries + brief + pinned }
}

// The work in the chat: what counts toward the ceiling. From the real context
// size when known, else from the chunks' own sizes.
export function workTokens(v: PickerView): number {
  if (v.context !== null && v.context.fixed > 0) return Math.max(0, v.context.tokens - v.context.fixed - keptParts(v).total)

  return tokensOf(workChunks(v).all)
}

export function needsFold(v: PickerView): boolean {
  return workTokens(v) >= settingsOf(v).ceiling || v.foldAsked.length > 0
}
