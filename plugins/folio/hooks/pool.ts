// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// FolioPack's slow steps wait on the engine (a folder's listing, a file's
// words, an answer from Haiku), so a few at once take a fraction of the time
// one after another does. inTurns keeps the order the one-by-one way gave.

// Runs `work` on each item, at most `most` at a time, and gives the results in
// the items' order.
export async function inTurns<T, R>(items: readonly T[], most: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, most), items.length) }, lane))

  return out
}

// At most `most` calls at once, wherever they come from: a walk through
// folders waits here for each listing, never while the folders inside it are
// read, so nested folders can't hold every turn and wait on each other.
export function gate(most: number): <R>(work: () => Promise<R>) => Promise<R> {
  let active = 0
  const waiting: Array<() => void> = []

  return async <R>(work: () => Promise<R>): Promise<R> => {
    while (active >= most) await new Promise<void>(go => waiting.push(go))
    active += 1
    try {
      return await work()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}
