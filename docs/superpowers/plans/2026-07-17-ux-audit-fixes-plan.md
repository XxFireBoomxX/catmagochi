# UX Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 7 in-scope findings from `docs/superpowers/specs/2026-07-17-ux-audit-fixes-design.md` (decay pacing, nudge send-feedback + offline retry, PLAY discoverability, a notification onboarding prompt, a stale `CLAUDE.md` section, and `StartScreen` skip-after-first-open).

**Architecture:** Eight independent, separately-testable changes across `usePet.ts`, `server/server.js`, `useMessages.ts`, and `App.tsx`/its supporting components. Tasks 2-4 share one thread (server accepts a client id → the client outbox uses it → `App.tsx` surfaces the result), everything else is fully standalone.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library (client), plain Node `http`/`ws` + `node --test` (server) — all existing, no new dependencies.

## Global Constraints

- No new npm dependencies, client or server.
- Every new `localStorage` key follows the existing `catmagochi-<thing>-v1` naming convention.
- Match existing code style exactly: no semicolons, single quotes, 2-space indent (see any existing file).
- `src/test/setup.ts` clears `localStorage` after every test — do not assume any key is set unless a test sets it itself.
- Run `npm test` (client) and, for Task 2, `cd server && npm test` after every task; both must be green before moving to the next task.

---

### Task 1: Slow stat decay rates

