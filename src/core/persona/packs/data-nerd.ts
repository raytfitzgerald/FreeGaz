// Data Nerd: lives for W′bal, NP, torque and a flat power trace. Metric puns,
// statistics jokes, and real numbers in nearly every line.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, ne, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('data-nerd')

b.add('ride_start', [
  [1, "Recording started. Sampling at one hertz. Let's collect some beautiful data."],
  [1, 'Ride initialized. Warm up gradually; heart rate lags power, so give it time.'],
  [2, "Today's dataset: {workoutName}. Hypothesis: you finish it."],
  [3, 'Starting the recording. Please avoid generating outliers.'],
  [4, "Ride start. Let's see if today's power curve is a curve or a scatter plot."],
  [5, "Recording. Let's make this ride file statistically significant, damn it.", P],
  [2, 'FTP test. Finally, a controlled experiment. Pace it evenly for clean data.', when(rideKind('ftp-test'))],
  [3, 'Free ride. Unstructured data. My favorite kind of chaos.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'Interval: {targetW} watts for {remainingS}. Aim for a flat power trace.'],
    [1, '{targetW} watts. Keep your variability index close to 1.0.'],
    [2, 'Interval start. {targetW} watts. Let the ERG do the math; you do the pedaling.'],
    [3, '{targetW} watts. Time to watch your W′bal descend like a well-behaved exponential.'],
    [4, '{targetW} watts for {remainingS}. Your power-duration curve is about to get an update.'],
    [5, "{targetW} watts. Pedal, damn it. The sample size won't grow itself.", P],
    [3, "Rep {rep} of {reps}. Statistically, you're {repsLeft} reps from done."],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'Final rep. Last data point in the set. Make it a good one.'],
    [4, 'Last rep. The fatigue curve says this one is the hardest. The fatigue curve is right.'],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, "Maximum effort for {remainingS}. Let's find your true peak power."],
    [4, 'All out. I want a spike on that graph so tall it needs its own axis.'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'Ramp. Linear increase in load. Nonlinear increase in suffering.'],
    [4, 'Ramp test. The only experiment where the subject decides when it ends.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warmup. Easy aerobic work while your enzymes wake up.'],
    [3, "Warmup. Heart rate lags power by about a minute. Don't chase it."],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady block: {targetW} watts for {remainingS}. Watch for cardiac drift.'],
    [3, 'Steady at {targetW}. An aerobic decoupling test, whether you like it or not.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery. W′bal is recharging. Spin easy.'],
    [2, 'Rest for {remainingS}. W′bal reconstitution in progress.'],
    [4, 'Recovery. Your W′bal refills exponentially. Your patience, apparently, linearly.'],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride for {remainingS}. Uncontrolled variables. Exciting.'],
    [3, 'ERG off. Your variability index is about to have opinions.'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown. Let heart rate return toward baseline.'],
    [3, 'Cooldown. It barely moves your TSS, but it helps your recovery.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds to the interval.'],
  [1, 'T minus ten seconds.'],
  [2, 'Ten seconds to {targetW} watts. Pre-load the pedals.'],
  [3, 'Ten seconds. Your W′bal is at a local maximum. Enjoy the view.'],
  [4, "Ten seconds. The null hypothesis is that you survive. Let's test it."],
  [5, 'Ten seconds. Brace for a damn steep gradient on your power chart.', P],
  [2, 'Ten seconds to max effort. Prepare for a new data point.', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, 'Halfway. {remainingS} remaining.'],
  [2, 'Fifty percent complete. Power {power}, target {targetW}.'],
  [3, "Halfway. The second half is statistically harder. It's not you, it's physiology."],
  [4, 'Halfway. Your W′bal slope looks like my savings account.'],
  [5, 'Halfway. The regression line points straight down. Damn it, buck the trend.', P],
  [2, 'Halfway and within two percent of target. Lovely precision.', when(gte('pct', 98))],
  [3, "Halfway, {deficitW} watts under. Your average is drifting. Let's correct it.", when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute remaining.'],
  [1, 'Final minute. Keep the variability low.'],
  [2, 'Last minute. Hold {targetW}; the average is almost locked in.'],
  [3, "Sixty seconds. That's only sixty more samples."],
  [4, 'Final minute. Your lactate is making strong arguments. Ignore the rhetoric.'],
  [5, "Last minute. Hold it, damn it. I don't want an asterisk on this interval.", P],
  [3, 'One minute, {deficitW} watts under. Sixty good samples can still lift the average.', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'Interval complete. {pct}% of target.'],
  [1, 'Average {avgW} watts. Clean execution.'],
  [2, "Done. Low variability. That's a beautiful trace."],
  [3, "{pct}% of target. I'd frame this interval, but it's a CSV."],
  [4, 'Complete. That power trace is so flat you could calibrate a spirit level with it.'],
  [5, "Damn fine interval. The data is chef's-kiss clean.", P],
  [2, 'Set complete. Nice dataset.', when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, 'Interval complete at {pct}% of target. Noted.'],
  [2, "Average {avgW} against {targetW}. That's a {pctUnder}% shortfall."],
  [3, '{pct}% of target. The error bars on your effort are... generous.'],
  [3, 'That interval was an outlier. The bad kind.'],
  [4, "Under target. If this were a lab result, I'd ask for a retest."],
  [4, 'Came in under. Correlation between excuses and wattage: strongly negative.'],
  [5, "{pct}%. Damn it, that's not a data point, that's noise.", P],
])

b.add('under_target', [
  [1, '{deficitW} watts below target.'],
  [1, 'Power {power}, target {targetW}. Increase slightly.'],
  [2, "You're {pctUnder}% under. Try a slightly higher cadence to help the ERG."],
  [3, 'Current deficit: {deficitW} watts. The integral of that is going to dent your average.'],
  [4, "{power} watts. That's a rounding error with ambitions."],
  [5, 'Under target. Your watts are trending like a damn bear market.', P],
  [3, "{pct}% of target. That's not variance. That's a different workout.", when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, "{surplusW} watts over target this early. You'll pay for that in W′bal."],
  [3, '{power} watts at the start. Positive splits are statistically doomed.'],
  [4, 'Too hot. Your W′bal model is sending me anxious notifications.'],
])

b.add('cadence_sag', [
  [1, 'Cadence down to {cadence} from {cadenceAvg}.'],
  [2, 'Cadence dropped {cadenceDrop} rpm. Torque is up to {torqueNm} N·m.'],
  [2, 'Cadence sag. {torqueNm} N·m per stroke. Lighten it up.'],
  [3, "Cadence {cadence}. Same watts, more torque. You've switched from spinning to squatting."],
  [3, 'Cadence down {cadenceDrop}. Torque-ing points: spin faster, strain less.'],
  [4, '{cadence} rpm. Your cadence has more drift than a cheap GPS.'],
  [5, "Cadence {cadence}. That's a damn torque festival. Spin it up.", P],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}, above your cap of {hrCap}. Ease off a little.'],
  [2, '{hr} bpm. Above the cap for this segment. Reduce power slightly.'],
  [3, "Heart rate over the cap. Cardiac drift is real; let's not feed it."],
])

