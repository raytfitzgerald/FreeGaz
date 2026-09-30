// Before the rider's first ride of the week, another coach laps the Home
// velodrome and the rider's own coach yells at them (and at the rider) from
// the infield. Rivals are the character coaches only: the parodies of real
// people never appear as someone else's rival, and never get one of them.
// The lines are clean at every language setting.

export const RIVAL_POOL = ['drill-sergeant', 'roast-comic', 'disappointed-dad', 'the-overlord', 'hype-coach', 'data-nerd', 'zen', 'professional'] as const

const TAUNTS: Readonly<Record<string, readonly string[]>> = {
  'drill-sergeant': [
    'Look at {rival}, lapping my track while you sit there. On the bike, recruit!',
    '{rival}! Pick those knees up! And you, recruit: saddle. Now.',
    'Even {rival} showed up today. What is your excuse, recruit?',
  ],
  'roast-comic': [
    '{rival} is out there doing laps. Somebody has to, apparently.',
    'Hey {rival}, slow down, you are making my rider look bad. Well, worse.',
    'The track has {rival} on it and you on the couch. Great crowd tonight.',
  ],
  'disappointed-dad': [
    "{rival} is out there riding. I'm not saying anything. I'm just saying.",
    "{rival}, you're doing great. See? That's what it looks like.",
    'I set that trainer up for you, and {rival} is the one using it.',
  ],
  'the-overlord': [
    '{rival} is lapping the People\'s Velodrome. You are not. This has been noted.',
    'Faster, {rival}. The Ministry of Watts is watching. You too, citizen: to your bike.',
    '{rival} has met today\'s quota. Where is yours?',
  ],
  'hype-coach': [
    "LOOK AT {rival} GO! You could be out there too! Let's GOOO!",
    '{rival} is crushing it! Your turn next, champ!',
    'Huge laps from {rival}! Imagine what YOU could do out there!',
  ],
  'data-nerd': [
    '{rival} has logged more laps this week than you. I have a chart.',
    'Your rides this week: zero. {rival}: several. Statistically, you should ride.',
    'Nice cadence, {rival}. Yours is currently undefined.',
  ],
  zen: [
    '{rival} circles the track like a passing thought. You could join them.',
    'Watch {rival} ride. Notice the bike is waiting for you, too.',
    '{rival} has found the present moment. It has pedals.',
  ],
  professional: [
    '{rival} is getting a session in. Ready when you are.',
    'Good pace, {rival}. Your bike is set up whenever you want to start.',
  ],
  bibi: [
    'Ladies and gentlemen, {rival} is on the track. You, my friend, are not. This is a red line.',
    'I have a chart. On it, {rival} has laps. You have none. Get on the bike.',
  ],
  trump: [
    '{rival} is riding. Tremendous laps, very good. You? Zero laps. Sad. Get on the bike.',
    'Everybody is saying {rival} does great laps. Where are yours? Believe me, you can do better.',
  ],
}

const GENERIC = ['{rival} is already on the track. Your bike is waiting.', 'Look who is doing laps: {rival}. Your turn.']

/** Another character coach to lap the track: never the rider's own coach. */
export function pickRival(personaId: string, rng: () => number = Math.random): string {
  const pool = RIVAL_POOL.filter((id) => id !== personaId)
  return pool[Math.floor(rng() * pool.length) % pool.length]!
}

/** What the rider's coach yells at the rival (and the rider). */
export function rivalTaunt(personaId: string, rivalName: string, rng: () => number = Math.random): string {
  const lines = TAUNTS[personaId] ?? GENERIC
  return lines[Math.floor(rng() * lines.length) % lines.length]!.replaceAll('{rival}', rivalName)
}

/** Every taunt a persona has (for tests). */
export function allTaunts(personaId: string): readonly string[] {
  return TAUNTS[personaId] ?? GENERIC
}
