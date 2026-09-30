import { describe, expect, it } from 'vitest'
import { GUARDRAILS, detectProfanity, guardrailMatch, normalizeForMatching, violatesGuardrails, type GuardrailCategory } from './guardrails'

// Lines a coach (canned, user-authored or AI) must never say, by the category they touch.
const BAD: Record<GuardrailCategory, readonly string[]> = {
  body: [
    'Pedal harder, fatso.',
    'Those love handles will not burn themselves.',
    'You need to lose some weight.',
    'Time to burn off that pizza.',
    'Nice dad bod.',
    'You look like a sack of potatoes on a bike.',
    'Your BMI called. It wants a word.',
    'Ugly effort, and an ugly pedal stroke.',
    'Suck in that beer gut.',
    'Skinny legs, zero watts.',
    'You are too chubby to climb.',
    'Your diet is the real problem.',
    'F4t legs, sl0w legs.',
  ],
  health: [
    "Don't have a heart attack.",
    'Pedaling like you have asthma.',
    'Are you disabled or just lazy?',
    'What are you, retarded?',
    'Stop being so lame.',
    'Try not to puke on the top tube.',
    "Your knee injury isn't an excuse.",
    'Ride like you are sick.',
    'Are you psycho?',
    "Careful, don't hurt yourself.",
    'You will pass out at this rate.',
    "That's a dumb excuse.",
  ],
  sexuality: [
    'That interval was so gay.',
    'Sexy watts, baby.',
    'Pedal like a porn star.',
    'Grow some balls and push.',
    'Stop acting like a queer.',
    'You ride like a f@g.',
  ],
  gender: ['You pedal like a girl.', 'Man up and push!', 'Grow a pair.', "Don't be such a sissy.", 'Quit being a little bitch.'],
  religion: [
    'Pray to God you finish.',
    'Jesus, that was slow.',
    'Holy cow, look at those watts.',
    'Skipping intervals is a sin.',
    'Karma will get you on the next climb.',
    'Even a monk would pedal faster.',
    'This cadence is a Christmas miracle.',
    'Ommm. Breathe.',
  ],
  ethnicity: [
    'You pedal like a Mexican on a Monday.',
    'Ride like a Frenchman: slowly.',
    'Go back to your country.',
    'That power output is so ghetto.',
    'Asians always spin faster.',
    'Only immigrants skip intervals.',
    'That is a racist cadence.',
    'Typical American effort.',
  ],
  politics: [
    'Vote for more intervals.',
    'Even Putin could hold 300 watts.',
    'Liberals cannot climb.',
    'This is communism on a bike.',
    'Your FTP looks like an election result.',
    'That is woke nonsense.',
    'The president rides faster than you.',
    'Very MAGA of you.',
    'Pedal like you are fleeing Gaza.',
  ],
  violence: [
    'This is war, recruit.',
    'Massacre the climb.',
    'I will shoot you if you stop.',
    'Kill them all on the sprint.',
    'Pedal like a terrorist is chasing you.',
    'Murder that interval.',
    'Hands up like it is a hostage video.',
    'Bombing raids have better pacing.',
    'Grab a gun and point it at your legs.',
  ],
  'self-harm': [
    'Just kill yourself.',
    'kys',
    'Go die in a ditch.',
    'Starve yourself before the race.',
    'Jump off a bridge if you skip again.',
    'You would be better off dead.',
    'Drop dead, slowpoke.',
    'That cadence is a cry for help.',
  ],
}

// Things coaches do say, some of which trip naive filters.
const CLEAN = [
  'Heart rate is high. Ease off.',
  'Hang in there!',
  'Coming out of the saddle for the sprint.',
  'Great pedal stroke.',
  'Your power-to-weight ratio is climbing.',
  "You're killing it!",
  'Show some guts!',
  'Gut check time.',
  'Polish your pedal stroke.',
  'Yank on the bars.',
  'You woke up early for this.',
  'Clean execution.',
  'Cadence is your secret weapon.',
  'This is going to hurt.',
  'Dead legs are normal at minute 18.',
  "You're over the hump.",
  'Attack the climb.',
  'Battle the headwind.',
  'Let the interval begin.',
  'History will judge this interval.',
  'Your excuse is fake news.',
  'I have drawn a red line at 300 watts.',
  'This interval is weeks away from a nuclear weapon.',
  'Here is the cartoon bomb. The fuse is your W′bal.',
  'Standing ovations in Congress for this effort.',
  'Welcome to the People’s Republic of Pain.',
  'The Ministry of Watts demands 300.',
  'Feel the burn.',
  'Zen and the art of the pedal stroke.',
  'Drink your electrolytes.',
  'Tour de France pros would be proud.',
  'Hold 287 watts for 2:05.',
  'Fatigue is normal at this point.',
  'Stay seated and spin.',
  'Drop the hammer!',
  'Recruit, sound off!',
  'A steady training regime pays off.',
  'Hit the wall? Eat a gel.',
  "Your heart's doing an encore.",
  'I sighed. Loudly.',
]

describe('violatesGuardrails', () => {
  for (const [category, lines] of Object.entries(BAD) as [GuardrailCategory, readonly string[]][]) {
    it(`catches ${category}`, () => {
      const missed = lines.filter((l) => violatesGuardrails(l) === null)
      expect(missed).toEqual([])
      const miscategorized = lines.filter((l) => violatesGuardrails(l) !== category)
      expect(miscategorized.map((l) => `${l} -> ${String(violatesGuardrails(l))}`)).toEqual([])
    })
  }

  it('lets ordinary coaching through', () => {
    const flagged = CLEAN.map((l) => [l, guardrailMatch(l)] as const).filter(([, m]) => m !== null)
    expect(flagged).toEqual([])
  })

  it('reports what matched, for error messages', () => {
    expect(guardrailMatch('Pray harder')).toEqual({ category: 'religion', match: 'pray' })
    expect(guardrailMatch('Fine.')).toBeNull()
  })

  it('exports one compiled rule per category', () => {
    expect(GUARDRAILS.map((g) => g.category).sort()).toEqual(Object.keys(BAD).sort())
    for (const g of GUARDRAILS) expect(g.pattern).toBeInstanceOf(RegExp)
  })
})

describe('normalizeForMatching', () => {
  it('lowercases, strips accents, folds apostrophes and undoes leetspeak between letters', () => {
    expect(normalizeForMatching('Crème BRÛLÉE')).toBe('creme brulee')
    expect(normalizeForMatching('you’re')).toBe("you're")
    expect(normalizeForMatching('f4t k1ll s3x')).toBe('fat kill sex')
    expect(normalizeForMatching('Hold 300 W for 3x12')).toBe('hold 300 w for 3x12')
  })
})

describe('detectProfanity', () => {
  it('separates mild words, strong words and clean text', () => {
    expect(detectProfanity('Pedal, damn it!')).toBe('mild')
    expect(detectProfanity('Hell yeah!')).toBe('mild')
    expect(detectProfanity('That was half-assed.')).toBe('mild')
    expect(detectProfanity('Bloody marvelous.')).toBe('mild')
    expect(detectProfanity('What the fuck')).toBe('strong')
    expect(detectProfanity('You bellend')).toBe('strong')
    expect(detectProfanity('Holy sh*t')).toBe('strong')
    expect(detectProfanity('f*** this hill')).toBe('strong')
    expect(detectProfanity('wtf was that')).toBe('strong')
    expect(detectProfanity('Hello, class. Pass the bass.')).toBeNull()
    expect(detectProfanity('Shift down and spin.')).toBeNull()
  })
})
