// PulseWise · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'pulsewise',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 30,
    bodyColumns: 90,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const PLAN = 'mcp__ccd_turn__update_plan'

/** Everything a drawing holds, as text: Text rows, labels, and the pictures' descriptions. */
type On = Parameters<Parameters<typeof test>[1]>[1]

/** The chat every test runs in: its start, its id and its project folder. */
const inProject = (on: On) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('session.root', () => ({ value: '/projects/demo' }))
}

const drawnText = async (ui: { drawn: () => Promise<unknown> }) => JSON.stringify(await ui.drawn())

/**
 * A file event's path as the test wrote it, on any system. The engine hands hooks the system's own form: on Windows,
 * backslashes, and a drive letter before a path that starts at the root, so "/home/me/x" arrives as "D:\home\me\x".
 */
const pathOf = (e: unknown) =>
  String((e as { path?: unknown }).path ?? '')
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:(?=\/)/, '')

test('the band follows the task list and its background work, on desktop and terminal', async ($, on) => {
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' && (e as { run_in_background?: boolean }).run_in_background
      ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } }
      : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Read the new notes', status: 'in_progress' },
      { content: 'Make the changes', status: 'pending' },
      { content: 'Post and close', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: PLAN, advance: true })
  await $.tool.call({ tool: 'Bash', command: 'python3 render.py', description: 'Render frames', run_in_background: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await drawnText(ui)).toContain('%')
    expect(await ui.find({ key: 'open-p:1' })).toBeDefined()
    await ui.press({ key: 'open-p:1' })
    if (surface === 'desktop') {
      // Each job shows once: point 2's close-up holds its job, which leaves the Tracks list while it is open.
      expect(await ui.find({ key: 'press-hd0' })).toBeDefined()
      expect(await drawnText(ui)).not.toContain('Tracks')
      expect(await ui.find({ key: 'nudge' })).toBeDefined()
      // The name and credit sit small at the right end of the button row.
      expect(await drawnText(ui)).toContain('PulseWise · by Zoke')
      // Short button labels, each explained in its own hover box.
      expect(await drawnText(ui)).toContain('"label":"Nudge"')
      expect(await drawnText(ui)).toContain('Ask Claude to update the list')
      // A press confirms on the button itself ("Nudged ✓"), with no toast.
      await ui.press({ key: 'nudge' })
      expect(await drawnText(ui)).toContain('"label":"Nudged ✓"')
    }
    await ui.press({ key: 'open-p:1' })
    await ui.unmount()
  }

  // The background command ends: its notification marks it done.
  await $.session.append({
    message: {
      type: 'user',
      content: [{ type: 'text', text: '<task-notification><task-id>bg1</task-id><status>completed</status></task-notification>' }],
    },
  })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('100%')
  expect(await ui.find({ key: 'toggle-done' })).toBeDefined()
  await ui.press({ key: 'toggle-done' })
  expect(await drawnText(ui)).toContain('Render frames')
  await ui.unmount()
})

test('with nothing running the band stays empty', async ($, on) => {
  inProject(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a helper script\'s job file fills the point it runs in', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const now = Date.now()
  const job = {
    id: 'j1', name: 'Rig build', point: null, session: 'chat-1', host_session: 'local_x', pid: 1, heartbeat: true,
    script: 'build.py', argv: 'build.py', started: now, updated: now, ended: null, state: 'running', message: null,
    steps: [{ name: 'Cut pieces', state: 'running', done: 40, total: 100, unit: null, weight: null, est_ms: null, started: now, ended: null }],
  }
  on('fs.list', () => ({ value: [{ name: 'j1.json', kind: 'file', size: 10, mtimeMs: 1, isLink: false }] }))
  on('fs.read', () => ({ value: JSON.stringify(job) }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Build the rig', status: 'in_progress' },
      { content: 'Check it', status: 'pending' },
    ],
  })
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'open-p:0' })
  // Its close-up shows the job's steps; the job is not repeated as a track.
  expect(await drawnText(ui)).toContain('Rig build · 40 / 100')
  expect(await drawnText(ui)).not.toContain('Tracks')
  await ui.unmount()
})

test('on Windows the jobs folder is found through USERPROFILE', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { USERPROFILE: 'C:\\Users\\me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('session.root', () => ({ value: 'C:/projects/demo' }))
  on('tool.call', () => ({ result: {} }))
  const listed: string[] = []
  const now = Date.now()
  const job = {
    id: 'j1', name: 'Rig build', point: null, session: 'chat-1', host_session: 'local_x', pid: 1, heartbeat: true,
    script: 'build.py', argv: 'build.py', started: now, updated: now, ended: null, state: 'running', message: null,
    steps: [{ name: 'Cut pieces', state: 'running', done: 40, total: 100, unit: null, weight: null, est_ms: null, started: now, ended: null }],
  }
  on('fs.list', (_, e) => {
    listed.push(pathOf(e))
    return { value: [{ name: 'j1.json', kind: 'file', size: 10, mtimeMs: 1, isLink: false }] }
  })
  on('fs.read', () => ({ value: JSON.stringify(job) }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)

  // USERPROFILE gave the folder (no HOME is set); pathOf drops the drive letter, so this reads the same everywhere.
  expect(listed.some(path => path.endsWith('/Users/me/.claude/progress/jobs'))).toBe(true)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('Rig build')
  await ui.unmount()
})

test('the readout shows only for a beat you open, and its \u00d7 closes it', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Plan the cut', status: 'completed' }, { content: 'Build the timeline', status: 'in_progress' }, { content: 'Send it', status: 'pending' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: true } as never)
  // Nothing opened: no readout, and the whole list's % at the pulse's right end.
  expect(await drawnText(ui)).not.toContain('"alt":"2. Build the timeline')
  expect(await ui.find({ key: 'close-detail' })).toBeUndefined()
  await ui.press({ key: 'open-p:0' })
  let drawn = await drawnText(ui)
  // The readout's own text (its picture's alt): the opened beat, its status and its own %.
  expect(drawn).toContain('"alt":"1. Plan the cut: done')
  expect(drawn).toContain('. 100%"')
  await ui.press({ key: 'close-detail' })
  // Closed again: the readout goes.
  drawn = await drawnText(ui)
  expect(drawn).not.toContain('"alt":"1. Plan the cut')
  expect(await ui.find({ key: 'close-detail' })).toBeUndefined()
  await ui.unmount()
})

test('Nudge shows while only background work runs, with points still open', async ($, on) => {
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } } : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the cut', status: 'in_progress' }, { content: 'Review', status: 'pending' }] })
  await $.tool.call({ tool: 'Bash', command: 'render', description: 'Render the cut', run_in_background: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: false } as never)
  expect(await ui.find({ key: 'nudge' })).toBeDefined()
  await ui.unmount()
})

test('Nudge is there from the first moment a list shows, with nothing running yet', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Plan the cut', status: 'pending' }, { content: 'Review', status: 'pending' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: false } as never)
  expect(await ui.find({ key: 'nudge' })).toBeDefined()
  await ui.unmount()
})

test('Claude working after every point is ticked keeps this chat\'s pulse up', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Find the pictures', status: 'completed' }, { content: 'Download them', status: 'completed' }] })
  // Long after the list finished, Claude runs a long command in the foreground.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: true } as never)
  expect(await ui.find({ key: 'open-p:1' })).toBeDefined()
  expect(await ui.find({ key: 'nudge' })).toBeDefined()
  await ui.unmount()
})

test('a new pulse starts with every beat folded, whatever was open before', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Plan the cut', status: 'in_progress' }, { content: 'Review', status: 'pending' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'open-p:1' })
  expect(await ui.find({ key: 'close-detail' })).toBeDefined()
  // A new list: nothing opened.
  await $.tool.call({ tool: PLAN, scope: 'new_task', items: [{ content: 'Find the pictures', status: 'in_progress' }, { content: 'Write the sheet', status: 'pending' }] })
  expect(await ui.find({ key: 'close-detail' })).toBeUndefined()
  await ui.unmount()
})

test('the end of Claude\'s turn asks the app to draw the band again', async ($, on) => {
  let asked = 0
  on('ui.invalidate', () => {
    asked += 1
    return { value: undefined }
  })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId?: string }).turnId ?? 't' }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Plan the cut', status: 'completed' }] })
  const before = asked
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(asked).toBeGreaterThan(before)
})

