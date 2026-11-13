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
}

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
  /** A job with no process to watch stays alive this long after its last report. */
  ttl?: number | null
  /** The stopped job this one redoes (its name), shown on its line. */
  redoOf?: string | null
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

/** Another chat in the same project, as that chat published its progress: shown behind "Other chats". */
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
}

declare module 'claude-code' {
  interface PluginState {
    'pulsewise': {
      model: Model
      tick: number
      selected: string | null
      showDone: boolean
      showSide: boolean
    }
  }
}
