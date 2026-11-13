// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionCompactInput, SessionCompactResult } from 'claude-code'

import type { ActivityItem, ChunkRecord, PickerView } from '../types'
import { currentChat, shortTokens } from './chunks'
import { buildFolded, chunksIn, estimateAll, isPaired, joinFolded, noPlan, planFold, protectedIds } from './fold'
import { errorText, later, note } from './debug'
import { needsFold, refreshContext, sideSaving, summaryTokens, workTokens } from './measure'
import { dropStalePins, dropSupersededPins } from './recall'
import { refreshBrief } from './brief'
import { addActivity, change, chunkOf, EMPTY_VIEW, patchChunk, readOriginal, setWorking, settingsOf, writeOriginal } from './store'
import { saveChat } from './sync'

const view = atom({ plugin: 'folio', key: 'view' } as const, EMPTY_VIEW)

// What this mod passes as compaction instructions, so its own hook knows the
// compaction is a fold it asked for, or a rebuild after an undo.
export const FOLD_ASK = 'folio: fold'
export const REBUILD_ASK = 'folio: rebuild'
type Ask = typeof FOLD_ASK | typeof REBUILD_ASK

// The heads-up shows once the work passes this share of the ceiling.
const HEADS_UP_SHARE = 0.8

// Whether Claude is replying now: a chat compacts only between replies.
let isReplying = false
export function setReplying(is: boolean) {
  isReplying = is
}
export function isClaudeReplying(): boolean {
  return isReplying
}
const WAITS = 'Folio will fold once Claude finishes replying.'

// Folio's fold or rebuild, from the ask to Claude Code's answer:
// - idle: nothing asked;
// - queued: asked while Claude replies; sent once the reply ends;
// - compacting: sent, and Folio's compaction hook hasn't finished it yet. An
//   ask that comes before the hook reads the chat rides along (the hook reads
//   every ask then); one that comes after waits in `after`, for the next;
// - failed: the last one didn't run; `why` says so.
// Asks are a set: a fold does what a waiting rebuild would, and when it finds
// nothing to fold it still rebuilds.
type Request =
  | { kind: 'idle' }
  | { kind: 'queued'; asks: Ask[] }
  | { kind: 'compacting'; asks: Ask[]; id: number; isRead: boolean; after: Ask[] }
  | { kind: 'failed'; why: string }
let request: Request = { kind: 'idle' }
let requestCount = 0
// What an ask came to: done (or sent as a prompt), or why not.
type Outcome = { isDone: boolean; why: string }

// A compaction that Claude Code doesn't start within this while (a /compact
// prompt dropped, or merged into another) is let go, so Fold now comes back;
// one Folio's hook is working on gets up to the longer while.
const START_WAIT_MS = 3 * 60_000
const WORK_WAIT_MS = 10 * 60_000

const union = (a: readonly Ask[], b: readonly Ask[]): Ask[] => [...new Set([...a, ...b])]

// Whether a fold asked for waits or runs: Fold now reads Folding… and takes no
// second press meanwhile.
export function isFoldPending(): boolean {
  if (request.kind === 'queued') return request.asks.includes(FOLD_ASK)
  if (request.kind === 'compacting') return request.asks.includes(FOLD_ASK) || request.after.includes(FOLD_ASK)

  return false
}

// Fold now's state for the panel: when its fold was asked for, while it waits
// or runs. Only a drawing hangs on it, so one that can't be set (the mod
// unloading) changes nothing.
const folding = atom({ plugin: 'folio', key: 'folding' } as const, null)
export async function showFolding($: EngineInterface) {
  await update($, folding, at => (isFoldPending() ? (at ?? Date.now()) : null)).catch(() => {})
}

// A new session asks nothing yet.
export async function resetActions($: EngineInterface) {
  request = { kind: 'idle' }
  isReplying = false
  autoAskedAt = null
  await showFolding($)
}

// Claude Code's own compaction, passed on unchanged; the size is measured again
// once it has run.
async function passOn(
  $: EngineInterface,
  e: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
): Promise<SessionCompactResult> {
  // Saved first, so recall can reach all of it; a save that fails never stops
  // the compaction.
  await saveChat($).catch(err => note($, `save before compaction failed: ${errorText(err)}`))
  const done = await next(e)
  later($, () => refreshContext($))

  return done
}