b.add('hr_spike_no_power', [
  [1, "Heart rate {hr} at {power} watts. That's not physiology, that's a strap artifact."],
  [2, '{hr} bpm with minimal power. Classic electrode dropout. Wet the strap.'],
  [3, 'That heart-rate spike fails every plausibility check I have. Sensor glitch.'],
])

b.add('stopped_pedaling', [
  [1, 'Pedaling stopped. Recording paused.'],
  [1, 'Paused. A good moment for a drink.'],
  [2, 'Zero cadence detected. Moving time is paused; nothing is lost.'],
  [3, 'Stopped at {elapsedMin} minutes. Your power trace just dropped to zero. Dramatic.'],
  [4, "Stopped. Your average power is plummeting... no, wait, pauses are excluded. You're safe. For now."],
  [5, 'Stopped again? Damn it, this is going to wreck my smoothing algorithm.', P],
])

b.add('resumed', [
  [1, 'Recording resumed.'],
  [2, 'Back after {pausedS}. W′bal got a nice refill.'],
  [4, 'Resumed. The data gap has been noted and will be judged.'],
])

b.add('skipped_interval', [
  [1, 'Interval skipped. Logged.'],
  [2, "Skipped {segmentLabel}. That's a missing data point."],
  [3, 'Interval skipped. Your training stress just took a small hit.'],
  [3, 'Skipped. Your TSS is sad. So is my spreadsheet.'],
  [4, "Skip recorded. The workout's compliance score is now... let's not."],
  [5, 'You skipped it. Damn it, now I have a gap in the dataset.', P],
])

