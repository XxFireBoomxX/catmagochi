import { beforeEach, describe, expect, it, vi } from 'vitest'

const DEVICE_ID_KEY = 'catmagochi-device-id-v1'

// deviceId.ts keeps a module-level fallback id for the storage-unavailable
// case, so each test needs its own module instance -- otherwise a later test
// silently reuses an earlier one's fallback and passes without exercising
// anything.
async function loadDeviceId() {
  vi.resetModules()
  const mod = await import('./deviceId')
  return mod.getDeviceId
}

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('generates and persists an id on first use', async () => {
    const getDeviceId = await loadDeviceId()
    const id = getDeviceId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(id)
  })

  it('returns the same id on every later call', async () => {
    const getDeviceId = await loadDeviceId()
    expect(getDeviceId()).toBe(getDeviceId())
  })

  it('keeps the stored id across reloads rather than minting a new one', async () => {
    const getDeviceId = await loadDeviceId()
    localStorage.setItem(DEVICE_ID_KEY, 'previously-stored-id')
    expect(getDeviceId()).toBe('previously-stored-id')
  })

  it('mints a fresh id when storage was cleared', async () => {
    const getDeviceId = await loadDeviceId()
    const first = getDeviceId()
    localStorage.clear()
    expect(getDeviceId()).not.toBe(first)
  })

  // Truthiness is not the load-bearing property -- the WS `device=` param and
  // the POST `origin` must agree within a session, or the relay cannot match
  // them and echo suppression silently stops working.
  it('returns a stable id for the session when localStorage cannot be written', async () => {
    const getDeviceId = await loadDeviceId()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const id = getDeviceId()
    expect(id).toBeTruthy()
    expect(getDeviceId()).toBe(id)
  })

  // The fallback must not depend on the API that may have put us in the catch
  // to begin with: crypto.randomUUID is undefined in a non-secure context, and
  // calling it again would throw straight out of the WebSocket connect().
  it('still produces a stable id when crypto.randomUUID is unavailable', async () => {
    const getDeviceId = await loadDeviceId()
    vi.stubGlobal('crypto', {})
    let id: string | undefined
    expect(() => { id = getDeviceId() }).not.toThrow()
    expect(id).toBeTruthy()
    expect(getDeviceId()).toBe(id)
  })
})
