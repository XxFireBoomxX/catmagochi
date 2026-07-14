import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const download = vi.fn()
const set = vi.fn()

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    download: (...args: unknown[]) => download(...args),
    set: (...args: unknown[]) => set(...args),
  },
}))

async function loadUseNativeUpdate() {
  const mod = await import('./useNativeUpdate')
  return mod.useNativeUpdate
}

describe('useNativeUpdate', () => {
  beforeEach(() => {
    vi.resetModules()
    download.mockReset()
    set.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts idle', async () => {
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    expect(result.current.status).toBe('idle')
  })

  it('marks up-to-date when the latest release tag matches the running version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: `v${__APP_VERSION__}`, assets: [{ name: 'bundle.zip', browser_download_url: 'x' }] }),
      }),
    )
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('up-to-date')
    expect(download).not.toHaveBeenCalled()
  })

  it('marks up-to-date when there is a newer tag but no bundle.zip asset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v999.0.0', assets: [] }),
      }),
    )
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('up-to-date')
  })

  it('marks up-to-date when the release has no tag_name at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ assets: [{ name: 'bundle.zip', browser_download_url: 'x' }] }),
      }),
    )
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('up-to-date')
  })

  it('downloads and marks ready when a newer version with a bundle asset is found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v999.0.0',
          assets: [{ name: 'bundle.zip', browser_download_url: 'https://example.test/bundle.zip' }],
        }),
      }),
    )
    download.mockResolvedValue({ id: 'bundle-123' })
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('ready')
    expect(download).toHaveBeenCalledWith({ url: 'https://example.test/bundle.zip', version: '999.0.0' })
  })

  it('applies the downloaded bundle via CapacitorUpdater.set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v999.0.0',
          assets: [{ name: 'bundle.zip', browser_download_url: 'https://example.test/bundle.zip' }],
        }),
      }),
    )
    download.mockResolvedValue({ id: 'bundle-123' })
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    await act(async () => {
      await result.current.applyUpdate()
    })
    expect(set).toHaveBeenCalledWith({ id: 'bundle-123' })
  })

  it('applyUpdate is a no-op when nothing has been downloaded yet', async () => {
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.applyUpdate()
    })
    expect(set).not.toHaveBeenCalled()
  })

  it('marks error when the release fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('error')
  })

  it('marks error when fetch itself throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('error')
  })

  it('marks error when the download itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v999.0.0',
          assets: [{ name: 'bundle.zip', browser_download_url: 'https://example.test/bundle.zip' }],
        }),
      }),
    )
    download.mockRejectedValue(new Error('download failed'))
    const useNativeUpdate = await loadUseNativeUpdate()
    const { result } = renderHook(() => useNativeUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('error')
  })
})