b.add('extended_interval', [
  [1, 'Interval extended by {extraS}.'],
  [3, 'Added {extraS}. More samples. I love more samples.'],
  [4, 'Extended. Your power-duration curve is about to get interesting.'],
])

b.add('intensity_down', [
  [1, 'Intensity reduced to {intensityPct}%.'],
  [2, '{intensityPct}%. Targets scaled accordingly.'],
  [3, 'Intensity down. Your TSS projection just got revised downward.'],
  [3, 'Intensity lowered. Better to complete at {intensityPct}% than bail at a hundred.'],
  [4, "{intensityPct}%. The ERG sighed. I didn't know ERGs could sigh."],
  [5, 'Down to {intensityPct}%. Damn, there goes my beautiful chart.', P],
])

b.add('intensity_up', [
  [1, 'Intensity raised to {intensityPct}%.'],
  [3, "{intensityPct}%. Bold hypothesis. Let's test it."],
  [4, "Intensity up. Your projected TSS is climbing. I'm so excited."],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%. Stay below critical power where you can.'],
  [2, "W′bal {wbalPct}%. You're deep into your anaerobic reserve."],
  [2, 'Low W′bal. Even pressure, no spikes above critical power.'],
  [3, 'W′bal down to {wbalPct}%. That exponential decay is getting personal.'],
  [4, "{wbalPct}% W′bal. You're burning matches faster than the model can count."],
  [5, 'W′bal {wbalPct}%. Damn it, stop surging. The model is begging you.', P],
])

b.add('wbal_empty', [
  [1, 'W′bal empty. Ride at or below critical power to recover.'],
  [3, "W′bal at zero. By the model, you shouldn't be able to do this. Prove the model wrong."],
  [4, "Zero W′bal. You're now an unsolved problem in exercise physiology."],
])

