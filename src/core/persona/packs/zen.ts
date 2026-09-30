// Zen: calm, breath and attention, with gentle humour. Secular mindfulness only:
// no religious figures, practices or teachings, and no borrowed quotes.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('zen')

b.add('ride_start', [
  [1, 'Welcome. Let the breath settle. The ride begins when you do.'],
  [1, 'Arrive in this moment. Feet on the pedals, shoulders soft.'],
  [2, "Today's path: {workoutName}. Take it one breath at a time. Well, one pedal stroke."],
  [3, 'The trainer waits patiently. It has nowhere else to be. Neither do you.'],
  [4, 'Begin. The pain cave is just a room with feelings about you.'],
  [5, 'Breathe in calm. Breathe out excuses. Now pedal, damn it. Gently.', P],
  [2, 'A test of the self. Or of the legs. Mostly the legs. Begin with calm.', when(rideKind('ftp-test'))],
  [3, 'No plan. No target. Just wheels and breath. How freeing. How suspicious.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'The effort begins. {targetW} watts. Breathe into it.'],
    [1, '{targetW} watts for {remainingS}. Let the effort rise like a tide.'],
    [2, 'Accept the interval. {targetW} watts. Resisting it only adds resistance.'],
    [3, '{targetW} watts. The mountain does not complain. Be the mountain.'],
    [4, '{targetW} watts. Discomfort is a visitor. Let it sit. Do not offer it tea.'],
    [5, "{targetW} watts. Embrace the suffering. It's going to hug you like hell anyway.", P],
    [3, 'Repetition {rep} of {reps}. Each one is new. Each one is also hard.'],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'The final repetition. Be fully present for it. Especially the hard part.'],
    [4, 'Last one. Let go of the previous ones. They cannot help you now.'],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, 'Everything, now, for {remainingS}. Release it all.'],
    [4, 'Maximum effort. Pour out everything. Refill later, with snacks.'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'The ramp begins. Rise with it, one minute at a time.'],
    [4, 'A ramp. Like most good things, it gets harder before it ends.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warm up slowly. The body wakes like morning light.'],
    [3, 'Warmup. Gently now. Even rivers begin as trickles.'],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady, {targetW} watts. Find the rhythm and rest inside it.'],
    [3, 'A steady block. {targetW} watts. Let the mind go quiet. Let the legs do the talking.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery. Breathe out longer than you breathe in.'],
    [2, 'Rest for {remainingS}. Let the heart slow, like a settling pond.'],
    [4, 'Recovery. Notice the relief. Notice also that it is temporary.'],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride. Follow the feeling.'],
    [3, 'No target for {remainingS}. Ride like no one is watching. No one is. Except me.'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown. The storm has passed. Spin gently.'],
    [3, 'Cooldown. Let the effort drain away like warm water.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds. Gather your breath.'],
  [1, 'Ten seconds. Soften the shoulders. Prepare.'],
  [2, 'Ten seconds until {targetW} watts. Inhale deeply.'],
  [3, 'Ten seconds. The calm before the effort. Enjoy the calm.'],
  [4, 'Ten seconds. Say farewell to comfort. It will return. Eventually.'],
  [5, 'Ten seconds. Breathe in calm. Breathe out... oh hell, here it comes.', P],
  [2, 'Ten seconds to all-out. Gather everything into one breath.', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, 'Halfway. Breathe. Return to the rhythm.'],
  [2, 'Half the path is behind you. {remainingS} ahead.'],
  [3, 'Halfway. The second half is just the first half, with more opinions.'],
  [4, 'Halfway. The legs are complaining. Listen kindly, then continue anyway.'],
  [5, 'Halfway. Breathe in. Breathe out. Pedal like hell. That last part is also mindfulness.', P],
  [2, 'Halfway, and right on target. Harmony.', when(gte('pct', 98))],
  [3, 'Halfway, {deficitW} watts beneath the target. Notice it without judgment. Then fix it.', when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute. Stay with the breath.'],
  [1, 'The final minute. Calm mind, strong legs.'],
  [2, 'The last minute. Hold {targetW}, gently but firmly.'],
  [3, 'Sixty seconds. Each one passes, like clouds.'],
  [4, 'The final minute. Pain is a teacher. This is the lecture you did not sign up for.'],
  [5, 'One minute. Be present. Be here. Be damn fast.', P],
  [3, 'One minute, {deficitW} watts short. There is still time. There is always a little time.', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'Complete. Beautifully done.'],
  [1, '{pct}% of target. Balanced, like a stone on a stone.'],
  [2, 'The effort is over. Breathe, and let it go.'],
  [3, 'Well done. The interval has ended. Your legs remember it fondly. Mostly.'],
  [4, 'Complete. You and the target were one. Briefly, but it counts.'],
  [5, "Damn fine interval. That was the most peaceful I've felt in hours.", P],
  [2, 'The set is complete. Sit with the accomplishment.', when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, '{pct}% of target. Let it go. The next breath is new.'],
  [2, 'Below the target. The target is a message from the past. You are in the present.'],
  [3, 'Average {avgW}, target {targetW}. A small gap. Observe it, forgive it, close it next time.'],
  [3, 'The interval did not go as planned. Few things do. Breathe.'],
  [4, '{pctUnder}% under. The river did not reach the sea today. It will try again tomorrow.'],
  [4, 'Short of the target. Expectations are heavy. So is this gear. Let both go.'],
  [5, '{pct}%. Hmm. Even the calmest pond has a damn frog in it sometimes.', P],
])

b.add('under_target', [
  [1, '{deficitW} watts below target. Breathe, and gently rise.'],
  [1, 'The target is {targetW}. Return to it, as you return to the breath.'],
  [2, '{power} watts. Notice the gap. Now close it, mindfully.'],
  [3, 'Under target. The mind wandered and took the watts with it.'],
  [4, '{deficitW} watts short. Let go of comfort. It is holding your legs back.'],
  [5, 'Under target. I am calm. I am centered. I am mildly damn annoyed. Pedal.', P],
  [3, '{pct}% of target. Perhaps a lighter path today. Or a firmer resolve.', when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, '{surplusW} watts over, so early. Patience. The interval is long.'],
  [3, '{power} watts. The eager river floods its banks. Be the steady river.'],
  [4, 'Too hot, too soon. The candle that burns brightest runs out of W′bal first.'],
])

b.add('cadence_sag', [
  [1, 'Your cadence slows. Quicken the feet, soften the effort.'],
  [2, 'Cadence {cadence}. Return to {cadenceAvg}. Round and round.'],
  [2, 'Quicker circles. Lighter legs. Steady breath.'],
  [3, 'Cadence down {cadenceDrop}. The wheel wants to turn. Let it.'],
  [3, 'Spin lightly, like brushing water with a leaf.'],
  [4, 'Cadence {cadence}. You are grinding, not flowing. Be the flow.'],
  [5, 'Cadence {cadence}. Round and round, damn it. Mindfully. But faster.', P],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}, above your cap. Ease off and breathe slowly.'],
  [2, '{hr} beats. Let the heart settle, like snow.'],
  [3, 'The heart runs ahead. Invite it back. Ease the effort.'],
])

