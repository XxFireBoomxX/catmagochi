export interface PetStats {
  fullness: number
  happiness: number
  energy: number
  cleanliness: number
}

export type Mood = 'happy' | 'hungry' | 'tired' | 'dirty' | 'sad' | 'sleeping' | 'content'

export type Stage = 'kitten' | 'young' | 'adult'

export type ActionCueType = 'feed' | 'clean' | 'sleep' | 'wake' | 'play'

// The subset of care actions that sync between devices for the shared-pet
// feature -- deliberately excludes sleep/wake, which stay per-device (see
// usePet.ts).
export type CareEventType = 'feed' | 'clean' | 'pet' | 'play'

export interface PetSave {
  name: string
  stats: PetStats
  sleeping: boolean
  lastUpdate: number
  growth: number
  adoptedAt: number
  totalFeeds: number
  totalPlays: number
  totalCleans: number
  totalPets: number
}

export interface RelayMessage {
  id: string
  text: string
  sentAt: number
  // Present for a canned "PLAY" nudge. Nothing in this app sends one any
  // more -- [PLAY] is a trick lesson now -- but a relay may still hold
  // nudge-kind messages sent by an older build, and the dismiss handler
  // skips the generic receiveMessage() bonus for them, since those already
  // rewarded the shared cat via the 'play' care event at send time.
  kind?: 'nudge'
}