**Files:**
- Modify: `src/hooks/usePet.ts:11-12`
- Modify: `src/hooks/usePet.test.ts:158-176` (recalculate one existing test's expected values)
- Modify: `src/hooks/usePet.test.ts` (add one new test after the "sleep regen" test, currently ending at line 194)

**Interfaces:** None — this is a constants-only change, no new exports or signatures.

- [ ] **Step 1: Update the failing test's expected values first**

Open `src/hooks/usePet.test.ts` and replace the body of the `'catches up stats for elapsed time since lastUpdate on load, awake decay'` test (lines 158-176) with:

```typescript
  it('catches up stats for elapsed time since lastUpdate on load, awake decay', () => {
    const tenMinutesAgo = Date.now() - 10 * 60_000
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Catchup',
        stats: baseStats,
        sleeping: false,
        lastUpdate: tenMinutesAgo,
        growth: 0,
      }),
    )
    const { result } = renderHook(() => usePet())
    // AWAKE_DECAY.fullness = -0.3/min * 10min = -3
    expect(result.current.save?.stats.fullness).toBe(77)
    expect(result.current.save?.stats.happiness).toBe(78)
    expect(result.current.save?.stats.energy).toBe(78.5)
    expect(result.current.save?.stats.cleanliness).toBe(78.5)
  })
```

- [ ] **Step 2: Run the test to verify it fails against the current rates**

Run: `npm test -- usePet.test.ts`
Expected: FAIL — the "awake decay" test expects `77`/`78`/`78.5`/`78.5` but the current `AWAKE_DECAY` constants produce `60`/`65`/`70`/`70`.

- [ ] **Step 3: Add a new test for the sleep-protective scenario**

Immediately after the `'catches up stats for elapsed time since lastUpdate on load, sleep regen'` test (which ends at line 194), insert:

```typescript
  it('an overnight sleep no longer bottoms out fullness/cleanliness', () => {
    const eightHoursAgo = Date.now() - 8 * 60 * 60_000
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Overnight',
        stats: { fullness: 100, happiness: 80, energy: 80, cleanliness: 80 },
        sleeping: true,
        lastUpdate: eightHoursAgo,
        growth: 0,
      }),
    )
    const { result } = renderHook(() => usePet())
    // SLEEP_RATE.fullness = -0.1/min * 480min = -48 -> 100-48 = 52
    expect(result.current.save?.stats.fullness).toBe(52)
    // SLEEP_RATE.cleanliness = -0.05/min * 480min = -24 -> 80-24 = 56
    expect(result.current.save?.stats.cleanliness).toBe(56)
  })
```

- [ ] **Step 4: Implement the new rate constants**

In `src/hooks/usePet.ts`, replace lines 11-12:

```typescript
const AWAKE_DECAY = { fullness: -2, happiness: -1.5, energy: -1, cleanliness: -1 }
const SLEEP_RATE = { fullness: -0.5, happiness: 0, energy: 4, cleanliness: -0.3 }
```

with:

```typescript
const AWAKE_DECAY = { fullness: -0.3, happiness: -0.2, energy: -0.15, cleanliness: -0.15 }
const SLEEP_RATE = { fullness: -0.1, happiness: 0, energy: 4, cleanliness: -0.05 }
```

- [ ] **Step 5: Run the full usePet test suite to verify everything passes**

Run: `npm test -- usePet.test.ts`
Expected: PASS, all tests including the updated "awake decay" test and the new "overnight sleep" test. The `'sleep regen'` (line 178) and `'caps catch-up at 12 simulated hours'` (line 196) tests need no changes and should already pass unmodified — confirm they do (both were verified by hand: sleep regen only checks `energy`/`happiness`, neither of which changed; the 12-hour cap is 720 minutes, and even at the new slower `-0.3`/min fullness rate that's still a 216-point drop from 80, so it still clamps to 0).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePet.ts src/hooks/usePet.test.ts
git commit -m "Slow stat decay to match a realistic check-in cadence"
```

---

### Task 2: Let `POST /send` accept a client-generated id

**Files:**
- Modify: `server/server.js:139,151-156`
- Modify: `server/server.test.js` (add a new test after the existing `'POST /send with a valid token queues and persists the message'` test, currently ending at line 111)

**Interfaces:**
- Produces: `POST /send` now accepts an optional string `id` field in its JSON body. When present and non-empty, the persisted/broadcast message uses that id instead of a server-generated one. Task 3 consumes this.

- [ ] **Step 1: Write the failing test**

In `server/server.test.js`, immediately after the `'POST /send with a valid token queues and persists the message'` test (ending at line 111, right before the `'POST /send trims text to the 500 character max'` test), insert:

```javascript
  test('POST /send honors a client-supplied id instead of generating one', async () => {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: 'client id test', id: 'client-generated-123' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.id, 'client-generated-123')

    const persisted = JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf-8'))
    assert.ok(persisted.some((m) => m.id === 'client-generated-123' && m.text === 'client id test'))

    await ackMessage('client-generated-123')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — `body.id` will be a server-generated UUID, not `'client-generated-123'`.

- [ ] **Step 3: Implement the server change**

In `server/server.js`, line 139, change:

```javascript
        const { token, text, kind } = JSON.parse(body)
```

to:

```javascript
        const { token, text, kind, id } = JSON.parse(body)
```

Then, lines 151-156, change:

```javascript
        const message = {
          id: randomUUID(),
          text: trimmed,
          sentAt: Date.now(),
          kind: MESSAGE_KINDS.has(kind) ? kind : undefined,
        }
```

to:

```javascript
        const message = {
          id: typeof id === 'string' && id ? id : randomUUID(),
          text: trimmed,
          sentAt: Date.now(),
          kind: MESSAGE_KINDS.has(kind) ? kind : undefined,
        }
```

- [ ] **Step 4: Run the full server test suite to verify everything passes**

Run: `cd server && npm test`
Expected: PASS, all tests including the new one. The existing tests that don't send an `id` (e.g. `'POST /send with a valid token queues and persists the message'`) must still pass unmodified — they'll fall through to `randomUUID()` exactly as before, since `id` is `undefined` in their request bodies.

- [ ] **Step 5: Commit**

```bash
git add server/server.js server/server.test.js
git commit -m "Let POST /send accept a client-generated id, matching /care-event"
```

---

### Task 3: Give `useMessages.send()` an outbox and a real return value

**Files:**
- Modify: `src/hooks/useMessages.ts` (whole-file rewrite of the `send` piece — see below)
- Modify: `src/hooks/useMessages.test.ts:247-296` (replace the entire `describe('send', ...)` block)

**Interfaces:**
- Consumes: nothing from earlier tasks directly (this task's own tests use a mocked `fetch`, not a real server) — but its behavior is designed around Task 2's server contract (a client-supplied `id` is honored).
- Produces: `send(text: string, kind?: RelayMessage['kind']): Promise<'sent' | 'queued' | 'unconfigured'>`. Task 4 consumes this exact signature and return type.

- [ ] **Step 1: Write the failing tests — replace the existing `send` describe block**

In `src/hooks/useMessages.test.ts`, delete the entire `describe('send', ...)` block (lines 247-295, everything between `describe('send', () => {` and its matching closing `})` right before the outer `describe('useMessages', ...)`'s final `})`), and replace it with:

```typescript
  describe('send', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
    })

    it('resolves to "unconfigured" and does not queue anything when relay env vars are unset', async () => {
      const useMessages = await loadUseMessages('', '')
      const { result } = renderHook(() => useMessages())
      let status: string | undefined
      await act(async () => {
        status = await result.current.send('hello')
      })
      expect(status).toBe('unconfigured')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(localStorage.getItem('catmagochi-message-outbox-v1')).toBeNull()
    })

    it('resolves to "sent" and posts text/kind/a generated id on success', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const useMessages = await loadUseMessages('wss://relay.test', 'tok')
      const { result } = renderHook(() => useMessages())
      let status: string | undefined
      await act(async () => {
        status = await result.current.send('Thinking of you', 'nudge')
      })
      expect(status).toBe('sent')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toBe('https://relay.test/send')
      expect(options.method).toBe('POST')
      const sentBody = JSON.parse(options.body)
      expect(sentBody.token).toBe('tok')
      expect(sentBody.text).toBe('Thinking of you')
      expect(sentBody.kind).toBe('nudge')
      expect(typeof sentBody.id).toBe('string')
      expect(sentBody.id.length).toBeGreaterThan(0)
      expect(JSON.parse(localStorage.getItem('catmagochi-message-outbox-v1') ?? '[]')).toEqual([])
    })

    it('resolves to "queued" and keeps the entry in the outbox when the send fails', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))
      const useMessages = await loadUseMessages('wss://relay.test', 'tok')
      const { result } = renderHook(() => useMessages())
      let status: string | undefined
      await act(async () => {
        status = await result.current.send('hello')
      })
      expect(status).toBe('queued')
      const outbox = JSON.parse(localStorage.getItem('catmagochi-message-outbox-v1') ?? '[]')
      expect(outbox).toHaveLength(1)
      expect(outbox[0].text).toBe('hello')
    })

    it('retries a queued message when the socket reconnects, and it eventually sends', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true })
      const useMessages = await loadUseMessages('wss://relay.test', 'tok')
      const { result } = renderHook(() => useMessages())
      await act(async () => {
        await result.current.send('hello')
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await act(async () => {
        MockWebSocket.instances[0].onopen?.()
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
      await waitFor(() => {
        expect(JSON.parse(localStorage.getItem('catmagochi-message-outbox-v1') ?? '[]')).toEqual([])
      })
    })

    it('loads a previously-persisted outbox and flushes it once the socket opens', async () => {
      localStorage.setItem(
        'catmagochi-message-outbox-v1',
        JSON.stringify([{ id: 'stale-1', text: 'left over', kind: undefined }]),
      )
      fetchMock.mockResolvedValue({ ok: true })
      const useMessages = await loadUseMessages('wss://relay.test', 'tok')
      renderHook(() => useMessages())
      act(() => {
        MockWebSocket.instances[0].onopen?.()
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'https://relay.test/send',
          expect.objectContaining({
            body: JSON.stringify({ token: 'tok', id: 'stale-1', text: 'left over', kind: undefined }),
          }),
        )
      })
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- useMessages.test.ts`
Expected: FAIL — `send()` currently returns `undefined` (not a promise resolving to a status string), doesn't include an `id` in the POST body, and has no outbox at all.

- [ ] **Step 3: Implement the outbox and async `send()`**

Replace the entire contents of `src/hooks/useMessages.ts` with:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RelayMessage } from '../types'

const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL
const RELAY_TOKEN: string | undefined = import.meta.env.VITE_RELAY_TOKEN

// Same ws(s):// -> http(s):// derivation useCareEvents/usePushSubscription
// use for their own POST endpoints.
const HTTP_RELAY_URL = RELAY_URL?.replace(/^ws/, 'http')

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const OUTBOX_KEY = 'catmagochi-message-outbox-v1'

interface OutboxEntry {
  id: string
  text: string
  kind?: RelayMessage['kind']
}

function loadOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : []
  } catch {
    return []
  }
}

function saveOutbox(entries: OutboxEntry[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries))
}

export type SendStatus = 'sent' | 'queued' | 'unconfigured'

export function useMessages() {
  const [messages, setMessages] = useState<RelayMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_MIN_MS)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const outbox = useRef<OutboxEntry[]>(HTTP_RELAY_URL && RELAY_TOKEN ? loadOutbox() : [])
  const flushing = useRef(false)

  // Attempts one outbox entry. On success, removes it from the outbox and
  // returns true; on failure, leaves it queued (the caller decides what
  // that means -- an immediate "queued" result for send(), or "try the
  // next one later" for flush()) and returns false.
  const sendEntry = useCallback(async (entry: OutboxEntry): Promise<boolean> => {
    try {
      const res = await fetch(`${HTTP_RELAY_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: RELAY_TOKEN, id: entry.id, text: entry.text, kind: entry.kind }),
      })
      if (!res.ok) return false
      outbox.current = outbox.current.filter((e) => e.id !== entry.id)
      saveOutbox(outbox.current)
      return true
    } catch {
      return false
    }
  }, [])

  // Retries whatever's left in the outbox, in order, stopping at the first
  // failure (the rest stay queued for the next opportunity) -- same shape
  // as useCareEvents.ts's own flush().
  const flush = useCallback(() => {
    if (!HTTP_RELAY_URL || !RELAY_TOKEN || flushing.current || outbox.current.length === 0) return
    flushing.current = true

    const run = async () => {
      while (outbox.current.length > 0) {
        const ok = await sendEntry(outbox.current[0])
        if (!ok) break
      }
      flushing.current = false
    }

    run()
  }, [sendEntry])

  useEffect(() => {
    if (!RELAY_URL || !RELAY_TOKEN) return

    let stopped = false

    const connect = () => {
      const ws = new WebSocket(`${RELAY_URL}/ws?token=${encodeURIComponent(RELAY_TOKEN)}`)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelay.current = RECONNECT_MIN_MS
        flush()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'message') {
            const { id, text, sentAt, kind } = data
            setMessages((current) =>
              current.some((m) => m.id === id) ? current : [...current, { id, text, sentAt, kind }],
            )
          }
        } catch {
          // ignore malformed frames
        }
      }

      const scheduleReconnect = () => {
        if (stopped) return
        reconnectTimer.current = setTimeout(connect, reconnectDelay.current)
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS)
      }

      ws.onclose = scheduleReconnect
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [flush])

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((m) => m.id !== id))
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ack', id }))
    }
  }, [])

  // Queues first (so nothing is lost even if the caller never awaits this,
  // or the component unmounts mid-request), then makes one immediate
  // attempt and resolves based on *that* attempt specifically -- it does
  // not wait around for a later background retry to eventually succeed.
  const send = useCallback(
    async (text: string, kind?: RelayMessage['kind']): Promise<SendStatus> => {
      if (!HTTP_RELAY_URL || !RELAY_TOKEN) return 'unconfigured'
      const entry: OutboxEntry = { id: crypto.randomUUID(), text, kind }
      outbox.current = [...outbox.current, entry]
      saveOutbox(outbox.current)
      const ok = await sendEntry(entry)
      return ok ? 'sent' : 'queued'
    },
    [sendEntry],
  )

  return { messages, dismiss, send }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- useMessages.test.ts`
Expected: PASS, all tests including the 5 new ones in the `send` describe block. Note `sentBody.kind` will be `undefined` when no `kind` is passed to `send()` (e.g. in the "resolves to 'queued'" test) — `JSON.stringify` drops `undefined`-valued keys, so `sentBody.kind` reads as `undefined` after `JSON.parse` either way; this is expected and matches the existing `useCareEvents.ts` outbox's own handling of optional fields.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMessages.ts src/hooks/useMessages.test.ts
git commit -m "Give useMessages.send() an outbox and a real sent/queued/unconfigured result"
```

---

### Task 4: Show nudge send-status feedback in `App.tsx`

**Files:**
- Modify: `src/App.tsx:179-185` (`handleSendNudge`), plus new state/effect and JSX
- Modify: `src/App.test.tsx` (update the mocked `useMessages`'s `send` where needed, add a new `describe('nudge send feedback', ...)` block)

**Interfaces:**
- Consumes: `useMessages().send(text, kind?)` returning `Promise<'sent' | 'queued' | 'unconfigured'>` (Task 3).

- [ ] **Step 1: Write the failing tests**

`src/App.test.tsx` already mocks `useMessages` with `send: mockSend` (a bare `vi.fn()`, see the top of the file) — existing tests that trigger a nudge send don't set a resolved value, so `mockSend()` returns `undefined` by default, which is harmless (an unhandled/awaited `undefined` — no test currently asserts on it). Add a new describe block, placed anywhere at the top level of the outer `describe('App', ...)` block (e.g. right after the existing `describe('shared-pet sync', ...)` block):

```typescript
  describe('nudge send feedback', () => {
    it('shows "Sent." when the send resolves to sent', async () => {
      mockSend.mockResolvedValue('sent')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.getByText('Sent.')).toBeInTheDocument()
    })

    it('shows the queued message when the send resolves to queued', async () => {
      mockSend.mockResolvedValue('queued')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.getByText('Saved — will send when back online.')).toBeInTheDocument()
    })

    it('shows nothing when the send resolves to unconfigured', async () => {
      mockSend.mockResolvedValue('unconfigured')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.queryByText('Sent.')).not.toBeInTheDocument()
      expect(screen.queryByText(/Saved/)).not.toBeInTheDocument()
    })

    it('clears the send-status caption after its display window', async () => {
      mockSend.mockResolvedValue('sent')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.getByText('Sent.')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2_500)
      })
      expect(screen.queryByText('Sent.')).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- App.test.tsx`
Expected: FAIL — `handleSendNudge` doesn't await `send()`'s result or show any caption yet.

- [ ] **Step 3: Add the send-status caption state**

In `src/App.tsx`, add a new constant near the top (after the existing `ACTION_FLAVOR_MS` on line 23):

```typescript
const SEND_STATUS_MS = 2500
```

Inside the `App()` function, add new state right after the existing `captionPop` state (line 88):

```typescript
  const [sendStatusCaption, setSendStatusCaption] = useState<{ text: string; top: number; left: number; key: number } | null>(null)
  const sendStatusTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sendStatusKey = useRef(0)
```

Add cleanup for the new timer alongside the existing one on line 96 — change:

```typescript
  useEffect(() => () => clearTimeout(actionFlavorTimer.current), [])
```

to:

```typescript
  useEffect(() => {
    return () => {
      clearTimeout(actionFlavorTimer.current)
      clearTimeout(sendStatusTimer.current)
    }
  }, [])
```

- [ ] **Step 4: Wire the caption into `handleSendNudge`**

Replace `handleSendNudge` (lines 179-185):

```typescript
  const handleSendNudge = (text: string) => {
    playGame()
    for (const stat of CARE_EVENT_STATS.play) pulse(stat)
    triggerCue('play')
    send(text, 'nudge')
    setPlayPickerOpen(false)
  }
```

with:

```typescript
  const showSendStatus = (text: string) => {
    sendStatusKey.current += 1
    setSendStatusCaption({
      text,
      top: 10 + Math.random() * 35,
      left: 15 + Math.random() * 60,
      key: sendStatusKey.current,
    })
    clearTimeout(sendStatusTimer.current)
    sendStatusTimer.current = setTimeout(() => setSendStatusCaption(null), SEND_STATUS_MS)
  }

  const handleSendNudge = async (text: string) => {
    playGame()
    for (const stat of CARE_EVENT_STATS.play) pulse(stat)
    triggerCue('play')
    setPlayPickerOpen(false)
    const status = await send(text, 'nudge')
    if (status === 'sent') showSendStatus('Sent.')
    else if (status === 'queued') showSendStatus('Saved — will send when back online.')
    // 'unconfigured' -- no caption, this is normal standalone/solo use
  }
```

Note `setPlayPickerOpen(false)` now runs *before* the `await`, so the picker closes immediately (same feel as today) while the caption appears once the send actually resolves.

- [ ] **Step 5: Render the caption**

In the JSX, right after the existing `captionPop` block (right after the `</div>` closing it, before `{growBanner && ...}`, around line 245), add:

```tsx
      {sendStatusCaption && (
        <div
          key={sendStatusCaption.key}
          className="floating-caption"
          style={{ top: `${sendStatusCaption.top}%`, left: `${sendStatusCaption.left}%` }}
          aria-live="polite"
        >
          {sendStatusCaption.text}
        </div>
      )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- App.test.tsx`
Expected: PASS, all tests including the 4 new ones. Existing tests that click a nudge option without awaiting anything (if any) should still pass since `mockSend()` returning `undefined` simply matches neither `'sent'` nor `'queued'`, so no caption appears and nothing else changes.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "Show a send-status caption after a nudge (sent / queued / silent when unconfigured)"
```

---

### Task 5: PLAY first-use discoverability line

**Files:**
- Modify: `src/components/NudgePicker.tsx` (whole-file rewrite — see below)
- Modify: `src/components/NudgePicker.css` (add `.nudge-intro`)
- Modify: `src/components/NudgePicker.test.tsx` (add a new `describe('first-use intro', ...)` block)

**Interfaces:** None consumed from other tasks. Produces nothing other tasks need.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/NudgePicker.test.tsx`, inside the existing `describe('NudgePicker', ...)` block, after its last existing test:

```typescript
  describe('first-use intro', () => {
    it('shows an intro line the first time it opens', () => {
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      expect(screen.getByText('Send a quick note instead of a game.')).toBeInTheDocument()
    })

    it('does not show the intro line once it has already been seen', () => {
      localStorage.setItem('catmagochi-nudge-intro-seen-v1', '1')
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      expect(screen.queryByText('Send a quick note instead of a game.')).not.toBeInTheDocument()
    })

    it('marks the intro as seen after picking an option', () => {
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: NUDGE_OPTIONS[0] }))
      expect(localStorage.getItem('catmagochi-nudge-intro-seen-v1')).toBe('1')
    })

    it('marks the intro as seen after cancelling', () => {
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: '[ CANCEL ]' }))
      expect(localStorage.getItem('catmagochi-nudge-intro-seen-v1')).toBe('1')
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- NudgePicker.test.tsx`
Expected: FAIL — the intro line doesn't exist yet.

- [ ] **Step 3: Implement the intro line**

Replace the entire contents of `src/components/NudgePicker.tsx` with:

```tsx
import { useState } from 'react'
import { NUDGE_OPTIONS } from '../data/nudges'
import './AsciiCat.css'
import './NudgePicker.css'

const INTRO_SEEN_KEY = 'catmagochi-nudge-intro-seen-v1'

export function NudgePicker({ onSend, onCancel }: { onSend: (text: string) => void; onCancel: () => void }) {
  const [showIntro] = useState(() => !localStorage.getItem(INTRO_SEEN_KEY))

  const close = (action: () => void) => {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    action()
  }

  return (
    <div className="ascii-stage">
      <div className="ascii-screen nudge-picker">
        <div className="nudge-header">SEND A NUDGE</div>
        {showIntro && <div className="nudge-intro">Send a quick note instead of a game.</div>}
        <div className="nudge-options">
          {NUDGE_OPTIONS.map((text) => (
            <button key={text} className="nudge-option" onClick={() => close(() => onSend(text))}>
              {text}
            </button>
          ))}
        </div>
        <button className="nudge-cancel" onClick={() => close(onCancel)}>
          [ CANCEL ]
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the intro line's style**

In `src/components/NudgePicker.css`, add at the end of the file:

```css
.nudge-intro {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-soft);
  margin: 0 0 0.3rem;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- NudgePicker.test.tsx`
Expected: PASS, all tests including the 3 pre-existing ones (unaffected — the intro `<div>` doesn't interfere with any of their button-role queries) and the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/components/NudgePicker.tsx src/components/NudgePicker.css src/components/NudgePicker.test.tsx
git commit -m "Add a one-time explainer to the nudge picker for PLAY's new meaning"
```

---

### Task 6: Notification onboarding prompt

**Files:**
- Modify: `src/App.tsx` (new constant, state, handlers, JSX)
- Modify: `src/App.css` (add `.notification-banner` + `.notification-banner-actions`)
- Modify: `src/App.test.tsx` (add a new `describe('notification prompt', ...)` block)

**Interfaces:** None consumed from other tasks. Produces nothing other tasks need.

- [ ] **Step 1: Write the failing tests**

Add to `src/App.test.tsx`, inside the outer `describe('App', ...)` block:

```typescript
  describe('notification prompt', () => {
    it('shows the prompt after adoption when notifications are off', () => {
      seedSave()
      renderApp()
      expect(screen.getByText(/Turn on notifications/)).toBeInTheDocument()
    })

    it('does not show the prompt once notifications are already enabled', () => {
      seedSave()
      localStorage.setItem(
        'catmagochi-notification-settings-v1',
        JSON.stringify({ global: true, message: true, attention: true, update: true }),
      )
      renderApp()
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
    })

    it('does not show the prompt once it has already been dismissed', () => {
      seedSave()
      localStorage.setItem('catmagochi-notification-prompt-seen-v1', '1')
      renderApp()
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
    })

    it('[ ENABLE ] turns notifications on and dismisses the prompt', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[ ENABLE ]'))
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
      const settings = JSON.parse(localStorage.getItem('catmagochi-notification-settings-v1')!)
      expect(settings.global).toBe(true)
      expect(localStorage.getItem('catmagochi-notification-prompt-seen-v1')).toBe('1')
    })

    it('[ NOT NOW ] dismisses the prompt without changing settings', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[ NOT NOW ]'))
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
      expect(localStorage.getItem('catmagochi-notification-prompt-seen-v1')).toBe('1')
      const stored = localStorage.getItem('catmagochi-notification-settings-v1')
      expect(stored ? JSON.parse(stored).global : false).toBe(false)
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- App.test.tsx`
Expected: FAIL — the prompt doesn't exist yet.

- [ ] **Step 3: Add the constant and state**

In `src/App.tsx`, add a new constant after `SEND_STATUS_MS` (added in Task 4):

```typescript
const NOTIFICATION_PROMPT_SEEN_KEY = 'catmagochi-notification-prompt-seen-v1'
```

Inside `App()`, add state after the existing `showStart` line (line 79):

```typescript
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(
    () => !localStorage.getItem(NOTIFICATION_PROMPT_SEEN_KEY),
  )
```

- [ ] **Step 4: Add the dismiss/enable handlers**

Add these two functions in `App()`, right after `handleDismissMessage` (after its closing `}`, before `const actionsDisabled = ...`):

```typescript
  const dismissNotificationPrompt = () => {
    localStorage.setItem(NOTIFICATION_PROMPT_SEEN_KEY, '1')
    setShowNotificationPrompt(false)
  }

  const enableNotifications = () => {
    updateNotificationSettings({ global: true })
    dismissNotificationPrompt()
  }
```

- [ ] **Step 5: Render the banner**

In the JSX, right after the `{growBanner && <div className="grow-banner">{growBanner}</div>}` line, add:

```tsx
      {showNotificationPrompt && !notificationSettings.global && (
        <div className="notification-banner">
          <span>Turn on notifications so you don't miss a nudge, even when the app's closed.</span>
          <div className="notification-banner-actions">
            <button onClick={enableNotifications}>[ ENABLE ]</button>
            <button onClick={dismissNotificationPrompt}>[ NOT NOW ]</button>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Add the banner's styles**

In `src/App.css`, add right after the `@keyframes banner-glow` block (after the `.grow-banner` styles, before `.stats`):

```css
.notification-banner {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--primary);
  border-radius: 4px;
  color: var(--text);
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: left;
}

.notification-banner-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.notification-banner-actions button {
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  transition: background 0.15s ease, color 0.15s ease;
}

.notification-banner-actions button:hover {
  background: var(--border);
  color: var(--bg);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- App.test.tsx`
Expected: PASS, including all 5 new tests. Run the **full** suite too (`npm test`), since this banner now renders in every existing test that reaches the game screen with notifications off and the flag unset — confirm nothing else queries a colliding button name or text.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "Add a one-time notification onboarding prompt"
```

---

### Task 7: Fix `CLAUDE.md`'s stale `asciiCat.ts` description

**Files:**
- Modify: `CLAUDE.md` (the `src/data/asciiCat.ts` bullet in the Architecture section)

**Interfaces:** None — documentation only, no behavior change, no tests.

- [ ] **Step 1: Locate and replace the stale bullet**

Find the bullet starting `- \`src/data/asciiCat.ts\` — the cat is **analytic geometry rendered as text with supersampling**...` in `CLAUDE.md`'s Architecture section, and replace the entire bullet (it's a single long paragraph) with:

```markdown
- `src/data/asciiCat.ts` — the cat is a single **verbatim braille-art image** (`BASE`, a 24-row array the file's own comment marks "embedded VERBATIM — do not regenerate or 'improve' it"), not generated art. Animation is character-level surgery on the eye rows only (rows 8-10): `openEyes(idleFrame)` slides the pupils (`⢼⣿`/`⣾⣷`, offset by `LEFT_OFFSETS`/`RIGHT_OFFSETS`) within the eye holes for an idle glancing loop, and `closedEyes()` swaps the holes for a closed-lid fill (`⣿` over a `⠉` lash line) for blinking or sleeping. Every character outside those two rows is always exactly the reference art, unchanged. **There is no per-stage art and no per-mood face**: `buildFrame(mood, blinkFrame, _stage, idleFrame)` takes `stage` only to satisfy its callers' signature (the parameter is unused, prefixed `_stage`) — growth stages render the *same* `BASE` art, just scaled up via CSS `font-size` per `.cat-sprite.stage-kitten/young/adult` class in `AsciiCat.css`. `mood` is only ever consulted for one check, `mood === 'sleeping'`, to pick the closed-eye frame — hungry, tired, dirty, and sad all render with the exact same open-eyed face as happy/content; the mood signal for those states comes entirely from the floating caption/glyph, never from the cat's own expression. **Gotcha:** when testing visually, remember stats of 80 make `deriveMood` return `happy`, not `content` — comparing a browser render against a terminal print of a different mood looks like a rendering bug (still applies, even though mood no longer changes the face — it still changes the caption/glyph you'd be comparing against).
```

- [ ] **Step 2: Verify against the real file**

Run: `sed -n '1,50p' src/data/asciiCat.ts`
Expected: confirms the `BASE` array, `openEyes`/`closedEyes`, `LEFT_PUPIL`/`RIGHT_PUPIL`, `LEFT_OFFSETS`/`RIGHT_OFFSETS`, and `buildFrame`'s signature all match what the new bullet describes. (They do — this was traced during the original audit in `plan.md`.)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Fix CLAUDE.md's stale asciiCat.ts description to match the actual braille-art renderer"
```

---

### Task 8: `StartScreen` skip-after-first-open

**Files:**
- Modify: `src/App.tsx:79,124-126`
- Modify: `src/App.test.tsx` (add 2 tests to the existing `describe('start screen', ...)` block)

**Interfaces:** None — `StartScreen` itself is untouched; the flag lives entirely in `App.tsx`.

- [ ] **Step 1: Write the failing tests**

In `src/App.test.tsx`, inside the existing `describe('start screen', ...)` block (currently ending around line 109), add:

```typescript
    it('skips the boot screen entirely on a later open, once it has been seen', () => {
      localStorage.setItem('catmagochi-start-seen-v1', '1')
      seedSave()
      render(<App />)
      expect(screen.queryByRole('heading', { name: 'Catmagochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeInTheDocument()
    })

    it('marks the boot screen as seen once it completes', () => {
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(START_TOTAL_MS)
      })
      expect(localStorage.getItem('catmagochi-start-seen-v1')).toBe('1')
    })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- App.test.tsx`
Expected: FAIL — the splash always shows today regardless of any flag, and nothing sets `catmagochi-start-seen-v1`.

- [ ] **Step 3: Implement the skip**

In `src/App.tsx`, add a constant near the other new ones (from Tasks 4/6):

```typescript
const START_SEEN_KEY = 'catmagochi-start-seen-v1'
```

Change line 79:

```typescript
  const [showStart, setShowStart] = useState(true)
```

to:

```typescript
  const [showStart, setShowStart] = useState(() => !localStorage.getItem(START_SEEN_KEY))
```

Change lines 124-126:

```typescript
  if (showStart) {
    return <StartScreen onDone={() => setShowStart(false)} />
  }
```

to:

```typescript
  if (showStart) {
    return (
      <StartScreen
        onDone={() => {
          localStorage.setItem(START_SEEN_KEY, '1')
          setShowStart(false)
        }}
      />
    )
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- App.test.tsx`
Expected: PASS, including the 2 new tests. The 3 pre-existing `start screen` tests and the `renderApp()` helper used throughout the rest of the file are unaffected — every existing test starts with an empty `localStorage` (per `src/test/setup.ts`'s `afterEach`), so `showStart` still initializes to `true` for all of them exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "Skip the boot splash after the first open"
```

---

## Final verification (all tasks complete)

- [ ] Run `npm test` — full client suite passes
- [ ] Run `npm run test:coverage` — still clears the 90% thresholds (all the new code paths are covered by the tests added above)
- [ ] Run `cd server && npm test` — full server suite passes
- [ ] Run `npm run lint` — clean
- [ ] Run `npm run build` — typecheck + production build succeed
- [ ] Commit any final cleanup, then hand off to `superpowers:finishing-a-development-branch`

---

## Self-review

**1. Spec coverage:** every one of the design doc's 7 in-scope sections maps to exactly one task above (§1→Task 1, §2/3→Tasks 2-4, §4→Task 5, §5→Task 6, §6→Task 7, §7→Task 8). The explicitly-out-of-scope iOS item has no task, correctly.

**2. Placeholder scan:** no TBD/TODO, no "add appropriate error handling"-style steps — every step has complete code, and every test has real assertions rather than a description of what to assert.

**3. Type consistency:** `send`'s return type (`SendStatus = 'sent' | 'queued' | 'unconfigured'`, defined and exported in Task 3) is used identically in Task 4 (`if (status === 'sent') ... else if (status === 'queued') ...`) — same three literal strings, no drift. `OutboxEntry` in Task 3 (`{ id, text, kind }`) matches what Task 3's own tests construct/assert against. The `localStorage` key names introduced across tasks (`catmagochi-message-outbox-v1`, `catmagochi-nudge-intro-seen-v1`, `catmagochi-notification-prompt-seen-v1`, `catmagochi-start-seen-v1`) are each used consistently within their own task's implementation and tests, and don't collide with any existing key.
