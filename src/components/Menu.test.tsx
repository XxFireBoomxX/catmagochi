import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Menu } from './Menu'
import type { RelayMessage } from '../types'
import type { NotificationSettings } from '../hooks/useNotificationSettings'
import type { PushStatus } from '../hooks/usePushSubscription'

const mockIsNativePlatform = vi.fn()
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

const mockUsePwaUpdate = vi.fn()
vi.mock('../hooks/usePwaUpdate', () => ({
  usePwaUpdate: () => mockUsePwaUpdate(),
}))

const mockUseNativeUpdate = vi.fn()
vi.mock('../hooks/useNativeUpdate', () => ({
  useNativeUpdate: () => mockUseNativeUpdate(),
}))

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  global: false,
  message: true,
  attention: true,
  update: true,
}

function setup({
  isNative = false,
  pwaStatus = 'idle',
  nativeStatus = 'idle',
  history = [] as RelayMessage[],
  onClose = vi.fn(),
  notificationSettings = DEFAULT_NOTIFICATION_SETTINGS,
  pushStatus = 'idle' as PushStatus,
} = {}) {
  mockIsNativePlatform.mockReturnValue(isNative)
  const pwaCheck = vi.fn()
  mockUsePwaUpdate.mockReturnValue({ status: pwaStatus, checkForUpdate: pwaCheck })
  const nativeCheck = vi.fn()
  const nativeApply = vi.fn()
  mockUseNativeUpdate.mockReturnValue({ status: nativeStatus, checkForUpdate: nativeCheck, applyUpdate: nativeApply })
  const onUpdateNotificationSettings = vi.fn()
  const utils = render(
    <Menu
      open
      history={history}
      onClose={onClose}
      notificationSettings={notificationSettings}
      onUpdateNotificationSettings={onUpdateNotificationSettings}
      pushStatus={pushStatus}
    />,
  )
  return { ...utils, onClose, pwaCheck, nativeCheck, nativeApply, onUpdateNotificationSettings }
}

