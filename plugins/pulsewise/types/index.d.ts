// PulseWise · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

/** One point of the chat's task list, with when it started and ended. */
export type Point = {
  name: string
  state: 'pending' | 'running' | 'done'
  started: number | null
  ended: number | null
  /**
   * When one of Claude's own steps first matched this point closely (two words in common) while the list still had it
   * waiting (the list lagging behind); cleared when the turn ends with the point still waiting.
   */
  seenAt?: number | null
  /** When Claude's steps last matched this point: the status line puts Claude's current step here. */
  activeAt?: number | null
  /**
   * Claude's own count for this point (the count tool): pieces done of all it found, and what a piece is ("edits").
   * `none` when Claude said the point can't be counted. `call` is Claude's call count when it last sent one.
   */
  count?: PointCount | null
  /** Claude's estimate for this point, in minutes (the estimate tool), and PulseWise's correction of it by past ones. */
  estimateMin?: number | null
  correctedMin?: number | null
  /** Time this point spent waiting on the person (Claude's turn over or stopped while it was open), in ms. */
  heldMs?: number
  /** Claude's call count when this point started (the count reminder counts calls from there). */
  startCall?: number | null
  /** Claude's call count when PulseWise last reminded it to count this point. */
  remindedCall?: number | null
  /**
   * The point's sub-tasks, as Claude counts them (the count tool's `sub` / `subs`): with them, the point's own count is
   * theirs (subCount). Shown under the pulse while the point runs: a bar, a list with counts, or names (subForm).
   */
  subs?: SubTask[] | null
}

/**
 * One sub-task of a point: its pieces done of all it has, and what a piece is ("clips"). `none` when it can't be counted
 * (shown by name only); `finished` marks such a one done.
 */
export type SubTask = { name: string; done: number; total: number; unit: string | null; none?: boolean; finished?: boolean; at: number }

/**
 * Claude's own count for a point, as the count tool last sent it. `peak` is the most pieces it ever counted done for
 * the point: a count that never went past 0 stands aside for the point's background work while Claude waits on it.
 */
export type PointCount = { done: number; total: number; unit: string | null; at: number; call: number; none?: boolean; peak?: number }

/** One step inside a helper job (a script that reports its own progress). */
export type TaskStep = {
  name: string
  state: string
  done: number | null
  total: number | null
  started: number | null
  ended: number | null
  estMs: number | null
  weight: number | null
  /** '%' when done/total are a percentage or a time share, not a count of items. */
  unit?: string | null
}

/**
 * Where a piece of background work stands:
 *   running        working, and counted: the bar is busy while it runs
 *   silent         a helper job not heard from (past its ttl, or its process could not be checked): not counted, not
 *                  ended; it runs again the moment its file reports
 *   betweenTurns   an agent the app lists as idle (or by a word PulseWise does not know): not counted, not ended; it
 *                  runs again when the app says so or it acts
 *   done, failed   ended, once (`ended` is set only here); only an agent that acts again, or a job the bar ended
 *                  itself whose own file reports after that, comes back from them
 * Beside the state, `coveredBy` marks a background command whose helper job reports it (covered: not counted itself,
 * its job is) or a stopped job a redo replaced (superseded: ended, hidden).
 */
export type TaskState = 'running' | 'silent' | 'betweenTurns' | 'done' | 'failed'

/** One piece of background work: a background command, an agent, or a helper job. */
export type Task = {
  id: string
  kind: 'shell' | 'agent' | 'job' | 'task'
  name: string
  /** Index of the task-list point it belongs to; -1 for work outside the list. */
  point: number
  /** Explicit point name a helper job asked for. */
  pointName: string | null
  started: number
  /** When it ended: set only once it is done or failed. */
  ended: number | null
  state: TaskState
  /** When it went silent or between turns (its time stands still from then). */
  pausedAt?: number | null
  /** The agent whose end closed or quieted this task of its own: it reopens if that agent acts again. */
  heldBy?: string | null
  /** Its end was told with a toast and the taskbar flash: an end after a revival is not told again. */
  announced?: boolean
  /** A job whose own file said it ended (not the bar, on its process looking gone or a stop): that end stands. */
  endedByFile?: boolean
  steps: TaskStep[]
  actions: number
  command: string | null
  script: string | null
  pid: number | null
  heartbeat: boolean
  updated: number
  /** A helper job that reports this background command's progress. */
  coveredBy: string | null
  /** The background agent this task belongs to (its commands and step-by-step jobs). */
  owner?: string | null
  /** An agent's recent commands, to recognise the jobs it starts. */
  commands?: string[]
  /** An agent's model as the app names it ("fable", "claude-opus-5-5"): shown as a short tag with it. */
  model?: string | null
  /** A job with no process to watch stays alive this long after its last report. */
  ttl?: number | null
  /** The stopped job this one redoes (its name), shown on its line. */
  redoOf?: string | null
  /** A server or watcher that keeps running (its words, or Claude said so): not progress, kept off the pulse. */
  service?: boolean
  /** Claude's call count when it started, and when PulseWise last reminded Claude of it running on with no count. */
  startCall?: number
  remindedCall?: number | null
  /** An agent whose brief got PulseWise's progress lines (a working agent, not a look-up one): its follow-ups get them too. */
  briefed?: boolean
  message: string | null
}

