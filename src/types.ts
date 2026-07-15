export interface PetStats {
  fullness: number
  happiness: number
  energy: number
  cleanliness: number
}

export type Mood = 'happy' | 'hungry' | 'tired' | 'dirty' | 'sad' | 'sleeping' | 'content'

export type Stage = 'kitten' | 'young' | 'adult'

export type ActionCueType = 'feed' | 'clean' | 'sleep' | 'wake'

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
}
