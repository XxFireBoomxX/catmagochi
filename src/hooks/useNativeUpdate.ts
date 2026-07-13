import { useCallback, useState } from 'react'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

export type NativeUpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'error'

const RELEASES_URL = 'https://api.github.com/repos/XxFireBoomxX/catmagochi/releases/latest'
const BUNDLE_ASSET_NAME = 'bundle.zip'

interface GithubRelease {
  tag_name?: string
  assets?: { name: string; browser_download_url: string }[]
}

export function useNativeUpdate() {
  const [status, setStatus] = useState<NativeUpdateStatus>('idle')
  const [bundleId, setBundleId] = useState<string | null>(null)

  const checkForUpdate = useCallback(async () => {
    setStatus('checking')
    setBundleId(null)
    try {
      const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(`release fetch failed: ${res.status}`)
      const release: GithubRelease = await res.json()
      const latestVersion = (release.tag_name ?? '').replace(/^v/, '')
      const asset = release.assets?.find((a) => a.name === BUNDLE_ASSET_NAME)

      if (!latestVersion || latestVersion === __APP_VERSION__ || !asset) {
        setStatus('up-to-date')
        return
      }

      setStatus('downloading')
      const bundle = await CapacitorUpdater.download({ url: asset.browser_download_url, version: latestVersion })
      setBundleId(bundle.id)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    if (!bundleId) return
    await CapacitorUpdater.set({ id: bundleId })
  }, [bundleId])

  return { status, checkForUpdate, applyUpdate }
}
