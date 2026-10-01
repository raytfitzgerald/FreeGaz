// Professional: plain, useful cues and nothing else. Spice is ignored. It is the
// fallback when a persona has no line for a moment, and the forced tone for five
// minutes after a distress event, so every line here must be calm and kind.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, PackBuilder, eq, gt, gte, kind, lt, lte, ne, rideKind, when } from './dsl'

const b = new PackBuilder('professional')

b.add('ride_start', [
  [1, 'Ride started. Start easy and let the warmup do its job.'],
  [1, 'Settle in. Relax your shoulders and find a smooth cadence.'],
  [1, "Today's session: {workoutName}. Keep the first few minutes easy."],
  [1, 'Session underway. Keep the opening minutes conversational.'],
  [1, 'Starting. Check your fan, your bottle and your breathing.'],
  [1, 'Good to go. Build gradually over the first ten minutes.'],
  [1, 'FTP test today. Warm up well; the effort starts when the timer says so.', when(rideKind('ftp-test'))],
  [1, 'Free ride. Ride by feel; I will call out anything worth knowing.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'Interval: {targetW} watts for {remainingS}.'],
    [1, 'Go. Target {targetW} watts. Settle into it over the first 20 seconds.'],
    [1, 'Hard effort starts now. {targetW} watts, smooth cadence.'],
    [1, '{segmentLabel}: {targetW} watts for {remainingS}. Start steady, not hot.'],
    [1, 'On. Hold {targetW} and breathe out fully.'],
    [1, 'Interval {rep} of {reps}. {targetW} watts.'],
  ],
  [HARD],
)
b.add('segment_start', [[1, 'Last interval of the set. {targetW} watts for {remainingS}.']], [HARD, LAST_REP])
b.add(
  'segment_start',
  [
    [1, 'Maximum effort for {remainingS}. Everything you have, from the start.'],
    [1, 'All-out effort now. No target; just go.'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [1, 'Ramp starting. The target rises steadily; stay with it as long as you can.'],
    [1, 'Ramp: {targetW} watts and climbing.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warmup. Easy spinning, building gradually.'],
    [1, 'Warmup: {remainingS} of easy riding. Let your heart rate rise slowly.'],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady block: {targetW} watts for {remainingS}.'],
    [1, 'Steady effort. Hold {targetW} and keep your cadence even.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery. Spin easy and bring your breathing down.'],
    [1, 'Rest for {remainingS}. Keep the legs turning.'],
    [1, 'Recovery at {targetW} watts. Drink if you need to.'],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride for {remainingS}. Ride by feel.'],
    [1, 'ERG off. Choose your own effort.'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown. Easy spinning to finish.'],
    [1, 'Cooldown for {remainingS}. Let your heart rate settle.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds. Next: {targetW} watts.'],
  [1, 'Ten seconds to the interval. Get into position.'],
  [1, 'Get ready: {targetW} watts for {durationS} in ten seconds.'],
  [1, 'Ten seconds. Bring your cadence up.'],
  [1, 'Interval in ten. Relax your grip.'],
  [1, 'Ten seconds to go. Deep breath.'],
  [1, 'Ten seconds to the all-out effort.', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, 'Halfway. {remainingS} to go.'],
  [1, 'Halfway there. Hold {targetW}.'],
  [1, 'Halfway. You are at {power} watts; the target is {targetW}.'],
  [1, 'Past halfway. Stay smooth and keep breathing.'],
  [1, 'Half done. Relax your upper body.'],
  [1, 'Halfway and right on target.', when(gte('pct', 98))],
  [1, 'Halfway. You are {deficitW} watts under; bring it up gradually.', when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute left.'],
  [1, 'Last minute. Hold {targetW}.'],
  [1, 'Final minute. Stay seated and smooth.'],
  [1, 'One minute to go. Keep the cadence up.'],
  [1, 'Last 60 seconds. Finish at target, not above it.'],
  [1, 'Final minute. Breathe and hold.'],
  [1, 'One minute left and {deficitW} watts under. Bring it up if you can.', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'Interval complete. Average {avgW} watts.'],
  [1, 'Done. {pct}% of target.'],
  [1, 'Interval done. Good control.'],
  [1, 'Complete. Spin easy.'],
  [1, 'Well paced. Recover now.'],
  [1, 'Done. That was on target.'],
  [1, 'Set complete. Well executed.', when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, 'Interval done at {pct}% of target. Recover and reset.'],
  [1, 'Finished at {avgW} watts against {targetW}. Consider lowering intensity for the next one.'],
  [1, 'Interval complete, below target. Use the recovery well.'],
  [1, 'Done. The average was {pctUnder}% under target.'],
  [1, 'That one came in under. Pace the start more evenly next time.'],
  [1, 'Interval over. If the next one feels out of reach, lower the intensity a few percent.'],
  [1, 'Below target this time. Drink, breathe, reset.'],
])

b.add('under_target', [
  [1, 'You are {deficitW} watts under target.'],
  [1, '{power} watts; the target is {targetW}.'],
  [1, 'Under target. Raise your cadence slightly to help the trainer.'],
  [1, 'Power is below target. Shift to an easier gear and spin up.'],
  [1, 'Falling short by {pctUnder}%. Bring it back gradually.'],
  [1, 'Target is {targetW}. Ease back up to it.'],
  [1, 'Well under target. If this is not sustainable, lower the intensity.', when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, 'You are {surplusW} watts over target this early. Settle in.'],
  [1, 'Too hot for the start: {power} against {targetW}. Ease back.'],
  [1, 'Over target early. Save it for the second half.'],
])

b.add('cadence_sag', [
  [1, 'Cadence down to {cadence}. Aim for {cadenceAvg}.'],
  [1, 'Cadence has dropped {cadenceDrop} rpm. Spin a little faster.'],
  [1, 'Cadence is sagging. Lighten the gear if you can.'],
  [1, 'Pick up the cadence.'],
  [1, 'Cadence {cadence}. Smooth circles.'],
  [1, 'Your cadence is falling. Stay relaxed and spin.'],
  [1, 'Cadence is {cadenceDrop} rpm below your average. Bring it back up.'],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}, above your cap of {hrCap}. Ease off.'],
  [1, 'Heart rate is above the zone cap. Reduce power slightly.'],
  [1, 'Heart rate high at {hr}. Back off until it settles.'],
])

b.add('hr_spike_no_power', [
  [1, 'Heart rate reads {hr} with little power. Probably a strap glitch; moisten the contacts.'],
  [1, 'Heart-rate spike without power. Check the strap fit.'],
])

b.add('stopped_pedaling', [
  [1, 'Paused. Take the time you need.'],
  [1, 'Pedaling stopped. The workout resumes when you do.'],
  [1, 'Stopped. Resume when ready.'],
  [1, 'Paused. Drink something while you are off the pedals.'],
  [1, 'Pedaling stopped at {elapsedMin} minutes.'],
  [1, 'Taking a break. Start with a gentle spin when you return.'],
])

b.add('resumed', [
  [1, 'Welcome back. Ease into it.'],
  [1, 'Resumed after {pausedS}. Build up gradually.'],
  [1, 'Back on the pedals. Start smooth.'],
])

b.add('skipped_interval', [
  [1, 'Interval skipped.'],
  [1, 'Skipped {segmentLabel}. Moving on.'],
  [1, 'Interval skipped. Next segment starting.'],
  [1, 'Skipped. Consider lowering intensity if the intervals feel out of reach.'],
  [1, 'Moving to the next segment.'],
  [1, 'Interval skipped. Recover and continue.'],
])

b.add('extended_interval', [
  [1, 'Interval extended by {extraS}.'],
  [1, 'Added {extraS}. Same target.'],
  [1, 'Extended. Hold steady.'],
])

b.add('intensity_down', [
  [1, 'Intensity lowered to {intensityPct}%.'],
  [1, 'Intensity down to {intensityPct}%. A good call if you need it.'],
  [1, 'Intensity reduced. Targets adjusted.'],
  [1, 'Lower intensity set. Focus on form.'],
  [1, 'Intensity now {intensityPct}%.'],
  [1, 'Targets reduced. Keep the quality high.'],
])

b.add('intensity_up', [
  [1, 'Intensity raised to {intensityPct}%.'],
  [1, 'Intensity up. Targets increased.'],
  [1, 'Intensity now {intensityPct}%. Adjust gradually.'],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%. Pace carefully.'],
  [1, 'Your anaerobic reserve is low: {wbalPct}%.'],
  [1, 'W′bal below a quarter. Hold the target; do not surge.'],
  [1, 'Reserves running low. Stay smooth.'],
  [1, 'W′bal {wbalPct}%. Keep the effort even.'],
  [1, 'Low W′bal. Avoid any spikes above target.'],
])

b.add('wbal_empty', [
  [1, 'W′bal is empty. Ease off slightly to recover.'],
  [1, 'Anaerobic reserve used up. Hold at or below threshold.'],
  [1, 'W′bal at zero. Spin easier until it recovers.'],
])

b.add('pr', [
  [1, 'New {prLabel} personal record.'],
  [1, 'Personal record: {prLabel}, {power} watts.'],
  [1, 'That is a new {prLabel} best.'],
  [1, 'New {prLabel} PR. Nicely done.'],
  [1, 'Record set for {prLabel} power.'],
  [1, 'A new best for {prLabel}. It will be in your ride summary.'],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected FTP {projectedFtp}.'],
  [1, 'Minute {minute}. Hold steady.'],
  [1, 'Minute {minute}. Projected {projectedFtp}. Keep the pace even.'],
  [1, 'Minute {minute}. Start controlled; it should feel hard but steady.', when(lte('minute', 3))],
  [1, "Minute {minute}. Don't go out too hard.", when(lte('minute', 3))],
  [1, 'Minute {minute}. Projected FTP {projectedFtp}. Push if you have it.', when(gte('minute', 15))],
  [1, 'Minute {minute}. Final minutes: spend what is left, gradually.', when(gte('minute', 17))],
  [1, 'Minute {minute}. On pace for {projectedFtp}, {projectedGain} above your current FTP.', when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'Test complete. New FTP {ftpNew}, up {ftpGain} watts from {ftpOld}.', when(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew}. That is {ftpGain} watts higher. Your zones will update.', when(gt('ftpGain', 0))],
  [1, 'New FTP: {ftpNew} watts. Well paced.', when(gt('ftpGain', 0))],
  [
    1,
    'Test complete. FTP {ftpNew}, {ftpDrop} below your previous {ftpOld}. Fatigue, sleep and heat all affect a test.',
    when(gt('ftpDrop', 0)),
  ],
  [1, 'FTP measured at {ftpNew}. You can keep {ftpOld} if today was not representative.', when(gt('ftpDrop', 0))],
  [1, 'FTP unchanged at {ftpNew}. Consistent.', when(eq('ftpGain', 0))],
  [1, 'Test complete. FTP {ftpNew} watts.'],
])

b.add('workout_complete', [
  [1, 'Workout complete. {elapsedMin} minutes.'],
  [1, 'Done. Normalized power {np} watts, TSS {tss}.'],
  [1, 'Workout complete. Cool down as long as you like.'],
  [1, 'Finished. {kj} kJ of work.'],
  [1, 'Complete. Refuel within the hour.'],
  [1, 'Session complete. Well done.'],
  [1, 'Workout done. Intensity factor {intensityFactor}.'],
])

b.add('ride_bailed', [
  [1, 'Ride ended early at {elapsedMin} minutes.'],
  [1, 'Ride stopped. Rest and recover.'],
  [1, 'Ending early. Partial workouts still count.'],
  [1, 'Ride saved at {elapsedMin} minutes.'],
  [1, 'Stopped early. Note how you felt; it helps plan the next session.'],
  [1, 'Ride ended. Take care of your recovery.'],
])

b.add('fueling_reminder', [
  [1, 'Time to fuel. Take some carbs.'],
  [1, '{elapsedMin} minutes in. Eat something.'],
  [1, 'Fuel reminder: a gel or a few bites now.'],
  [1, 'Take on carbohydrate now to keep your energy up.'],
  [1, 'Eat while it is easy. Your later intervals depend on it.'],
  [1, 'Fueling check. Aim for steady carbs every 20 to 30 minutes.'],
])

b.add('hydration_reminder', [
  [1, 'Drink some water.'],
  [1, 'Hydration reminder. A few sips now.'],
  [1, '{elapsedMin} minutes in. Have a drink.'],
])

b.add('distress', [
  [1, 'Your numbers look unusual. Ease right off. Stop if anything feels wrong.'],
  [1, "Let's take it easy. Soft-pedal or stop, and breathe slowly. The workout can wait."],
  [1, 'Stop pushing for now. If you feel unwell, stop riding and get help.'],
])

b.add('idle_banter', [
  [1, 'Relax your shoulders.'],
  [1, 'Check your grip. Light hands.'],
  [1, 'Breathe deep and low.'],
  [1, 'Keep your knees tracking straight.'],
  [1, 'Smooth circles. No stomping.'],
  [1, 'Unclench your jaw.'],
  [1, 'Keep your core engaged and your upper body quiet.'],
  [1, 'Sip when you can.'],
  [1, 'Posture check: long spine, soft elbows.'],
  [1, '{elapsedMin} minutes in. Steady.'],
  [1, 'Cadence {cadence}, power {power}. All steady.'],
  [1, 'Stay relaxed. Tension wastes watts.'],
])

const NOT_END = [ne('milestoneKind', 'halfway'), ne('milestoneKind', 'finish')]
b.add(
  'journey_milestone',
  [
    [1, '{place}. {kmDone} km done, {kmLeft} km to go.'],
    [1, 'Reached {place}. {kmLeft} km remaining on {journeyName}.'],
  ],
  NOT_END,
)
b.add('journey_milestone', [
  [1, 'Now in {place}. {kmLeft} km to go.'],
  [1, '{place}. {kmDone} km into {journeyName}.'],
], [eq('milestoneKind', 'border')])
b.add('journey_milestone', [
  [1, 'Top of {place}. Recover on the descent.'],
  [1, 'Summit: {place}. Keep the pressure smooth over the top.'],
], [eq('milestoneKind', 'summit')])
b.add('journey_milestone', [
  [1, 'Halfway: {kmDone} km done, {kmLeft} km to go.'],
  [1, 'Halfway through {journeyName}. Pace yourself for the second half.'],
], [eq('milestoneKind', 'halfway')])
b.add('journey_milestone', [
  [1, '{place}. {journeyName} complete: {kmDone} km.'],
  [1, 'Journey complete at {place}. Well done.'],
], [eq('milestoneKind', 'finish')])

export const PROFESSIONAL: PersonaPack = {
  meta: {
    id: 'professional',
    name: 'Professional',
    tagline: 'Straight, useful cues. No jokes.',
    voiceHint: { rate: 1, pitch: 1, preferVoices: ['Samantha', 'Alex', 'Daniel'] },
  },
  lines: b.build(),
}