// A list ticked done while its work still runs is behind too: Nudge stays.
test('Nudge stays when the list is ticked done but its background work still runs', async ($, on) => {
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } } : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the cut', status: 'in_progress' }, { content: 'Review', status: 'pending' }] })
  await $.tool.call({ tool: 'Bash', command: 'render', description: 'Render the cut', run_in_background: true })
  await $.tool.call({ tool: PLAN, scope: 'continuation', items: [{ content: 'Render the cut', status: 'completed' }, { content: 'Review', status: 'completed' }] })
  // A job started after the list was ticked done belongs to no point: Nudge still shows.
  await $.tool.call({ tool: 'Bash', command: 'export', description: 'Export the stills', run_in_background: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: false } as never)
  expect(await ui.find({ key: 'nudge' })).toBeDefined()
  await ui.unmount()
})

test('points can finish out of order: 3 done while 2 still runs', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Find where the new rules were written', status: 'completed' },
      { content: 'Move style points to project memory', status: 'in_progress' },
      { content: 'Reword the general rule', status: 'pending' },
    ],
  })
  // Point 3 is ticked before point 2.
  await $.tool.call({ tool: PLAN, done: [3] })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'open-p:2' })
  expect(await drawnText(ui)).toContain('Claude: done')
  await ui.press({ key: 'open-p:1' })
  expect(await drawnText(ui)).toContain('Claude: working')
  await ui.unmount()

  // Advancing now ends point 2 and starts nothing (no point is left pending).
  await $.tool.call({ tool: PLAN, advance: true })
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(after)).toContain('100%')
  await after.unmount()
})

test("other chats in the same project show behind their toggle, even with nothing running here", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  const now = Date.now()
  const chat = (session: string, project: string, title: string) => ({
    session, host: `local_${session}`, project, parent: '', title, busy: true, pct: 40,
    line: '2. Render: Frames · 12 / 30 · 40%', updated: now,
    segs: [{ name: 'Plan', fill: 1, state: 'done', weight: 10000 }, { name: 'Render', fill: 0.4, state: 'running', weight: 30000 }],
  })
  const files: Record<string, unknown> = {
    'a.json': chat('chat-2', '/projects/demo', 'Second chat here'),
    'b.json': chat('chat-3', '/projects/elsewhere', 'Chat in another project'),
  }
  on('fs.list', (_, e) => {
    const path = pathOf(e)
    return { value: path.includes('/chats') ? Object.keys(files).map(name => ({ name, kind: 'file', size: 10, mtimeMs: 1, isLink: false })) : [] }
  })
  on('fs.read', (_, e) => {
    const path = pathOf(e)
    const name = Object.keys(files).find(one => path.includes(one))
    return { value: JSON.stringify(name ? files[name] : {}) }
  })
  on('fs.write', () => ({ value: undefined }))
  const opened: string[][] = []
  on('process.run', (_, e) => {
    opened.push((e as { argv: string[] }).argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'toggle-side' })).toBeDefined()
  await ui.press({ key: 'toggle-side' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Second chat here')
  expect(drawn).not.toContain('Chat in another project')
  expect(drawn).not.toContain('Open this chat')
  // A press on its row opens that chat through the app's own link.
  await ui.press({ key: 'chat-0-bar' })
  expect(await ui.find({ key: 'chat-0-name' })).toBeDefined()
  expect(opened.some(argv => argv.includes('claude://code/continue?session=local_chat-2&source=desktop_action'))).toBe(true)
  await ui.unmount()
})

test('other chats keep the spot they took when first listed, oldest on top, however they update', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  const now = Date.now()
  const chat = (session: string, title: string, busy: boolean, updated: number) => ({
    session, host: `local_${session}`, project: '/projects/demo', parent: '', title, busy, pct: 40, line: 'working', updated,
    segs: [{ name: 'Plan', fill: 0.4, state: 'running', weight: 10000 }],
  })
  const files: Record<string, unknown> = { 'a.json': chat('chat-2', 'First listed', true, now) }
  let mtime = 1
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/chats') ? Object.keys(files).map(name => ({ name, kind: 'file', size: 10, mtimeMs: mtime, isLink: false })) : [] }))
  on('fs.read', (_, e) => {
    const name = Object.keys(files).find(one => pathOf(e).includes(one))
    return { value: JSON.stringify(name ? files[name] : {}) }
  })
  on('fs.write', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)
  files['b.json'] = chat('chat-3', 'Listed later', true, now + 2000)
  mtime = 2
  await clock.advance(1100)
  // Both update again, the later one last: neither moves.
  files['a.json'] = chat('chat-2', 'First listed', true, now + 4000)
  files['b.json'] = chat('chat-3', 'Listed later', true, now + 5000)
  mtime = 3
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-side' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('First listed')
  expect(drawn).toContain('Listed later')
  expect(drawn.indexOf('First listed')).toBeLessThan(drawn.indexOf('Listed later'))
  await ui.unmount()
})

test('an opened point that finishes hands over to the next running point', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'First step', status: 'in_progress' },
      { content: 'Second step', status: 'pending' },
      { content: 'Third step', status: 'pending' },
    ],
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'open-p:0' })
  expect(await ui.find({ key: 'close-detail' })).toBeDefined()
  expect(await drawnText(ui)).toContain('"alt":"First step ')
  await ui.unmount()

  await $.tool.call({ tool: PLAN, advance: true })
  await clock.advance(1100)

  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(after)).toContain('"alt":"Second step ')
  await after.unmount()
})

test('with two points running, a background task joins the point named like it', async ($, on) => {
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg7' } } : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Animation notes on the walk (parallel agent)', status: 'in_progress' },
      { content: 'Redo the cut-out notes', status: 'in_progress' },
      { content: 'Check every piece', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: 'Bash', command: 'run notes', description: 'Animation notes on the walk', run_in_background: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'open-p:0' })
  // The command joined point 1: its close-up shows it, and it is not repeated as a track.
  expect(await drawnText(ui)).toContain('Animation notes on the walk · ')
  expect(await drawnText(ui)).not.toContain('point 1 · running')
  await ui.unmount()
})

test('a point whose background jobs are done is not drawn full while Claude\'s own part is still open', async ($, on) => {
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } } : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Load it in a fresh session', status: 'in_progress' }, { content: 'Report', status: 'pending' }] })
  await $.tool.call({ tool: 'Bash', command: 'claude -p hi', description: 'Load it in a fresh session', run_in_background: true })
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: '<task-notification><task-id>bg1</task-id><status>completed</status></task-notification>' }] } })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  // The first segment's track and its fill: the fill must stop short of the track's end.
  const track = drawn.match(/class=\\"track\\" x=\\"([\d.]+)%\\" y=\\"[\d.]+\\" width=\\"([\d.]+)%/)
  const fill = drawn.match(/class=\\"run\\" x=\\"[\d.]+%\\" y=\\"[\d.]+\\" width=\\"([\d.]+)%/)
  expect(track).not.toBeNull()
  expect(Number(fill?.[1] ?? 0)).toBeLessThan(Number(track?.[2]))
  await ui.unmount()
})

test('work still running when a new list is written joins the new point named like it', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  on('agent.list', () => ({ value: [{ id: 'agent-1', description: 'Analyse the interview footage', type: 'general-purpose', status: 'running' }] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Plan the cut', status: 'in_progress' }, { content: 'Write the notes', status: 'pending' }] })
  await $.agent.spawn({ prompt: 'analyse', description: 'Analyse the interview footage', subagentType: 'general-purpose' })
  // A rewritten list: the agent's work now has a point of its own.
  await $.tool.call({
    tool: PLAN,
    scope: 'continuation',
    items: [
      { content: 'Build the timeline', status: 'completed' },
      { content: 'Render the review', status: 'completed' },
      { content: 'Analyse the interview footage', status: 'in_progress' },
    ],
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).not.toContain('Other work')
  expect(drawn).toContain('point 3')
  await ui.unmount()
})

test('two background jobs get a bar each; a finished one says done while the other keeps going', async ($, on) => {
  inProject(on)
  let next = 0
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `bg${++next}` } } : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Images and video', status: 'in_progress' }, { content: 'Review', status: 'pending' }] })
  await $.tool.call({ tool: 'Bash', command: 'cut pieces', description: 'Cut out the pieces', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'render', description: 'Render the animation round', run_in_background: true })

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  let drawn = await drawnText(ui)
  expect(drawn).toContain('Cut out the pieces: ')
  expect(drawn).toContain('Render the animation round: ')
  await ui.unmount()

  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: '<task-notification><task-id>bg1</task-id><status>completed</status></task-notification>' }] } })
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  drawn = await drawnText(ui)
  expect(drawn).toContain('Cut out the pieces: done')
  expect(drawn).toContain('Render the animation round: ')
  expect(drawn).not.toContain('Render the animation round: done')
  await ui.unmount()
})