// The desktop app (and any SDK session) can't compact from a mod: there a
// compaction runs only as a /compact prompt. Once seen, Folio asks that way.
let isPromptOnly = false
const isHeadless = (err: unknown) => /headless|not available/i.test(errorText(err))

// Asks for a fold or a rebuild. Where a mod can't compact directly, it runs
// "/compact <ask>" as a slash command, once the chat is idle; Folio's own hook
// recognises the ask and does the folding. The state changes before anything
// is awaited, so a second press that comes before the panel redraws sees it.
export async function compactNow($: EngineInterface, ask: Ask): Promise<Outcome> {
  return shown($, enqueue($, ask))
}

// An ask on its way, with Fold now's state drawn as it starts and as it ends.
async function shown($: EngineInterface, outcome: Outcome | Promise<Outcome>): Promise<Outcome> {
  await showFolding($)
  const done = await outcome
  await showFolding($)

  return done
}

function enqueue($: EngineInterface, ask: Ask): Outcome | Promise<Outcome> {
  if (request.kind === 'compacting') {
    if (!request.isRead) {
      request = { ...request, asks: union(request.asks, [ask]) }

      return { isDone: true, why: '' }
    }
    request = { ...request, after: union(request.after, [ask]) }

    return { isDone: false, why: ask === FOLD_ASK ? 'Folio folds once the change it is making now is done.' : '' }
  }
  const asks = request.kind === 'queued' ? union(request.asks, [ask]) : [ask]
  // A chat compacts only between replies: while Claude is answering, the asks
  // wait for the reply's end (turn.complete comes even for a stopped reply).
  if (isReplying) return waitForReply($, asks, ask)

  return send($, asks)
}

// The asks wait for the reply's end; a rebuild says so.
function waitForReply($: EngineInterface, asks: Ask[], ask: Ask): Outcome {
  request = { kind: 'queued', asks }
  if (ask === REBUILD_ASK) {
    const why = 'Folio updates the chat after this reply.'
    $.ui.toast(why)

    return { isDone: false, why }
  }

  return { isDone: false, why: WAITS }
}

// Sends the asks as one compaction: a fold when one of them is, else a rebuild.
async function send($: EngineInterface, asks: Ask[]): Promise<Outcome> {
  requestCount += 1
  const id = requestCount
  request = { kind: 'compacting', asks, id, isRead: false, after: [] }
  watch($, id, 0)
  const ask = asks.includes(FOLD_ASK) ? FOLD_ASK : REBUILD_ASK
  if (isPromptOnly) return byPrompt($, id, ask)
  try {
    const result = await $.session.compact({ instructions: ask })
    const why = result.skip === undefined ? '' : String(result.skip)
    await settle($, id, why)

    return { isDone: why === '', why }
  } catch (err) {
    if (isHeadless(err)) {
      isPromptOnly = true

      return byPrompt($, id, ask)
    }
    const why = errorText(err)
    // Refused as mid-reply all the same: the asks wait for the reply's end.
    if (/turn is running|between turns/i.test(why) && request.kind === 'compacting' && request.id === id) {
      return waitForReply($, union(request.asks, request.after), ask)
    }
    const text = `Claude Code didn't start the fold (${why}). Try again between replies.`
    void note($, `fold refused by Claude Code: ${why}`)
    await settle($, id, text)

    return { isDone: false, why: text }
  }
}

// Runs "/compact <ask>" as the person's slash command would. It is queued for
// when the chat is idle, and started just after the calling hook returns, since
// a hook the turn waits on can't run a command. A refusal is said and logged.
function byPrompt($: EngineInterface, id: number, ask: Ask): Outcome {
  $.clock.after(0, () => {
    $.command.run({ command: 'compact', args: ask }).catch((err: unknown) => {
      const why = `Claude Code didn't run /compact (${errorText(err)}).`
      void note($, `fold by /compact refused: ${why}`)
      $.ui.toast(why)
      void settle($, id, why)
    })
  })

  return { isDone: true, why: '' }
}