b.add('pr', [
  [1, 'New {prLabel} power record.'],
  [1, "That's a new {prLabel} best. Saved to your records."],
  [2, '{prLabel} PR: {power} watts. Your power-duration curve just moved.'],
  [3, "New {prLabel} best. I've updated the curve. I may have also teared up."],
  [4, "{prLabel} PR. That's a statistically significant improvement. P less than point oh five."],
  [5, '{prLabel} PR! Damn! That point is off my chart!', P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected FTP {projectedFtp}.'],
  [2, 'Minute {minute}. Pacing is even. Keep the variance low.'],
  [3, 'Minute {minute}. Projected {projectedFtp}. Confidence interval narrowing.'],
  [1, 'Minute {minute}. Hold back slightly. Even pacing gives the best estimate.', when(lte('minute', 3))],
  [3, 'Minute {minute}. Early data is unreliable. So is early enthusiasm.', when(lte('minute', 3))],
  [2, 'Minute {minute}. Final minutes. Negative split if you have it.', when(gte('minute', 15))],
  [4, 'Minute {minute}. Anything held in reserve is wasted data. Spend it.', when(gte('minute', 17))],
  [2, 'Minute {minute}. Projected {projectedFtp}, {projectedGain} above your current FTP. Promising trend.', when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'Test complete. New FTP {ftpNew}, up {ftpGain} watts. Zones recalculated.', when(gt('ftpGain', 0))],
  [3, "{ftpNew} watts, a {ftpGain} watt improvement. I'm updating every chart I own.", when(gt('ftpGain', 0))],
  [5, "Up {ftpGain} to {ftpNew}! Damn, that's a beautiful delta!", whenP(gt('ftpGain', 0))],
  [
    1,
    'FTP {ftpNew}, {ftpDrop} below {ftpOld}. Sleep, heat and fatigue all add noise. One test is one sample.',
    when(gt('ftpDrop', 0)),
  ],
  [3, "{ftpNew}. Down {ftpDrop}. Could be signal, could be noise. Let's collect more data before panicking.", when(gt('ftpDrop', 0))],
  [2, 'FTP {ftpNew}. Identical to before. Remarkably reproducible.', when(eq('ftpGain', 0))],
  [1, 'Test complete. Estimated FTP {ftpNew} watts.'],
])

b.add('workout_complete', [
  [1, 'Workout complete. {elapsedMin} minutes recorded.'],
  [1, 'Done. NP {np}, TSS {tss}. Lovely numbers.'],
  [2, 'Finished. {kj} kJ of work. Refuel accordingly.'],
  [2, 'Complete. {tss} TSS added to your chronic training load.'],
  [3, "Complete. Intensity factor {intensityFactor}. That's a respectable day at the office."],
  [4, "Workout done. I'll be analyzing this file for the next several hours. Don't wait up."],
  [5, 'Done. Damn, look at that NP: {np} watts.', P],
])

b.add('ride_bailed', [
  [1, 'Ride ended at {elapsedMin} minutes. Data saved.'],
  [2, 'Stopped early. Partial data is still data.'],
  [3, 'Ended at {elapsedMin} minutes. The ride file has a cliffhanger ending.'],
  [3, 'Early termination. The experiment is inconclusive.'],
  [4, 'Bailed. The completion rate for this plan just dropped below one.'],
  [5, 'Quitting at {elapsedMin} minutes? Damn it, my charts were just getting interesting.', P],
])

b.add('fueling_reminder', [
  [1, 'Fuel reminder. Aim for 60 to 90 grams of carbohydrate per hour.'],
  [1, 'Carbohydrate time. Small, regular doses work best.'],
  [2, "{elapsedMin} minutes in. Glycogen isn't infinite. Eat."],
  [3, 'Eat now. Muscle glycogen is a finite resource, unlike my interest in your data.'],
  [4, 'Fuel. Hitting the wall is not a data point I want to collect.'],
  [5, 'Eat a damn gel. Bonking ruins the power curve.', P],
])

b.add('hydration_reminder', [
  [1, 'Hydration reminder. Sweat rate indoors is high.'],
  [2, 'Drink. Losing two percent of your fluids costs measurable power.'],
  [3, 'Sip now. Core temperature and heart-rate drift both improve with fluids.'],
])

b.add('distress', [
  [1, 'Your numbers look unusual. Forget the data. Ease off and stop if anything feels wrong.'],
  [1, 'Pausing the analysis. Soft-pedal or stop, and breathe slowly. You matter more than the file.'],
])

b.add('idle_banter', [
  [1, 'All metrics nominal.'],
  [1, 'Power {power}, cadence {cadence}. Steady state achieved.'],
  [2, 'Fun fact: your torque right now is about {torqueNm} N·m.'],
  [2, '{elapsedMin} minutes of clean data. Delightful.'],
  [2, 'Did you know a smooth pedal stroke improves efficiency? Now you do. You are welcome.'],
  [3, "Your cadence has a lovely low standard deviation. I'm not crying, you're crying."],
  [3, 'Pedal smoothly and NP stays close to average power. Smooth is efficient. Efficient is fast.'],
  [3, "I love a good power curve. All curves, no drama. Unlike your interval choices."],
  [4, 'Your W′bal chart looks like a mountain range drawn by someone very tired.'],
  [4, "Fun fact: I've calculated your excuses per hour. It's trending up."],
  [5, "I've seen smoother data from a broken thermostat."],
  [5, 'Pedal smoother, damn it. My variability index is weeping.', P],
])

b.add('under_target', [[5, '{power} watts. That sample is fucking noise. Get back on target.', P]])
b.add('idle_banter', [[5, 'This power trace is shit. Smooth it out.', P]])

// Unhinged: strong profanity, only for riders who asked for it.
b.add('ride_start', [
  [1, "Recording at one hertz. Let's collect some fucking beautiful data.", P],
  [4, "Dataset: {workoutName}. Null hypothesis: you half-ass it. Let's reject that shit.", P],
])
b.add(
  'segment_start',
  [
    [2, '{targetW} watts for {remainingS}. Clean data only. No fucking outliers.', P],
    [5, '{targetW} watts. Spike to 600 in the first ten seconds and I will lose my shit.', P],
  ],
  [HARD],
)
b.add('countdown_10s', [[3, 'Ten seconds. Brace for a step function. A big fucking step function.', P]])
b.add('halfway', [[3, 'Halfway. Sample size is fine. The effect size is shit. Push.', P]])
b.add('last_minute', [[2, "Sixty seconds. Hold {targetW}. Don't fuck up my rolling average.", P]])
b.add('segment_end_success', [
  [1, '{pct}% of target. That is some statistically significant shit. Beautiful.', P],
  [5, '{avgW} on a {targetW} target. P less than 0.05. You fucking legend.', P],
])
b.add('segment_end_failed', [
  [3, "{pct}%. That's not variance, that's bullshit with error bars.", P],
  [5, 'Average {avgW}. Target {targetW}. I ran the numbers. The numbers say what the fuck.', P],
])
b.add('under_target', [
  [2, "{deficitW} watts under. Regress to the target, for fuck's sake.", P],
  [4, "{power} watts. That's two standard deviations of bullshit below target.", P],
])
b.add('cadence_sag', [[3, '{torqueNm} newton meters of torque. That is a fucking grind, not a spin.', P]])
b.add('stopped_pedaling', [[4, 'Stopped. Now I have zeros in my fucking dataset. Well, nulls. Missing is not zero.', P]])
b.add('skipped_interval', [[3, "Skipped {segmentLabel}. That's missing data, and missing data is shit data.", P]])
b.add('intensity_down', [[4, '{intensityPct}%. You just rescaled the whole fucking y-axis.', P]])
b.add('wbal_low', [[3, 'W′bal {wbalPct}%. The model is screaming. Stop fucking surging.', P]])
b.add('pr', [[2, '{prLabel} PR at {power} watts. Fucking gorgeous outlier. Keeping it.', P]])
b.add('ftp_test_minute', [[3, 'Minute {minute}. Projected {projectedFtp}. The confidence interval is tightening. Hold that shit.', P]])
b.add('ftp_test_result', [[4, 'FTP {ftpNew}. Recalculating every fucking zone. This is my favourite part.', P]])
b.add('workout_complete', [
  [1, 'Done. {tss} TSS, {kj} kilojoules. Fucking lovely numbers.', P],
  [5, "NP {np}, TSS {tss}. I'm going to stare at this shit for an hour.", P],
])
b.add('ride_bailed', [[4, 'Ending at {elapsedMin} minutes. Incomplete file. Truncated. Fucking tragic.', P]])
b.add('fueling_reminder', [[3, '{elapsedMin} minutes in. Eat, or the back half of your power curve goes to shit.', P]])
b.add('idle_banter', [
  [2, "Power {power}, cadence {cadence}. Low variability. Fucking chef's kiss.", P],
  [5, "Correlation isn't causation. But cadence dropping and watts going to shit? That's causation.", P],
])

const NOT_END = [ne('milestoneKind', 'halfway'), ne('milestoneKind', 'finish')]
b.add(
  'journey_milestone',
  [
    [1, '{place}. {kmDone} km logged, {kmLeft} km to go.'],
    [2, 'Waypoint reached: {place}. Updating the progress bar. Very satisfying.'],
    [3, '{place}. I have plotted your distance curve. It goes up and to the right.'],
    [4, '{place}. At this pace I can tell you your arrival time to the minute. I will. Later.'],
    [5, '{place}. {kmLeft} km left. Damn, that is a clean distance trace.', P],
    [5, '{place}. {kmLeft} km left. A clean distance trace.'],
  ],
  NOT_END,
)
b.add('journey_milestone', [
  [1, 'Border crossed: {place}. New region, same physics.'],
  [3, '{place}. Fun fact: the rolling resistance does not care which country it is in.'],
], [eq('milestoneKind', 'border')])
b.add('journey_milestone', [
  [1, 'Summit: {place}. Highest point of the segment. Gradient now negative. Lovely.'],
  [3, 'Top of {place}. Your W/kg on that climb deserves its own spreadsheet.'],
], [eq('milestoneKind', 'summit')])
b.add('journey_milestone', [
  [1, 'Halfway. Exactly 50 percent of {journeyName}. Give or take a rounding error.'],
  [3, 'Halfway: {kmDone} km. The progress bar is now more full than empty. Statistically significant.'],
], [eq('milestoneKind', 'halfway')])
b.add('journey_milestone', [
  [1, '{place}. {journeyName} complete: {kmDone} km. Exporting the data now.'],
  [3, '{place}. Journey complete. I have a chart of every kilometre. You want to see it. Trust me.'],
], [eq('milestoneKind', 'finish')])

export const DATA_NERD: PersonaPack = {
  meta: {
    id: 'data-nerd',
    name: 'Data Nerd',
    tagline: 'W′bal, NP, torque and puns. Lives for a flat power trace.',
    voiceHint: { rate: 1.1, pitch: 1.05, preferVoices: ['Alex', 'Tom', 'Samantha'] },
  },
  lines: b.build(),
}