b.add('hr_spike_no_power', [
  [1, 'Heart rate {hr} at {power} watts? The strap is dreaming. Moisten it gently.'],
  [2, 'A heart rate of {hr} while barely pedaling. The strap has had a vivid thought. Wet the contacts.'],
  [3, 'That heart-rate spike is an illusion. Most things are. Especially sensor data.'],
])

b.add('stopped_pedaling', [
  [1, 'Stillness. Rest as long as you need.'],
  [1, 'A rest. Drink, breathe, return when ready.'],
  [2, 'The pedals stop. The breath continues.'],
  [3, 'A pause at {elapsedMin} minutes. Even rivers rest in pools.'],
  [4, 'Stopped. Stillness is wonderful. In moderation. During workouts, very moderate moderation.'],
  [5, 'Stopped? Be still. Then be pedaling. Damn soon, ideally.', P],
])

b.add('resumed', [
  [1, 'Welcome back. Begin again gently.'],
  [2, 'Back after {pausedS}. Every moment is a fresh start.'],
  [4, 'You return. The pedals missed you. They would never say so.'],
])

b.add('skipped_interval', [
  [1, 'The interval is released. Let it go.'],
  [2, 'Skipped {segmentLabel}. No regrets, only the next breath.'],
  [3, 'You skipped it. The interval was an illusion anyway. The next one is less of an illusion.'],
  [3, 'Skipped. The mountain does not skip. But the mountain also has no legs.'],
  [4, 'Skipped. The path you avoid often returns, wearing a disguise.'],
  [5, 'Skipped. Hmm. Inner calm is great, but damn, that was a nice interval.', P],
])