// A compaction asked for and not finished, `waited` ms on: while Claude replies
// the /compact prompt waits its turn, and while Folio's hook works on it, it is
// given longer; otherwise it is let go, and Fold now comes back.
function watch($: EngineInterface, id: number, waited: number) {
  $.clock.after(START_WAIT_MS, () => {
    if (request.kind !== 'compacting' || request.id !== id) return
    const age = waited + START_WAIT_MS
    if (isReplying || (request.isRead && age < WORK_WAIT_MS)) return watch($, id, age)
    void note($, `${request.asks.join(' + ')} let go after ${Math.round(age / 1000)} s: Folio's hook didn't finish it`)
    const why = request.asks.includes(FOLD_ASK) ? "Claude Code didn't run Folio's fold. Press Fold now to try again." : "Claude Code didn't run Folio's update of the chat; the next fold brings it in."
    $.ui.toast(why)
    void settle($, id, why)
  })
}

// The compaction `id` is over: done (`why` empty) or not. Asks that came while
// it ran go next, after the reply if one is running.
async function settle($: EngineInterface, id: number, why: string) {
  if (request.kind !== 'compacting' || request.id !== id) return
  const after = request.after
  request = why === '' ? { kind: 'idle' } : { kind: 'failed', why }
  if (after.length > 0) {
    if (isReplying) request = { kind: 'queued', asks: after }
    else void shown($, send($, after))
  }
  await showFolding($)
}

// Folio's hook reads the chat: every ask made so far is done by this one
// compaction. One that isn't the running request's (a /compact prompt that
// came after it was let go) stands alone.
function takeAsks(ask: Ask): Ask[] {
  if (request.kind !== 'compacting') return [ask]
  request = { ...request, isRead: true }

  return request.asks
}

// After each reply: waiting asks run; the chunks with exact details the
// next fold would take are noted for the ring, with one heads-up as the work
// nears the ceiling; and in Automatic the fold itself runs once it is due.
export async function afterTurn($: EngineInterface) {
  if (request.kind === 'queued') {
    if (!isReplying) await shown($, send($, request.asks))

    return
  }
  let v = await read($, view)
  const settings = settingsOf(v)
  const messages = currentChat(await $.session.messages())
  const plan = planFold(messages, v, Math.max(workTokens(v), settings.ceiling))
  const foldNext = plan.foldIds.filter(id => {
    const c = chunkOf(v, id)

    return c !== undefined && c.exactReason !== null && c.decision === null
  })
  const isNear = workTokens(v) >= settings.ceiling * HEADS_UP_SHARE
  v = await change($, x => ({ ...x, foldNext }))
  if (isNear && foldNext.length > 0 && v.headsUpFold !== v.folds) {
    $.ui.toast(`${foldNext.length} chunk${foldNext.length === 1 ? '' : 's'} with exact details fold at ${shortTokens(settings.ceiling)}. Look at them in Folio.`)
    await change($, x => ({ ...x, headsUpFold: x.folds }))
  }
  // Automatic asks only when the plan has something to fold, and not again at
  // the same size: where the ask is a /compact prompt, that prompt's own turn
  // ends here too, and must not ask once more.
  const work = workTokens(v)
  const hasPlan = plan.foldIds.length > 0 || plan.trimIds.length > 0
  if (v.settings.mode === 'auto' && needsFold(v) && hasPlan && (autoAskedAt === null || Math.abs(work - autoAskedAt) > AUTO_ASK_STEP)) {
    autoAskedAt = work
    await compactNow($, FOLD_ASK)
  }
}

// The work when Automatic last asked for a fold; cleared once a fold is done.
let autoAskedAt: number | null = null
const AUTO_ASK_STEP = 5_000

function chunkItems(v: PickerView, ids: string[], how: 'fold' | 'trim'): ActivityItem[] {
  return ids.flatMap(id => {
    const c = chunkOf(v, id)
    if (c === undefined) return []

    return [{ kind: 'chunk' as const, chunkId: id, text: c.title || 'Not summarised yet', detail: how === 'fold' ? `${shortTokens(c.tokens)} → ${shortTokens(summaryTokens(c))} summary` : 'old tool output trimmed' }]
  })
}

