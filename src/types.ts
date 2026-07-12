export interface PetStats {
  fullness: number
  happiness: number
  energy: number
  cleanliness: number
}

export type Mood = 'happy' | 'hungry' | 'tired' | 'dirty' | 'sad' | 'sleeping' | 'content'

export type Stage = 'kitten' | 'young' | 'adult'

export interface PetSave {
  name: string
  stats: PetStats
  sleeping: boolean
  lastUpdate: number
  growth: number
}

export interface RelayMessage {
  id: string
  text: string
  sentAt: number
}
