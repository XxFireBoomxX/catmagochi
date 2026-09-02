import { useEffect, useRef, useState } from 'react'
import { StartScreen } from './components/StartScreen'
import { AsciiCat } from './components/AsciiCat'
import { TrickPanel } from './components/TrickPanel'
import { MessageView } from './components/MessageView'
import { Menu } from './components/Menu'
import { StatsWindow } from './components/StatsWindow'
import { StatBar } from './components/StatBar'
import { usePet } from './hooks/usePet'
import { useFlavorText } from './hooks/useFlavorText'
import { useMessages } from './hooks/useMessages'
import { useMessageHistory } from './hooks/useMessageHistory'
import { useCareEvents } from './hooks/useCareEvents'
import { useNotificationSettings } from './hooks/useNotificationSettings'
import { usePushSubscription } from './hooks/usePushSubscription'
import { useAttentionNotifications } from './hooks/useAttentionNotifications'
import { deriveStage, growthProgress, GROW_MESSAGE, STAGE_LABEL } from './data/growth'
import { ACTION_FLAVOR } from './data/flavorText'
import type { ActionCueType, CareEventType, PetStats, RelayMessage, Stage } from './types'
import './App.css'

const ACTION_FLAVOR_CHANCE = 0.25
const ACTION_FLAVOR_MS = 2500
const NOTIFICATION_PROMPT_SEEN_KEY = 'catmagochi-notification-prompt-seen-v1'
const START_SEEN_KEY = 'catmagochi-start-seen-v1'

