// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

export type Mode = 'watch' | 'auto'
export type Strategy = 'light' | 'balanced' | 'lean' | 'custom'
// compacted: Claude Code's own compaction took it out of the chat; its summary
// and original stay here for recall.
export type ChunkStatus = 'live' | 'trimmed' | 'folded' | 'compacted'

// The context window as of the last reply, and the part of it Claude Code
// holds for itself (tools, system prompt, skills, memory), which no fold shrinks.
export type ContextFill = {
  tokens: number
  window: number
  // Where Claude Code compacts by itself; null when auto-compact is off or unknown.
  compactAt: number | null
  // Whether the person lowered Claude Code's compaction window below the
  // model's own limit (CLAUDE_CODE_AUTO_COMPACT_WINDOW or the settings), and
  // where Claude Code would compact had they not: the model's own point.
  // Absent on a size measured before they were kept.
  isLowered?: boolean
  ownCompactAt?: number | null
  fixed: number
  fixedParts: Array<{ name: string; tokens: number }>
  // Each MCP server's loaded tool schemas, for the connectors suggestion.
  mcpServers: Array<{ name: string; tokens: number }>
  // The highest ceiling the Custom slider allows this chat.
  customTop?: number
}

// What a chunk's brief holds; each list is short, one item per line.
export type Brief = {
  // An older Folio's list of the person's requests: kept in the parts it
  // saved, read by nothing, never written now.
  requests?: string[]
  rules: string[]
  decisions: string[]
  terms: string[]
  files: string[]
  openTasks: string[]
}

// One part of a big chunk's outline: a heading Claude scans first, a short
// paragraph, and the exact values or paths worth keeping. `from` and `to` are
// the chunk's message numbers it covers, so recall reads just that stretch.
export type Section = {
  heading: string
  body: string
  points: string[]
  from: number
  to: number
}

// A message an older Folio had Haiku judge side talk, to tidy it: its number
// in the part, its opening words, why, and its size. Left out when a chat is
// loaded (see ChunkRecord's `side`); a whole side turn (`isSide`) does the
// job now.
export type SideMessage = {
  n: number
  opening: string
  why: string
  tokens: number
}

// What a message of a part holds, by rule: the person's words, Claude's words,
// a tool call's input, or a tool's or the engine's output.
export type RowType = 'said' | 'reply' | 'call' | 'output'

// An exact value a part used, with a short name: "bubble colour: #F2A623".
export type Value = { name: string; value: string }

// How a part's task was decided: it started one; Haiku said it carries on
// the part before it; its topic came back to an older task; the part before
// it's, since nothing said otherwise; a leg of a turn, the turn's; or, for a
// part saved before tasks, from the runs of its topic.
export type TaskWhy = 'new' | 'carries' | 'rejoins' | 'previous' | 'leg' | 'topic'

// Claude's own plan for a turn, from its update_plan calls: the steps and
// whether the turn starts a new task.
export type TurnPlan = { scope?: string; steps: string[] }

// A ledger item's kind. Its id is the kind's letter and a number: R rule,
// D decision, G term (a name or word of this work, with what it means),
// V value, F file, O open task.
export type LedgerKind = 'rule' | 'decision' | 'term' | 'value' | 'file' | 'task'
export type ItemStatus = 'open' | 'done' | 'replaced' | 'parked'

// One item of the ledger. Items are never deleted: one that closes, is
// replaced or is parked keeps its words and says so.
export type LedgerItem = {
  id: string
  kind: LedgerKind
  // One line: a value as "name: value", a file as its path and a note.
  text: string
  status: ItemStatus
  // The part it came from, by order; null for one from before the ledger
  // (an older Folio's merged brief) or from a FolioPack (`isOld`).
  from: number | null
  // The newest part that worked on it or said it again, by order: an open
  // task untouched for 40 parts is parked.
  touched: number
  // The task of the part it came from.
  task?: string
  // The item that took its place, and the part where it closed, was replaced
  // or was parked.
  replacedBy?: string
  endedIn?: number
  // For a done open task: the words from the part or Claude's recap that showed it done.
  evidence?: string
  isOld?: boolean
}

// Rules, decisions, terms, values, files and open tasks, each with its id and
// status. `next`: the next number of each letter, never used twice.
export type Ledger = { version: number; next: Record<string, number>; items: LedgerItem[] }

