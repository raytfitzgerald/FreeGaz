// The built-in workout library. Every workout here is original to FreeGaz and
// written in the text syntax (io/intervals-text.ts), parsed once at module
// load: the library doubles as a test of the syntax. The texts are fixed, so
// a parse error is a bug caught by builtins.test.ts, and loading throws on
// one rather than shipping a half-parsed workout.
//
// Treat these workouts as read-only; structuredClone one before editing it.

import { parseIntervalsText } from './io/intervals-text'
import type { Workout } from './model'

interface BuiltinSpec {
  slug: string
  name: string
  tags: string[]
  description: string
  text: string
}

const WARMUP_OPENERS = `Warm-up
- 10m warmup 45-75%
- 30s 110%
- 1m30s 55%
- 30s 110%
- 3m30s 55%`

const SPECS: BuiltinSpec[] = [
  {
    slug: 'recovery-spin-30',
    name: 'Recovery Spin 30',
    tags: ['recovery'],
    description:
      'An easy half hour to flush out a hard day. Keep it truly easy: light pressure, relaxed breathing and a few minutes of quicker spinning.',
    text: `Easy start
- 5m warmup 40-55%

Spin
- 8m 52% 90rpm
- 2m 50% 100rpm
- 8m 52% 90rpm
- 2m 50% 100rpm

Wind down
- 5m cooldown 50-40%`,
  },
  {
    slug: 'endurance-45',
    name: 'Endurance 45',
    tags: ['endurance'],
    description:
      'A steady Zone 2 ride for aerobic base when time is short. Stay conversational; the short cadence lift in the middle keeps the pedal stroke honest.',
    text: `Warm-up
- 8m warmup 45-65%

Endurance
- 15m 68% 88rpm
- 2m 68% 100rpm
- 15m 70% 88rpm

Cool-down
- 5m cooldown 60-42%`,
  },
  {
    slug: 'endurance-60',
    name: 'Endurance 60',
    tags: ['endurance'],
    description:
      'One hour of classic Zone 2, the bread and butter of base training. Ride at a pace you could chat at, with the middle block at a quicker cadence.',
    text: `Warm-up
- 10m warmup 45-68%

Endurance
- 15m 68%
- 15m 70% 95rpm
- 15m 68%

Cool-down
- 5m cooldown 60-42%`,
  },
  {
    slug: 'endurance-90',
    name: 'Endurance 90',
    tags: ['endurance'],
    description:
      'Ninety minutes of steady aerobic work in the upper half of Zone 2. Eat and drink early, and use the two short spin-ups to reset your position.',
    text: `Warm-up
- 10m warmup 45-68%

Endurance
- 25m 68-72%
- 2m 60% 100rpm
- 25m 68-72%
- 2m 60% 100rpm
- 18m 70%

Cool-down
- 8m cooldown 62-45%`,
  },
  {
    slug: 'endurance-120',
    name: 'Endurance 120',
    tags: ['endurance'],
    description:
      'Two hours in Zone 2 for long-ride durability. Settle in, fuel every 20 to 30 minutes, and treat each spin-up as a chance to stand and stretch.',
    text: `Warm-up
- 10m warmup 45-68%

Endurance 4x
- 22m 68-72%
- 3m 62% 100rpm

Cool-down
- 10m cooldown 62-42%`,
  },
  {
    slug: 'endurance-surges-60',
    name: 'Endurance with Surges',
    tags: ['endurance'],
    description:
      'An hour of Zone 2 with a 30-second surge every eight minutes. The surges practise changes of pace; drop straight back to easy endurance after each one.',
    text: `Warm-up
- 10m warmup 45-68%

Surges 5x
- 7m30s 68%
- Surge 30s 110% 100rpm

- 5m 66%

Cool-down
- 5m cooldown 60-42%`,
  },
  {
    slug: 'tempo-2x20',
    name: 'Tempo 2×20',
    tags: ['tempo'],
    description:
      'Two 20-minute tempo blocks: comfortably hard, with full sentences getting difficult. Stay seated and smooth.',
    text: `Warm-up
- 10m warmup 45-72%
- 2m 55%

Tempo 2x
- 20m 80-85% 88rpm
- 5m 55%

Cool-down
- 8m cooldown 60-42%`,
  },
  {
    slug: 'tempo-3x15',
    name: 'Tempo 3×15',
    tags: ['tempo'],
    description:
      'Three 15-minute tempo blocks that build muscular endurance without the sting of threshold work. Pick a cadence you could hold all day.',
    text: `Warm-up
- 10m warmup 45-72%
- 2m 55%

Tempo 3x
- 15m 82-87%
- 4m 55%

Cool-down
- 6m cooldown 60-42%`,
  },
  {
    slug: 'low-cadence-5x5',
    name: 'Low-Cadence Strength 5×5',
    tags: ['tempo', 'strength'],
    description:
      'Five 5-minute tempo efforts at 60 rpm to build pedalling strength. Stay seated with a quiet upper body, and raise the cadence if your knees complain.',
    text: `Warm-up
- 10m warmup 45-72%
- 2m 55% 90rpm

Big gear 5x
- 5m 85% 60rpm
- 3m 55% 90rpm

Cool-down
- 8m cooldown 60-42%`,
  },
  {
    slug: 'sweet-spot-3x12',
    name: 'Sweet Spot 3×12',
    tags: ['sweet-spot'],
    description:
      'Three 12-minute efforts just under threshold: a lot of fitness for a manageable cost. Finish each block feeling you had another minute in you.',
    text: `Warm-up
- 10m warmup 45-75%
- 2m 55%

Sweet spot 3x
- 12m 88-92%
- 4m 55%

Cool-down
- 5m cooldown 60-42%`,
  },
  {
    slug: 'sweet-spot-3x15',
    name: 'Sweet Spot 3×15',
    tags: ['sweet-spot'],
    description:
      'Three 15-minute blocks at 88–93 % FTP. Settle into a rhythm early and hold the power steady rather than chasing the top of the range.',
    text: `Warm-up
- 10m warmup 45-75%
- 3m 55%

Sweet spot 3x
- 15m 88-93%
- 5m 55%

Cool-down
- 7m cooldown 60-42%`,
  },
  {
    slug: 'sweet-spot-2x20',
    name: 'Sweet Spot 2×20',
    tags: ['sweet-spot'],
    description:
      'Two long sweet spot blocks for sustained power. The second 20 is where the work happens: keep the upper body relaxed and breathe deep.',
    text: `Warm-up
- 10m warmup 45-75%
- 2m 55%

Sweet spot 2x
- 20m 88-92%
- 5m 55%

Cool-down
- 8m cooldown 60-42%`,
  },
  {
    slug: 'sweet-spot-4x10-cadence',
    name: 'Sweet Spot 4×10 Cadence Mix',
    tags: ['sweet-spot', 'cadence'],
    description:
      'Four 10-minute sweet spot blocks that change cadence as you go: seated at 85, quick at 100, then a grind at 70. Keep the power steady through every switch.',
    text: `Warm-up
- 10m warmup 45-75%
- 2m 55%

4x
- Seated 4m 89% 85rpm
- Spin 3m 89% 100rpm
- Grind 3m 89% 70rpm
- Recover 3m 55%

Cool-down
- 6m cooldown 60-42%`,
  },
  {
    slug: 'threshold-2x15',
    name: 'Threshold 2×15',
    tags: ['threshold'],
    description:
      'Two 15-minute efforts right at FTP. Start at the low end of the range, find a rhythm, and finish the second one strong.',
    text: `Warm-up
- 10m warmup 45-75%
- 1m 100%
- 3m 55%

Threshold 2x
- 15m 97-100%
- 6m 55%

Cool-down
- 9m cooldown 60-42%`,
  },
  {
    slug: 'threshold-3x10',
    name: 'Threshold 3×10',
    tags: ['threshold'],
    description:
      'Three 10-minute blocks at threshold, a good way into FTP work. Even pacing matters more than a big start.',
    text: `Warm-up
- 10m warmup 45-75%
- 1m 100%
- 3m 55%

Threshold 3x
- 10m 98-102%
- 5m 55%

Cool-down
- 6m cooldown 60-42%`,
  },
  {
    slug: 'threshold-2x20',
    name: 'Threshold 2×20',
    tags: ['threshold'],
    description:
      'The benchmark threshold session: two 20-minute efforts at 95–100 % FTP. If the first feels easy, resist raising it; the second will tell the truth.',
    text: `Warm-up
- 10m warmup 45-75%
- 1m 100%
- 3m 55%

Threshold 2x
- 20m 95-100%
- 6m 55%

Cool-down
- 9m cooldown 60-42%`,
  },
  {
    slug: 'over-unders-3x9',
    name: 'Over-Unders 3×9',
    tags: ['threshold'],
    description:
      'Three sets of three over-unders: two minutes just under FTP, one just over. It teaches you to clear fatigue while still working; stay seated through the switches.',
    text: `Warm-up
- 10m warmup 45-75%
- 1m 100%
- 4m 55%

Set one 3x
- Under 2m 95%
- Over 1m 105%

Recover
- 5m 55%

Set two 3x
- Under 2m 95%
- Over 1m 105%

Recover
- 5m 55%

Set three 3x
- Under 2m 95%
- Over 1m 105%

Cool-down
- 8m cooldown 60-42%`,
  },
  {
    slug: 'pyramid',
    name: 'Pyramid',
    tags: ['threshold', 'vo2max'],
    description:
      'Efforts that grow from one to four minutes and back, easing from 105 % toward threshold as they lengthen. Rest matches the work, so the top of the pyramid is the crux.',
    text: `Warm-up
- 10m warmup 45-72%
- 2m 55%

Pyramid
- 1m 105%
- 1m 55%
- 2m 102%
- 2m 55%
- 3m 100%
- 3m 55%
- 4m 98%
- 4m 55%
- 3m 100%
- 3m 55%
- 2m 102%
- 2m 55%
- 1m 105%

Cool-down
- 7m cooldown 60-42%`,
  },
  {
    slug: 'vo2max-5x4',
    name: 'VO2 Max 5×4',
    tags: ['vo2max'],
    description:
      'Five 4-minute efforts at 115 % FTP with equal recovery. Get up to power quickly, then hold on; breathing should be deep and hard by the end of each rep.',
    text: `${WARMUP_OPENERS}

VO2 max 5x
- 4m 115% 95rpm
- 4m 50%

Cool-down
- 9m cooldown 60-42%`,
  },
  {
    slug: 'vo2max-6x3',
    name: 'VO2 Max 6×3',
    tags: ['vo2max'],
    description:
      'Six 3-minute efforts at 118 % FTP. Shorter reps let you go a little higher; keep the cadence up and save something for the last two.',
    text: `${WARMUP_OPENERS}

VO2 max 6x
- 3m 118% 95rpm
- 3m 50%

Cool-down
- 8m cooldown 60-42%`,
  },
  {
    slug: 'thirty-thirties',
    name: '30/30s × 2 Sets',
    tags: ['vo2max'],
    description:
      'Two sets of ten 30-second surges with 30 seconds easy between. The work adds up to real VO2 max time without long, grim reps; spin fast on the easy half.',
    text: `Warm-up
- 10m warmup 45-75%
- 5m 60%

Set one 10x
- 30s 125%
- 30s 50%

Recover
- 8m 55%

Set two 10x
- 30s 125%
- 30s 50%

Cool-down
- 7m cooldown 60-42%`,
  },
  {
    slug: 'forty-twenties',
    name: '40/20s',
    tags: ['vo2max'],
    description:
      'Three blocks of eight 40-second efforts with only 20 seconds to recover. The short rests keep oxygen demand high; pace the first reps so the last ones still hit the target.',
    text: `Warm-up
- 12m warmup 45-75%
- 5m 60%

Block one 8x
- 40s 120%
- 20s 50%

Recover
- 5m 55%

Block two 8x
- 40s 120%
- 20s 50%

Recover
- 5m 55%

Block three 8x
- 40s 120%
- 20s 50%

Cool-down
- 9m cooldown 60-42%`,
  },
  {
    slug: 'ronnestad-30-15',
    name: 'Rønnestad-Style 30/15s 3×13',
    tags: ['vo2max'],
    description:
      'Three series of thirteen 30-second efforts with 15-second recoveries, after the protocol in the research of Bent Rønnestad. It keeps you near VO2 max for longer than classic intervals; hold the target, not more.',
    text: `Warm-up
- 12m warmup 45-75%
- 3m 60%

Series one 13x
- 30s 120%
- 15s 50%

Recover
- 3m 50%

Series two 13x
- 30s 120%
- 15s 50%

Recover
- 3m 50%

Series three 13x
- 30s 120%
- 15s 50%

Cool-down
- 9m45s cooldown 60-42%`,
  },
  {
    slug: 'anaerobic-8x1',
    name: 'Anaerobic 8×1',
    tags: ['anaerobic'],
    description:
      'Eight one-minute efforts at 130 % FTP with generous recovery. It builds the ability to go deep and come back; expect the last 20 seconds of each to hurt.',
    text: `Warm-up
- 12m warmup 45-75%
- 3m 60%

Anaerobic 8x
- 1m 130% 100rpm
- 3m 45%

Cool-down
- 8m cooldown 55-40%`,
  },
  {
    slug: 'sprints-6x15',
    name: 'Sprints 6×15s',
    tags: ['sprint'],
    description:
      'Six all-out 15-second sprints with nearly five minutes easy between them. ERG switches off for each sprint, so pick a big gear and go; full recovery keeps the quality high.',
    text: `Warm-up
- 12m warmup 45-72%
- 3m 60% 100rpm

6x
- Sprint 15s max
- Easy 4m45s 45%

Cool-down
- 10m cooldown 55-40%`,
  },
  {
    slug: 'race-openers',
    name: 'Race Openers',
    tags: ['openers'],
    description:
      'A short session to wake up before an event without tiring you: three one-minute efforts just over threshold and three short kicks. Ride it the day before or the morning of.',
    text: `Warm-up
- 10m warmup 45-70%

Openers 3x
- 1m 105%
- 2m 55%

3x
- Kick 10s max
- Easy 1m50s 50%

Cool-down
- 5m cooldown 55-40%`,
  },
  {
    slug: 'cadence-drills',
    name: 'Cadence Drills',
    tags: ['endurance', 'cadence'],
    description:
      'Endurance power with the cadence doing the work: a ladder from 85 to 115 rpm and short spin-ups at 120. Stay quiet on the saddle; if you bounce, ease the cadence back.',
    text: `Warm-up
- 10m warmup 45-65% 90rpm

Ladder 4x
- 2m 68% 95rpm
- 2m 68% 105rpm
- 1m 65% 115rpm
- 2m 62% 85rpm

Spin-ups 4x
- 30s 60% 120rpm
- 1m30s 55% 90rpm

Steady
- 4m 65% 90rpm

Cool-down
- 5m cooldown 60-45%`,
  },
  {
    slug: 'roast-me',
    name: 'Roast Me',
    tags: ['threshold', 'vo2max', 'fun'],
    description:
      'A hard-but-fair threshold session narrated by a coach who has heard every excuse. Four 5-minute efforts just over FTP and a short finisher; the jokes are about your effort, never about you.',
    text: `Warm-up
- 10m warmup 45-75%
  > 0s Oh, you actually showed up. Bold.
  > 5m This is the easy part. Treasure it.
- 3m 55%
  > 0s Three easy minutes. Savor them; they're about to be taken away.

Main event 4x
> 0s Four rounds of five minutes at 105 %. The fan is not coming to save you.
> 2m30s Cadence check: above 85, please. This is not a tractor pull.
> 8m One down. Only three more servings of regret.
> 16m Halfway. Your excuses are already warming up.
> 24m Last one. Pretend someone is watching. Someone is: me.
- 5m 105% 90rpm
- 3m 50%

Finisher 3x
> 0s Three 30-second punches. You did say you wanted to get faster.
- 30s 150%
- 30s 50%

Cool-down
- 7m cooldown 60-40%
  > 0s Done. I'm almost impressed. Almost.
  > 5m Same time next week? I'll bring new material.`,
  },
  // For adults, with a sense of humour: the charts are the jokes, and the cues
  // swear (the ride screen masks them to match the rider's language setting).
  {
    slug: 'the-bird',
    name: 'The Bird',
    tags: ['vo2max',  'fun'],
    description:
      'Open the power chart and look at it: four knuckles at threshold and one tall, proud middle finger at 150 % FTP. Ride it for everyone who ever charged you a monthly fee to pedal in your own garage.',
    text: `Warm-up
- 10m warmup 45-70%
  > 0s Warm up those fingers, you magnificent bastard.
  > 8m Almost time to tell the world how you really feel.
- 3m 55%

- Thumb 3m 80%
  > 0s Thumb first. Nobody notices the thumb. Keep it steady.
- Between fingers 30s 50%
- Index finger 3m 100%
- Between fingers 30s 50%

The finger
- 45s 130%
  > 0s Here it comes. Raise the fucking finger.
- 1m30s 150%
  > 0s Fingertip. 150 %. Point it straight at your problems.
- 45s 130%

- Between fingers 30s 50%
- Ring finger 3m 100%
- Between fingers 30s 50%
- Pinky 2m 90%
  > 0s Pinky out, classy as hell. You just flipped off an entire subscription economy.
- 6m 50%
  > 0s Hold that pose. Admire your work in the chart.

Cool-down
- 7m cooldown 60-40%
  > 0s Done. That was the most honest ride of your life.`,
  },
  {
    slug: 'both-barrels',
    name: 'Both Barrels',
    tags: ['vo2max',  'fun'],
    description:
      'Two hands, two middle fingers, and the second one is taller because you meant it more. A VO2max session disguised as a very rude chart.',
    text: `Warm-up
- 10m warmup 45-70%
  > 0s One bird is a gesture. Two birds is a lifestyle.
- 3m 55%

- Thumb 3m 80%
  > 0s Left hand. The polite one. Relatively.
- Between fingers 30s 50%
- Index finger 3m 100%
- Between fingers 30s 50%

The finger
- 45s 130%
  > 0s First finger up. Aim it at your alarm clock.
- 1m30s 145%
  > 0s Hold it. 145 %. Your neighbours can feel this.
- 45s 130%

- Between fingers 30s 50%
- Ring finger 3m 100%
- Between fingers 30s 50%
- Pinky 2m 90%
  > 0s One down. The other hand is jealous.
- 6m 50%
  > 0s Shake it out. Reload.
- Thumb 3m 80%
  > 0s Right hand. The one that means it.
- Between fingers 30s 50%
- Index finger 3m 100%
- Between fingers 30s 50%

The finger
- 45s 130%
  > 0s Second finger. Taller, angrier, better.
- 1m30s 160%
  > 0s 160 %. This one is for whoever invented the Tuesday meeting. Fuck them in particular.
- 45s 130%

- Between fingers 30s 50%
- Ring finger 3m 100%
- Between fingers 30s 50%
- Pinky 2m 90%
  > 0s That's two. Frame this chart.
- 6m 50%

Cool-down
- 7m cooldown 60-40%
  > 0s Both barrels emptied. You are free now.`,
  },
  {
    slug: 'mount-stupid',
    name: 'Mount Stupid',
    tags: ['threshold',  'fun'],
    description:
      'The Dunning-Kruger curve as a workout: a fast climb to peak confidence, a crash into the valley of despair, then the long slope of actually knowing what you are doing. Accurate to within a few watts.',
    text: `Peak of confidence
- 5m warmup 50-65%
  > 0s You have ridden a bike before. How hard can this be?
- 3m ramp 70-120%
  > 0s Climbing Mount Stupid. You are a natural. Everyone says so.
- 2m 120%
  > 0s Top of the mountain. You should start a cycling podcast.

- Valley of despair 12m 45%
  > 0s Oh no. Oh shit. It turns out you knew nothing.
  > 6m Rock bottom. Great view of your own ignorance from down here.
- Slope of enlightenment 20m ramp 60-95%
  > 0s Slowly, painfully, you start to understand things.
  > 10m Look at you, learning. Humility is a hell of a drug.
- Plateau of sustainability 12m 92%
  > 0s Welcome to competence. It is less fun than Mount Stupid, but it pays better.
- Cool-down 6m cooldown 60-40%
  > 0s Congratulations, you are now wise enough to know how little you know.`,
  },
  {
    slug: 'stairway-to-hell',
    name: 'Stairway to Hell',
    tags: ['threshold',  'fun'],
    description:
      'Nine steps up, 3 minutes each, from easy to well past threshold, and then the stairs simply end. There is no landing.',
    text: `- Warm-up 8m warmup 45-65%
  > 0s Welcome to the stairwell. The elevator is out of order. Forever.
- Step 1 3m 60%
  > 0s Step one. This is fine.
- Step 2 3m 66%
- Step 3 3m 72%
  > 0s Nice and easy. Suspiciously easy.
- Step 4 3m 78%
- Step 5 3m 84%
  > 0s Halfway up. It is getting warm in here. Wonder why.
- Step 6 3m 90%
- Step 7 3m 96%
  > 0s Is that sulfur? That smells like sulfur.
- Step 8 3m 102%
  > 0s Threshold. The devil is holding the door open for you.
- Step 9 3m 110%
  > 0s Top step. There is no landing. Just keep fucking climbing.
- The fall 7m 45%
  > 0s And... you fall. All the way down. Nobody catches you.
- Cool-down 8m cooldown 60-40%
  > 0s You survived hell. It was mostly stairs.`,
  },
  {
    slug: 'shit-show',
    name: 'Shit Show',
    tags: ['vo2max',  'anaerobic',  'fun'],
    description:
      'Intervals picked by a raccoon that got into the energy drinks: odd lengths, random targets, no pattern and no mercy. Great for the days real life feels like this anyway.',
    text: `Warm-up
- 10m warmup 45-70%
  > 0s Nothing about the next half hour makes sense. Just roll with it.

The shit show
- 47s 118%
  > 0s Forty-seven seconds. Why 47? Nobody fucking knows.
- 2m13s 62%
- 19s 160%
  > 0s SPRINT. No reason. Go.
- 1m41s 88%
- 3m 105%
  > 0s A normal interval. Enjoy it, it won't happen again.
- 1m 55%
- 1m37s 125%
  > 0s The raccoon has chosen violence.
- 58s 70%
- 23s 150%
- 2m7s 60%
- 4m11s 96%
  > 0s Four minutes eleven. The raccoon was asked to round it and refused.
- 1m29s 55%
- 33s 140%
- 1m 65%
- 2m44s 108%
  > 0s Almost over. Probably. Honestly, who even knows anymore.
- 1m15s 50%
- 11s 170%
  > 0s Eleven seconds of pure chaos. Empty the bastard tank.
- 3m32s 58%

Cool-down
- 6m cooldown 60-40%
  > 0s Well, that was a shit show. Same time tomorrow.`,
  },
  {
    slug: 'sawtooth',
    name: 'Sawtooth Motherfucker',
    tags: ['threshold',  'vo2max',  'fun'],
    description:
      'Eight ramps that climb from comfortable to cruel and then drop you like a bad habit. The chart looks like a saw because it is one.',
    text: `Warm-up
- 10m warmup 45-70%
  > 0s Eight teeth on this saw. Each one bites a little harder.
- 3m 55%

Teeth
- 3m ramp 70-115%
  > 0s Up the ramp, off the cliff, repeat until something breaks.

Teeth 3x
- 1m 50%
- 3m ramp 70-115%

Teeth
- 1m 50%
- 3m ramp 70-115%
  > 0s Halfway. The saw does not get tired. You do. That is the whole joke.

Teeth 2x
- 1m 50%
- 3m ramp 70-115%

Teeth
- 1m 50%
- 3m ramp 70-115%
  > 0s Last tooth. Bite back, motherfucker.
- 1m 50%

Cool-down
- 10m cooldown 60-40%
  > 0s Saw's put away. Count your fingers.`,
  },
  {
    slug: 'market-crash',
    name: 'Market Crash',
    tags: ['sweet-spot',  'fun'],
    description:
      'A 20-minute bull run to sweet spot, a Black Monday crash, a dead cat bounce, a recession and a slow recovery. Past performance does not guarantee future watts.',
    text: `- Warm-up 6m warmup 45-60%
  > 0s Markets open. Everyone is feeling rich and stupid.
- Bull run 20m ramp 60-92%
  > 0s Number go up. Your portfolio is on fire. The good kind of fire.
  > 12m Irrational exuberance. Buy the dip. What dip? There are no dips.
- Black Monday 3m 40%
  > 0s CRASH. Oh fuck. Oh fuck oh fuck oh fuck.
- Dead cat bounce 1m 110%
  > 0s Dead cat bounce. It's back. It's so back.
- Recession 10m 55%
  > 0s It was not back. Welcome to the recession.
- Slow recovery 14m ramp 60-88%
  > 0s Slowly, the economy of your legs recovers. Mostly for the rich.
- Cool-down 6m cooldown 60-40%
  > 0s Markets closed. Not financial advice.`,
  },
  {
    slug: 'liar-liar',
    name: 'Liar Liar',
    tags: ['vo2max',  'fun'],
    description:
      'Every one of these 3-minute intervals is the last one, according to the coach. There are seven.',
    text: `Warm-up
- 10m warmup 45-70%
  > 0s Today is short and easy. Four intervals, tops. Trust me.
- 3m 55%

Intervals
- 3m 110%
  > 0s Interval one of four. Easy.
- 3m 50%
- 3m 110%
  > 0s Two of four. See? I never lie.
- 3m 50%
- 3m 110%
  > 0s Three of four. Almost done, champ.
- 3m 50%
- 3m 110%
  > 0s Last one. For real.
- 3m 50%
  > 0s ...
- 3m 110%
  > 0s Okay, one more. That was a typo.
- 3m 50%
- 3m 110%
  > 0s THIS is the last one. Pinky promise.
- 3m 50%
- 3m 110%
  > 0s Fine. I'm a fucking liar. This is the actual last one.

Cool-down
- 8m cooldown 60-40%
  > 0s It's over. Genuinely. Would I lie to you?`,
  },
]

function build(spec: BuiltinSpec): Workout {
  const { workout, errors } = parseIntervalsText(spec.text, {
    id: `builtin:${spec.slug}`,
    name: spec.name,
    author: 'FreeGaz',
    description: spec.description,
    tags: spec.tags,
    source: 'builtin',
  })
  if (errors.length > 0) {
    const detail = errors.map((e) => `line ${e.line}: ${e.message}`).join('; ')
    throw new Error(`Built-in workout "${spec.name}" does not parse: ${detail}`)
  }
  return workout
}

export const BUILTIN_WORKOUTS: Workout[] = SPECS.map(build)

/** The source text of a built-in, keyed by id (for "open in text mode" and tests). */
export const BUILTIN_TEXT: Readonly<Record<string, string>> = Object.fromEntries(SPECS.map((s) => [`builtin:${s.slug}`, s.text]))