export type Activity = { label: string; started: number; toolUseId: string; isWaiting?: boolean }

/** A line of "Done so far"; `id` is the task's, so a task that ends again replaces its line instead of adding one. */
export type LogEntry = { text: string; ok: boolean; at: number; id?: string }

/**
 * Where this chat's own turn stands:
 *   idle             no turn seen yet
 *   working          Claude's turn is running
 *   awaitingReply    its turn ended with points still open: Claude's own part stands still until the next turn
 *   stoppedByPerson  the person pressed Stop with points still open: the same, and the list is not counted as busy
 *   finished         its turn ended with nothing left open
 */
export type ChatPhase = 'idle' | 'working' | 'awaitingReply' | 'stoppedByPerson' | 'finished'

/** Another local chat, as that chat published its progress: shown behind "Other pulses". */
export type SideChat = {
  session: string
  title: string
  pct: number
  busy: boolean
  line: string
  updated: number
  segs: { name: string; fill: number; state: string; weight: number }[]
  /** When that chat's work finished (none while it works). */
  finishedAt?: number | null
  /** When the person last opened that chat, from the app's own record of it. */
  focusedAt?: number | null
  /** That chat waits on the person: a question to answer, or Claude stopped with points still open. */
  needsInput?: boolean
  /** The person pressed Stop in that chat with points still open, and nothing of it runs now. */
  isStopped?: boolean
  /** That chat's id in the app (local_…): its own record there says when the person last opened it. */
  host?: string
  /** The name of that chat's project folder, when it is not this chat's. */
  place?: string
  /** About how long that chat's work has left, in ms, when every part still to do can tell (as of `updated`). */
  left?: number | null
  /** When this chat first listed it: its spot in the list, oldest on top. */
  listedAt?: number
}

export type Model = {
  points: Point[]
  tasks: Task[]
  /** Claude's tool calls running now, oldest first: several can run at once. */
  actions?: Activity[]
  log: LogEntry[]
  side: SideChat[]
  /** When the last point or task finished, once nothing is left running. */
  finishedAt: number | null
  /** Where this chat's own turn stands; kept here, so a hot reload of the code mid-turn keeps it. */
  phase: ChatPhase
  /** When the phase began: Claude's own part of the open points stands still from then while it waits or is stopped. */
  phaseAt: number | null
  /** The main loop's turns, counted, and the turn that last wrote or updated the task list. */
  turn: number
  listTurn: number
  /**
   * Helper jobs this bar ended or took off, by id, with their file's `updated` then: a re-read of a file (after a
   * reload) never brings one back unless the file reports again since.
   */
  closedJobs: Record<string, number>
  /** Claude's own tool calls in this chat's main loop, counted (the count reminder measures by them). */
  calls?: number
  /** When Claude's turn ended with points open and nothing of its own running: it waits on the person from then. */
  waitFrom?: number | null
  /** The current list: when it was written, Claude's estimate for all of it (minutes) and when that came, its held time. */
  list?: ListInfo | null
  /** Short labels for names longer than the bar shows whole, written by a small model (Haiku): name -> label. */
  labels?: Record<string, string>
  /** Notes for Claude waiting for its next call (the organised plan for a new list). */
  notes?: string[]
  /** The small model's layout of the current list (organiseList), kept to quote a point's parts when it starts. */
  plan?: Plan | null
  /** A layout asked for and not yet answered: the list's start, when it was asked, and how many times. */
  planAsk?: { list: number; at: number; tries: number } | null
  /** The person's latest message, for the small model (kept in memory with the model, never on disk). */
  request?: string
  /** Claude's steps since that message, by their labels, for the small model. */
  recent?: string[]
}

/** One part of a point in an organised plan: its pieces and what they are, or none for one that can't be counted. */
export type PlanPart = { name: string; total?: number; unit?: string; none?: boolean }

/** A list as the small model laid it out: its heading, and each point with its parts. `list` is the list's start. */
export type Plan = { list: number; at: number; heading: string; points: { name: string; parts: PlanPart[] }[] }

/** The current task list as a whole, for the estimate and the time log. */
export type ListInfo = {
  started: number
  estimateMin: number | null
  /** The estimate corrected by how past ones turned out; null before enough are on record. */
  correctedMin?: number | null
  /** Time the whole list spent waiting on the person, in ms. */
  heldMs: number
  /** Written to the time log already (finished, or replaced by a new list). */
  logged: boolean
  /** The request the list is for, in a few words (the estimate tool's `heading`): shown over the pulse. */
  heading?: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'pulsewise': {
      model: Model
      tick: number
      selected: string | null
      showDone: boolean
      showSide: boolean
      /** The band folded down to one row by its chevron. */
      folded: boolean
    }
  }
}