export type TaskStatus = 'open' | 'done' | 'parked'

// One piece of work: T1, T2 and on. Its parts need not be neighbours: a task
// that stops and comes back later is still one task.
export type Task = {
  id: string
  title: string
  topic: string
  status: TaskStatus
  // Its parts' ids, oldest first (read from the parts' own task).
  parts: string[]
  // Two sentences: what the task is and what it came to; and where it stands.
  digest: string
  stands: string
  // Who wrote the digest: Haiku, or by rule Claude's newest recap or the newest
  // summary. `digestAt`: how many of its parts Haiku read when it last wrote it.
  digestBy: 'haiku' | 'recap' | 'summary' | 'none'
  digestAt: number
}

// The chat's tasks; `next` is the next task's number, never used twice.
export type TaskList = { version: number; next: number; tasks: Task[] }

// One part of the chat: a turn (a prompt and everything done for it), a leg
// of a long turn, or a turn with the short ones after it.
export type ChunkRecord = {
  id: string
  // Where an older Folio found the part, by the text around its start. Left
  // out when a chat is loaded; the copy of the index an upgrade keeps holds it.
  anchor?: string
  // Where the part sits in the chat, by what no trim, tidy or fold changes:
  // the hash of its prompt and of its opening (the prompt and the start of the
  // reply), and its first and last tool calls. A leg starts mid-turn, at its
  // first call. Absent on parts saved before they were kept.
  prompt?: string
  opening?: string
  firstCall?: string
  lastCall?: string
  isLeg?: boolean
  // A part an older Folio saved twice: the part that holds the same words. It
  // stays out of the folded history; recall still reads it.
  copyOf?: string
  // Order in the chat, oldest first; stable once the part is seen. Its number
  // is order + 1, given once and never changed or used again.
  order: number
  title: string
  topic: string
  // One line for a small chunk, a few sentences for a bigger one; a big chunk
  // adds its outline in `sections`.
  summary: string
  sections: Section[]
  brief: Brief
  // Estimated size of the chunk word for word.
  tokens: number
  isSummarised: boolean
  // An older Folio's note from Haiku of exact details a summary may blur.
  // Left out when a chat is loaded, as `anchor` is.
  exactReason?: string | null
  // The person's call: keep it word for word, or seen and fine to fold.
  decision: 'keep' | 'fold' | null
  // The fold count when the person kept it, so an unused keep can be raised again.
  keptAtFold: number | null
  status: ChunkStatus
  recalls: number
  // Files the chunk's tool calls touched, skills it ran and MCP servers it
  // used: what a pack needs, and whether a kept chunk still comes up.
  paths: string[]
  skills: string[]
  servers: string[]
  // An older Folio's side messages, the ones it tidied out of the chat and the
  // ones the person put back. Left out when a chat is loaded, as `anchor` is.
  side?: SideMessage[]
  tidied?: number[]
  keepSide?: number[]
  // The task it belongs to (T1, T2 …) and how that was decided. Absent only
  // on a part from before tasks, until the upgrade gives it one.
  task?: string
  taskWhy?: TaskWhy
  // Haiku's: whether the part carries on the work of the part before it, and
  // whether the whole turn is off the work (chatter, talk about other chats).
  carriesOn?: boolean
  isSide?: boolean
  // Exact values worth keeping, each with a short name (Haiku's).
  values?: Value[]
  // By rule from its tool calls: each command it ran (its first 200
  // characters) and each file it wrote or edited. Absent on a part saved
  // before it was kept.
  did?: string[]
  // Claude's own recap of the turn (a wrap_up call) and its plan
  // (update_plan), when Claude wrote them: hints for the summary.
  recap?: string
  plan?: TurnPlan
  // Parts that share its files, terms or task, as they stood when its card was written.
  links?: Array<{ id: string; shared: string[] }>
  // Rules Haiku found that hold only for this task, and ones Claude's own
  // rules or memory already say: kept on the card, not in the ledger.
  taskRules?: string[]
  houseRules?: string[]
  // The FolioPack it came from, by name: another chat's work, numbered here
  // as it came in. A part an older Folio brought in has none, and an order
  // below 0 instead.
  pack?: string
}

