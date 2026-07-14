import { useEffect, useRef, useState } from 'react'
import { AsciiCat } from './components/AsciiCat'
import { YarnGame } from './components/YarnGame'
import { MessageView } from './components/MessageView'
import { Menu } from './components/Menu'
import { StatBar } from './components/StatBar'
import { usePet } from './hooks/usePet'
import { useFlavorText } from './hooks/useFlavorText'
import { useMessages } from './hooks/useMessages'
import { useMessageHistory } from './hooks/useMessageHistory'
import { deriveStage, GROW_MESSAGE, STAGE_LABEL } from './data/growth'
import type { PetStats, RelayMessage, Stage } from './types'
import './App.css'

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
  const { save, mood, createPet, feed, playGame, clean, toggleSleep, pet, receiveMessage } = usePet()
  const { messages, dismiss } = useMessages()
  const { history, record } = useMessageHistory()
  const [pulsed, setPulsed] = useState<Set<keyof PetStats>>(new Set())
  const [gameActive, setGameActive] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [growBanner, setGrowBanner] = useState<string | null>(null)
  const flavorText = useFlavorText(mood)
  const prevStage = useRef<Stage | null>(null)
  const stage = save ? deriveStage(save.growth) : null

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

  if (!save) {
    return <NameScreen onCreate={createPet} />
  }

  const { stats, sleeping } = save

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

  const handleGameComplete = (hits: number) => {
    playGame(hits)
    pulse('happiness')
    pulse('energy')
    pulse('fullness')
    pulse('cleanliness')
    setGameActive(false)
  }

  const handleDismissMessage = (message: RelayMessage) => {
    dismiss(message.id)
    record(message)
    receiveMessage()
    pulse('happiness')
  }

  const actionsDisabled = sleeping || gameActive || messages.length > 0

  return (
    <div className="game">
      <div className="version-label">v{__APP_VERSION__}</div>
      <button className="menu-button" onClick={() => setMenuOpen(true)} disabled={gameActive}>[MENU]</button>

      <header>
        <h1>{save.name}</h1>
        <p className="mood-label">{save.name} {flavorText}</p>
        <p className="stage-label">[{STAGE_LABEL[stage ?? 'kitten']}]</p>
      </header>

      {growBanner && <div className="grow-banner">{growBanner}</div>}

      {gameActive ? (
        <YarnGame onComplete={handleGameComplete} />
      ) : messages.length > 0 ? (
        <MessageView message={messages[0]} onDismiss={() => handleDismissMessage(messages[0])} />
      ) : (
        <AsciiCat mood={mood} name={save.name} stage={stage ?? 'kitten'} onPet={pet} />
      )}

      <div className="stats">
        <StatBar code="FOOD" label="Fullness" value={stats.fullness} isPulsing={pulsed.has('fullness')} />
        <StatBar code="MOOD" label="Happiness" value={stats.happiness} isPulsing={pulsed.has('happiness')} />
        <StatBar code="ENGY" label="Energy" value={stats.energy} isPulsing={pulsed.has('energy')} />
        <StatBar code="CLEN" label="Cleanliness" value={stats.cleanliness} isPulsing={pulsed.has('cleanliness')} />
      </div>

      <div className="actions">
        <button onClick={() => { feed(); pulse('fullness') }} disabled={actionsDisabled}>[FEED]</button>
        <button onClick={() => setGameActive(true)} disabled={actionsDisabled}>[PLAY]</button>
        <button onClick={() => { clean(); pulse('cleanliness') }} disabled={actionsDisabled}>[CLEAN]</button>
        <button onClick={toggleSleep} disabled={gameActive || messages.length > 0} className={sleeping ? 'active' : ''}>
          {sleeping ? '[WAKE]' : '[SLEEP]'}
        </button>
      </div>

      <Menu open={menuOpen} history={history} onClose={() => setMenuOpen(false)} />
    </div>
  )
}

export default App