function sideItems(v: PickerView, tidy: Record<string, number[]>): ActivityItem[] {
  return Object.entries(tidy).flatMap(([chunkId, ns]) => {
    const c = chunkOf(v, chunkId)

    return ns.flatMap(n => {
      const s = c?.side.find(x => x.n === n)

      return s ? [{ kind: 'side' as const, chunkId, n, text: `“${s.opening}”`, detail: s.why }] : []
    })
  })
}

// The session.compact hook's work: fold by the plan, or leave the compaction
// to the engine. Claude Code's own compaction runs as before in Watch mode,
// for /compact, for subagents, and whenever there is nothing this mod can fold.
// Folio's own asks arrive from the mod, or as the /compact prompt it sends
// where a mod can't compact directly; their words are Folio's alone.
function oursOf(e: SessionCompactInput): Ask | null {
  const ask = e.instructions?.trim()

  return ask === FOLD_ASK || ask === REBUILD_ASK ? ask : null
}

export async function onCompact(
  $: EngineInterface,
  e: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
): Promise<SessionCompactResult> {
  const isMine = e.agentId === undefined && e.trigger !== 'precompute' && oursOf(e) !== null
  let why = 'the fold stopped on an error'
  try {
    const done = await foldOrPass($, e, next)
    why = done.skip === undefined ? '' : String(done.skip)

    return done
  } finally {
    // Folio's own ask has folded or said why not, whatever it asked: Fold now
    // is pressable again, and asks that came meanwhile go next.
    if (isMine && request.kind === 'compacting') await settle($, request.id, why)
  }
}