// The brief an older Folio had Haiku merge from every summarised chunk's
// brief. The ledger is built from it once, and it is kept as it was; a
// FolioPack carries the brief in this shape. `ids` are the chunks it covers.
// `openTasks` is absent in a brief merged before it was kept.
export type BriefDigest = {
  ids: string[]
  rules: string[]
  decisions: string[]
  terms: string[]
  files: string[]
  openTasks?: string[]
}

// Why the map was built whole: the chat's first map, a map that could not be
// read back, one from an older Folio, a part it showed that left the history
// (an undo), a map that would pass its budget, or a stretch added since the
// last rebuild that grew past a quarter of the budget.
export type MapRebuild = 'first' | 'unreadable' | 'version' | 'part left' | 'over budget' | 'long stretch'

// The map as last built (map.txt and map.json in the chat's folder): what
// Claude reads for every folded part. Its top (the recall lines and the tasks)
// is kept as it was between folds and only added to; its tail (values, the
// brief, state now) is built again each time. `top` and `since` are lengths in
// characters: the whole top, and the stretch added since the last rebuild.
export type MapState = {
  version: number
  text: string
  top: number
  since: number
  // The parts the top lists, by id, and each task's status as the top states it.
  shown: string[]
  stated: Record<string, string>
  // The fold count at the last rebuild, and why it was built whole.
  rebuiltAt: number
  why: MapRebuild
}

// What one activity entry touched, listed when the entry is opened. A side
// message is an older Folio's tidy, kept as saved and no longer listed.
export type ActivityItem = {
  kind: 'chunk' | 'side'
  chunkId: string
  // For a side message: its number in the part.
  n?: number
  text: string
  detail: string
}

// An entry of Recent activity. Kinds 'tidy', 'pin' and 'unpin' are an older
// Folio's: kept as saved, no longer made or shown.
export type Activity = {
  id: string
  kind: 'fold' | 'trim' | 'tidy' | 'recall' | 'undo' | 'pin' | 'unpin' | 'choice' | 'snooze' | 'pack' | 'import'
  at: number
  text: string
  detail: string
  // The chunks it touched, so Undo can take it back.
  chunkIds: string[]
  // For a choice: what the person chose. For a suggestion put off: which one.
  choice?: 'keep' | 'fold'
  suggestion?: string
  items?: ActivityItem[]
  // The part (and section) it is about, when that is more than its chunks say;
  // '' when its own words name it already (a recall of part 32's card).
  ref?: string
}

export type Settings = {
  mode: Mode
  strategy: Strategy
  // The Custom slider's ceiling as older versions kept it: compared with the
  // work alone (the context less Claude Code's own part and Folio's kept
  // parts). Read once to set customReal, never written again.
  customCeiling?: number
  // The ceiling chosen on the Custom slider, in real tokens of the whole
  // context; the floor follows from it.
  customReal?: number
}

// Why a fold runs: the person asked (Fold now, Summarise now), Automatic at
// the ceiling, Automatic on a cold cache, or Claude Code's own compaction
// answered with a fold.
export type FoldWhy = 'asked' | 'ceiling' | 'cold' | 'engine'

// Claude's fold note (foldnote.ts), as the map's State now shows it: the fold
// it was asked for, what Claude is in the middle of, what is still open, and
// when it came.
export type FoldNote = { fold: number; doing: string; open: string[]; at: number }

// A fold made and not yet seen in a request: what the context was before it
// and what the plan meant to free, both in real tokens.
export type PendingFold = { fold: number; why: FoldWhy; before: number; planned: number; isCold: boolean }

// The chat's real sizes, as the model's requests report them. Folio's own
// counts are estimates; `ratio` turns them into real tokens.
export type RealSizes = {
  // Real tokens per token Folio estimates; null until measured.
  ratio: number | null
  // Requests the main chat has made, and the count at the last fold.
  requests: number
  lastFold: number | null
  // When the last request was answered (milliseconds since the epoch) and
  // its context, uncached, cache-written and cache-read together. Null after
  // a fold until the next request.
  lastAt: number | null
  tokens: number | null
  pending: PendingFold | null
}