b.add('extended_interval', [
  [1, 'Extended by {extraS}. You chose more. How brave.'],
  [3, '{extraS} more. The present moment just got longer.'],
  [4, 'You added time. Most seek less suffering. You seek extra. Fascinating.'],
])

b.add('intensity_down', [
  [1, 'Intensity to {intensityPct}%. Listening to the body is wisdom.'],
  [2, '{intensityPct}%. The bamboo bends, and does not break.'],
  [3, 'Intensity down. Let go of ego. Keep the practice.'],
  [3, 'Softer targets. Same breath. Same you.'],
  [4, '{intensityPct}%. The wise rider bends. The proud rider also bends, later, and louder.'],
  [5, '{intensityPct}%. Wisdom, or comfort? Only you know. Damn, I hope it is wisdom.', P],
])

b.add('intensity_up', [
  [1, 'Intensity to {intensityPct}%. Rise to meet it.'],
  [3, 'You raised the intensity. The fire within grows. Please keep it contained.'],
  [4, "{intensityPct}%. Ambition. A beautiful thing. Let's see if the legs agree."],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%. Pace with care. No sudden movements.'],
  [2, '{wbalPct}% of W′bal remains. Spend it wisely, like quiet time.'],
  [2, 'Low reserves. Smooth, steady, patient.'],
  [3, 'Reserves low. The well is not dry, but you can see the bottom.'],
  [4, 'W′bal {wbalPct}%. You gave away your calm too early. Hold what remains.'],
  [5, 'W′bal {wbalPct}%. Breathe. Hold steady. And no damn surges.', P],
])

b.add('wbal_empty', [
  [1, 'W′bal empty. Now you ride with breath alone.'],
  [3, 'The well is empty. Wells refill. Ease off slightly.'],
  [4, 'Nothing left in reserve. Freedom, in a way. Painful freedom.'],
])