/**
 * A background agent's step-by-step job ("Animation notes on the walk", a CLI job with no process), in a jobs folder
 * of its own: on step 2 of 3, "Fix arms", 2 of 5 done.
 */
const agentNotesJob = (on: On) => {
  const now = Date.now()
  const job = {
    id: 'j9', name: 'Animation notes on the walk', point: null, session: 'chat-1', host_session: 'local_x', pid: null, heartbeat: false, ttl_ms: 1800000,
    script: 'progress.py', argv: '', started: now, updated: now, ended: null, state: 'running', message: null,
    steps: [
      { name: 'Read notes', state: 'done', done: null, total: null, unit: null, weight: null, est_ms: null, started: now - 5000, ended: now - 1000 },
      { name: 'Fix arms', state: 'running', done: 2, total: 5, unit: null, weight: null, est_ms: null, started: now - 1000, ended: null },
      { name: 'Render', state: 'pending', done: null, total: null, unit: null, weight: null, est_ms: null, started: null, ended: null },
    ],
  }
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/jobs') ? [{ name: 'j9.json', kind: 'file', size: 10, mtimeMs: 1, isLink: false }] : [] }))
  on('fs.read', () => ({ value: JSON.stringify(job) }))
  on('fs.write', () => ({ value: undefined }))
}

test("a background agent's named step-by-step job shows on the agent's own bar", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  on('agent.list', () => ({ value: [{ id: 'agent-1', description: 'Animation notes on the walk', type: 'general-purpose', status: 'running' }] }))
  agentNotesJob(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Animation notes on the walk (parallel agent)', status: 'in_progress' }, { content: 'Cut-out notes', status: 'in_progress' }] })
  await $.agent.spawn({ prompt: 'do the notes', description: 'Animation notes on the walk', subagentType: 'general-purpose' })
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Animation notes on the walk: ')
  expect(drawn).toContain('Fix arms · 2 / 5')
  await ui.unmount()
})

test('a background agent waiting on its own background command stays on the bar after its turn ends', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  on('fs.list', () => ({ value: [] }))
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } } : { result: {} },
  )
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  on('agent.list', () => ({ value: [{ id: 'agent-1', description: 'Check the pack', type: 'general-purpose', status: 'waiting' }] }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Check the pack', status: 'in_progress' }] })
  await $.agent.spawn({ prompt: 'check it', description: 'Check the pack', subagentType: 'general-purpose' })
  await $.tool.call({ tool: 'Bash', command: 'claude -p hi', description: 'Headless run', run_in_background: true, agentId: 'agent-1' } as never)
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' } as never)
  // The main list is done; the agent still waits on its command.
  await $.tool.call({ tool: PLAN, scope: 'continuation', items: [{ content: 'Check the pack', status: 'completed' }] })
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't0', reason: 'answer' } as never)
  await clock.advance(30_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('Agent: Check the pack')
  await ui.unmount()
})

test('a background agent that ran its own background command leaves the bar once the app says it finished', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  on('fs.list', () => ({ value: [] }))
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } } : { result: {} },
  )
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  let status = 'waiting'
  // A finished agent may be gone from the app's list altogether.
  on('agent.list', () => ({ value: status === 'gone' ? [] : [{ id: 'agent-1', description: 'Check the pack', type: 'general-purpose', status }] }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Check the pack', status: 'in_progress' }, { content: 'Report', status: 'pending' }] })
  await $.agent.spawn({ prompt: 'check it', description: 'Check the pack', subagentType: 'general-purpose' })
  // Its own command's end goes to the agent, not this chat: the bar never hears it.
  await $.tool.call({ tool: 'Bash', command: 'claude -p hi', description: 'Headless run', run_in_background: true, agentId: 'agent-1' } as never)
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' } as never)
  status = 'gone'
  await $.turn.complete({ answer: 'all good', durationMs: 1000, isAborted: false, turnId: 't2', agentId: 'agent-1', reason: 'answer' } as never)
  await clock.advance(30_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).not.toContain('Agent: Check the pack')
  await ui.unmount()
})

test('a finished other chat stays until opened; one opened since it finished is gone', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  const now = Date.now()
  const done = (session: string, title: string, focusedAt: number | null) => ({
    session, host: `local_${session}`, project: '/projects/demo', parent: '', title, busy: false, pct: 100, line: '',
    updated: now - 60_000, finishedAt: now - 60_000, focusedAt, segs: [{ name: 'All', fill: 1, state: 'done', weight: 10000 }],
  })
  const files: Record<string, unknown> = {
    'a.json': done('chat-2', 'Finished, not opened yet', now - 120_000),
    'b.json': done('chat-3', 'Finished and opened since', now - 30_000),
  }
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/chats') ? Object.keys(files).map(name => ({ name, kind: 'file', size: 10, mtimeMs: 1, isLink: false })) : [] }))
  on('fs.read', (_, e) => {
    const name = Object.keys(files).find(one => pathOf(e).includes(one))
    return { value: JSON.stringify(name ? files[name] : {}) }
  })
  on('fs.write', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)

  // Nothing runs in this chat, yet the button shows for the finished, unopened chat.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'toggle-side' })).toBeDefined()
  await ui.press({ key: 'toggle-side' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Finished, not opened yet')
  expect(drawn).not.toContain('Finished and opened since')
  await ui.unmount()
})

test('a redo takes the place of the job that stopped, named outright or clearly continuing it', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const now = Date.now()
  const job = (id: string, name: string, state: string, extra: Record<string, unknown> = {}) => ({
    id, name, point: null, session: 'chat-1', host_session: 'local_x', pid: null, heartbeat: false, ttl_ms: 1800000,
    script: 'progress.py', argv: '', started: now - 60_000, updated: now - 1000, ended: state === 'running' ? null : now - 2000, state, message: null,
    steps: [{ name, state, done: 1, total: 2, unit: null, weight: null, est_ms: null, started: now - 60_000, ended: null }], ...extra,
  })
  const files: Record<string, unknown> = {
    // the record of a killed job still says running; its redo names it outright
    '1.json': job('old-1', 'Render the walk', 'running'),
    '2.json': job('new-1', 'Re-render the walk', 'running', { redoes: 'Render the walk', started: now - 10_000 }),
    // a stopped job, and a later job whose name clearly continues it, in the same point
    '3.json': job('old-2', 'Cut out the 4 fills', 'failed'),
    '4.json': job('new-2', 'Cut out the 151 legs fill', 'running', { started: now - 5000 }),
  }
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/jobs') ? Object.keys(files).map(name => ({ name, kind: 'file', size: 10, mtimeMs: 1, isLink: false })) : [] }))
  on('fs.read', (_, e) => {
    const name = Object.keys(files).find(one => pathOf(e).includes(`/${one}`))
    return { value: JSON.stringify(name ? files[name] : {}) }
  })
  on('fs.write', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Cut out and render', status: 'in_progress' }, { content: 'Review', status: 'pending' }] })
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  // Its % (and, once it can tell, its time left), then the line saying what it redoes.
  expect(drawn).toMatch(/Re-render the walk: 50%( · \d+s left)?, point 1 · redo of “Render the walk”/)
  expect(drawn).toContain('Cut out the 151 legs fill: 50%, point 1 · redo of “Cut out the 4 fills”')
  expect(drawn).not.toContain('Render the walk: stopped')
  expect(drawn).not.toContain('Cut out the 4 fills: stopped')
  await ui.unmount()
})

test('the opened bar and each job bar get click areas; a hover box shows only where a name is cut', async ($, on) => {
  inProject(on)
  let next = 0
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `bg${++next}` } } : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const LONG = 'Answer the questions and explain every choice made in the images, the video and the review, one by one'
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [{ content: 'Images and video', status: 'in_progress' }, { content: 'Review', status: 'pending' }, { content: LONG, status: 'pending' }],
  })
  await $.tool.call({ tool: 'Bash', command: 'cut pieces', description: 'Cut out the pieces', run_in_background: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Opening point 1 moves its job into its close-up: the job is not repeated as a track.
  await ui.press({ key: 'open-p:0' })
  let drawn = await drawnText(ui)
  expect(await ui.find({ key: 'press-hd0' })).toBeDefined()
  expect(await ui.find({ key: 'press-hl0-0' })).toBeUndefined()
  // A hover box is plain text inside its segment's own click area (the app shows a hover only there), and only where
  // the label under the segment is cut: the long, quick last point gets one, a label that fits does not, and a
  // one-part job bar (its title and line already say it all) does not.
  expect(drawn).toContain('"3. Answer the questions and explain every choice')
  // A name that fits under its beat gets no hover box; a cut one does.
  expect(drawn).not.toContain('["1. Images and video"]')
  expect(drawn).not.toContain('"scope"')
  // Point 2 is another beat: point 1's job is back among the tracks, each track segment holding a button.
  await ui.press({ key: 'open-p:1' })
  drawn = await drawnText(ui)
  expect(drawn).toContain('Tracks')
  expect(await ui.find({ key: 'press-hl0-0' })).toBeDefined()
  expect(await ui.find({ key: 'press-hd0' })).toBeDefined()
  // Clicking the track opens its beat, which takes the job into its close-up again.
  await ui.press({ key: 'press-hl0-0' })
  expect(await ui.find({ key: 'press-hl0-0' })).toBeUndefined()
  expect(await drawnText(ui)).not.toContain('Tracks')
  await ui.unmount()
})

