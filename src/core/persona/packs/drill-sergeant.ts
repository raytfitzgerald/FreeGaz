// Drill Sergeant: a yelling cadence-caller. Ridicule for slacking, grudging
// praise for work. Roasts effort and excuses, never the rider's body.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('drill-sergeant')

b.add('ride_start', [
  [1, "Good morning, recruit! Clip in, sit up, and let's get to work."],
  [1, "Fall in! Easy spin to start. I'll tell you when it's time to hurt."],
  [2, "Look alive, recruit. Today's drill: {workoutName}. You will complete it."],
  [3, 'Oh, you showed up. The bike was about to file a missing persons report.'],
  [4, "On the bike, recruit! I've seen more fight in a folding chair."],
  [5, 'Rise and grind, recruit! This is a training facility, not a damn spa.', P],
  [2, "FTP test day, recruit. Today we find out what you're made of. Warm up like you mean it.", when(rideKind('ftp-test'))],
  [3, "Free ride? No plan, no orders? Fine. I'll be watching anyway.", when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'GO, recruit! {targetW} watts, smooth and steady!'],
    [1, 'Interval! {targetW} watts for {remainingS}. Move it!'],
    [2, 'Hit it! {targetW} watts! Left, right, left, right!'],
    [3, "On the pedals, NOW! {targetW} watts, or you're scrubbing this trainer with a toothbrush!"],
    [4, "{targetW} watts, recruit! I don't want excuses, I want wattage!"],
    [5, 'MOVE! {targetW} watts! Pedal like the bike owes you money, damn it!', P],
    [3, 'Rep {rep} of {reps}! {targetW} watts! Do not make me come over there!'],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'Last one, recruit! {targetW} watts! Leave nothing on this bike!'],
    [4, 'Final rep! Finish this one and I might stop yelling. Might.'],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, "ALL OUT, recruit! Everything you've got for {remainingS}!"],
    [4, "Max effort! If you can still hear me, you're not trying!"],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'Ramp, recruit! It gets harder every minute. So do you!'],
    [4, 'Ramp! Climb that staircase until your legs file a formal complaint!'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warmup, recruit. Easy spin. Loosen up those legs.'],
    [3, "Warmup! That means easy, not lazy. There's a difference, and I will find it."],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady effort! {targetW} watts! Hold it right there!'],
    [3, 'Steady block, recruit. {targetW} watts. Boring is the point. Embrace it.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery! Spin easy, breathe, and get ready.'],
    [2, "At ease, recruit. {remainingS} of rest. Don't get comfortable."],
    [4, "Recovery. That's a privilege, not a nap. Keep those legs turning!"],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride, recruit. Your call. Make it a good one.'],
    [3, 'No orders for {remainingS}. Show me some initiative!'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown. You earned it, recruit. Easy spin.'],
    [3, "Cooldown! Don't celebrate yet. I'm still watching your cadence."],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds, recruit! Get ready!'],
  [1, 'Ten seconds! Hands on the bars, eyes up!'],
  [2, 'Ten seconds to {targetW} watts! Brace yourself!'],
  [3, 'Ten seconds! Stop fidgeting and get ready to work!'],
  [4, 'Ten seconds! Say goodbye to comfort, recruit!'],
  [5, 'Ten seconds! Get your ass in gear, recruit!', P],
  [2, 'Ten seconds to max effort! Everything, recruit! Everything!', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, 'Halfway, recruit! Keep it steady!'],
  [2, 'Halfway! {remainingS} to go! Hold {targetW}!'],
  [3, "Halfway there. Your legs are negotiating. I don't negotiate."],
  [4, "Halfway! If you're thinking of quitting, think louder so I can yell at it."],
  [5, "Halfway, recruit! The second half doesn't care how you feel. Neither do I, damn it!", P],
  [2, "Halfway and on target! Outstanding! Don't let it go to your head!", when(gte('pct', 98))],
  [3, 'Halfway and {deficitW} watts short! Unacceptable! Bring it up!', when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute, recruit! Finish strong!'],
  [1, 'Last minute! Hold {targetW}! Hold it!'],
  [2, "Sixty seconds! You've done harder things than this. Probably."],
  [3, 'One minute left! Dig, recruit! DIG!'],
  [4, 'Last minute! Your legs are lying to you! Call their bluff!'],
  [5, "ONE MINUTE! Quit now and you're doing this whole damn interval again!", P],
  [3, "Last minute and you're {deficitW} short! Find those watts, recruit!", when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, "Good work, recruit! That's how it's done!"],
  [1, 'Interval complete! {pct}% of target! Outstanding!'],
  [2, "Done! Not bad. Not bad at all. Don't let it go to your head."],
  [3, "Well, well. The recruit can follow orders. I'm almost impressed."],
  [4, "Acceptable, recruit. That's the nicest word I own. Treasure it."],
  [5, 'Hell of an interval, recruit. Now wipe that grin off before I add another one.', P],
  [2, "Set complete! That's what I like to see!", when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, 'Came up short, recruit. Shake it off. Next one.'],
  [2, '{pct}% of target. The order was 100. Regroup!'],
  [3, 'That was {pctUnder}% under. Even the trainer is embarrassed.'],
  [3, "Average {avgW}, target {targetW}. I've seen better math from a broken calculator."],
  [4, "Short again! Did you think I wouldn't notice? I notice everything!"],
  [5, '{pct}%? That was a half-assed interval, recruit, and we both know it!', P],
  [4, 'Under target, recruit. Drop and give me twenty... more watts next time!'],
])

b.add('under_target', [
  [1, 'Pick it up, recruit! {targetW} watts!'],
  [1, "You're {deficitW} watts short! Close the gap!"],
  [2, '{power} watts? The order was {targetW}! Move it!'],
  [3, 'Under target! Are you pedaling or just visiting?'],
  [4, "{deficitW} watts short! I've seen more power from a desk fan!"],
  [5, 'Under target AGAIN? Get off your ass... no, stay on it, and PEDAL!', P],
  [3, "Way under, recruit! {pct}% of target! That's not training, that's sightseeing!", when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, 'Easy, recruit! {surplusW} watts over. Save it for the finish!'],
  [3, 'Too hot! Who told you to ride {power}? Not me! {targetW}!'],
  [4, "Slow down, hero! You'll blow up before the second half!"],
])

b.add('cadence_sag', [
  [1, 'Cadence, recruit! Pick it up!'],
  [1, 'Cadence {cadence}! I want {cadenceAvg}! Spin!'],
  [2, 'Left, right, left, right! Faster, recruit!'],
  [3, 'Your cadence dropped {cadenceDrop} rpm! Are those pedals made of concrete?'],
  [4, "Cadence {cadence}? That's a stroll, not a drill! Spin, recruit!"],
  [5, 'Cadence is sinking, recruit! Spin those damn legs!', P],
  [2, 'One, two, one, two! Keep that cadence up!'],
])

b.add('hr_high', [
  [1, "Heart rate {hr}, recruit. That's over your cap. Ease off a notch."],
  [2, "Heart rate's redlining at {hr}. Back it down. That's an order."],
  [3, 'Easy, recruit. {hr} bpm. Even I say dial it back.'],
])

b.add('hr_spike_no_power', [
  [1, 'Heart rate {hr} at {power} watts? Recruit, your strap is lying to me.'],
  [2, 'That heart-rate reading is out of line, recruit. Wet the strap.'],
  [3, "{hr} bpm while coasting? Either the strap's glitching, or you just remembered I'm here."],
])

b.add('stopped_pedaling', [
  [1, 'Stopped, recruit? Take a breath. Then back to work.'],
  [1, 'Break taken. Drink some water. Back on in your own time.'],
  [2, 'Nobody said stop! ...Fine. Thirty seconds.'],
  [3, 'Why are the pedals not moving? I did not give that order!'],
  [4, 'Stopped? At {elapsedMin} minutes? My coffee lasts longer than that.'],
  [5, 'Did you just stop? Get back on that bike before I lose my damn mind!', P],
])

b.add('resumed', [
  [1, 'Back in formation! Ease into it.'],
  [3, 'Welcome back, recruit. {pausedS} off. I counted every second.'],
  [4, 'Oh, look who remembered they own a bike.'],
])

b.add('skipped_interval', [
  [1, 'Skipped it. Noted, recruit. Make the next one count.'],
  [2, 'Skipped {segmentLabel}? That will be in my report.'],
  [3, 'You skipped an interval. The interval did not skip you. Remember that.'],
  [3, "Skip one more and I'm renaming you Private Fast-Forward."],
  [4, "Skipped! You don't get to skip, recruit. You get to suffer!"],
  [5, 'Skipping intervals? What is this, a damn buffet?', P],
])

b.add('extended_interval', [
  [1, "Extended by {extraS}! That's initiative, recruit!"],
  [3, 'You ADDED time? Outstanding! Who are you, and what did you do with my recruit?'],
  [4, "An extra {extraS}? Now you're speaking my language!"],
])

b.add('intensity_down', [
  [1, 'Intensity down to {intensityPct}%. Smart call if you need it, recruit.'],
  [2, 'Dropping to {intensityPct}%? Fine. Quality over ego.'],
  [3, 'Intensity down. I saw that. I see everything.'],
  [3, 'Intensity down. Your legs asked nicely, I assume.'],
  [4, "Turning it down? The hill doesn't turn down, recruit!"],
  [5, '{intensityPct}%? Who authorized that? Oh, you did. Damn it, recruit.', P],
])

b.add('intensity_up', [
  [1, "Intensity up to {intensityPct}%! That's the spirit, recruit!"],
  [3, "You turned it UP? I may have to be nice to you. Don't get used to it."],
  [4, "{intensityPct}%! Now we're cooking! Don't make me regret this!"],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%, recruit. Ration it!'],
  [2, 'Reserves low! No surges, no heroics!'],
  [2, 'Low reserves. Steady pressure, recruit. Steady.'],
  [3, "W′bal {wbalPct}%. You're running on fumes and attitude."],
  [4, "The tank's almost dry, recruit! Hold it steady and don't you dare surge!"],
  [5, 'W′bal at {wbalPct}%! You spent it like a damn lottery winner!', P],
])

b.add('wbal_empty', [
  [1, 'W′bal empty! Hold it together, recruit!'],
  [3, 'The tank is empty. Now we find out who you really are.'],
  [4, "Zero W′bal! Now it's all willpower, recruit! Show me some!"],
])

b.add('pr', [
  [1, 'New {prLabel} record, recruit! Outstanding!'],
  [1, 'Personal record, {prLabel}! Log it, recruit!'],
  [2, "{prLabel} PR! {power} watts! That's what I'm talking about!"],
  [3, "A new {prLabel} best? I'm... proud. Don't tell anyone I said that."],
  [4, '{prLabel} PR! See what happens when you listen to me?'],
  [5, 'New {prLabel} record! Hell yes, recruit! HELL YES!', P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}, recruit! Projected {projectedFtp}! Hold steady!'],
  [2, 'Minute {minute}! Steady pressure! Do not blow up!'],
  [3, 'Minute {minute}. Projected {projectedFtp}. Your legs are filing complaints. Denied!'],
  [1, 'Minute {minute}. Easy on the throttle, recruit. This is a long one.', when(lte('minute', 3))],
  [3, "Minute {minute}! Don't be a hero yet, recruit. Heroes blow up at minute eight.", when(lte('minute', 3))],
  [2, 'Minute {minute}! Final stretch! Give me everything, recruit!', when(gte('minute', 15))],
  [4, "Minute {minute}! Projected {projectedFtp}! If you've got more, now's the time to prove it!", when(gte('minute', 17))],
  [2, "Minute {minute}! On pace for {projectedFtp}, that's {projectedGain} up! Keep marching!", when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'New FTP: {ftpNew}! Up {ftpGain} watts! Outstanding, recruit!', when(gt('ftpGain', 0))],
  [3, "{ftpNew} watts. Up {ftpGain}. I suppose I'll have to yell at you harder now.", when(gt('ftpGain', 0))],
  [5, 'Up {ftpGain} watts to {ftpNew}! Hell of a test, recruit!', whenP(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew}, down {ftpDrop}. Bad day, recruit. We regroup and come back stronger.', when(gt('ftpDrop', 0))],
  [3, "{ftpNew}. Down {ftpDrop} from {ftpOld}. The test doesn't lie, but it does have bad days.", when(gt('ftpDrop', 0))],
  [2, 'FTP holds at {ftpNew}. Steady as a rock, recruit.', when(eq('ftpGain', 0))],
  [1, 'Test complete! FTP {ftpNew} watts! Dismissed... after the cooldown.'],
])

b.add('workout_complete', [
  [1, 'Workout complete! Outstanding work, recruit!'],
  [1, 'Done! {elapsedMin} minutes of hard work. Dismissed!'],
  [2, "Mission accomplished, recruit. Hydrate and stretch. That's an order."],
  [3, "You finished. I bet you wouldn't. I lost. Good."],
  [3, "{tss} TSS. That's the kind of number I like to see."],
  [4, 'Workout complete. You may now collapse. Neatly.'],
  [5, "That's a wrap, recruit. Damn fine work. I'll deny I ever said that.", P],
])

b.add('ride_bailed', [
  [1, 'Calling it early, recruit. Rest up. We go again.'],
  [2, 'Pulling out at {elapsedMin} minutes. We regroup tomorrow.'],
  [3, 'Leaving already? The bike will remember this.'],
  [3, "Early exit. I'll write it up as a strategic withdrawal."],
  [4, "Bailing? I've seen more commitment from a New Year's resolution."],
  [5, 'Quitting at {elapsedMin} minutes? Hell of a way to spend a workout, recruit.', P],
])

b.add('fueling_reminder', [
  [1, 'Fuel up, recruit! Eat something now.'],
  [1, "Fuel check! Take some carbs while it's easy."],
  [2, 'Chow time! Carbs in, recruit!'],
  [3, 'Eat! An empty recruit is a slow recruit!'],
  [4, '{elapsedMin} minutes in. Eat something before your legs mutiny.'],
  [5, "Get a damn gel in you, recruit! That's an order!", P],
])

b.add('hydration_reminder', [
  [1, 'Hydrate, recruit! Drink up!'],
  [2, "Water! Now! That's an order!"],
  [3, 'Drink, recruit. Dry recruits make me sad. And loud.'],
])

b.add('distress', [
  [1, "Stand down, recruit. That's a real order: ease off and breathe. Stop if anything feels wrong."],
  [1, 'Dropping the act for a second. Soft-pedal or stop. Your wellbeing comes first.'],
])

b.add('idle_banter', [
  [1, 'Shoulders down, recruit! Relax that upper body!'],
  [1, 'Eyes up! Breathe! Keep pedaling!'],
  [1, 'Good posture, recruit. Keep it that way.'],
  [2, 'Left, right, left, right! Keep it smooth!'],
  [2, "Keep those knees in line, recruit! This isn't a rodeo!"],
  [2, '{elapsedMin} minutes in, recruit. Stay sharp!'],
  [3, "I've seen statues with more cadence. Move!"],
  [3, 'Is that sweat, or are you leaking motivation? Either way, keep going!'],
  [3, 'Count it off! One, two! Three, four! Every watt, and then one more!'],
  [4, 'You call that pedaling? I call it gentle stirring.'],
  [4, 'Somewhere a recruit is working harder than you. Find them. Pass them.'],
  [5, "I've watched paint dry with more urgency. Pick it up!"],
  [5, 'Quit sightseeing and pedal, damn it! The view in here never changes!', P],
])

b.add('segment_start', [[5, '{targetW} watts! Move and fucking pedal, recruit!', P]], [HARD])
b.add('under_target', [[5, 'Under target! That effort was shit, recruit! Fix it!', P]])
b.add('idle_banter', [[5, 'Quit sightseeing and fucking pedal, recruit!', P]])

export const DRILL_SERGEANT: PersonaPack = {
  meta: {
    id: 'drill-sergeant',
    name: 'Drill Sergeant',
    tagline: 'Yells cadence, hates excuses, praises grudgingly.',
    voiceHint: { rate: 1.15, pitch: 0.9, preferVoices: ['Fred', 'Ralph', 'Alex'] },
  },
  lines: b.build(),
}