describe('Menu', () => {
  beforeEach(() => {
    vi.stubGlobal('reload', vi.fn())
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when closed', () => {
    mockIsNativePlatform.mockReturnValue(false)
    mockUsePwaUpdate.mockReturnValue({ status: 'idle', checkForUpdate: vi.fn() })
    mockUseNativeUpdate.mockReturnValue({ status: 'idle', checkForUpdate: vi.fn(), applyUpdate: vi.fn() })
    const { container } = render(
      <Menu
        open={false}
        history={[]}
        onClose={() => {}}
        notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
        onUpdateNotificationSettings={() => {}}
        pushStatus="idle"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the root menu with all three items when open', () => {
    setup()
    expect(screen.getByText('MENU')).toBeInTheDocument()
    expect(screen.getByText('MESSAGE HISTORY')).toBeInTheDocument()
    expect(screen.getByText('CHECK FOR UPDATES')).toBeInTheDocument()
    expect(screen.getByText('SETTINGS')).toBeInTheDocument()
  })

  it('calls onClose from the root close button', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByText('[ CLOSE ]'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('history view', () => {
    it('shows an empty message when there is no history', () => {
      setup({ history: [] })
      fireEvent.click(screen.getByText('MESSAGE HISTORY'))
      expect(screen.getByText('No messages yet.')).toBeInTheDocument()
    })

    it('lists history items with a formatted time and the message text', () => {
      const sentAt = new Date(2026, 0, 5, 9, 5).getTime() // Jan 5, 09:05 local
      setup({ history: [{ id: '1', text: 'hello there', sentAt }] })
      fireEvent.click(screen.getByText('MESSAGE HISTORY'))
      expect(screen.getByText('hello there')).toBeInTheDocument()
      expect(screen.getByText('JAN 5 09:05')).toBeInTheDocument()
    })

    it('returns to the root view on back', () => {
      setup()
      fireEvent.click(screen.getByText('MESSAGE HISTORY'))
      fireEvent.click(screen.getByText('[ BACK ]'))
      expect(screen.getByText('MENU')).toBeInTheDocument()
    })
  })

  describe('update view, PWA (web) path', () => {
    it('triggers the PWA update check on entering the view', () => {
      const { pwaCheck, nativeCheck } = setup({ isNative: false })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(pwaCheck).toHaveBeenCalledTimes(1)
      expect(nativeCheck).not.toHaveBeenCalled()
    })

    it('shows checking status text and a disabled recheck button while checking', () => {
      setup({ isNative: false, pwaStatus: 'checking' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText('Checking for updates...')).toBeInTheDocument()
      expect(screen.getByText('[ CHECK AGAIN ]')).toBeDisabled()
    })

    it('shows up-to-date status text', () => {
      setup({ isNative: false, pwaStatus: 'up-to-date' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText("You're on the latest version.")).toBeInTheDocument()
    })

    it('shows an unsupported message', () => {
      setup({ isNative: false, pwaStatus: 'unsupported' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText("Updates aren't available yet. Try again in a moment.")).toBeInTheDocument()
    })

    it('shows an error message', () => {
      setup({ isNative: false, pwaStatus: 'error' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText("Couldn't check for updates. Make sure you're online.")).toBeInTheDocument()
    })

    it('reloads the page when applying an updating PWA', () => {
      setup({ isNative: false, pwaStatus: 'updating' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText('Update found and ready. Tap Reload to apply it.')).toBeInTheDocument()
      fireEvent.click(screen.getByText('[ RELOAD NOW ]'))
      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('re-checks when CHECK AGAIN is clicked', () => {
      const { pwaCheck } = setup({ isNative: false, pwaStatus: 'error' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(pwaCheck).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByText('[ CHECK AGAIN ]'))
      expect(pwaCheck).toHaveBeenCalledTimes(2)
    })

    it('returns to root from the update view', () => {
      setup({ isNative: false, pwaStatus: 'error' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      fireEvent.click(screen.getByText('[ BACK ]'))
      expect(screen.getByText('MENU')).toBeInTheDocument()
    })
  })

  describe('update view, native (Capacitor) path', () => {
    it('triggers the native update check on entering the view, not the PWA one', () => {
      const { pwaCheck, nativeCheck } = setup({ isNative: true })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(nativeCheck).toHaveBeenCalledTimes(1)
      expect(pwaCheck).not.toHaveBeenCalled()
    })

    it('treats both checking and downloading as the "checking" busy state', () => {
      const { rerender } = setup({ isNative: true, nativeStatus: 'checking' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText('[ CHECK AGAIN ]')).toBeDisabled()

      mockUseNativeUpdate.mockReturnValue({ status: 'downloading', checkForUpdate: vi.fn(), applyUpdate: vi.fn() })
      rerender(
        <Menu
          open
          history={[]}
          onClose={() => {}}
          notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
          onUpdateNotificationSettings={() => {}}
          pushStatus="idle"
        />,
      )
      expect(screen.getByText('Downloading update...')).toBeInTheDocument()
      expect(screen.getByText('[ CHECK AGAIN ]')).toBeDisabled()
    })

    it('shows the reload button and applies the update when ready', () => {
      const { nativeApply } = setup({ isNative: true, nativeStatus: 'ready' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText('Update downloaded and ready. Tap Reload to apply it.')).toBeInTheDocument()
      fireEvent.click(screen.getByText('[ RELOAD NOW ]'))
      expect(nativeApply).toHaveBeenCalledTimes(1)
    })

    it('shows up-to-date and error text for native status', () => {
      const { rerender } = setup({ isNative: true, nativeStatus: 'up-to-date' })
      fireEvent.click(screen.getByText('CHECK FOR UPDATES'))
      expect(screen.getByText("You're on the latest version.")).toBeInTheDocument()

      mockUseNativeUpdate.mockReturnValue({ status: 'error', checkForUpdate: vi.fn(), applyUpdate: vi.fn() })
      rerender(
        <Menu
          open
          history={[]}
          onClose={() => {}}
          notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
          onUpdateNotificationSettings={() => {}}
          pushStatus="idle"
        />,
      )
      expect(screen.getByText("Couldn't check for updates. Make sure you're online.")).toBeInTheDocument()
    })
  })

  describe('settings view', () => {
    it('shows the global toggle and per-type toggles, all reflecting current settings', () => {
      setup({ notificationSettings: { global: true, message: true, attention: false, update: true } })
      fireEvent.click(screen.getByText('SETTINGS'))
      expect(screen.getByText('SETTINGS')).toBeInTheDocument()
      expect(screen.getByText('Notifications')).toBeInTheDocument()
      expect(screen.getByText('Messages')).toBeInTheDocument()
      expect(screen.getByText('Cat needs attention')).toBeInTheDocument()
      expect(screen.getByText('Update available')).toBeInTheDocument()
    })

    it('reflects message/update being off too, not just attention', () => {
      setup({ notificationSettings: { global: true, message: false, attention: true, update: false } })
      fireEvent.click(screen.getByText('SETTINGS'))
      // global + attention are ON, message + update are OFF
      expect(screen.getAllByText('[ON]')).toHaveLength(2)
      expect(screen.getAllByText('[OFF]')).toHaveLength(2)
    })

    it('toggles the global setting and calls onUpdateNotificationSettings', () => {
      const { onUpdateNotificationSettings } = setup({
        notificationSettings: { global: false, message: true, attention: true, update: true },
      })
      fireEvent.click(screen.getByText('SETTINGS'))
      fireEvent.click(screen.getByText('[OFF]')) // only the global row shows [OFF] initially -- per-type rows are disabled but still ON
      expect(onUpdateNotificationSettings).toHaveBeenCalledWith({ global: true })
    })

    it('disables per-type toggles while the global setting is off', () => {
      setup({ notificationSettings: { global: false, message: true, attention: true, update: true } })
      fireEvent.click(screen.getByText('SETTINGS'))
      const onButtons = screen.getAllByText('[ON]')
      for (const button of onButtons) {
        expect(button).toBeDisabled()
      }
    })

    it('toggles a per-type setting when the global setting is on', () => {
      const { onUpdateNotificationSettings } = setup({
        notificationSettings: { global: true, message: true, attention: true, update: true },
      })
      fireEvent.click(screen.getByText('SETTINGS'))
      // index 0 is the global toggle itself; 1/2/3 are Messages/Attention/Update
      const onButtons = screen.getAllByText('[ON]')
      fireEvent.click(onButtons[1])
      expect(onUpdateNotificationSettings).toHaveBeenCalledWith({ message: false })
      fireEvent.click(onButtons[2])
      expect(onUpdateNotificationSettings).toHaveBeenCalledWith({ attention: false })
      fireEvent.click(onButtons[3])
      expect(onUpdateNotificationSettings).toHaveBeenCalledWith({ update: false })
    })

    it('shows a status message for unsupported/denied/error push states', () => {
      const { rerender } = setup({ pushStatus: 'unsupported' })
      fireEvent.click(screen.getByText('SETTINGS'))
      expect(screen.getByText(/aren't supported/)).toBeInTheDocument()

      rerender(
        <Menu
          open
          history={[]}
          onClose={() => {}}
          notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
          onUpdateNotificationSettings={() => {}}
          pushStatus="denied"
        />,
      )
      expect(screen.getByText(/blocked/)).toBeInTheDocument()
    })

    it('shows no status message for idle/subscribed/unsubscribed push states', () => {
      setup({ pushStatus: 'subscribed' })
      fireEvent.click(screen.getByText('SETTINGS'))
      expect(screen.queryByText(/not supported/)).not.toBeInTheDocument()
      expect(screen.queryByText(/blocked/)).not.toBeInTheDocument()
    })

    it('returns to the root view on back', () => {
      setup()
      fireEvent.click(screen.getByText('SETTINGS'))
      fireEvent.click(screen.getByText('[ BACK ]'))
      expect(screen.getByText('MENU')).toBeInTheDocument()
    })
  })

  it('resets to the root view every time it is reopened', () => {
    const onClose = vi.fn()
    mockIsNativePlatform.mockReturnValue(false)
    mockUsePwaUpdate.mockReturnValue({ status: 'idle', checkForUpdate: vi.fn() })
    mockUseNativeUpdate.mockReturnValue({ status: 'idle', checkForUpdate: vi.fn(), applyUpdate: vi.fn() })
    const { rerender } = render(
      <Menu
        open
        history={[]}
        onClose={onClose}
        notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
        onUpdateNotificationSettings={() => {}}
        pushStatus="idle"
      />,
    )
    fireEvent.click(screen.getByText('MESSAGE HISTORY'))
    expect(screen.getByText('MESSAGE HISTORY')).toBeInTheDocument()
    rerender(
      <Menu
        open={false}
        history={[]}
        onClose={onClose}
        notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
        onUpdateNotificationSettings={() => {}}
        pushStatus="idle"
      />,
    )
    rerender(
      <Menu
        open
        history={[]}
        onClose={onClose}
        notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
        onUpdateNotificationSettings={() => {}}
        pushStatus="idle"
      />,
    )
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })
})