test('another chat waiting on the person shows "needs input" and stays; this chat reports the same', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const now = Date.now()
  const waiting = {
    session: 'chat-2', host: 'local_chat-2', project: '/projects/demo', parent: '', title: 'Asks a question', busy: true, pct: 20,
    line: 'Needs your input: Claude asked a question and is waiting for your answer', needsInput: true,
    updated: now - 90_000, finishedAt: null, focusedAt: null, segs: [{ name: 'Plan', fill: 1, state: 'done', weight: 10000 }, { name: 'Ask', fill: 0, state: 'running', weight: 20000 }],
  }
  const writes: string[] = []
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/chats') ? [{ name: 'w.json', kind: 'file', size: 10, mtimeMs: 1, isLink: false }] : [] }))
  on('fs.read', () => ({ value: JSON.stringify(waiting) }))
  on('fs.write', (_, e) => {
    writes.push(JSON.stringify(e))
    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // This chat: a list with points still open, and no turn running (Claude stopped and waits for a reply).
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Plan the beats', status: 'in_progress' }, { content: 'Build', status: 'pending' }] })
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(JSON.stringify(await ui.find({ key: 'toggle-side' }))).toContain('1 needs input')
  await ui.press({ key: 'toggle-side' })
  expect(await drawnText(ui)).toContain('Asks a question: needs input')
  await ui.unmount()
  expect(writes.some(w => w.includes('needsInput') && w.includes('true'))).toBe(true)
})

test('by default a new task list carries the parallel-planning note for Claude; added points get a short one; status updates none', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const items = [
    { content: 'Find the images', status: 'in_progress' },
    { content: 'Cut the video', status: 'pending' },
    { content: 'Review both', status: 'pending' },
  ]
  const first = await $.tool.call({ tool: PLAN, scope: 'first_task', items })
  expect(JSON.stringify(first)).toContain('this task list is new')
  // It points to the rules for handing a minor point to a cheaper model, bundled in the plugin, rather than carrying them each time.
  expect(JSON.stringify(first)).toContain('/progress/cheaper-agents.md')
  expect(JSON.stringify(first)).not.toContain('~/.claude/progress/cheaper-agents.md')
  const again = await $.tool.call({ tool: PLAN, scope: 'continuation', items: items.map((item, i) => (i === 0 ? { ...item, status: 'completed' } : item)) })
  expect(JSON.stringify(again)).not.toContain('this task list is new')
  const advanced = await $.tool.call({ tool: PLAN, advance: true })
  expect(JSON.stringify(advanced)).not.toContain('this task list is new')
  // The same list with one point added is still that list: no new-list note, but the added point gets its own check.
  const grown = await $.tool.call({ tool: PLAN, scope: 'continuation', items: [...items.map((item, i) => (i === 0 ? { ...item, status: 'completed' } : item)), { content: 'Post the result', status: 'pending' }] })
  expect(JSON.stringify(grown)).not.toContain('this task list is new')
  expect(JSON.stringify(grown)).toContain('a point was added to this task list')
  expect(JSON.stringify(grown)).toContain('Post the result')
  // Only statuses changing: no note at all.
  const ticked = await $.tool.call({ tool: PLAN, scope: 'continuation', items: [...items.map(item => ({ ...item, status: 'completed' })), { content: 'Post the result', status: 'in_progress' }] })
  expect(JSON.stringify(ticked)).not.toContain('PulseWise (the progress bar)')
  const single = await $.tool.call({ tool: PLAN, scope: 'new_task', items: [{ content: 'Answer the question', status: 'in_progress' }] })
  expect(JSON.stringify(single)).not.toContain('this task list is new')
})

test('an idle other chat never shows; a finished one seen before a restart stays gone; a new look is shared', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  const now = Date.now()
  const chat = (session: string, title: string, finishedAt: number | null) => ({
    session, host: `local_${session}`, project: '/projects/demo', parent: '', title, busy: false, pct: finishedAt ? 100 : 0, line: '',
    updated: now - 60_000, finishedAt, focusedAt: null, segs: finishedAt ? [{ name: 'All', fill: 1, state: 'done', weight: 10000 }] : [],
  })
  const files: Record<string, unknown> = {
    'a.json': chat('chat-2', 'Idle since it started', null),
    'b.json': chat('chat-3', 'Finished, seen before the restart', now - 60_000),
    'c.json': chat('chat-4', 'Finished, not seen yet', now - 60_000),
    '.seen.json': { 'chat-3': { finished: now - 60_000, at: now - 50_000 } },
  }
  const writes: string[] = []
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/chats') ? Object.keys(files).map(name => ({ name, kind: 'file', size: 10, mtimeMs: 1, isLink: false })) : [] }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1, isLink: false } }))
  on('fs.read', (_, e) => {
    const name = Object.keys(files).find(one => pathOf(e).includes(`/${one}`))
    return { value: JSON.stringify(name ? files[name] : {}) }
  })
  on('fs.write', (_, e) => {
    writes.push(JSON.stringify(e))
    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-side' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Finished, not seen yet')
  expect(drawn).not.toContain('Idle since it started')
  expect(drawn).not.toContain('Finished, seen before the restart')
  // Looking at the open panel marks the chat as seen in the shared file, so other chats and later restarts know.
  await clock.advance(1100)
  expect(writes.some(one => one.includes('.seen.json') && one.includes('chat-4'))).toBe(true)
  await ui.unmount()
})