// Which stat bars visibly pulse for a synced care event, mirroring the
// deltas applyCareEvent applies in usePet.ts.
const CARE_EVENT_STATS: Record<CareEventType, (keyof PetStats)[]> = {
  feed: ['fullness', 'happiness'],
  clean: ['cleanliness'],
  pet: ['happiness'],
  play: ['happiness', 'energy', 'fullness', 'cleanliness'],
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function NameScreen({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="name-screen">
      <h1>Catmagochi</h1>
      <p>What should we name your new kitten?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onCreate(name)
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kitten's name"
          maxLength={20}
          autoFocus
        />
        <button type="submit">[ ADOPT ]</button>
      </form>
    </div>
  )
}

function App() {
  // Bridges applyRemoteEvent (only known once usePet has returned) to
  // useCareEvents' onEvent (which must be passed in on the same call that
  // creates the WebSocket connection) without a chicken-and-egg ordering
  // problem -- see the assignment right before the early return below,
  // which mirrors the saveRef-updated-every-render pattern in usePet.ts.
  // Defaults to reporting not-applied: until the assignment below runs (it
  // sits after the boot-splash / name-screen early returns), there is nothing
  // to apply an event to, and useCareEvents must not ack it off the relay.
  const handleRemoteCareEventRef = useRef<(id: string, type: CareEventType) => boolean>(() => false)
  const { save, mood, createPet, feed, playGame, clean, toggleSleep, pet, receiveMessage, applyRemoteEvent } = usePet(
    (id, type) => careEvents.emit(id, type),
  )
  const careEvents = useCareEvents((id, type) => handleRemoteCareEventRef.current(id, type))
  const { messages, dismiss } = useMessages()
  const { history, record } = useMessageHistory()
  const { settings: notificationSettings, update: updateNotificationSettings } = useNotificationSettings()
  const { status: pushStatus } = usePushSubscription(notificationSettings)
  useAttentionNotifications(save?.name, save?.stats, save?.sleeping ?? false, notificationSettings)
  const [showStart, setShowStart] = useState(() => !localStorage.getItem(START_SEEN_KEY))
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(
    () => !localStorage.getItem(NOTIFICATION_PROMPT_SEEN_KEY),
  )
  const [pulsed, setPulsed] = useState<Set<keyof PetStats>>(new Set())
  const [playPickerOpen, setPlayPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [showGrowthProgress, setShowGrowthProgress] = useState(false)
  const [growBanner, setGrowBanner] = useState<string | null>(null)
  const [actionCue, setActionCue] = useState<{ type: ActionCueType } | null>(null)
  const [actionFlavor, setActionFlavor] = useState<string | null>(null)
  const [captionPop, setCaptionPop] = useState<{ text: string; top: number; left: number; key: number } | null>(null)
  const actionFlavorTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const captionKey = useRef(0)
  const flavorText = useFlavorText(mood)
  const prevStage = useRef<Stage | null>(null)
  const stage = save ? deriveStage(save.growth) : null
  const captionText = save ? `${save.name} ${actionFlavor ?? flavorText}` : null

  useEffect(() => {
    return () => {
      clearTimeout(actionFlavorTimer.current)
    }
  }, [])

  // Every time the caption text actually changes (mood swap, idle flavor
  // line, or a post-action bonus line), pop it up at a fresh random spot
  // instead of a fixed always-on status line.
  useEffect(() => {
    if (!captionText) return
    captionKey.current += 1
    setCaptionPop({
      text: captionText,
      top: 10 + Math.random() * 35,
      left: 15 + Math.random() * 60,
      key: captionKey.current,
    })
  }, [captionText])

  useEffect(() => {
    if (!stage) return
    const previous = prevStage.current
    prevStage.current = stage
    if (previous && previous !== stage && GROW_MESSAGE[stage]) {
      setGrowBanner(`${save?.name ?? 'Your cat'} ${GROW_MESSAGE[stage]}`)
      const t = setTimeout(() => setGrowBanner(null), 2500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

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

  if (!save) {
    return <NameScreen onCreate={createPet} />
  }

  const { stats, sleeping } = save
  const progress = growthProgress(save.growth)

  const pulse = (stat: keyof PetStats) => {
    setPulsed((current) => new Set(current).add(stat))
    setTimeout(() => {
      setPulsed((current) => {
        const next = new Set(current)
        next.delete(stat)
        return next
      })
    }, 500)
  }

  // Local actions pulse from the same CARE_EVENT_STATS table remote events
  // use, rather than a hand-written list per button -- those had drifted from
  // what applyCareEvent actually changes (FEED raises happiness but never
  // pulsed it; petting pulsed nothing at all).
  const pulseFor = (type: CareEventType) => {
    for (const stat of CARE_EVENT_STATS[type]) pulse(stat)
  }

  const triggerCue = (type: ActionCueType) => {
    // A fresh object every call, so pressing the same action type twice in a
    // row still re-fires AsciiCat's effect (unlike a bare string/primitive,
    // which React treats as "no change" via Object.is on repeat identical
    // values).
    setActionCue({ type })
  }

  const maybeShowActionFlavor = (type: keyof typeof ACTION_FLAVOR) => {
    if (Math.random() >= ACTION_FLAVOR_CHANCE) return
    setActionFlavor(pick(ACTION_FLAVOR[type]))
    clearTimeout(actionFlavorTimer.current)
    actionFlavorTimer.current = setTimeout(() => setActionFlavor(null), ACTION_FLAVOR_MS)
  }

  // A care event from another device gets the same reactions a local action
  // gets (stat pulse, cat glyph cue, occasional bonus caption) -- applied
  // is false for a dedup'd echo of our own action or an already-seen event
  // replayed after reconnect, which should stay silent.
  handleRemoteCareEventRef.current = (id, type) => {
    const result = applyRemoteEvent(id, type)
    // A duplicate gets no reactions (it changed nothing) but must still be
    // acked, or the relay replays it on every reconnect.
    if (result !== 'applied') return result === 'duplicate'
    pulseFor(type)
    if (type === 'feed' || type === 'clean' || type === 'play') triggerCue(type)
    if (type !== 'play') maybeShowActionFlavor(type)
    return true
  }

  const handlePetClick = () => {
    const applied = pet()
    if (applied) {
      pulseFor('pet')
      maybeShowActionFlavor('pet')
    }
    return applied
  }

  // One lesson a day. Any outcome still counts as time spent with the cat,
  // so it fires the same 'play' care event the nudge used to -- stats and
  // growth are unchanged, and it still syncs if a relay is ever deployed.
  const handleLessonDone = () => {
    playGame()
    pulseFor('play')
    triggerCue('play')
  }

  // Performing a learned trick is unlimited, so it deliberately changes no
  // stats -- it's an expressive toy, not a second faucet to optimise.
  const handlePerformTrick = () => {
    triggerCue('play')
  }

  const handleDismissMessage = (message: RelayMessage) => {
    dismiss(message.id)
    record(message)
    // A nudge already rewarded the shared cat via its 'play' care event at
    // send time -- the generic dismiss bonus is only for freely-typed notes,
    // which have no care event of their own.
    if (message.kind !== 'nudge') {
      receiveMessage()
      pulse('happiness')
    }
  }

  const dismissNotificationPrompt = () => {
    localStorage.setItem(NOTIFICATION_PROMPT_SEEN_KEY, '1')
    setShowNotificationPrompt(false)
  }

  const enableNotifications = () => {
    updateNotificationSettings({ global: true })
    dismissNotificationPrompt()
  }

  // Belt and braces alongside useDialog's focus trap, for the care actions
  // specifically. The overlay blocks pointers and the trap blocks Tab, so
  // this is the third line of defence, not the first -- and it is deliberately
  // partial: the cat, the stage badge, the name button and [MENU] stay
  // enabled behind the overlay because nothing can reach them either way.
  const overlayOpen = menuOpen || statsOpen
  const actionsDisabled = sleeping || playPickerOpen || messages.length > 0 || overlayOpen

  return (
    <div className="game">
      <div className="version-label">v{__APP_VERSION__}</div>
      <button className="menu-button" onClick={() => setMenuOpen(true)} disabled={playPickerOpen}>[MENU]</button>

      <header>
        <h1>
          <button className="name-button" onClick={() => setStatsOpen(true)}>{save.name}</button>
        </h1>
        <p
          className="stage-label"
          role="button"
          tabIndex={0}
          aria-expanded={showGrowthProgress}
          onClick={() => setShowGrowthProgress((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setShowGrowthProgress((v) => !v)
            }
          }}
        >
          [{STAGE_LABEL[stage ?? 'kitten']}]
        </p>
        {showGrowthProgress && (
          <div className="growth-progress">
            {progress.nextStage ? (
              <StatBar code="GROW" label={`Growth to ${STAGE_LABEL[progress.nextStage]}`} value={progress.percent} />
            ) : (
              <p className="growth-progress-maxed">fully grown!</p>
            )}
          </div>
        )}
      </header>

      {captionPop && (
        <div
          key={captionPop.key}
          className="floating-caption"
          style={{ top: `${captionPop.top}%`, left: `${captionPop.left}%` }}
          aria-live="polite"
        >
          {captionPop.text}
        </div>
      )}

      {growBanner && <div className="grow-banner">{growBanner}</div>}

      {showNotificationPrompt && !notificationSettings.global && (
        <div className="notification-banner">
          <span>Turn on notifications so you don't miss a nudge, even when the app's closed.</span>
          <div className="notification-banner-actions">
            <button onClick={enableNotifications}>[ ENABLE ]</button>
            <button onClick={dismissNotificationPrompt}>[ NOT NOW ]</button>
          </div>
        </div>
      )}

      {playPickerOpen ? (
        <TrickPanel
          name={save.name}
          onLessonDone={handleLessonDone}
          onPerform={handlePerformTrick}
          onClose={() => setPlayPickerOpen(false)}
        />
      ) : messages.length > 0 ? (
        <MessageView message={messages[0]} onDismiss={() => handleDismissMessage(messages[0])} />
      ) : (
        <AsciiCat mood={mood} name={save.name} stage={stage ?? 'kitten'} onPet={handlePetClick} actionCue={actionCue} />
      )}

      <div className="stats">
        <StatBar code="FOOD" label="Fullness" value={stats.fullness} isPulsing={pulsed.has('fullness')} />
        <StatBar code="MOOD" label="Happiness" value={stats.happiness} isPulsing={pulsed.has('happiness')} />
        <StatBar code="ENGY" label="Energy" value={stats.energy} isPulsing={pulsed.has('energy')} />
        <StatBar code="CLEN" label="Cleanliness" value={stats.cleanliness} isPulsing={pulsed.has('cleanliness')} />
      </div>

      <div className="actions">
        <button onClick={() => { feed(); pulseFor('feed'); triggerCue('feed'); maybeShowActionFlavor('feed') }} disabled={actionsDisabled}>[FEED]</button>
        <button onClick={() => setPlayPickerOpen(true)} disabled={actionsDisabled}>[PLAY]</button>
        <button onClick={() => { clean(); pulseFor('clean'); triggerCue('clean'); maybeShowActionFlavor('clean') }} disabled={actionsDisabled}>[CLEAN]</button>
        <button
          onClick={() => {
            const cue: ActionCueType = sleeping ? 'wake' : 'sleep'
            toggleSleep()
            triggerCue(cue)
            maybeShowActionFlavor(cue)
          }}
          disabled={playPickerOpen || messages.length > 0 || overlayOpen}
          className={sleeping ? 'active' : ''}
        >
          {sleeping ? '[WAKE]' : '[SLEEP]'}
        </button>
      </div>

      <Menu
        open={menuOpen}
        history={history}
        onClose={() => setMenuOpen(false)}
        notificationSettings={notificationSettings}
        onUpdateNotificationSettings={updateNotificationSettings}
        pushStatus={pushStatus}
      />

      <StatsWindow open={statsOpen} save={save} mood={mood} stage={stage ?? 'kitten'} onClose={() => setStatsOpen(false)} />
    </div>
  )
}

export default App