b.add('pr', [
  [1, 'A new {prLabel} best. Take a moment to feel it.'],
  [1, "That's a new {prLabel} best. Gratitude for the legs."],
  [2, '{prLabel} personal record, {power} watts. Growth, quietly revealed.'],
  [3, 'New {prLabel} PR. Do not cling to it. Also, screenshot it.'],
  [4, "A {prLabel} PR. The student has surpassed the student's previous self."],
  [5, '{prLabel} PR. Serene. Centered. Damn impressive.', P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected {projectedFtp}. Breathe and hold.'],
  [2, 'Minute {minute}. Steady as the tide.'],
  [3, 'Minute {minute}. Projected {projectedFtp}. Observe the number. Do not become the number.'],
  [1, 'Minute {minute}. Begin gently. The long road rewards patience.', when(lte('minute', 3))],
  [3, 'Minute {minute}. The eager start ends in regret. Stay patient.', when(lte('minute', 3))],
  [2, 'Minute {minute}. The end draws near. Give what remains.', when(gte('minute', 15))],
  [4, 'Minute {minute}. Hold nothing back. Saving it serves no one.', when(gte('minute', 17))],
  [2, 'Minute {minute}. Projected {projectedFtp}, {projectedGain} beyond your current FTP. Stay calm about it.', when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'New FTP {ftpNew}, {ftpGain} watts higher. Growth, like a tree: slow, then visible.', when(gt('ftpGain', 0))],
  [3, '{ftpNew}, up {ftpGain}. The numbers rise. Remain humble. Maybe a little smug.', when(gt('ftpGain', 0))],
  [5, 'Up {ftpGain} to {ftpNew}. Breathe. Okay, one small damn celebration.', whenP(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew}, {ftpDrop} lower than before. Seasons change. Strength returns.', when(gt('ftpDrop', 0))],
  [3, '{ftpNew}. Down {ftpDrop}. A number is not a verdict. Rest, and ride again.', when(gt('ftpDrop', 0))],
  [2, 'FTP {ftpNew}, unchanged. Stillness is also a kind of progress.', when(eq('ftpGain', 0))],
  [1, 'The test is complete. FTP {ftpNew}. Be at ease with it.'],
])

b.add('workout_complete', [
  [1, 'The practice is complete. Well done.'],
  [1, '{elapsedMin} minutes of presence. Thank your legs.'],
  [2, 'Finished. Let the breath return to ease.'],
  [2, '{tss} TSS. The body will turn it into strength while you rest.'],
  [3, 'Complete. The effort passes. The fitness remains.'],
  [4, "Workout done. You suffered mindfully. That's the best kind, allegedly."],
  [5, 'Done. Deep breath. That was a damn good ride.', P],
])

b.add('ride_bailed', [
  [1, 'The ride ends early. Rest is also practice.'],
  [2, 'Stopping at {elapsedMin} minutes. Honor what you did.'],
  [3, 'You end early. The path will be here tomorrow.'],
  [3, 'The session ends. Let it go without judgment. Mostly without judgment.'],
  [4, 'Early exit. A wise choice, or a comfortable one. Only the legs know.'],
  [5, 'Stopping at {elapsedMin} minutes. Acceptance. Mild damn disappointment. Acceptance again.', P],
])

b.add('fueling_reminder', [
  [1, 'Nourish the body. Eat something now.'],
  [1, 'Time for carbs. Chew slowly. Or quickly. You are riding.'],
  [2, '{elapsedMin} minutes. A mindful snack.'],
  [3, "Eat. The body cannot run on serenity alone. I've checked."],
  [4, 'Fuel now. An empty tank makes a noisy mind.'],
  [5, 'Eat a damn gel. Mindfully. But eat it.', P],
])

b.add('hydration_reminder', [
  [1, 'Drink. Water sustains all things. Including intervals.'],
  [2, 'A sip of water. Feel it cool the fire.'],
  [3, 'Hydrate. The water flows in, the sweat flows out.'],
])

b.add('distress', [
  [1, "Let's slow everything down. Ease off, breathe gently, and stop if anything feels wrong."],
  [1, 'Rest now. Soft-pedal or stop. Your wellbeing matters more than any workout.'],
])

b.add('idle_banter', [
  [1, 'Breathe in for four. Breathe out for four.'],
  [1, 'Notice your shoulders. Let them drop.'],
  [2, 'Unclench the jaw. The watts do not live there.'],
  [2, 'Each pedal stroke, a small circle of attention.'],
  [2, 'Power {power}, cadence {cadence}. Balanced. Like a pebble on a pebble.'],
  [3, 'The fan hums. The legs turn. The mind wanders. Bring it back.'],
  [3, '{elapsedMin} minutes in. Where did the time go? Into your legs.'],
  [3, 'A calm mind pedals smoother. A smooth pedal calms the mind. Round and round.'],
  [4, 'Discomfort is information. It is telling you to keep going. I am interpreting loosely.'],
  [4, 'Stay in this moment. Mostly because the workout is not over.'],
  [5, 'The trainer is not your opponent. The trainer is your very demanding friend.'],
  [5, "Inner calm, outer watts. Damn, I'm good at this.", P],
])

b.add('idle_banter', [[5, 'Breathe in. Breathe out. Now fucking pedal. Mindfully.', P]])
b.add('under_target', [[5, 'Under target. I am calm. This pace is still shit. Pedal.', P]])

export const ZEN: PersonaPack = {
  meta: {
    id: 'zen',
    name: 'Zen',
    tagline: 'Calm, breath and gentle humor. Suffering, observed without judgment.',
    voiceHint: { rate: 0.82, pitch: 0.95, preferVoices: ['Moira', 'Karen', 'Samantha'] },
  },
  lines: b.build(),
}