test('a counted job shows its time left on its bar and, when all the work left can tell, beside the main %', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const now = Date.now()
  // 40 of 100 done in its first 30 s: about 45 s to go. It names the point it belongs to.
  const job = {
    id: 'j1', name: 'Rig build', point: 'Build the rig', session: 'chat-1', host_session: 'local_x', pid: 1, heartbeat: true,
    script: 'build.py', argv: 'build.py', started: now - 30_000, updated: now, ended: null, state: 'running', message: null,
    steps: [{ name: 'Cut pieces', state: 'running', done: 40, total: 100, unit: null, weight: null, est_ms: null, started: now - 30_000, ended: null }],
  }
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/jobs') ? [{ name: 'j1.json', kind: 'file', size: 10, mtimeMs: 1, isLink: false }] : [] }))
  on('fs.read', () => ({ value: JSON.stringify(job) }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // One point, whose only work is the counted job: the main bar can tell too.
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Build the rig', status: 'in_progress' }] })
  await clock.advance(1100)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  let drawn = await drawnText(ui)
  expect(drawn).toMatch(/Rig build: 40% · \d+s left/)
  expect(drawn).toMatch(/Progress \d+% · \d+s left\./)
  await ui.unmount()

  // With a point not started yet, the whole bar cannot tell: only its % shows, the job bar keeps its estimate.
  await $.tool.call({ tool: PLAN, scope: 'continuation', items: [{ content: 'Build the rig', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await clock.advance(1100)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  drawn = await drawnText(ui)
  expect(drawn).toMatch(/Progress \d+%\. /)
  expect(drawn).toMatch(/Rig build: 40% · \d+s left/)
  await ui.unmount()
})

test('points are sized by real and expected time: a reused name keeps no old times, an answer is short, a build long', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // A first list, finished; its last point ran for ten minutes.
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Find the files', status: 'in_progress' }, { content: 'Answer the questions', status: 'pending' }] })
  await clock.advance(30_000)
  await $.tool.call({ tool: PLAN, advance: true })
  await clock.advance(600_000)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' })

  // A new list reuses that last name: it starts fresh, and is expected to be short; a build is expected to be long.
  await $.tool.call({
    tool: PLAN,
    scope: 'continuation',
    items: [{ content: 'Check the notes', status: 'in_progress' }, { content: 'Build the panel', status: 'pending' }, { content: 'Answer the questions', status: 'pending' }],
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  /** The drawn width of the main bar's segment n, in % of the picture. */
  const widthOf = (n: number) => Number(drawn.match(new RegExp(`clipPath id=\\\\"m${n}\\\\"><rect x=\\\\"[\\d.]+%\\\\" y=\\\\"1\\\\" width=\\\\"([\\d.]+)%`))?.[1] ?? NaN)
  const check = widthOf(0)
  const build = widthOf(1)
  const answer = widthOf(2)
  expect(build).toBeGreaterThan(answer * 3)
  // A check is quick too: the two quick points get the same room, the build most of the bar.
  // Both quick: the same width, give or take the 4 px steps edges move in.
  expect(Math.abs(check - answer)).toBeLessThan(1)
  expect(answer).toBeLessThan(20)
  await ui.unmount()
})

test("Claude's own steps move the point they name even when the list lags, and keep its real time", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Look at how folds and undo work', status: 'in_progress' },
      { content: 'Put the footer count back after the button', status: 'pending' },
      { content: 'Collapse What fills the context on open', status: 'pending' },
    ],
  })
  await clock.advance(20_000)
  // The list still says point 1, but this step is points 2 and 3's work.
  await $.tool.call({ tool: 'Bash', command: 'python3 edit.py', description: 'Size labels, footer order, What fills shut on open' })
  await clock.advance(30_000)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  let drawn = await drawnText(ui)
  expect(drawn).toContain('Collapse What fills the context on open: Claude working')
  expect(drawn).toContain('not yet marked in progress')
  await ui.unmount()
  // The list catches up all at once at the end: the points keep the time their work really took.
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' })
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  drawn = await drawnText(ui)
  // (The test clock moves timers, not Date.now, so durations read 0s here; the app uses real time.)
  expect(drawn).toContain('3. Collapse What fills the context on open ·')
  expect(drawn).toContain('2. Put the footer count back after the button ·')
  await ui.unmount()
})

test('with side-by-side planning turned off, a new list or added points carry no note', { options: { sideBySide: false } }, async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const items = [
    { content: 'Find the images', status: 'in_progress' },
    { content: 'Cut the video', status: 'pending' },
  ]
  const first = await $.tool.call({ tool: PLAN, scope: 'first_task', items })
  expect(JSON.stringify(first)).not.toContain('PulseWise (the progress bar)')
  const grown = await $.tool.call({ tool: PLAN, scope: 'continuation', items: [...items, { content: 'Post the result', status: 'pending' }] })
  expect(JSON.stringify(grown)).not.toContain('PulseWise (the progress bar)')
})

test('Claude is told once per conversation how long jobs get a bar, whatever the setting', async ($, on) => {
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  const { blocks } = await $.prompt.context({ blocks: [] })
  const block = blocks.find(one => one.name === 'pulsewise')
  expect(block?.text).toContain('~/.claude/progress/progress.py')
  expect(block?.text).toContain('run --name')
  expect(block?.text).toContain('--redoes')
})

test('the bundled helper is put in ~/.claude/progress when the copy there is older', async ($, on) => {
  mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  const files = new Map<string, string>([['/home/me/.claude/progress/progress.py', 'HELPER_VERSION = 1\n']])
  const writes: string[] = []
  on('fs.read', (_, e) => {
    const path = pathOf(e)
    if (path.endsWith('/progress/progress.py') && !path.startsWith('/home/me/')) return { value: '#!/usr/bin/env python3\nHELPER_VERSION = 2\n' }
    if (path.endsWith('/progress/demo.py') && !path.startsWith('/home/me/')) return { value: 'demo' }
    const known = files.get(path)
    if (known === undefined) throw new Error('missing')
    return { value: known }
  })
  on('fs.exists', (_, e) => ({ value: files.has(pathOf(e)) }))
  on('fs.write', (_, e) => {
    const path = pathOf(e)
    const { text } = e as { text: string }
    writes.push(path)
    files.set(path, text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(writes).toContain('/home/me/.claude/progress/progress.py')
  expect(writes).toContain('/home/me/.claude/progress/demo.py')
  expect(files.get('/home/me/.claude/progress/progress.py')).toContain('HELPER_VERSION = 2')
})

test('an up-to-date helper in ~/.claude/progress is left alone', async ($, on) => {
  mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  const files = new Map<string, string>([['/home/me/.claude/progress/progress.py', 'HELPER_VERSION = 2\n']])
  const writes: string[] = []
  on('fs.read', (_, e) => {
    const path = pathOf(e)
    if (path.endsWith('/progress/progress.py') && !path.startsWith('/home/me/')) return { value: '#!/usr/bin/env python3\nHELPER_VERSION = 2\n' }
    if (path.endsWith('/progress/demo.py') && !path.startsWith('/home/me/')) return { value: 'demo' }
    const known = files.get(path)
    if (known === undefined) throw new Error('missing')
    return { value: known }
  })
  on('fs.exists', (_, e) => ({ value: files.has(pathOf(e)) }))
  on('fs.write', (_, e) => {
    const path = pathOf(e)
    const { text } = e as { text: string }
    writes.push(path)
    files.set(path, text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(writes.filter(path => path.includes('/.claude/progress/') && path.endsWith('.py'))).toEqual([])
})

test('a command still running after Claude finished with every point done says it was left running', async ($, on) => {
  inProject(on)
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } } : { result: {} },
  )
  on('turn.start', (_, e) => ({ turnId: (e as { turnId?: string }).turnId ?? 't' }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Collect the data', status: 'in_progress' }] })
  await $.tool.call({ tool: 'Bash', command: 'python3 receiver.py', description: 'Run the receiver', run_in_background: true })
  await $.tool.call({ tool: PLAN, scope: 'continuation', items: [{ content: 'Collect the data', status: 'completed' }] })
  const during = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(during)).not.toContain('left running')
  await during.unmount()
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  const after = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: false } as never)
  expect(await drawnText(after)).toContain('left running after Claude finished')
  await after.unmount()
})

test('Stop freezes Claude\'s own part of the pulse; its next turn moves it again', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId?: string }).turnId ?? 't' }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Build the page', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: 't1', reason: 'aborted' } as never)
  const stopped = await $.ui.mount({ ...BAND, surface: 'terminal', isWorking: false } as never)
  const first = await drawnText(stopped)
  expect(first).toContain('stopped')
  expect(first).not.toContain('Claude working')
  await new Promise(resolve => setTimeout(resolve, 1100))
  await stopped.unmount()
  const later = await $.ui.mount({ ...BAND, surface: 'terminal', isWorking: false } as never)
  // Its clock stands still: a second later it still says the time Stop was pressed at.
  expect(first).toContain('Stopped · 0s')
  expect(await drawnText(later)).toContain('Stopped · 0s')
  await later.unmount()
  await $.turn.start({ turnId: 't2' } as never)
  const resumed = await $.ui.mount({ ...BAND, surface: 'terminal', isWorking: true } as never)
  expect(await drawnText(resumed)).not.toContain('stopped')
  await resumed.unmount()
})

/** A Bash call answered as a background command, each with its own task id. */
const backgroundBash = (on: On) => {
  let n = 0
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `bg-late-${(n += 1)}` } } : { result: {} },
  )
}

/** The render list: point 2 running, point 3 named for the range the job renders. */
const RENDER_LIST = [
  { content: 'Set up the scene', status: 'completed' },
  { content: 'Test render and check', status: 'in_progress' },
  { content: 'Render A17–A30 and check', status: 'pending' },
]

/**
 * A jobs folder the bar reads: each file's content is made at each read (so a `Date.now()` in it is the moment of the
 * read), and read again only when the test bumps its mtime. What the bar writes is kept, and never changes a file.
 */
const jobFolder = (on: On) => {
  const files = new Map<string, { mtime: number; body: () => Record<string, unknown> }>()
  const writes: { path: string; text: string }[] = []
  on('fs.list', (_, e) => ({
    value: pathOf(e).includes('/jobs') ? [...files].map(([id, file]) => ({ name: `${id}.json`, kind: 'file', size: 10, mtimeMs: file.mtime, isLink: false })) : [],
  }))
  on('fs.read', (_, e) => {
    const path = pathOf(e)
    const id = [...files.keys()].find(one => path.endsWith(`/jobs/${one}.json`))
    const file = id === undefined ? undefined : files.get(id)
    if (!file) throw new Error('missing')
    return { value: JSON.stringify(file.body()) }
  })
  on('fs.write', (_, e) => {
    writes.push({ path: pathOf(e), text: String((e as { text?: unknown }).text ?? '') })
    return { value: undefined }
  })
  return { files, writes }
}