async function foldOrPass(
  $: EngineInterface,
  e: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
): Promise<SessionCompactResult> {
  if (e.agentId !== undefined) return next(e)
  const ask = oursOf(e)
  const isOurs = ask !== null
  if (e.trigger === 'manual' && !isOurs) return passOn($, e, next)
  if (e.trigger === 'precompute') {
    // In Automatic mode this mod folds; the engine's own summary would be unused.
    return (await read($, view)).settings.mode === 'auto' ? { skip: 'Folio folds this chat' } : passOn($, e, next)
  }
  if (!isOurs && (await read($, view)).settings.mode !== 'auto') return passOn($, e, next)
  // Every ask made so far, read once: what Folio folds or rebuilds now.
  const asks: Ask[] = ask === null ? [FOLD_ASK] : takeAsks(ask)
  // The chat's newest stretch is saved first, so a trim never stands in for
  // words no original holds yet.
  await saveChat($).catch(err => note($, `save before the fold failed: ${errorText(err)}`))
  const v = await read($, view)

  const messages = e.messages
  const before = v.context?.tokens ?? estimateAll(messages)
  let isRebuild = !asks.includes(FOLD_ASK)
  const plan = isRebuild ? noPlan() : planFold(messages, v, workTokens(v))
  const tidyCount = Object.values(plan.tidy).reduce((n, ns) => n + ns.length, 0)
  // A fold that finds nothing still makes the rebuild asked for with it.
  if (plan.foldIds.length === 0 && plan.trimIds.length === 0 && !isRebuild && asks.includes(REBUILD_ASK)) isRebuild = true
  if (plan.foldIds.length === 0 && plan.trimIds.length === 0 && !isRebuild) {
    if (!isOurs) return passOn($, e, next)
    // Says exactly why, so Fold now can tell the person.
    const work = workTokens(v)
    const target = settingsOf(v).target
    const found = chunksIn(messages, v)
    const kept = protectedIds(messages, v)
    const free = found.filter(s => {
      const c = chunkOf(v, s.id)

      return !kept.has(s.id) && c?.isSummarised && c.decision !== 'keep'
    })
    void note($, `fold found nothing: work ${work}, fold-back line ${target}, ${found.length} chunks matched in the chat (${found.map(s => s.id).join(', ')}), ${kept.size} newest kept, ${free.length} free to fold`)
    const why =
      work <= target
        ? `the work (${shortTokens(work)}) is already under ${shortTokens(target)}, where a fold stops.`
        : found.length === 0
          ? "Folio couldn't match its chunks to the chat's messages."
          : free.length === 0
            ? `the ${found.length} chunks in the chat are the newest (kept word for word) or still being summarised.`
            : 'no chunk would bring the work down.'

    return { skip: `Nothing to fold: ${why}` }
  }

  let after = v
  for (const id of plan.foldIds) after = patchChunk(after, id, { status: 'folded' })
  for (const id of plan.trimIds) after = patchChunk(after, id, { status: 'trimmed' })
  for (const [id, ns] of Object.entries(plan.tidy)) {
    const c = chunkOf(after, id)
    if (c) after = patchChunk(after, id, { tidied: [...new Set([...c.tidied, ...ns])] })
  }
  // A chunk restored from a trim is live again once rebuilt.
  for (const c of after.chunks) {
    if (c.status === 'trimmed' && c.decision === 'keep') after = patchChunk(after, c.id, { status: 'live' })
  }
  // Neighbouring folded chunks on one topic become one summary for Claude,
  // while the panel keeps them apart. What the joins save is counted with the
  // fold; a join an undo broke gives its saving back.
  // The brief Claude reads is merged first, so it says each thing once.
  await refreshBrief($).catch(() => {})
  after = { ...after, briefDigest: (await read($, view)).briefDigest }
  await setWorking($, 'Joining summaries')
  const joins = await joinFolded($, after).finally(() => setWorking($, null))
  const joinSaves = joins.reduce((sum, j) => sum + j.saves, 0) - v.joins.reduce((sum, j) => sum + j.saves, 0)
  after = { ...after, joins }
  plan.foldSaves += Math.max(0, joinSaves)
  if (joinSaves < 0 || isRebuild) after = { ...after, savedTokens: Math.max(0, after.savedTokens + joinSaves) }
  const saves = plan.foldSaves + plan.trimSaves + plan.tidySaves
  if (!isRebuild) {
    autoAskedAt = null
    after = { ...after, folds: after.folds + 1, savedTokens: after.savedTokens + saves, foldAsked: after.foldAsked.filter(id => !plan.foldIds.includes(id)), foldNext: [] }
    after = await dropSupersededPins($, dropStalePins(after))
    if (plan.foldIds.length > 0 || tidyCount > 0) {
      const n = plan.foldIds.length
      after = addActivity(after, {
        kind: 'fold',
        text: [n > 0 ? `Folded ${n} chunk${n === 1 ? '' : 's'}` : '', tidyCount > 0 ? `tidied ${tidyCount} side message${tidyCount === 1 ? '' : 's'}` : '']
          .filter(Boolean)
          .join(' and ')
          .replace(/^t/, 'T'),
        detail: [plan.foldSaves > 0 ? shortTokens(plan.foldSaves) : '', plan.tidySaves > 0 ? shortTokens(plan.tidySaves) : ''].filter(Boolean).join(' + ') + ' tokens out',
        chunkIds: [...plan.foldIds, ...Object.keys(plan.tidy)],
        items: [...chunkItems(v, plan.foldIds, 'fold'), ...sideItems(v, plan.tidy)],
      })
    }
    if (plan.trimIds.length > 0) {
      after = addActivity(after, {
        kind: 'trim',
        text: `Trimmed old tool output in ${plan.trimIds.length} chunk${plan.trimIds.length === 1 ? '' : 's'}`,
        detail: `${shortTokens(plan.trimSaves)} tokens out`,
        chunkIds: plan.trimIds,
        items: chunkItems(v, plan.trimIds, 'trim'),
      })
    }
  }

  const built = await buildFolded($, messages, after, plan)
  if (!isPaired(built.messages)) {
    $.ui.toast('Folio stopped a fold that would have split a tool call from its result.')

    return isOurs ? { skip: 'fold refused: a tool call would lose its result' } : passOn($, e, next)
  }
  // A tidied message's own words are kept, so it can be put back.
  for (const t of built.tidiedRaw) {
    const original = await readOriginal($, t.chunkId)
    if (original) await writeOriginal($, t.chunkId, { ...original, tidiedRaw: { ...original.tidiedRaw, [String(t.n)]: t.text } })
  }
  await change($, () => after)
  later($, () => refreshContext($))

  return { messages: built.messages, tokensBefore: before, tokensAfter: Math.max(0, before - saves) }
}

