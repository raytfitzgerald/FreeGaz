// Hype Coach: high energy, all-caps moments, positive only. Spice turns the
// volume up, never the meanness: even a skipped interval gets a cheer.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('hype-coach')

b.add('ride_start', [
  [1, "Welcome back! So glad you're here. Let's have a great ride!"],
  [1, "Here we go! Easy start, big finish. You've got this!"],
  [2, "Today's session: {workoutName}! Let's crush it together!"],
  [3, "YES! You showed up! That's the hardest part, and you already did it!"],
  [4, "IT'S GO TIME! LET'S GOOOO!"],
  [5, 'HELL YEAH! Clip in! Today is YOUR day!', P],
  [2, "FTP test day! Let's find out how strong you've become!", when(rideKind('ftp-test'))],
  [3, "Free ride! No rules! Just you and the pedals! Let's GO!", when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, "Here we go! {targetW} watts! You've got this!"],
    [1, 'Interval time! {targetW} watts for {remainingS}! Strong and steady!'],
    [2, "{targetW} watts! Let's GO! Smooth power!"],
    [3, "It's GO TIME! {targetW} watts! Show it who's boss!"],
    [4, "{targetW} WATTS! YOU ARE A POWER PLANT! LET'S GO!"],
    [5, "HELL YES! {targetW} watts! LET'S DO THIS!", P],
    [3, 'Rep {rep} of {reps}! Every rep makes you stronger!'],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'LAST ONE! {targetW} watts! Finish this set like a champion!'],
    [4, "FINAL REP! EVERYTHING YOU'VE GOT! THIS IS IT!"],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, "All-out effort! Give it everything for {remainingS}! You've got this!"],
    [4, 'MAX EFFORT! UNLEASH IT! GO GO GO!'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'Ramp time! Every minute you climb, you get stronger!'],
    [4, 'THE RAMP! Climb that staircase! Higher! HIGHER!'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warmup! Nice and easy. Wake those legs up!'],
    [3, 'Warmup! Every great ride starts right here!'],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady block! {targetW} watts, nice and smooth!'],
    [3, "Steady at {targetW}! Rock solid! You're a metronome!"],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery! Breathe it out. You earned this!'],
    [2, 'Rest for {remainingS}. Recharge those batteries!'],
    [4, "Recovery! Soak it in! You're getting STRONGER right now!"],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride! Your pace, your call! Enjoy it!'],
    [3, 'No target for {remainingS}! Ride with joy!'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown! You did it! Spin it out!'],
    [3, 'Cooldown! Victory lap! Soak up that feeling!'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, "Ten seconds! Get ready! You've got this!"],
  [1, 'Ten seconds! Deep breath, here we go!'],
  [2, "Ten seconds to {targetW} watts! Let's GO!"],
  [3, 'TEN SECONDS! Get hyped!'],
  [4, 'TEN! SECONDS! TO! GLORY!'],
  [5, "Ten seconds! Hell yeah! Let's rip it!", P],
  [2, 'Ten seconds to all-out! Unleash it!', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, "Halfway! You're doing amazing!"],
  [2, 'Halfway there! {remainingS} to go! Keep that energy!'],
  [3, 'HALFWAY! Look at you go!'],
  [4, "Halfway! You're a machine! A beautiful, pedaling machine!"],
  [5, 'HALFWAY! Hell yeah! The second half is YOURS!', P],
  [2, 'Halfway and right on target! PERFECT!', when(gte('pct', 98))],
  [3, "Halfway! You're {deficitW} watts from perfect. You can find those! I believe it!", when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute left! Finish strong!'],
  [1, 'Final minute! So proud of this effort!'],
  [2, "Last minute! Hold {targetW}! You've got this!"],
  [3, 'SIXTY SECONDS! Bring it home!'],
  [4, 'LAST MINUTE! THIS IS WHERE CHAMPIONS ARE MADE!'],
  [5, 'ONE MINUTE! Hell yeah! Empty the tank!', P],
  [3, 'Last minute! {deficitW} watts to find! You can do it! Dig deep!', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'YES! Great interval!'],
  [1, '{pct}% of target! Nailed it!'],
  [2, "That's what I'm talking about! Beautiful work!"],
  [3, "BOOM! Interval DONE! You're on fire!"],
  [4, 'INCREDIBLE! That was textbook! Frame it!'],
  [5, 'Hell yes! That interval was damn near perfect!', P],
  [2, "SET COMPLETE! You're unstoppable!", when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, "{pct}% of target! That's still real work! Proud of you!"],
  [2, 'Tough one! You kept pedaling, and that counts!'],
  [3, 'Not every interval is perfect, but every interval makes you stronger!'],
  [3, "{avgW} watts of pure effort! The next one's yours!"],
  [4, 'That was a battle and you stayed in it! RESPECT!'],
  [4, "Shake it off! Reset! The next interval doesn't know about this one!"],
  [5, "Short of target, but hell, you gave it everything! Next one, let's GO!", P],
])

b.add('under_target', [
  [1, "You're {deficitW} watts from target! You've got this!"],
  [1, "Target's {targetW}! A little more! You can do it!"],
  [2, "Come on! Find those {deficitW} watts! I know they're in there!"],
  [3, "Let's go! Bring it up to {targetW}! You're stronger than this moment!"],
  [4, 'DIG DEEP! {targetW} is RIGHT THERE!'],
  [5, "Come on! Hell yeah, you've got more! FIND IT!", P],
  [3, "{pct}% of target! Breathe, reset, and build back up! You've got this!", when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, 'Love the energy! {surplusW} over, though. Save some for later!'],
  [3, "Whoa, {power} watts! Easy, tiger! The target's {targetW}!"],
  [4, 'So much fire! Bottle it up for the finish!'],
])

b.add('cadence_sag', [
  [1, "Let's lift that cadence! Quick feet!"],
  [2, "Cadence {cadence}! Let's get back to {cadenceAvg}! Spin it!"],
  [2, "Pick up that rhythm! You've got this!"],
  [3, 'Spin, spin, spin! Light and fast!'],
  [3, 'Cadence dropped {cadenceDrop}! Bring the rhythm back!'],
  [4, "FAST FEET! You're a hummingbird! SPIN!"],
  [5, "Hell yeah, let's spin! Cadence UP!", P],
])

b.add('hr_high', [
  [1, "Heart rate {hr}, over your cap. Ease off a touch. You're still crushing it!"],
  [2, "Your heart is working hard at {hr}! Let's dial it back a little."],
  [3, 'Heart rate high! Back off slightly. Smart riders go far!'],
])

b.add('hr_spike_no_power', [
  [1, "Heart rate says {hr} at {power} watts! Either your strap's glitching or you're just THAT excited!"],
  [2, 'Whoa, {hr} bpm while cruising! Probably the strap. Wet the contacts!'],
  [3, 'That heart-rate jump is pure hype! Or a sensor glitch. Probably the glitch.'],
])

b.add('stopped_pedaling', [
  [1, "Taking a breather! That's okay! Rest up!"],
  [1, 'Stopped at {elapsedMin} minutes. Proud of what you did so far!'],
  [2, "Paused! Grab some water! We'll go again when you're ready!"],
  [3, 'Quick break! Recharge and come back stronger!'],
  [4, 'Pit stop! Refuel, reset, RETURN!'],
  [5, 'Break time! Hell, even champions pause!', P],
])

b.add('resumed', [
  [1, "You're back! Let's go!"],
  [2, 'Back after {pausedS}! Ease in and build!'],
  [4, 'THE COMEBACK! I love it!'],
])

b.add('skipped_interval', [
  [1, 'Skipped it! Listening to your body is smart!'],
  [2, "Skipped {segmentLabel}! No worries! Let's own the next one!"],
  [3, 'Skip! Strategy! Save it for what comes next!'],
  [3, 'Moving on! Every ride is a win!'],
  [4, 'Skipping one to crush the rest! I love a plan!'],
  [5, "Skipped! Hell, fresh legs for the next one! LET'S GO!", P],
])

b.add('extended_interval', [
  [1, 'You added {extraS}! AMAZING!'],
  [3, 'Bonus time! {extraS} more! Look at you go!'],
  [4, "EXTRA TIME! You're a legend!"],
])

b.add('intensity_down', [
  [1, 'Intensity down to {intensityPct}%! Smart choice! Quality work!'],
  [2, '{intensityPct}%! Perfect! Consistency beats heroics!'],
  [3, "Adjusted! That's what champions do!"],
  [3, "Intensity lowered! You're still here, still pedaling, still winning!"],
  [4, 'Dialing it in at {intensityPct}%! Smart training is strong training!'],
  [5, '{intensityPct}%? Hell yeah! Finish it strong!', P],
])

b.add('intensity_up', [
  [1, "Intensity up to {intensityPct}%! Let's GO!"],
  [3, 'Turned it UP! Yes! YES!'],
  [4, "{intensityPct}%! You're a ROCKET!"],
])

b.add('wbal_low', [
  [1, "W′bal at {wbalPct}%! Steady now! You've got this!"],
  [2, '{wbalPct}% W′bal! Smooth and strong! No surges!'],
  [2, "Low reserves! Steady pressure! You're doing amazing!"],
  [3, 'Reserves low, spirit HIGH!'],
  [4, "W′bal {wbalPct}%! Running on heart now! LET'S GO!"],
  [5, "Low W′bal? Hell, you're tougher than any number!", P],
])

b.add('wbal_empty', [
  [1, "W′bal empty! Hold steady! You're so strong!"],
  [3, 'Running on pure grit now! AMAZING!'],
  [4, 'EMPTY TANK, FULL HEART! GO!'],
])

b.add('pr', [
  [1, 'New {prLabel} PR! AMAZING!'],
  [1, "That's a new {prLabel} best! So proud of you!"],
  [2, '{prLabel} personal record! {power} watts! YES!'],
  [3, "A NEW {prLabel} BEST! You're on another level!"],
  [4, "PR! PR! {prLabel} PR! LET'S GOOOO!"],
  [5, "Hell YES! New {prLabel} PR! You're a damn legend!", P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}! Projected {projectedFtp}! Looking strong!'],
  [2, "Minute {minute}! Steady and strong! You've got this!"],
  [3, 'Minute {minute}! Projected {projectedFtp}! Keep that rhythm!'],
  [1, 'Minute {minute}! Smooth start! Patience is power!', when(lte('minute', 3))],
  [3, 'Minute {minute}! Controlled and confident! Perfect!', when(lte('minute', 3))],
  [2, 'Minute {minute}! Final stretch! Give it everything!', when(gte('minute', 15))],
  [4, 'Minute {minute}! THIS IS YOUR MOMENT! EMPTY IT!', when(gte('minute', 17))],
  [2, "Minute {minute}! On pace for {projectedFtp}! That's {projectedGain} up! INCREDIBLE!", when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'New FTP {ftpNew}! Up {ftpGain} watts! AMAZING!', when(gt('ftpGain', 0))],
  [3, "{ftpNew}! That's {ftpGain} watts of pure progress! YES!", when(gt('ftpGain', 0))],
  [5, "Hell YES! {ftpNew}! Up {ftpGain}! You're a damn machine!", whenP(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew} today! Every test teaches us something! Proud of this effort!', when(gt('ftpDrop', 0))],
  [3, '{ftpNew}, {ftpDrop} under last time. Test days vary! You showed up and gave it everything!', when(gt('ftpDrop', 0))],
  [2, 'FTP holds at {ftpNew}! Rock solid! Consistency is power!', when(eq('ftpGain', 0))],
  [1, 'Test complete! FTP {ftpNew}! You did it!'],
])

b.add('workout_complete', [
  [1, 'Workout complete! You did it!'],
  [1, '{elapsedMin} minutes! DONE! So proud of you!'],
  [2, 'Finished! NP {np}! Beautiful ride!'],
  [2, '{tss} TSS in the bank! Recovery starts now!'],
  [3, 'YOU DID IT! Every single minute!'],
  [4, 'WORKOUT COMPLETE! LEGEND STATUS UNLOCKED!'],
  [5, 'Hell yeah! Done! That was a damn great ride!', P],
])

b.add('ride_bailed', [
  [1, "Calling it early? That's okay! You showed up!"],
  [2, '{elapsedMin} minutes is still a win! Rest up!'],
  [3, 'Smart riders know when to stop! Recover and come back strong!'],
  [3, "Ride saved! Tomorrow's you says thanks!"],
  [4, 'Every minute counts! {elapsedMin} of them today! Proud of you!'],
  [5, 'Hell, some days are like that! Rest up, champ! Next time!', P],
])

b.add('fueling_reminder', [
  [1, 'Fuel time! Eat something!'],
  [1, 'Fuel check! A few bites now!'],
  [2, 'Snack attack! Carbs in!'],
  [3, '{elapsedMin} minutes in! Fuel that engine!'],
  [4, 'FUEL UP! Champions eat on schedule!'],
  [5, 'Eat a damn gel! Your legs will LOVE you!', P],
])

b.add('hydration_reminder', [
  [1, 'Drink up! Hydration is power!'],
  [2, 'Water break! Sip, sip, sip!'],
  [3, 'HYDRATE! Your muscles are cheering!'],
])

b.add('distress', [
  [1, "Hey, let's ease off. Breathe slowly. Stop if anything feels wrong. You're what matters."],
  [1, 'Time to take it easy. Soft-pedal or stop. The workout can wait for you.'],
])

b.add('idle_banter', [
  [1, "You're doing great!"],
  [1, 'Love this energy! Keep it up!'],
  [2, 'Smooth pedaling! Beautiful!'],
  [2, '{elapsedMin} minutes of awesome!'],
  [2, "Power {power}! Cadence {cadence}! Chef's kiss!"],
  [3, "You're getting stronger with every pedal stroke!"],
  [3, 'Every watt counts! Every single one!'],
  [3, 'Your future self is high-fiving you right now!'],
  [4, 'YOU ARE A WATT FACTORY!'],
  [4, 'Look at you! Consistent, strong, unstoppable!'],
  [5, "UNSTOPPABLE! UNBREAKABLE! UN... UNTIRED? ...LET'S GO!"],
  [5, 'Hell yeah! Keep those legs singing!', P],
])

b.add('segment_start', [[5, '{targetW} watts! FUCK YES! LET\'S GO!', P]], [HARD])
b.add('workout_complete', [[5, 'DONE! You absolute fucking legend! That was incredible!', P]])

export const HYPE_COACH: PersonaPack = {
  meta: {
    id: 'hype-coach',
    name: 'Hype Coach',
    tagline: 'Maximum energy, zero negativity. Every watt gets a cheer.',
    voiceHint: { rate: 1.2, pitch: 1.15, preferVoices: ['Samantha', 'Ava', 'Allison'] },
  },
  lines: b.build(),
}