/** A helper job's file: a running ttl job with one counted step (4 of 14), with `o` over it. */
const jobBody = (o: Record<string, unknown>) => ({
  id: 'j', name: 'Job', point: null, session: 'chat-1', host_session: 'local_x', pid: null, heartbeat: false, ttl_ms: 1_800_000,
  script: 'progress.py', argv: '', started: Date.now(), updated: Date.now(), ended: null, state: 'running', message: null,
  steps: [{ name: 'Frames', state: o.state ?? 'running', done: 4, total: 14, unit: null, weight: null, est_ms: null, started: o.started ?? Date.now(), ended: null }],
  ...o,
})

const ran = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

/**
 * A helper job's file, which the bar can read once `job.written` is set: started at `started()` (the test clock moves
 * timers, not Date.now, so each test gives its job the start it needs), running until `job.ended` is set (its file
 * changes then), and always fresh, as a running job's file is. `flashes()` gives the scripts the bar ran in PowerShell,
 * decoded.
 */
const helperJob = (on: On, o: { id: string; name: string; started: () => number; env?: Record<string, string> }) => {
  const runs: string[][] = []
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x', ...o.env })
  on('process.run', (_, e) => {
    runs.push((e as { argv: string[] }).argv)
    return ran()
  })
  const { files } = jobFolder(on)
  const job = {
    ended: false,
    get written() {
      return files.has(o.id)
    },
    set written(isWritten: boolean) {
      if (isWritten) files.set(o.id, file)
      else files.delete(o.id)
    },
  }
  const file = {
    get mtime() {
      return job.ended ? 2 : 1
    },
    body: () => {
      const at = o.started()
      const state = job.ended ? 'done' : 'running'
      return jobBody({
        id: o.id, name: o.name, pid: 1, heartbeat: true, ttl_ms: null, script: 'render.py', argv: 'render.py', started: at, state, ended: job.ended ? Date.now() : null,
        steps: [{ name: 'Frames', state, done: job.ended ? 14 : 4, total: 14, unit: null, weight: null, est_ms: null, started: at, ended: null }],
      })
    },
  }
  const flashes = () =>
    runs
      .filter(argv => argv[0] === 'powershell.exe')
      .map(argv => [...atob(argv[argv.indexOf('-EncodedCommand') + 1] ?? '')].filter((_, i) => i % 2 === 0).join(''))
  return { job, flashes }
}

/** The render job the late-tick tests file: "Render A17–A30". */
const renderJob = (on: On, id: string, started: () => number) => helperJob(on, { id, name: 'Render A17–A30', started }).job

/** A real moment between a job's start and the tick: the tick comes after the start, as it does in the app. */
const aMomentLater = () => {
  const until = Date.now() + 3
  while (Date.now() < until);
}

test('a job started a second before the list ticks over to its point moves there, and the point before reads done', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  let at = 0
  const job = renderJob(on, 'j-late', () => at)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: RENDER_LIST })
  // Point 3's job starts while point 2 is still the running one, and the bar files it there…
  at = Date.now()
  job.written = true
  await clock.advance(1100)
  // …then the list ticks over to point 3 a moment later.
  aMomentLater()
  await $.tool.call({ tool: PLAN, advance: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Test render and check: done')
  expect(drawn).toContain('Render A17–A30 and check: Render A17–A30 · 4 / 14')
  await ui.press({ key: 'open-p:1' })
  // Point 2 is full, not held near 95 % by a job that isn't its own.
  expect(await drawnText(ui)).toContain('Test render and check 100%')
  await ui.unmount()
})

test('a job started well before the list ticks over stays under the point it started in', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const job = renderJob(on, 'j-early', () => Date.now() - 30_000)
  job.written = true
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: RENDER_LIST })
  await clock.advance(1100)
  // The list ticks over 30 s after the job started: it is point 2's own job, still running.
  await $.tool.call({ tool: PLAN, advance: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Test render and check: Render A17–A30 · 4 / 14')
  expect(drawn).not.toContain('Render A17–A30 and check: Render A17–A30')
  await ui.unmount()
})

test('a helper job the bar first reads after the late tick joins the point it was started for', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  let at = 0
  const job = renderJob(on, 'j-unseen', () => at)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: RENDER_LIST })
  at = Date.now()
  aMomentLater()
  await $.tool.call({ tool: PLAN, advance: true })
  // Only now does the bar read the job's file: it started while point 2 still ran, a moment before the tick.
  job.written = true
  await clock.advance(1100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Test render and check: done')
  expect(drawn).toContain('Render A17–A30 and check: Render A17–A30 · 4 / 14')
  await ui.unmount()
})

test('a background command started just before the tick moves too, when its name fits the new point as well', async ($, on) => {
  inProject(on)
  backgroundBash(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Set up the scene', status: 'completed' },
      { content: 'Test render and check', status: 'in_progress' },
      { content: 'Render the rest and check', status: 'pending' },
    ],
  })
  // "Render A17–A30" fits both points by one word, so at its start it goes to the running point 2…
  await $.tool.call({ tool: 'Bash', command: 'python3 render.py --from A17 --to A30', description: 'Render A17–A30', run_in_background: true })
  // …and the list ticks over to point 3 a moment later.
  await $.tool.call({ tool: PLAN, advance: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Test render and check: done')
  expect(drawn).toContain('Render the rest and check: Render A17–A30 · running')
  await ui.unmount()
})

test('a job joins a point by a range or code written with any dash, and one shared word only joins a running point', async ($, on) => {
  inProject(on)
  backgroundBash(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Started before any list, so they run as other work until a list names them.
  await $.tool.call({ tool: 'Bash', command: 'python3 render.py', description: 'Render A17–A30', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'python3 export.py', description: 'Export r18', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'python3 bg.py', description: 'Render the backgrounds', run_in_background: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Render and grade the sky', status: 'in_progress' },
      { content: 'Test render A17-A30', status: 'pending' },
      { content: 'Check frames r18', status: 'pending' },
      { content: 'Render the intro', status: 'pending' },
    ],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  // The en dash in the job and the hyphen in the point name are the same range.
  expect(drawn).toContain('Test render A17-A30: Render A17–A30 · running')
  // One shared code is enough.
  expect(drawn).toContain('Check frames r18: Export r18 · running')
  // "render" alone joins the running point, not the first waiting point with "render" in its name.
  expect(drawn).toContain('Render and grade the sky: Render the backgrounds · running')
  expect(drawn).toContain('Render the intro: not started')
  await ui.unmount()
})

/** A helper job "Render the intro", already listed, that started `ranMs` ago, on a host with `env`. */
const finishingJob = (on: On, env: Record<string, string>, ranMs: number) => {
  const began = Date.now() - ranMs
  const made = helperJob(on, { id: 'j-intro', name: 'Render the intro', started: () => began, env })
  made.job.written = true
  return made
}

test("a long job finishing on Windows flashes the Claude app's taskbar button, unless the app is in front", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const { job, flashes } = finishingJob(on, { APPDATA: 'C:/Users/me/AppData/Roaming' }, 60_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await clock.advance(1100)
  expect(flashes()).toEqual([])
  job.ended = true
  await clock.advance(1100)
  const sent = flashes()
  expect(sent.length).toBe(1)
  // The script skips the flash while the app is in front, and flashes only the taskbar button until it comes forward.
  expect(sent[0]).toContain('GetForegroundWindow')
  expect(sent[0]).toContain('if ($apps.Id -contains $owner) { exit 0 }')
  expect(sent[0]).toContain('$f.dwFlags = 14')
  // Only the desktop app's own (Electron) windows: never a console window of the claude command line.
  expect(sent[0]).toContain('"Chrome_WidgetWin_1"')
})

test('off Windows, or for a short job, nothing flashes', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  // A Mac or Linux host: no APPDATA.
  const { job, flashes } = finishingJob(on, {}, 60_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }] })
  await clock.advance(1100)
  job.ended = true
  await clock.advance(1100)
  expect(flashes()).toEqual([])
})

test('on Windows a job that took only seconds ends without a flash', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const { job, flashes } = finishingJob(on, { APPDATA: 'C:/Users/me/AppData/Roaming' }, 5_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }] })
  await clock.advance(1100)
  job.ended = true
  await clock.advance(1100)
  expect(flashes()).toEqual([])
})

// ---- the state machines: one writer, task and agent lives, the chat's phase, ends told once ------------------------

/** A real pause, for what is timed by the real clock (a ttl, a turn's frozen time): the test clock moves timers only. */
const realWait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const notification = (id: string, status = 'completed') => ({
  message: { type: 'user', content: [{ type: 'text', text: `<task-notification><task-id>${id}</task-id><status>${status}</status></task-notification>` }] },
})

