import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeviceId } from './deviceId'

const DEVICE_ID_KEY = 'catmagochi-device-id-v1'

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('generates and persists an id on first use', () => {
    const id = getDeviceId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(id)
  })

  it('returns the same id on every later call', () => {
    expect(getDeviceId()).toBe(getDeviceId())
  })

  it('keeps the stored id across reloads rather than minting a new one', () => {
    localStorage.setItem(DEVICE_ID_KEY, 'previously-stored-id')
    expect(getDeviceId()).toBe('previously-stored-id')
  })

  it('mints a fresh id when storage was cleared', () => {
    const first = getDeviceId()
    localStorage.clear()
    expect(getDeviceId()).not.toBe(first)
  })

  it('falls back to a working id when localStorage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(getDeviceId()).toBeTruthy()
  })
})
