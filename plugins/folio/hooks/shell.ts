// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { SessionMessage } from 'claude-code'

import { callLinesIn } from './chunks'
import { expandHome, isFullPath, slash } from './paths'

// The paths a chat's shell commands name, read from the commands' own words:
// a mod sees what a command said, not what it did to the disk, so FolioPack
// checks each path against the project's files.

// A shell command as Claude ran it, by the Bash or the PowerShell tool.
export type ShellCommand = { tool: string; command: string }

// A path a command names, as the full paths it may be (the first one there is
// the one meant). `isLook`: the command only looks at it (ls, find…), so a
// folder or a pattern there brings no files.
export type NamedPath = { paths: string[]; isLook: boolean }

// The chat's folders, for reading a command's words.
export type Where = { cwd: string; root: string; home: string; isWindows: boolean }

const SHELLS = new Set(['Bash', 'PowerShell'])
// More values than this for one word (a loop's, a pattern's) is guessing.
const MAX_VALUES = 50
const MAX_COMMANDS = 5000
const MAX_INNER = 20
// Words that keep a command's first word to come.
const LEAD = /^(then|do|else|elif|\{|!|time|nohup|exec|sudo|export|local|declare|readonly|typeset)$/
const CD = /^(cd|pushd|chdir|set-location|sl|push-location)$/i
// Commands that only look at what they name.
const LOOK = /^(ls|dir|tree|du|df|find|stat|file|wc|test|\[|\[\[|echo|printf|get-childitem|gci|test-path|get-item|gi|resolve-path|write-host|write-output)$/i
const NAME = /^(env:)?[A-Za-z_]\w*$/

// The shell commands in a chat's messages, in order.
export function shellCommandsOf(messages: readonly SessionMessage[]): ShellCommand[] {
  return messages.flatMap(m =>
    m.toolUses.flatMap(use => {
      const command = ((use.input ?? {}) as Record<string, unknown>).command

      return SHELLS.has(use.tool) && typeof command === 'string' ? [{ tool: use.tool, command }] : []
    }),
  )
}

// The shell commands in a chunk's saved original, in order.
export function shellCommandsIn(text: string): ShellCommand[] {
  const out: ShellCommand[] = []
  for (const { tool, json } of callLinesIn(text)) {
    const command = SHELLS.has(tool) ? commandOf(json) : null
    if (command !== null) out.push({ tool, command })
  }

  return out
}

// A call's command, from its input as JSON. A private value set apart inside
// it may have broken the JSON around it, so the command is looked for alone too.
function commandOf(json: string): string | null {
  try {
    const command = (JSON.parse(json) as Record<string, unknown>).command

    return typeof command === 'string' ? command : null
  } catch {
    const quoted = /"command":("(?:[^"\\]|\\.)*")/.exec(json)?.[1]
    try {
      return quoted === undefined ? null : (JSON.parse(quoted) as string)
    } catch {
      return null
    }
  }
}

// Every path a chat's shell commands name. A command starts where the tool's
// shell was left (an earlier command's cd, kept while it is in the project,
// as the shell tools keep it) and, failing that, in the chat's working folder.
export function namedPaths(commands: readonly ShellCommand[], w: Where): NamedPath[] {
  const left = new Map<string, string | null>()
  const named: NamedPath[] = []
  for (const { tool, command } of commands.slice(-MAX_COMMANDS)) {
    const was = left.get(tool) ?? null
    const starts = [...new Set([was !== null && isInside(was, w.root) ? was : w.cwd, w.cwd])]
    const found = commandPaths(command, tool, starts, w, 0)
    named.push(...found.named)
    left.set(tool, found.end)
  }

  return named
}

function isInside(path: string, root: string): boolean {
  const p = path.toLowerCase()
  const r = root.toLowerCase()

  return p === r || p.startsWith(`${r}/`)
}

// Whether a path starts with a drive's letter (D:).
const hasDrive = (s: string) => s[1] === ':' && /[A-Za-z]/.test(s[0] ?? '')

// A path with its . and .. read and its slashes single; a drive's letter kept.
function normalise(path: string): string {
  const drive = hasDrive(path) ? path.slice(0, 2) : ''
  const segs: string[] = []
  for (const seg of path.slice(drive.length).split('/')) {
    if (seg === '..') segs.pop()
    else if (seg !== '' && seg !== '.') segs.push(seg)
  }

  return `${drive}/${segs.join('/')}`
}

// A word as the full path it names from folder `dir`: Windows forms (D:\x,
// D:/x, Git Bash's /d/x) and the home folder's ~ read as meant; null for a
// word no path is in, or one relative to a folder not known.
function fullPath(word: string, dir: string | null, w: Where): string | null {
  let s = word.includes('\\') ? slash(word.trim()) : word.trim()
  if (s === '' || s.length > 1000 || (s.includes('://') && /^[A-Za-z][\w+.-]+:\/\//.test(s))) return null
  s = expandHome(s, w.home)
  if (w.isWindows && s[0] === '/' && (s[2] === '/' || s.length === 2) && /[A-Za-z]/.test(s[1] ?? '')) s = `${s[1]!.toUpperCase()}:/${s.slice(3)}`
  if (isFullPath(s)) return normalise(s)
  if (hasDrive(s) || dir === null) return null

  return normalise(`${dir}/${s}`)
}

// The ways a word may hold a path: whole (an option alone holds none), after
// an option's = (--output=x), and each item of a list (a,b). A word over
// lines (code in quotes) holds none.
function formsOf(value: string): string[] {
  if (value.length > 1000 || value.includes('\n') || value.includes('\r')) return []
  const forms = value.startsWith('-') ? [] : [value]
  const eq = value.indexOf('=')
  if (eq >= 0 && eq < value.length - 1) forms.push(value.slice(eq + 1))
  if (value.includes(',') && !/\s/.test(value)) forms.push(...value.split(',').filter(Boolean))

  return forms
}

// Bash's braces: a{1,2}b as a1b and a2b.
function braces(s: string): string[] {
  const m = s.includes('{') ? /\{([^{}]*,[^{}]*)\}/.exec(s) : null
  if (m === null) return [s]

  return m[1]!
    .split(',')
    .flatMap(x => braces(`${s.slice(0, m.index)}${x}${s.slice(m.index + m[0].length)}`))
    .slice(0, MAX_VALUES)
}

// One piece of a word: plain text, a variable, or what only running the
// command would tell (another command's output, an argument).
type Part = { text: string } | { name: string } | { isUnknown: true }
type Word = { kind: 'word'; parts: Part[]; isQuoted: boolean }
type Token = Word | { kind: 'op'; op: string }

const literalOf = (t: Token | undefined): string | null =>
  t?.kind === 'word' && t.parts.every(p => 'text' in p) ? t.parts.map(p => (p as { text: string }).text).join('') : null
const nameOf = (p: Part | undefined): string | null => (p !== undefined && 'name' in p ? p.name : null)

// The index of the bracket closing the one at `at`, or the text's end.
function closing(src: string, at: number): number {
  let depth = 0
  for (let i = at; i < src.length; i++) {
    if (src[i] === '(') depth += 1
    else if (src[i] === ')' && --depth === 0) return i
  }

  return src.length
}

// Splits a command into words and operators as its shell would: quotes keep a
// word together, \ escapes in Bash but separates folders in PowerShell (which
// escapes with `), comments are left out, and a here-document's lines are
// words for its command. A command inside one ($(…), `…`) goes to `inner`, to
// be read on its own; the word it sits in can't be known.
function lex(src: string, isBash: boolean, inner: string[]): Token[] {
  const out: Token[] = []
  let parts: Part[] = []
  let text = ''
  let isWord = false
  let isQuoted = false
  const heredocs: string[] = []
  const flush = () => {
    if (text !== '') parts.push({ text })
    text = ''
  }
  const endWord = () => {
    flush()
    if (isWord) out.push({ kind: 'word', parts, isQuoted })
    parts = []
    isWord = false
    isQuoted = false
  }
  const piece = (p: Part) => {
    flush()
    parts.push(p)
    isWord = true
  }
  const nested = (body: string) => {
    inner.push(body)
    piece({ isUnknown: true })
  }
  // A $ at `i`: a variable, a command inside this one, or a plain $. Returns
  // where it ends.
  const dollar = (i: number): number => {
    const rest = src.slice(i + 1, i + 200)
    if (rest.startsWith('(')) {
      const end = closing(src, i + 1)
      nested(src.slice(i + 2, end))

      return end + 1
    }
    if (rest.startsWith('{')) {
      const end = src.indexOf('}', i + 2)
      const name = src.slice(i + 2, end < 0 ? src.length : end)
      piece(NAME.test(name) ? { name } : { isUnknown: true })

      return end < 0 ? src.length : end + 1
    }
    const name = (isBash ? /^[A-Za-z_]\w*/ : /^(env:)?[A-Za-z_]\w*/).exec(rest)?.[0]
    if (name !== undefined) {
      piece({ name })

      return i + 1 + name.length
    }
    if (/^[\d@*#?$!-]/.test(rest)) {
      piece({ isUnknown: true })

      return i + 2
    }
    text += '$'
    isWord = true

    return i + 1
  }
  const backtick = (i: number): number => {
    const end = src.indexOf('`', i + 1)
    nested(src.slice(i + 1, end < 0 ? src.length : end))

    return end < 0 ? src.length : end + 1
  }
  // A line's end: a here-document's lines come next, up to the line that ends it.
  const lineEnd = (i: number): number => {
    let at = src[i] === '\r' && src[i + 1] === '\n' ? i + 2 : i + 1
    endWord()
    for (const end of heredocs.splice(0)) {
      const rest = src.slice(at)
      const last = new RegExp(`^[ \\t]*${end.replace(/[.\\-]/g, '\\$&')}[ \\t]*\\r?$`, 'm').exec(rest)
      const body = last === null ? rest : rest.slice(0, last.index)
      for (const t of lex(body, isBash, inner)) if (t.kind === 'word') out.push(t)
      at += last === null ? rest.length : last.index + last[0].length
    }
    out.push({ kind: 'op', op: ';' })

    return at
  }

  // Runs of plain characters, outside quotes and inside double quotes, taken at once.
  const plain = isBash ? /[^\s'"$`\\;&|()<>#]+/y : /[^\s'"$`;&|()<>#]+/y
  const quoted = isBash ? /[^"$`\\]+/y : /[^"$`]+/y
  const run = (re: RegExp, at: number): number => {
    re.lastIndex = at
    const m = re.exec(src)
    if (m === null) return 0
    text += m[0]
    isWord = true

    return m[0].length
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    const next = src[i + 1] ?? ''
    const taken = ch === '#' ? 0 : run(plain, i)
    if (taken > 0) {
      i += taken
      continue
    }
    if (ch === "'") {
      const end = src.indexOf("'", i + 1)
      text += src.slice(i + 1, end < 0 ? src.length : end)
      isWord = isQuoted = true
      i = end < 0 ? src.length : end + 1
    } else if (ch === '"') {
      isWord = isQuoted = true
      i += 1
      while (i < src.length && src[i] !== '"') {
        const c = src[i]!
        const d = src[i + 1] ?? ''
        const inQuotes = run(quoted, i)
        if (inQuotes > 0) i += inQuotes
        else if (c === '$') i = dollar(i)
        else if (isBash && c === '`') i = backtick(i)
        else if (isBash && c === '\\' && /["\\$`]/.test(d)) {
          text += d
          i += 2
        } else if (!isBash && c === '`' && d !== '') {
          text += d
          i += 2
        } else {
          text += c
          i += 1
        }
      }
      i += 1
    } else if (ch === '$') i = dollar(i)
    else if (isBash && ch === '`') i = backtick(i)
    else if (ch === (isBash ? '\\' : '`')) {
      // An escaped character; at a line's end, the line goes on.
      if (next !== '\n' && next !== '\r') {
        text += next
        isWord = true
      }
      i += next === '\r' && src[i + 2] === '\n' ? 3 : 2
    } else if (ch === '\n' || ch === '\r') i = lineEnd(i)
    else if (ch === ' ' || ch === '\t') {
      endWord()
      i += 1
    } else if (ch === '#' && !isWord) {
      const end = src.indexOf('\n', i)
      i = end < 0 ? src.length : end
    } else if (isBash && ch === '<' && next === '<' && src[i + 2] !== '<') {
      endWord()
      out.push({ kind: 'op', op: '<<' })
      const delimiter = /^-?[ \t]*(['"]?)([A-Za-z_][\w.-]*)\1/.exec(src.slice(i + 2, i + 200))
      if (delimiter !== null) heredocs.push(delimiter[2]!)
      i += 2 + (delimiter?.[0].length ?? 0)
    } else if (';&|()<>'.includes(ch)) {
      // A file's number before a redirection (2>) is no word.
      if ((ch === '>' || ch === '<') && parts.length === 0 && !isQuoted && /^\d$/.test(text)) {
        text = ''
        isWord = false
      }
      const op = next === ch && ch !== '(' && ch !== ')' ? `${ch}${ch}` : ch
      endWord()
      out.push({ kind: 'op', op })
      i += op.length
    } else {
      text += ch
      isWord = true
      i += 1
    }
  }
  endWord()

  return out
}

// The paths one command names, and where it leaves its shell when it started
// in the first of `starts` (null where a cd went somewhere that can't be
// known). Variables set in the command (NAME=x, $name = 'x', a for loop's
// list) are read; one it didn't set, other than the home folder's and the
// working folder's, can't be known, so a word using it names nothing.
function commandPaths(command: string, tool: string, starts: string[], w: Where, depth: number): { named: NamedPath[]; end: string | null } {
  const isBash = tool !== 'PowerShell'
  const inner: string[] = []
  const tokens = lex(command, isBash, inner)
  const vars = new Map<string, string[]>()
  const keyOf = (name: string) => (isBash ? name : name.toLowerCase())
  const builtin = (name: string): string[] | undefined => {
    const n = isBash ? name : name.toLowerCase().replace(/^env:/, '')
    if ((isBash ? ['HOME', 'USERPROFILE'] : ['home', 'userprofile']).includes(n)) return [w.home]
    if (n === (isBash ? 'PWD' : 'pwd')) return ['.']

    return undefined
  }
  // A word's values: every way its variables and braces read; null when one
  // can't be known.
  const valuesOf = (parts: Part[]): string[] | null => {
    let out = ['']
    for (const p of parts) {
      if ('isUnknown' in p) return null
      if ('text' in p) {
        out = out.map(s => `${s}${p.text}`)
        continue
      }
      const known = vars.get(keyOf(p.name)) ?? builtin(p.name)
      if (known === undefined) return null
      out = out.flatMap(s => known.map(k => `${s}${k}`)).slice(0, MAX_VALUES)
    }
    if (isBash) out = out.flatMap(braces).slice(0, MAX_VALUES)
    // Windows' %NAME%: the home folder's and the working folder's; any other can't be known.
    let isKnown = true
    out = out.map(s =>
      !s.includes('%') ? s : s.replace(/%([A-Za-z_]\w*)%/g, (_, name: string) => {
        const n = name.toLowerCase()
        if (n === 'userprofile' || n === 'home') return w.home
        if (n === 'cd') return '.'
        isKnown = false

        return ''
      }),
    )

    return isKnown ? out : null
  }

  let dirs: Array<string | null> = [...starts]
  const stack: Array<Array<string | null>> = []
  const named: NamedPath[] = []
  // Where the reader is in a command: at its start, its first word to come;
  // in the words of one that only looks (ls, find…); or of any other. Set at
  // operators: after a redirection the command goes on as it was, after any
  // other one comes.
  let segment: 'start' | 'look' | 'run' = 'start'
  // A word said again from the same folders names nothing new.
  const said = new Set<string>()
  const name = (values: string[]) => {
    const isLook = segment === 'look'
    const from = `${isLook}\u0001${dirs.join('\u0001')}`
    for (const value of values.slice(0, MAX_VALUES)) {
      for (const form of formsOf(value)) {
        const key = `${from}\u0000${form}`
        if (said.has(key)) continue
        said.add(key)
        const paths = [...new Set(dirs.map(d => fullPath(form, d, w)).filter((p): p is string => p !== null))]
        if (paths.length > 0) named.push({ paths, isLook })
      }
    }
  }
  const setVar = (key: string, values: string[] | null) => {
    if (values !== null && values.length > 0) vars.set(key, values.slice(0, MAX_VALUES))
    else vars.delete(key)
  }

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t]!
    if (tok.kind === 'op') {
      if (tok.op === '(') stack.push(dirs)
      if (tok.op === ')') dirs = stack.pop() ?? dirs
      if (!/^[<>]/.test(tok.op)) segment = 'start'
      // A redirection's target (> out.txt) is a path, never the command's word,
      // even written first. A here-document's word was taken with its <<.
      else if (tok.op !== '<<' && tokens[t + 1]?.kind === 'word') {
        const values = valuesOf((tokens[t + 1] as Word).parts)
        if (values !== null) name(values)
        t += 1
      }
      continue
    }
    const literal = literalOf(tok)
    const after = (n: number) => literalOf(tokens[t + n])
    // for NAME in WORDS; do (Bash)
    if (isBash && segment === 'start' && literal === 'for' && /^[A-Za-z_]\w*$/.test(after(1) ?? '') && after(2) === 'in') {
      let u = t + 3
      const values: string[] = []
      let isKnown = true
      for (; tokens[u]?.kind === 'word'; u++) {
        const vs = valuesOf((tokens[u] as Word).parts)
        if (vs === null) isKnown = false
        else {
          values.push(...vs)
          name(vs)
        }
      }
      setVar(after(1)!, isKnown ? values : null)
      t = u - 1
      continue
    }
    // foreach ($name in 'a', 'b') (PowerShell): a list written out in quotes.
    const loopVar = tokens[t + 2]
    const loopName = loopVar?.kind === 'word' && loopVar.parts.length === 1 ? nameOf(loopVar.parts[0]) : null
    if (!isBash && literal?.toLowerCase() === 'foreach' && tokens[t + 1]?.kind === 'op' && loopName !== null && after(3)?.toLowerCase() === 'in') {
      let u = t + 4
      let level = 1
      const values: string[] = []
      let isKnown = true
      for (; u < tokens.length; u++) {
        const x = tokens[u]!
        if (x.kind === 'op') {
          if (x.op === '(') level += 1
          else if (x.op === ')' && --level === 0) break
          continue
        }
        if (literalOf(x) === '@') continue
        const vs = valuesOf(x.parts)
        if (vs === null || !x.isQuoted) isKnown = false
        else values.push(...vs.flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean))
      }
      name(values)
      setVar(keyOf(loopName), isKnown ? values : null)
      t = u
      // Its body's first word is a command's; with no body after it, the
      // reader goes on in the words it was in.
      segment = literalOf(tokens[t + 1]) === '{' ? 'start' : segment === 'start' ? 'run' : segment
      continue
    }
    if (segment === 'start' && literal !== null && LEAD.test(literal)) continue
    // NAME=value (Bash), at a command's start.
    const first = tok.parts[0]
    const assign = isBash && segment === 'start' && first !== undefined && 'text' in first ? /^([A-Za-z_]\w*)=/.exec(first.text) : null
    if (assign !== null && first !== undefined && 'text' in first) {
      const values = valuesOf([{ text: first.text.slice(assign[0].length) }, ...tok.parts.slice(1)])
      setVar(assign[1]!, values)
      if (values !== null) name(values)
      continue
    }
    // $name = value, or $name=value (PowerShell).
    if (!isBash && first !== undefined && 'name' in first) {
      const second = tok.parts[1]
      if (tok.parts.length === 1 && after(1) === '=' && tokens[t + 2]?.kind === 'word') {
        const values = valuesOf((tokens[t + 2] as Word).parts)
        setVar(keyOf(first.name), values)
        if (values !== null) name(values)
        t += 2
        if (segment === 'start') segment = 'run'
        continue
      }
      if (second !== undefined && 'text' in second && second.text.startsWith('=')) {
        const values = valuesOf([{ text: second.text.slice(1) }, ...tok.parts.slice(2)])
        setVar(keyOf(first.name), values)
        if (values !== null) name(values)
        if (segment === 'start') segment = 'run'
        continue
      }
    }
    // cd: the shell moves for the rest of the command. Its target is named too.
    if (segment === 'start' && literal !== null && CD.test(literal)) {
      let u = t + 1
      while (tokens[u]?.kind === 'word' && /^-./.test(literalOf(tokens[u]) ?? '')) u++
      const target = tokens[u]
      if (target?.kind === 'word') {
        const values = valuesOf(target.parts)
        if (values !== null) name(values)
        const to = values?.length === 1 && values[0] !== '-' ? values[0]! : null
        dirs = dirs.map(d => (to === null ? null : fullPath(to, d, w)))
        t = u
      } else if (isBash) dirs = dirs.map(() => w.home)
      segment = 'run'
      continue
    }
    if (segment === 'start') segment = literal !== null && LOOK.test(literal) ? 'look' : 'run'
    const values = valuesOf(tok.parts)
    if (values !== null) name(values)
  }
  // A command inside this one runs where this one ended up.
  if (depth < 3) {
    const at = dirs.filter((d): d is string => d !== null)
    for (const body of inner.slice(0, MAX_INNER)) if (at.length > 0) named.push(...commandPaths(body, tool, at, w, depth + 1).named)
  }

  return { named, end: dirs[0] ?? null }
}