test("a task's end that lands while the poll waits on a file is kept, not written over by the poll", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  backgroundBash(on)
  let isSlow = false
  let mtime = 1
  const job = jobBody({ id: 'j-stills', name: 'Export the stills' })
  on('fs.list', (_, e) => ({ value: pathOf(e).includes('/jobs') ? [{ name: 'j-stills.json', kind: 'file', size: 10, mtimeMs: mtime, isLink: false }] : [] }))
  on('fs.read', async (_, e) => {
    if (isSlow && pathOf(e).includes('/jobs/')) await clock.sleep(500)
    return { value: JSON.stringify(job) }
  })
  on('fs.write', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the cut', status: 'in_progress' }, { content: 'Export the stills', status: 'pending' }] })
  await $.tool.call({ tool: 'Bash', command: 'python3 render.py', description: 'Render the cut', run_in_background: true })
  await clock.advance(1100)
  // The job's file changes, and this time it takes a while to read: the poll waits on it…
  isSlow = true
  mtime = 2
  await clock.advance(1000)
  // …when the background command's end arrives, and is written first.
  await $.session.append(notification('bg-late-1') as never)
  await clock.advance(600)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Render the cut · ')
  expect(drawn).toContain('Render the cut: done')
  await ui.unmount()
})

test('a job past its ttl goes silent, not failed; it runs again when it reports, and its real end is logged and told once', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const { files } = jobFolder(on)
  const began = Date.now() - 60_000
  let state = 'running'
  files.set('j-batch', { mtime: 1, body: () => jobBody({ id: 'j-batch', name: 'Batch the frames', ttl_ms: 200, started: began, state, ended: state === 'done' ? Date.now() : null }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Batch the frames', status: 'in_progress' }, { content: 'Check them', status: 'pending' }] })
  await clock.advance(1100)
  // Past its ttl with no report.
  await realWait(300)
  await clock.advance(6000)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  let drawn = await drawnText(ui)
  expect(drawn).toContain('Batch the frames: no report')
  expect(drawn).not.toContain('stopped reporting')
  expect(toasts).toEqual([])
  await ui.unmount()
  // It reports again: it runs.
  const file = files.get('j-batch')
  if (file) file.mtime = 2
  await clock.advance(1000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('Batch the frames: 29%')
  await ui.unmount()
  // Its file says done: its real end, in "Done so far" and in one toast.
  state = 'done'
  if (file) file.mtime = 3
  await clock.advance(1000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  drawn = await drawnText(ui)
  expect(drawn).toContain('Batch the frames · 1m')
  expect(drawn).not.toContain('stopped reporting')
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('Finished: Batch the frames')
  await ui.unmount()
})

/**
 * A Windows host whose job "Intro frames" (pid 4242) last wrote its heartbeat a minute ago (a laptop waking from sleep,
 * say), and whose process list, looked up with tasklist (there is no ps), lists it, does not list it, or cannot be read.
 */
const windowsJob = async ($: Parameters<Parameters<typeof test>[1]>[0], on: On, tasklist: 'alive' | 'gone' | 'broken') => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x', APPDATA: 'C:/Users/me/AppData/Roaming' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const { files, writes } = jobFolder(on)
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'ps') throw new Error('no ps here')
    if (argv[0] !== 'tasklist') return ran()
    if (tasklist === 'broken') throw new Error('tasklist did not run')
    const rows = ['"System","4","Services","0","4,316 K"', '"tasklist.exe","9000","Console","1","8,000 K"']
    if (tasklist === 'alive') rows.push('"python.exe","4242","Console","1","52,000 K"')
    return ran(rows.join('\r\n'))
  })
  const heard = Date.now() - 60_000
  files.set('j-win', { mtime: 1, body: () => jobBody({ id: 'j-win', name: 'Intro frames', pid: 4242, heartbeat: true, ttl_ms: null, script: 'render.py', started: heard - 60_000, updated: heard }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await clock.advance(1100)
  return { clock, writes }
}

test('on Windows a job unheard for a while whose process tasklist lists runs on', async ($, on) => {
  await windowsJob($, on, 'alive')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Intro frames: 29%')
  expect(drawn).not.toContain('stopped')
  await ui.unmount()
})

test('a job unheard for a while goes silent, not failed, when the process list cannot be read', async ($, on) => {
  await windowsJob($, on, 'broken')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Intro frames: no report')
  expect(drawn).not.toContain('stopped')
  await ui.unmount()
})

test('on Windows a job whose process is gone fails once, and its end is written to its file', async ($, on) => {
  const { clock, writes } = await windowsJob($, on, 'gone')
  await clock.advance(10_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('"label":"▸ Done · 1"')
  await ui.press({ key: 'toggle-done' })
  expect(await drawnText(ui)).toContain('Intro frames · stopped (the script ended without finishing)')
  await ui.unmount()
  expect(writes.some(w => w.path.endsWith('/jobs/j-win.json') && w.text.includes('"state":"failed"'))).toBe(true)
})

/** A background command run through the helper (`progress.py run … -- python3 render.py`) and the helper's job for it. */
const coveredRender = async ($: Parameters<Parameters<typeof test>[1]>[0], on: On) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  backgroundBash(on)
  const { files } = jobFolder(on)
  const job = { state: 'running' }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'python3 ~/.claude/progress/progress.py run --name "Render frames" -- python3 render.py', description: 'Render frames', run_in_background: true })
  const began = Date.now()
  files.set('j-run', {
    mtime: 1,
    body: () => jobBody({ id: 'j-run', name: 'Render frames', pid: 77, heartbeat: true, ttl_ms: null, script: 'render.py', started: began, state: job.state, ended: job.state === 'running' ? null : Date.now() }),
  })
  await clock.advance(1100)
  return { clock, files, job }
}

test('a command its helper job reports is not counted itself: the bar finishes with the job', async ($, on) => {
  const { clock, files, job } = await coveredRender($, on)
  job.state = 'done'
  const file = files.get('j-run')
  if (file) file.mtime = 2
  await clock.advance(1000)
  // The command's own end has not come yet (it comes a moment after its job's).
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', isWorking: false } as never)
  expect(await drawnText(ui)).toContain('Done ·')
  await ui.unmount()
})

test('stopping a command its helper job reports stops the job too', async ($, on) => {
  await coveredRender($, on)
  await $.tool.call({ tool: 'TaskStop', task_id: 'bg-late-1' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  expect(await drawnText(ui)).toContain('Render frames · stopped')
  await ui.unmount()
})

test("an agent is not taken for ended when its status can't be read or reads idle; its real end is logged once", async ($, on) => {
  mock.clock(on, { now: Date.now() })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  // null: the app's list does not answer.
  let status: 'idle' | 'completed' | null = null
  on('agent.list', () => (status === null ? { deny: 'not now' } : { value: [{ id: 'agent-1', description: 'Check the pack', type: 'general-purpose', status }] }))
  on('turn.complete', () => ({ text: '' }))
  const agentTurnEnds = () => $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 'ta', agentId: 'agent-1', reason: 'answer' } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Check the pack', status: 'in_progress' }, { content: 'Report', status: 'pending' }] })
  await $.agent.spawn({ prompt: 'check it', description: 'Check the pack', subagentType: 'general-purpose' })
  await agentTurnEnds()
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  expect(await drawnText(ui)).not.toContain('Check the pack: done')
  await ui.unmount()
  // Idle: between turns, not ended.
  status = 'idle'
  await agentTurnEnds()
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  expect(await drawnText(ui)).toContain('Check the pack: between turns')
  await ui.unmount()
  // It acts again, then the app says it completed: one line in "Done so far".
  await $.tool.call({ tool: 'Read', file_path: '/notes.md', agentId: 'agent-1' } as never)
  status = 'completed'
  await agentTurnEnds()
  await agentTurnEnds()
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('"label":"▸ Done · 1"')
  expect(await drawnText(ui)).toContain('Check the pack: done')
  await ui.unmount()
})

test("an agent's own step-by-step job is not ended with it, and shows again when the agent comes back", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  let status: 'running' | 'completed' = 'running'
  on('agent.list', () => ({ value: [{ id: 'agent-1', description: 'Animation notes on the walk', type: 'general-purpose', status }] }))
  on('turn.complete', () => ({ text: '' }))
  agentNotesJob(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Animation notes on the walk (parallel agent)', status: 'in_progress' }, { content: 'Cut-out notes', status: 'in_progress' }] })
  await $.agent.spawn({ prompt: 'do the notes', description: 'Animation notes on the walk', subagentType: 'general-purpose' })
  await clock.advance(1100)
  // The app says it completed; then it acts again (a message woke it): its job is back on its bar, where it was.
  status = 'completed'
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 'ta', agentId: 'agent-1', reason: 'answer' } as never)
  status = 'running'
  await $.tool.call({ tool: 'Read', file_path: '/notes.md', agentId: 'agent-1' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('Fix arms · 2 / 5')
  await ui.unmount()
})

test('a turn that ends with points still open reads as waiting for your reply, its time standing still', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId?: string }).turnId ?? 't' }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Build the page', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await $.turn.complete({ answer: 'Which colour?', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await realWait(1100)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop', isWorking: false } as never)
  await ui.press({ key: 'open-p:0' })
  let drawn = await drawnText(ui)
  expect(drawn).toContain('"alt":"1. Build the page: waiting for your reply · 0s')
  expect(drawn).not.toContain('Claude working')
  await ui.unmount()
  // The person answers: Claude's turn runs, and its part moves again (the beat is still open).
  await $.turn.start({ turnId: 't2' } as never)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  drawn = await drawnText(ui)
  expect(drawn).toContain('"alt":"1. Build the page: Claude working')
  await ui.unmount()
})

