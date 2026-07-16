import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}

const OUTBOX_KEY = 'catmagochi-care-outbox-v1'

async function loadUseCareEvents(url: string, token: string) {
  vi.resetModules()
  // Same rationale as useMessages.test.ts: the repo's gitignored .env may
  // set these for real local relay testing, so always stub explicitly.
  vi.stubEnv('VITE_RELAY_URL', url)
  vi.stubEnv('VITE_RELAY_TOKEN', token)
  const mod = await import('./useCareEvents')
  return mod.useCareEvents
}

describe('useCareEvents', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never opens a socket when relay env vars are unset', async () => {
    const useCareEvents = await loadUseCareEvents('', '')
    renderHook(() => useCareEvents(vi.fn()))
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('never opens a socket when only the token is missing', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', '')
    renderHook(() => useCareEvents(vi.fn()))
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('connects to the relay URL with the token as a query param when configured', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'secret-token')
    renderHook(() => useCareEvents(vi.fn()))
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('wss://relay.test/ws?token=secret-token')
  })

  it('applies an incoming care-event frame and acks it', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    const onEvent = vi.fn()
    renderHook(() => useCareEvents(onEvent))
    const ws = MockWebSocket.instances[0]
    ws.readyState = MockWebSocket.OPEN
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'care-event', id: 'e1', eventType: 'feed', sentAt: 1 }) })
    })
    expect(onEvent).toHaveBeenCalledWith('e1', 'feed')
    expect(ws.sent).toEqual([JSON.stringify({ type: 'ack', id: 'e1' })])
  })

  it('does not ack when the socket is not open', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    const onEvent = vi.fn()
    renderHook(() => useCareEvents(onEvent))
    const ws = MockWebSocket.instances[0]
    ws.readyState = MockWebSocket.CONNECTING
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'care-event', id: 'e3', eventType: 'clean', sentAt: 1 }) })
    })
    expect(onEvent).toHaveBeenCalledWith('e3', 'clean')
    expect(ws.sent).toEqual([])
  })

  it('ignores frames that are not type "care-event"', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    const onEvent = vi.fn()
    renderHook(() => useCareEvents(onEvent))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'message', id: '1', text: 'hi', sentAt: 1 }) })
    })
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('ignores care-event frames with an unrecognized event type', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    const onEvent = vi.fn()
    renderHook(() => useCareEvents(onEvent))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'care-event', id: '1', eventType: 'sleep', sentAt: 1 }) })
    })
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('ignores malformed JSON frames without throwing', async () => {
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    const onEvent = vi.fn()
    renderHook(() => useCareEvents(onEvent))
    const ws = MockWebSocket.instances[0]
    expect(() => {
      act(() => {
        ws.onmessage?.({ data: 'not json{{' })
      })
    }).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('reconnects with backoff after the socket closes', async () => {
    vi.useFakeTimers()
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    renderHook(() => useCareEvents(vi.fn()))
    expect(MockWebSocket.instances).toHaveLength(1)

    act(() => {
      MockWebSocket.instances[0].onclose?.()
    })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('stops reconnecting after unmount', async () => {
    vi.useFakeTimers()
    const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
    const { unmount } = renderHook(() => useCareEvents(vi.fn()))
    const ws = MockWebSocket.instances[0]
    unmount()
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  describe('emit / outbox', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
    })

    it('is a no-op when relay env vars are unset', async () => {
      const useCareEvents = await loadUseCareEvents('', '')
      const { result } = renderHook(() => useCareEvents(vi.fn()))
      act(() => {
        result.current.emit('e1', 'feed')
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(localStorage.getItem(OUTBOX_KEY)).toBeNull()
    })

    it('posts immediately and clears the outbox on success', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
      const { result } = renderHook(() => useCareEvents(vi.fn()))
      act(() => {
        result.current.emit('e1', 'feed')
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'https://relay.test/care-event',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ token: 'tok', id: 'e1', type: 'feed' }),
          }),
        )
      })
      await waitFor(() => {
        expect(JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')).toEqual([])
      })
    })

    it('keeps a failed send queued in localStorage for a later retry', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))
      const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
      const { result } = renderHook(() => useCareEvents(vi.fn()))
      act(() => {
        result.current.emit('e1', 'feed')
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
      expect(JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')).toEqual([{ id: 'e1', type: 'feed' }])
    })

    it('retries a queued event when the socket reconnects', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true })
      const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
      const { result } = renderHook(() => useCareEvents(vi.fn()))
      act(() => {
        result.current.emit('e1', 'clean')
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
      act(() => {
        MockWebSocket.instances[0].onopen?.()
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
      await waitFor(() => {
        expect(JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')).toEqual([])
      })
    })

    it('stops at the first failure, leaving later queued events in place', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('offline'))
      const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
      const { result } = renderHook(() => useCareEvents(vi.fn()))
      // both queued before either flush settles, so the second sits behind
      // the first in the outbox
      act(() => {
        result.current.emit('e1', 'feed')
        result.current.emit('e2', 'clean')
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
      expect(JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')).toEqual([{ id: 'e2', type: 'clean' }])
    })

    it('ignores a corrupt persisted outbox and starts empty', async () => {
      localStorage.setItem(OUTBOX_KEY, '{not valid json')
      const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
      const { result } = renderHook(() => useCareEvents(vi.fn()))
      act(() => {
        MockWebSocket.instances[0].onopen?.()
      })
      expect(fetchMock).not.toHaveBeenCalled()
      // emit() still works normally afterward -- the corrupt outbox didn't
      // wedge anything, it just started from an empty array.
      fetchMock.mockResolvedValue({ ok: true })
      act(() => {
        result.current.emit('e1', 'feed')
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
    })

    it('loads a previously-persisted outbox and flushes it once the socket opens', async () => {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify([{ id: 'stale', type: 'pet' }]))
      fetchMock.mockResolvedValue({ ok: true })
      const useCareEvents = await loadUseCareEvents('wss://relay.test', 'tok')
      renderHook(() => useCareEvents(vi.fn()))
      act(() => {
        MockWebSocket.instances[0].onopen?.()
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'https://relay.test/care-event',
          expect.objectContaining({
            body: JSON.stringify({ token: 'tok', id: 'stale', type: 'pet' }),
          }),
        )
      })
    })
  })
})
