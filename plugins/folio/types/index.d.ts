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
  fixed: number
  fixedParts: Array<{ name: string; tokens: number }>
  // Each MCP server's loaded tool schemas, for the connectors suggestion.
  mcpServers: Array<{ name: string; tokens: number }>
  // The highest ceiling the Custom slider allows this chat.
  customTop?: number
}

// What a chunk's brief holds; each list is short, one item per line.
export type Brief = {
  requests: string[]
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

// A message Haiku judged side talk (about another chat, a retry, a plain "ok"):
// its number in the chunk, its opening words, why, and its size.
export type SideMessage = {
  n: number
  opening: string
  why: string
  tokens: number
}

// One chunk of the chat: a few prompts and everything done for them.
export type ChunkRecord = {
  id: string
  // Where the chunk starts in context, so its bounds hold as the chat changes.
  anchor?: string
  // Order in the chat, oldest first; stable once the chunk is seen.
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
  // Haiku's note: exact details a summary may blur (which), else null. The
  // chunk still folds unless the person keeps it.
  exactReason: string | null
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
  side: SideMessage[]
  // Side messages tidied out of the chat now, and ones the person put back
  // (never tidied again).
  tidied: number[]
  keepSide: number[]
}

// The brief merged by Haiku from every summarised chunk's brief: each item
// said once in its newest wording, what a later item reversed left out, and
// paths that are gone or tied to one chat dropped. `ids` are the chunks it
// covers; a chunk summarised later is merged in. `openTasks`: the newest
// summary's list with what is done or dropped taken out (absent in a brief
// merged before it was kept).
export type BriefDigest = {
  ids: string[]
  rules: string[]
  decisions: string[]
  terms: string[]
  files: string[]
  openTasks?: string[]
}

// One summary Claude reads for neighbouring folded chunks on the same topic,
// written at a fold. The chunks keep their own records, so the panel lists and
// undoes them one by one. `key` says which summaries it was written from; a
// change to any of them (an undo, a new neighbour) writes it again. `saves`:
// tokens it saves over the chunks' own summaries.
export type Join = {
  ids: string[]
  key: string
  title: string
  topic: string
  summary: string
  sections: Section[]
  saves: number
}

// Something recall brought back for good: a short answer asked for twice
// (fact), or a stretch of an original recalled twice (passage).
export type PinnedFact = {
  id: string
  kind: 'fact' | 'passage'
  text: string
  query: string
  chunkIds: string[]
  recalls: number
  pinnedAt: number
  // The fold count when it was last recalled; ones unused for a while go back.
  lastUsedFold: number
  // The fold count when it was pinned: however often it is used, it goes back
  // after a while, and comes back with a fresh answer if it is asked for again.
  pinnedFold: number
  // For a fact: the newest part of the chat when it was answered, and that
  // part's size then. A part newer than that (or that part grown since) which
  // the question's search would read may change the answer, so it is looked up
  // again. Absent on ones pinned before it was kept.
  upTo?: PartMark
  // For a passage: where it starts, as the part number and section letter
  // recall uses ("32.B"); absent on ones brought back before it was kept.
  ref?: string
}

// How far the chat went when an answer was made: its newest part's order and size.
export type PartMark = { order: number; tokens: number }

// What one activity entry touched, listed when the entry is opened.
export type ActivityItem = {
  kind: 'chunk' | 'side'
  chunkId: string
  // For a side message: its number in the chunk.
  n?: number
  text: string
  detail: string
}

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
  // The part (and section) it is about, when that is more than its chunks say.
  ref?: string
}

export type Settings = {
  mode: Mode
  strategy: Strategy
  // The ceiling chosen on the Custom slider; the rest follows from it.
  customCeiling?: number
}

// Everything the panel draws, kept in one value so a change redraws it once.
export type PickerView = {
  settings: Settings
  chunks: ChunkRecord[]
  pinned: PinnedFact[]
  activity: Activity[]
  // Tokens kept out of the context by folds, trims and tidies so far.
  savedTokens: number
  folds: number
  // Background work in progress, for the panel's status line.
  working: string | null
  context: ContextFill | null
  // Suggestions put off: their id to the fold count they may come back at.
  snoozed: Record<string, number>
  // Chunks the person asked to summarise now; the next fold takes them.
  foldAsked: string[]
  // Folded neighbours Claude reads as one summary.
  joins: Join[]
  // The panel's sections the person folded up, kept with the chat.
  collapsed: string[]
  briefDigest: BriefDigest | null
  // Flagged chunks the next fold would take, for the ring and the heads-up.
  foldNext: string[]
  // The fold count the heads-up toast was last shown at.
  headsUpFold: number | null
  // Private items found so far (kept apart from summaries and originals).
  privateCount: number
  // The session's folder, so a whole-project pack can find this chat.
  cwd: string
  // The questions (a fact's query, a passage's place) the person unpinned:
  // recall still answers them, but never pins them again by itself.
  unpinned: string[]
}

// One file the pack can carry, ticked on its own.
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
  // Where Pack up saves, as typed: '' is ~/FolioPacks. Kept for every chat in
  // ~/.claude/folio/prefs.json.
  saveTo: string
}

// Where the FolioPack form stands. The form itself (every file of the project,
// each with its tick) is too big for the panel's state and is kept in the mod's
// memory; `rev` changes whenever it does.
export type PackStatus = { rev: number; phase: 'scanning' | 'ready' | 'failed'; error: string } | null

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
      // When Fold now was pressed, while its fold hasn't been confirmed: the
      // button reads Folding… and takes no further press until then.
      folding: number | null
    }
  }
}