test("the chat's phase is kept in the model the host holds, so a hot reload of the code mid-turn keeps it", async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId?: string }).turnId ?? 't' }) as never)
  on('turn.complete', () => ({ text: '' }))
  // What the plugin writes to the host's state (which a reload of its code keeps), the newest last.
  const kept: { phase?: string }[] = []
  on('state.set', (_, e, next) => {
    const write = e as { key?: string; value?: { phase?: string } }
    if (write.key === 'model' && write.value) kept.push(write.value)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  expect(kept.at(-1)?.phase).toBe('working')
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Build the page', status: 'in_progress' }] })
  await $.turn.complete({ answer: 'Which colour?', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(kept.at(-1)?.phase).toBe('awaitingReply')
})

test('one shared word in a step does not start a waiting point; two words do', async ($, on) => {
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    scope: 'first_task',
    items: [
      { content: 'Look at the layout', status: 'in_progress' },
      { content: 'Put the footer count back', status: 'pending' },
      { content: 'Collapse what fills the panel', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: 'Bash', command: 'grep -n footer app.tsx', description: 'Check footer' })
  await $.tool.call({ tool: 'Bash', command: 'python3 edit.py', description: 'Collapse the fills' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await drawnText(ui)
  expect(drawn).toContain('Put the footer count back: not started')
  expect(drawn).toContain('Collapse what fills the panel: Claude working')
  await ui.unmount()
})

test('an end worked out twice (its first write beaten by another) is told once', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const { files } = jobFolder(on)
  files.set('j-long', { mtime: 1, body: () => jobBody({ id: 'j-long', name: 'Export the stills', started: Date.now() - 60_000 }) })
  // The first write that ends the job is beaten (another write got in first): the end is worked out again.
  let isArmed = false
  on('state.set', (_, e, next) => {
    const write = e as { key?: string; value?: { tasks?: { id: string; state: string }[] } }
    if (isArmed && write.key === 'model' && write.value?.tasks?.some(t => t.id === 'j-long' && t.state === 'failed')) {
      isArmed = false
      return { value: { isSet: false, version: 0 } } as never
    }
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)
  isArmed = true
  await $.tool.call({ tool: 'TaskStop', task_id: 'j-long' } as never)
  expect(isArmed).toBe(false)
  expect(toasts.filter(text => text.includes('Stopped: Export the stills')).length).toBe(1)
})

test('on Windows a long stretch that ends with a short job flashes too: the poll ends work by the same rule', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x', APPDATA: 'C:/Users/me/AppData/Roaming' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const runs: string[][] = []
  on('process.run', (_, e) => {
    runs.push((e as { argv: string[] }).argv)
    return ran()
  })
  const { files } = jobFolder(on)
  const now = Date.now()
  let isDone = false
  // A render that stopped a minute ago, and its redo, started 5 s ago: the stretch is long, the last job short.
  files.set('old-walk', { mtime: 1, body: () => jobBody({ id: 'old-walk', name: 'Render the walk', started: now - 60_000, updated: now - 1000 }) })
  files.set('new-walk', {
    mtime: 1,
    body: () => jobBody({ id: 'new-walk', name: 'Re-render the walk', redoes: 'Render the walk', started: now - 5000, state: isDone ? 'done' : 'running', ended: isDone ? Date.now() : null }),
  })
  const flashes = () => runs.filter(argv => argv[0] === 'powershell.exe')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1100)
  expect(flashes()).toEqual([])
  isDone = true
  const file = files.get('new-walk')
  if (file) file.mtime = 2
  await clock.advance(1000)
  expect(flashes().length).toBe(1)
})

test("a job run by bash is not taken for an agent's own just because the agent's commands use bash too", async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'test' }))
  on('agent.list', () => ({ value: [{ id: 'agent-1', description: 'Fix the notes', type: 'general-purpose', status: 'running' as const }] }))
  const { files } = jobFolder(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'fix them', description: 'Fix the notes', subagentType: 'general-purpose' })
  await $.tool.call({ tool: 'Bash', command: 'bash check.sh', description: 'Check the notes', agentId: 'agent-1' } as never)
  // Another chat's agent, or Claude itself, runs a script through bash: the helper names its script "bash".
  files.set('j-other', { mtime: 1, body: () => jobBody({ id: 'j-other', name: 'Render the stills', pid: 99, heartbeat: true, ttl_ms: null, script: 'bash', argv: 'bash render.sh' }) })
  await clock.advance(1100)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Its own track, not the agent's bar.
  expect(await drawnText(ui)).toContain('Render the stills: 29%')
  await ui.unmount()
})

test('a job the bar took for gone runs again when its own file reports after that, and its ✗ line goes', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const { files } = jobFolder(on)
  on('process.run', (_, e) => ((e as { argv: string[] }).argv[0] === 'ps' ? ran('', 1) : ran()))
  let heard = Date.now() - 60_000
  files.set('j-back', { mtime: 1, body: () => jobBody({ id: 'j-back', name: 'Intro frames', pid: 4242, heartbeat: true, ttl_ms: null, script: 'render.py', started: Date.now() - 120_000, updated: heard }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await clock.advance(1100)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('Intro frames: stopped')
  await ui.unmount()
  // Its heartbeat comes in after all (ps missed it): it runs again.
  heard = Date.now()
  const file = files.get('j-back')
  if (file) file.mtime = 2
  await clock.advance(1000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).toContain('Intro frames: 29%')
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  await ui.unmount()
})

test('a job the bar ended does not come back when its file is read again after the bar let it go; its end is written to the file', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const { files, writes } = jobFolder(on)
  // ps finds none of them (it answers 1).
  on('process.run', (_, e) => ((e as { argv: string[] }).argv[0] === 'ps' ? ran('', 1) : ran()))
  const heard = Date.now() - 60_000
  files.set('j-dead', { mtime: 1, body: () => jobBody({ id: 'j-dead', name: 'Intro frames', pid: 4242, heartbeat: true, ttl_ms: null, script: 'render.py', started: heard - 60_000, updated: heard }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await clock.advance(1100)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  expect(await drawnText(ui)).toContain('Intro frames · stopped (the script ended without finishing)')
  await ui.unmount()
  // A new list lets the ended job go; its file is read again (as after a reload), still saying running.
  await $.tool.call({ tool: PLAN, scope: 'new_task', items: [{ content: 'Write the notes', status: 'in_progress' }, { content: 'Send them', status: 'pending' }] })
  const file = files.get('j-dead')
  if (file) file.mtime = 2
  await clock.advance(6000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await drawnText(ui)).not.toContain('Intro frames')
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  await ui.unmount()
  // And its file was told it ended, so not even a restart that forgets the model brings it back.
  expect(writes.some(w => w.path.endsWith('/jobs/j-dead.json') && w.text.includes('"state":"failed"'))).toBe(true)
})

test('a job file left saying running long ago (its script gone in a crash or a power cut) is history at first sight', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_HOST_SESSION_ID: 'local_x' })
  inProject(on)
  on('tool.call', () => ({ result: {} }))
  const { files } = jobFolder(on)
  on('process.run', (_, e) => ((e as { argv: string[] }).argv[0] === 'ps' ? ran('', 1) : ran()))
  const heard = Date.now() - 20 * 60_000
  files.set('j-old', { mtime: 1, body: () => jobBody({ id: 'j-old', name: 'Intro frames', pid: 4242, heartbeat: true, ttl_ms: null, script: 'render.py', started: heard - 60_000, updated: heard }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, scope: 'first_task', items: [{ content: 'Render the intro', status: 'in_progress' }, { content: 'Check it', status: 'pending' }] })
  await clock.advance(1100)
  await clock.advance(6000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  expect(await drawnText(ui)).not.toContain('Intro frames')
  await ui.unmount()
})
