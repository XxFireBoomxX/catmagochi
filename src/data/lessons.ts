// The daily lesson: her mood for the day, the approach you pick, and what
// comes of it. See docs/superpowers/specs/2026-09-02-daily-trick-training-design.md.
//
// The mood is NOT usePet's `Mood` -- that one is derived from current stats
// and changes every five seconds. This one is derived from the calendar day
// and holds still, so reopening the app shows you the same cat you left.

// How she is today, for teaching purposes.
export type LessonMood = 'restless' | 'sleepy' | 'curious' | 'aloof' | 'playful' | 'hungry'

// How you go about it.
export type Approach = 'treat' | 'patience' | 'play'

export type Outcome = 'learned' | 'almost' | 'nothing'

// How well an approach suits a mood.
export type Weighting = 'best' | 'ok' | 'poor'

export const LESSON_MOODS: LessonMood[] = ['restless', 'sleepy', 'curious', 'aloof', 'playful', 'hungry']

// Order matters: rollOutcome walks these in sequence against the cumulative
// weight, so it has to stay best-to-worst.
export const OUTCOME_ORDER: Outcome[] = ['learned', 'almost', 'nothing']

// Sentence-case on purpose, like the nudge lines before them -- these read as
// things you do, not as system commands (see CLAUDE.md's visual theme note).
export const APPROACHES: { id: Approach; label: string }[] = [
  { id: 'treat', label: 'offer a treat' },
  { id: 'patience', label: 'wait quietly' },
  { id: 'play', label: 'wave the string first' },
]

export const LESSON_MOOD_LABEL: Record<LessonMood, string> = {
  restless: 'is restless',
  sleepy: 'is half asleep',
  curious: 'is investigating something',
  aloof: 'is pretending you are not here',
  playful: 'is in a silly mood',
  hungry: 'is extremely interested in the kitchen',
}

export const MOOD_INTRO: Record<LessonMood, string[]> = {
  restless: [
    'She has already been up and down the hallway twice.',
    'Her tail will not stop moving.',
    'She keeps starting to settle and then thinking better of it.',
  ],
  sleepy: [
    'One eye is open. Barely.',
    'She is warm, folded up, and not going anywhere.',
    'She yawns at you, slowly, on purpose.',
  ],
  curious: [
    'Something behind the sofa has her full attention.',
    'She is inspecting a corner of the room with great seriousness.',
    'She noticed a sound ten minutes ago and has not let it go.',
  ],
  aloof: [
    'She is sitting with her back to you. Deliberately.',
    'You exist, technically, in a way she is choosing not to acknowledge.',
    'She looks past your shoulder as though something better is there.',
  ],
  playful: [
    'She is crouched behind the chair leg, waiting to ambush nothing.',
    'She keeps pouncing on her own tail and losing.',
    'Everything on the floor is a target today.',
  ],
  hungry: [
    'She has walked to the food bowl and back four times.',
    'She is looking at you, then the cupboard, then you.',
    'Every word you say sounds like dinner to her right now.',
  ],
}

// {trick} is replaced with the name of the trick being taught, so a line can
// be specific without needing one written per mood-approach-trick triple.
export const APPROACH_OUTCOME: Record<Approach, Record<Outcome, string[]>> = {
  treat: {
    learned: [
      'She works out that the treat comes after the {trick}, and does it.',
      'One treat, held just so, and there it is: {trick}, no argument.',
      'She would do almost anything for this, and today that includes {trick}.',
    ],
    almost: [
      'She goes halfway to a {trick}, then tries to take the treat early.',
      'She does something adjacent to {trick} and looks for payment anyway.',
      'The treat holds her attention. The {trick} does not, quite.',
    ],
    nothing: [
      'She takes the treat. She does not do the {trick}. She had no plans to.',
      'She eats, blinks at you, and walks off mid-lesson.',
      'The treat is gone and nothing has been learned, by either of you.',
    ],
  },
  patience: {
    learned: [
      'You wait. She works it out on her own, and the {trick} arrives.',
      'Nothing happens for a long moment, and then a perfectly good {trick}.',
      'She decides in her own time that {trick} is worth doing.',
    ],
    almost: [
      'She thinks about it for a long while, then very nearly does a {trick}.',
      'You wait her out and get most of a {trick} for your trouble.',
      'Almost. She holds the shape of a {trick} for about half a second.',
    ],
    nothing: [
      'You wait. She waits. She wins.',
      'She holds your gaze for a full minute and does absolutely nothing.',
      'She falls asleep before the lesson goes anywhere.',
    ],
  },
  play: {
    learned: [
      'The string wears her out just enough, and then: {trick}, first try.',
      'She chases the string, then turns around and offers a {trick} unprompted.',
      'Play first, work after. She does the {trick} like it was her idea.',
    ],
    almost: [
      'She is too wound up to finish, but there was a {trick} in there somewhere.',
      'Halfway to a {trick}, then the string is more interesting again.',
      'She attempts a {trick} at speed and overshoots it entirely.',
    ],
    nothing: [
      'The string wins. The lesson does not happen.',
      'She plays happily for a while and then ambushes your foot instead.',
      'She is far too excited to learn anything at all right now.',
    ],
  },
}

// Each mood has one best, one ok and one poor approach, and each approach is
// best for exactly two moods -- so there is no globally correct answer to
// settle into. Enforced by lessons.test.ts.
export const ODDS: Record<LessonMood, Record<Approach, Weighting>> = {
  restless: { play: 'best', treat: 'ok', patience: 'poor' },
  sleepy: { patience: 'best', treat: 'ok', play: 'poor' },
  curious: { patience: 'best', play: 'ok', treat: 'poor' },
  aloof: { treat: 'best', patience: 'ok', play: 'poor' },
  playful: { play: 'best', treat: 'ok', patience: 'poor' },
  hungry: { treat: 'best', play: 'ok', patience: 'poor' },
}

export const OUTCOME_WEIGHTS: Record<Weighting, Record<Outcome, number>> = {
  best: { learned: 0.55, almost: 0.35, nothing: 0.1 },
  ok: { learned: 0.25, almost: 0.45, nothing: 0.3 },
  poor: { learned: 0.1, almost: 0.35, nothing: 0.55 },
}

export const OUTCOME_POINTS: Record<Outcome, number> = {
  learned: 2,
  almost: 1,
  nothing: 0,
}

// Deterministic from the calendar day so the mood holds still while you look
// at it. A plain multiply-and-mod hash: this only has to spread six moods
// across consecutive dates, not resist anything.
export function lessonMoodForDay(dayKey: string): LessonMood {
  let hash = 0
  for (let i = 0; i < dayKey.length; i++) {
    hash = (hash * 31 + dayKey.charCodeAt(i)) % 100_000
  }
  return LESSON_MOODS[hash % LESSON_MOODS.length]
}

// Fills {name} and {trick} in a line. Kept here rather than inline in the
// panel so tests can build the exact string a line renders to.
export function fillLine(line: string, vars: { name: string; trick: string }): string {
  return line.replaceAll('{name}', vars.name).replaceAll('{trick}', vars.trick)
}

// `roll` is a number in [0, 1) supplied by the caller rather than read from
// Math.random() here, so the odds table can be tested without stubbing a
// global -- and so a single lesson's roll is visible at its call site.
export function rollOutcome(mood: LessonMood, approach: Approach, roll: number): Outcome {
  const weights = OUTCOME_WEIGHTS[ODDS[mood][approach]]
  let cumulative = 0
  for (const outcome of OUTCOME_ORDER) {
    cumulative += weights[outcome]
    if (roll < cumulative) return outcome
  }
  return 'nothing'
}