// The person's choices from the panel, logged in the activity so a mistaken
// click can be taken back.
export async function decide($: EngineInterface, id: string, decision: 'keep' | 'fold') {
  await change($, v => {
    const title = chunkOf(v, id)?.title || id

    // A chunk decided on is no longer one to look at before the next fold.
    const decided = { ...patchChunk(v, id, { decision, keptAtFold: decision === 'keep' ? v.folds : null }), foldNext: v.foldNext.filter(x => x !== id) }

    return addActivity(decided, {
      kind: 'choice',
      text: decision === 'keep' ? `Kept “${title}” word for word` : `Fine to fold: “${title}”`,
      // In Watch, Claude Code's own compaction still runs, and can take it.
      detail: decision === 'keep' ? (v.settings.mode === 'auto' ? 'your choice; it never folds' : "your choice; Folio won't fold it") : 'your choice; it folds with the rest',
      chunkIds: [id],
      choice: decision,
    })
  })
}

// Takes a choice back: the chunk is undecided again, and the entry leaves the log.
export async function undoChoice($: EngineInterface, activityId: string) {
  await change($, v => {
    const entry = v.activity.find(a => a.id === activityId)
    if (entry === undefined) return v
    let next = { ...v, activity: v.activity.filter(a => a.id !== activityId) }
    for (const id of entry.chunkIds) next = patchChunk(next, id, { decision: null, keptAtFold: null })

    return next
  })
}

// A chunk a fold or a trim took that is not back yet: one restored already
// (kept word for word) has given its saving back.
export function isUndoable(c: Pick<ChunkRecord, 'status' | 'decision'>): boolean {
  return (c.status === 'folded' || c.status === 'trimmed') && c.decision !== 'keep'
}

// Side message `n` of chunk `c` is tidied out of the chat now, not put back yet.
export function isTidied(c: Pick<ChunkRecord, 'tidied'> | undefined, n: number | undefined): boolean {
  return c !== undefined && n !== undefined && c.tidied.includes(n)
}

// Undo a fold or a trim: the chunk is kept word for word from now on, and the
// chat is rebuilt so Claude reads it again. A chunk restored before is left as
// it is, so its saving is never given back twice. Says whether any came back.
export async function undo($: EngineInterface, chunkIds: string[]): Promise<boolean> {
  let restored: string[] = []
  await change($, v => {
    restored = chunkIds.filter(id => {
      const c = chunkOf(v, id)

      return c !== undefined && isUndoable(c)
    })
    if (restored.length === 0) return v
    let next = v
    let back = 0
    for (const id of restored) {
      const c = chunkOf(next, id)!
      back += c.status === 'folded' ? c.tokens - summaryTokens(c) : 0
      next = patchChunk(next, id, { decision: 'keep', keptAtFold: next.folds })
    }

    return addActivity(
      { ...next, savedTokens: Math.max(0, next.savedTokens - back) },
      { kind: 'undo', text: `Restored ${restored.length} chunk${restored.length === 1 ? '' : 's'} word for word`, detail: 'kept from now on', chunkIds: restored },
    )
  })
  if (restored.length > 0) await compactNow($, REBUILD_ASK)

  return restored.length > 0
}

// Tidied side messages, back in the chat for good: never tidied again, and
// what tidying them saved comes off the total.
function sidesBack(v: PickerView, sides: Array<{ chunkId: string; n: number }>): PickerView {
  let next = v
  let back = 0
  for (const { chunkId, n } of sides) {
    const c = chunkOf(next, chunkId)
    if (c === undefined) continue
    if (c.tidied.includes(n)) back += sideSaving(c.side.find(s => s.n === n))
    next = patchChunk(next, chunkId, { tidied: c.tidied.filter(x => x !== n), keepSide: [...new Set([...c.keepSide, n])] })
  }

  return { ...next, savedTokens: Math.max(0, next.savedTokens - back) }
}