// Everything the panel draws, kept in one value so a change redraws it once.
// What an older Folio kept in it besides (joins, pinned, unpinned, foldNext,
// headsUpFold) is left out when a chat is loaded; the copy of the index an
// upgrade keeps holds it.
export type PickerView = {
  // The saved index's version; one saved with none is 1.
  version: number
  // The order the next new part takes: one past every order given so far, so
  // no part number is used twice.
  nextPart: number
  settings: Settings
  chunks: ChunkRecord[]
  activity: Activity[]
  // Real tokens kept out of the context by folds, trims, tidies and
  // shortened outputs so far. A fold's share is the real drop from the
  // request before it to the request after.
  savedTokens: number
  real: RealSizes
  folds: number
  // Background work in progress, for the panel's status line.
  working: string | null
  context: ContextFill | null
  // Suggestions put off: their id to the fold count they may come back at.
  snoozed: Record<string, number>
  // Chunks the person asked to summarise now; the next fold takes them.
  foldAsked: string[]
  // The map Claude reads for the folded parts, as last built; null until the
  // chat's first map (kept in map.txt and map.json, not in the index).
  map: MapState | null
  // The panel's sections the person folded up, kept with the chat.
  collapsed: string[]
  // An older Folio's merged brief, kept as it was; the ledger stands for it now.
  briefDigest: BriefDigest | null
  // Rules, decisions, terms, values, files and open tasks, by id and status
  // (kept in ledger.json), and the chat's tasks (tasks.json).
  ledger: Ledger
  tasks: TaskList
  // Claude's note at the last fold that asked for one; State now shows it
  // until the next fold.
  foldNote: FoldNote | null
  // Private items found so far (kept apart from summaries and originals).
  privateCount: number
  // The session's folder, so a whole-project pack can find this chat.
  cwd: string
}

// One file the pack can carry, ticked on its own, by its path in the project.
export type PackFile = { path: string; bytes: number; isChecked: boolean }

// A group of files the pack can carry, found from the project and the chat: a
// kind of file, a folder, or a folder's folders. A group holds either folders
// (`children`) or files; its tick is its files' ticks.
export type PackGroup = {
  id: string
  label: string
  // Where it goes: the FolioPack itself, or FolioFiles beside it.
  into: 'pack' | 'files'
  count: number
  bytes: number
  // What it holds, in a line, so whoever ticks it knows what they send.
  about: string
  children?: PackGroup[]
  files?: PackFile[]
}

// Another chat Folio kept in the same project, for a whole-project pack.
// `bytes`: its summaries and originals before zipping.
export type PackChat = { id: string; chunks: number; title: string; bytes: number }

// The FolioPack form while it is open.
export type PackDraft = {
  name: string
  root: string
  // Pack just this chat (its own files), or the whole project (every file in
  // it, and every chat Folio kept there).
  scope: 'chat' | 'project'
  groups: PackGroup[]
  chatGroups: PackGroup[]
  chats: PackChat[]
  rules: Array<{ path: string; label: string; uses: number; isChecked: boolean; about: string }>
  skills: string[]
  // Where Pack up saves, as typed: '' is defaultFolder. Kept for every chat in
  // ~/.claude/folio/prefs.json.
  saveTo: string
  // Where an empty Saves to goes: the project's Work/Folio/Folio packs, or ~/FolioPacks.
  defaultFolder: string
}

// Where the FolioPack form stands. The form itself (every file of the project,
// each with its tick) is too big for the panel's state and is kept in the mod's
// memory; `rev` changes whenever it does.
export type PackStatus = { rev: number; phase: 'scanning' | 'ready' | 'failed'; error: string } | null

// How far a FolioPack scan has got, for its loading bar. Each step: when it
// started, its count so far (files listed, files made by shell commands,
// Haiku's batches done), the count it is going to (batches only, once known)
// and, once done, how long it took. A step not started yet is missing.
export type ScanStep = { startedAt: number; count: number; total?: number; ms?: number }
export type ScanSteps = { startedAt: number; files?: ScanStep; shell?: ScanStep; sorting?: ScanStep }
// A scan's steps by name.
export type ScanStepName = Exclude<keyof ScanSteps, 'startedAt'>

declare module 'claude-code' {
  interface PluginState {
    folio: {
      view: PickerView
      // The panel's opened parts: 'context', 'suggestions', 'brief', 'chunks',
      // 'pack', 'pack-always', a pack group id, an activity id.
      open: string[]
      openChunk: string | null
      pack: PackStatus
      // Pack up's state since the panel opened: packing, or packed. Opening the
      // panel again sets it back to Pack up.
      packed: 'packing' | 'done' | null
      // Whether Fold now's fold waits or runs: the button reads Folding… and
      // takes no further press until it is done.
      folding: boolean
    }
  }
}
