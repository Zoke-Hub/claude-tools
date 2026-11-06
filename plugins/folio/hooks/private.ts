// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Private items (keys, tokens, passwords, card and phone numbers, email
// addresses) are set apart the moment a chunk is saved: summaries, originals
// and packs hold a placeholder, and the real value lives only in this
// session's private file, which recall on this computer reads back.

const PATTERNS: Array<{ kind: string; re: RegExp; group?: number }> = [
  { kind: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'API key', re: /\b(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/g },
  { kind: 'token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  { kind: 'password', re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*["']?([^\s"'`,;]{6,})/gi, group: 1 },
  { kind: 'card number', re: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: 'phone number', re: /\+\d{1,3}[ -]?\(?\d{2,5}\)?[ -]?\d{3,5}[ -]?\d{3,5}\b/g },
  { kind: 'email address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
]

// Addresses that are part of tooling, not anyone's own.
const PUBLIC_EMAIL = /@(?:example\.(?:com|org)|anthropic\.com|users\.noreply\.github\.com)$|^(?:noreply|no-reply)@/i

const PRIVATE_MARK = '[private:'

export type Vault = Record<string, { kind: string; value: string }>

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }

  return sum % 10 === 0
}

function isReal(kind: string, value: string): boolean {
  if (kind === 'card number') {
    const digits = value.replace(/\D/g, '')
    // The pattern already holds 13 to 19 digits.
    return luhn(digits) && !/^(\d)\1+$/.test(digits)
  }
  if (kind === 'email address') return !PUBLIC_EMAIL.test(value)

  return true
}

// The text with every private item swapped for its placeholder. The vault is
// updated in place; the same value always gets the same placeholder.
export function redact(text: string, vault: Vault): string {
  let out = text
  for (const { kind, re, group } of PATTERNS) {
    out = out.replace(re, (match: string, ...rest: unknown[]) => {
      const value = group === undefined ? match : (rest[group - 1] as string | undefined)
      if (value === undefined || value.startsWith(PRIVATE_MARK) || !isReal(kind, value)) return match
      const known = Object.entries(vault).find(([, item]) => item.value === value)?.[0]
      const mark = known ?? `${PRIVATE_MARK}${kind} ${Object.keys(vault).length + 1}]`
      vault[mark] = { kind, value }

      return group === undefined ? mark : match.replace(value, mark)
    })
  }
  // A value known to be private is set apart wherever it appears, labelled or
  // not (in quoted code, say). Short values are left alone, as a common word
  // could match them.
  for (const [mark, item] of Object.entries(vault)) {
    if (item.value.length >= KNOWN_MIN && out.includes(item.value)) out = out.split(item.value).join(mark)
  }

  return out
}

const KNOWN_MIN = 6

// Placeholders back to their values, for recall on this computer only.
export function reveal(text: string, vault: Vault): string {
  if (!text.includes(PRIVATE_MARK)) return text
  let out = text
  for (const [mark, item] of Object.entries(vault)) out = out.split(mark).join(item.value)

  return out
}

export function countByKind(vault: Vault): string {
  const counts = new Map<string, number>()
  for (const item of Object.values(vault)) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)

  return [...counts].map(([kind, n]) => `${n} ${kind}${n === 1 ? '' : kind.endsWith('s') ? 'es' : 's'}`).join(', ')
}