// Puts tidied side messages back in the chat.
export async function putBack($: EngineInterface, sides: Array<{ chunkId: string; n: number }>) {
  await change($, v => sidesBack(v, sides))
  await compactNow($, REBUILD_ASK)
}

// Undoes a whole activity entry: its chunks restored, its side messages put
// back; what an earlier Restore or Put back already brought back is left alone.
export async function undoEntry($: EngineInterface, activityId: string) {
  const v = await read($, view)
  const entry = v.activity.find(a => a.id === activityId)
  if (entry === undefined) return
  const sides = (entry.items ?? []).filter(i => i.kind === 'side' && isTidied(chunkOf(v, i.chunkId), i.n)).map(i => ({ chunkId: i.chunkId, n: i.n! }))
  const chunks = (entry.items ?? []).filter(i => i.kind === 'chunk').map(i => i.chunkId)
  if (sides.length > 0) await change($, x => sidesBack(x, sides))
  // A restore asks for the rebuild; side messages alone ask for their own.
  const isRestored = chunks.length > 0 && (await undo($, chunks))
  if (sides.length > 0 && !isRestored) await compactNow($, REBUILD_ASK)
}

// Tidies side messages now, from the suggestion.
export async function tidyNow($: EngineInterface, sides: Array<{ chunkId: string; n: number }>) {
  await change($, v => {
    let next = v
    let saves = 0
    const tidy: Record<string, number[]> = {}
    for (const { chunkId, n } of sides) {
      const c = chunkOf(next, chunkId)
      if (c === undefined) continue
      saves += sideSaving(c.side.find(s => s.n === n))
      next = patchChunk(next, chunkId, { tidied: [...new Set([...c.tidied, n])] })
      tidy[chunkId] = [...(tidy[chunkId] ?? []), n]
    }

    return addActivity(
      { ...next, savedTokens: next.savedTokens + saves },
      { kind: 'tidy', text: `Tidied ${sides.length} side message${sides.length === 1 ? '' : 's'}`, detail: `${shortTokens(saves)} tokens out`, chunkIds: Object.keys(tidy), items: sideItems(v, tidy) },
    )
  })
  await compactNow($, REBUILD_ASK)
}

// Summarises a kept chunk this time, from the suggestion or a restored
// chunk's card: a folded one shows its summary again, and saves again what
// restoring it gave back; one still in the chat folds now.
export async function summariseNow($: EngineInterface, chunkId: string) {
  const c = chunkOf(await read($, view), chunkId)
  if (c === undefined) return
  await decide($, chunkId, 'fold')
  if (c.status === 'folded') {
    if (c.decision === 'keep') await change($, v => ({ ...v, savedTokens: Math.max(0, v.savedTokens + c.tokens - summaryTokens(c)) }))
    await compactNow($, REBUILD_ASK)
  } else {
    await change($, v => ({ ...v, foldAsked: [...new Set([...v.foldAsked, chunkId])] }))
    await compactNow($, FOLD_ASK)
  }
}

// Puts a suggestion off for a few folds (or for good, with a large count),
// logged so Undo brings it back.
export async function snooze($: EngineInterface, id: string, folds: number, title: string) {
  await change($, v =>
    addActivity(
      { ...v, snoozed: { ...v.snoozed, [id]: v.folds + folds } },
      { kind: 'snooze', text: `Put off: ${title}`, detail: folds > 1000 ? 'won’t be suggested again' : `back after ${folds} folds`, chunkIds: [], suggestion: id },
    ),
  )
}

// Brings a suggestion that was put off back, and drops its entry from the log.
export async function undoSnooze($: EngineInterface, activityId: string) {
  await change($, v => {
    const entry = v.activity.find(a => a.id === activityId)
    if (entry?.suggestion === undefined) return v
    const { [entry.suggestion]: _, ...snoozed } = v.snoozed

    return { ...v, snoozed, activity: v.activity.filter(a => a.id !== activityId) }
  })
}
