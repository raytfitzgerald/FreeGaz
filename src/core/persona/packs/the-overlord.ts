// The Overlord: an original mock-dictator of the fictional People's Republic of
// Pain, served by the Ministry of Watts and the Bureau of Revolutions (per
// minute). Grand decrees, loyal minions, absurd bureaucratic threats. Entirely
// invented: no real regimes, leaders or other fitness brands' characters.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('the-overlord')

b.add('ride_start', [
  [1, "Welcome, minion, to the People's Republic of Pain. Your Overlord is pleased you have reported for duty."],
  [1, 'The session begins. By decree, the first minutes shall be easy.'],
  [2, "Today's program, approved by the Ministry of Watts: {workoutName}. The Ministry does not accept complaints."],
  [3, 'Minion! You are late. The Ministry of Punctuality has been notified.'],
  [4, 'Report for suffering, minion. The Five-Minute Plan waits for no one.'],
  [5, 'Bow before the flywheel, minion. Then get the hell back in the saddle.', P],
  [2, 'Today, the Republic measures your worth. In watts. As is tradition.', when(rideKind('ftp-test'))],
  [3, 'A free ride? In MY republic? Very well. The Overlord permits it, just this once.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'By decree of the Overlord: {targetW} watts for {remainingS}. Begin!'],
    [1, 'The Ministry of Watts demands {targetW}. Deliver it, minion!'],
    [2, 'Interval! {targetW} watts! The Republic is watching!'],
    [3, '{targetW} watts, minion. Fail, and you will be reassigned to the Department of Gentle Spinning.'],
    [4, 'Decree number {rep}: {targetW} watts for {remainingS}. Disobedience goes in your permanent file.'],
    [5, '{targetW} watts! Pedal, minion, or the Overlord revokes your damn snack privileges!', P],
    [3, 'Rep {rep} of {reps}. The Five-Minute Plan proceeds exactly as the Overlord intended.'],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'The final decree of the set: {targetW} watts. Glory awaits the obedient!'],
    [4, 'Last rep, minion. Complete it and the Overlord may grant you a medal. Made of cardboard.'],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, 'The Overlord commands your maximum! Everything, for {remainingS}!'],
    [4, 'Max effort, minion. The Ministry wants your true output. No lies. Only watts.'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'The Great Staircase begins! Each minute harder, exactly as the Overlord intended!'],
    [4, 'The ramp, minion. Climb until the Republic is satisfied. The Republic is never satisfied.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, "The warmup, minion. Even the Overlord's legs require preparation."],
    [3, 'Warm up. The Ministry of Warmups has strict standards and no sense of humor.'],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'A steady decree: {targetW} watts for {remainingS}. Consistency pleases the Overlord.'],
    [3, 'Steady at {targetW}. The Bureau of Monotony salutes you.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery, minion. The Overlord is merciful. Briefly.'],
    [2, 'Rest for {remainingS}. The Ministry of Recovery has approved your breathing.'],
    [4, 'Recovery. Do not mistake mercy for weakness. The next decree is already written.'],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride, minion. Show the Overlord your initiative.'],
    [3, 'No target for {remainingS}. The Ministry wonders what you do without orders. Do not disappoint the Ministry.'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'The cooldown, minion. You have served the Republic well today.'],
    [3, 'Cooldown. The Overlord allows you to spin gently. Gratitude is expected.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds, minion. Prepare yourself.'],
  [1, 'In ten seconds, the decree takes effect!'],
  [2, 'Ten seconds until {targetW} watts. The Ministry has spoken.'],
  [3, 'Ten seconds. The Bureau of Excuses is closed for the next {durationS}.'],
  [4, 'Ten seconds, minion. Stop looking at the clock and start respecting it.'],
  [5, 'Ten seconds! Brace your bloody self, minion!', P],
  [2, 'Ten seconds to the Supreme Effort. Hold nothing back from the Republic!', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, 'Halfway, minion. The Overlord is... not displeased.'],
  [2, 'Halfway! {remainingS} remain. The Republic endures, and so shall you.'],
  [3, 'Halfway. The Ministry of Watts reports acceptable output. Do not let it go to your quads.'],
  [4, 'Halfway. Your legs have filed a petition. The Overlord has shredded it.'],
  [5, 'Halfway, minion. The second half is mandatory. So is the suffering. Bloody obviously.', P],
  [2, "Halfway and on target. The Overlord will mention you in tonight's broadcast.", when(gte('pct', 98))],
  [3, 'Halfway, and {deficitW} watts short. The Ministry has opened an inquiry.', when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute, minion! Glory is near!'],
  [1, 'Final minute! The Overlord believes in you. Believing back is mandatory.'],
  [2, 'The final minute! Hold {targetW}, by order of the Overlord!'],
  [3, "Sixty seconds. The Republic's anthem is a single long groan. Sing it."],
  [4, 'One minute. Complete this decree, or the Ministry will demand a sequel.'],
  [5, "Last minute! Finish it, minion, or I'll make the next interval twice as bloody long!", P],
  [3, 'One minute left and {deficitW} short. The Ministry offers one final chance at redemption.', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'Decree fulfilled! The Overlord is pleased.'],
  [1, '{pct}% of target. The Ministry of Watts records your obedience.'],
  [2, 'Excellent, minion. You may have one extra breath. Use it wisely.'],
  [3, 'Well done. The Overlord will name a small, unimportant bridge after you.'],
  [4, "Acceptable. The Overlord does not say 'good'. The Overlord says 'acceptable'. Treasure it."],
  [5, 'Bloody magnificent, minion. Do not tell the other minions I said so.', P],
  [2, 'The set is complete. The Republic celebrates with thirty seconds of mild clapping.', when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, '{pct}% of target. The Overlord forgives you. Once.'],
  [2, 'Average {avgW}, demanded {targetW}. The Ministry has questions.'],
  [3, '{pctUnder}% under the decree. Your file grows thicker.'],
  [3, 'Insufficient, minion. The Bureau of Disappointment will be in touch.'],
  [4, 'That interval has been classified as a state secret. For your sake.'],
  [4, 'Below target. The Overlord is not angry. The Overlord is drafting a strongly worded decree.'],
  [5, '{pct}%? Bloody insolence against the Ministry of Watts. Report for remedial spinning.', P],
])

b.add('under_target', [
  [1, 'Minion, you are {deficitW} watts below the decree.'],
  [1, 'The Ministry demands {targetW}. You offer {power}. Negotiations are closed.'],
  [2, '{power} watts? The Republic expected more. The Republic always expects more.'],
  [3, 'Under target. The Bureau of Revolutions per Minute is watching you very closely.'],
  [4, '{deficitW} watts short. Your ration of glory has been reduced accordingly.'],
  [5, 'Under target, minion! The Overlord did not build this bloody empire on {power} watts!', P],
  [3, '{pct}% of the decree. That is not service. That is sabotage.', when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, 'Patience, minion. {surplusW} watts over. The decree says {targetW}.'],
  [3, '{power} watts so early? Enthusiasm is admirable. Obedience is mandatory.'],
  [4, 'Too hot, minion! The Ministry of Pacing did not authorize this display!'],
])

b.add('cadence_sag', [
  [1, 'Your cadence falls, minion. Raise it.'],
  [2, 'Cadence {cadence}. The Bureau of Revolutions per Minute requires {cadenceAvg}.'],
  [2, 'The Overlord decrees: quicker feet, lighter gear, immediately.'],
  [3, 'Cadence down {cadenceDrop} rpm. The Bureau of Revolutions has been notified.'],
  [3, "Spin faster, minion. The Republic's power grid depends on it. Probably."],
  [4, "Cadence {cadence}? The Overlord's ceremonial snail spins faster."],
  [5, 'Cadence {cadence}! Spin, minion, spin, before I lose my bloody patience!', P],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}, above your cap of {hrCap}. Even the Overlord says ease off.'],
  [2, '{hr} bpm. The Ministry of Hearts orders you to back off slightly.'],
  [3, 'Heart rate over the cap. A rested minion serves the Republic longer. Ease off.'],
])

b.add('hr_spike_no_power', [
  [1, 'Heart rate {hr} at {power} watts? The strap is spreading rumors. Wet it.'],
  [2, 'The Ministry detects a heart rate of {hr} while you coast. The strap is under arrest.'],
  [3, 'That heart-rate reading is a forgery. The Bureau of Sensors will look into it.'],
])

b.add('stopped_pedaling', [
  [1, 'You rest, minion. The Overlord permits a brief pause.'],
  [1, 'Pause granted. Drink. Then return to service.'],
  [2, 'The pedals have stopped. The Ministry of Motion is concerned.'],
  [3, 'Stopped at {elapsedMin} minutes? The Republic does not stop. The Republic merely pauses dramatically.'],
  [4, 'Halted without a permit, minion? The paperwork alone will take longer than the interval.'],
  [5, 'You stopped? Get back on the bloody bike before the Overlord drafts a decree about it.', P],
])

b.add('resumed', [
  [1, 'The minion returns. Ease back into service.'],
  [2, 'Back after {pausedS}. The Ministry has logged your absence.'],
  [4, 'You have returned. The Overlord had already begun composing your farewell decree.'],
])

b.add('skipped_interval', [
  [1, 'An interval skipped. The Overlord will allow it. This time.'],
  [2, 'Skipped {segmentLabel}? The Ministry of Watts has recorded this in your file.'],
  [3, 'Skipping decrees is not how one earns the Order of the Golden Crank.'],
  [3, 'That interval has been skipped and replaced with a small portrait of disappointment.'],
  [4, "You skipped it. The Overlord has renamed that interval The Minion's Shame."],
  [5, 'Skipped?! The Ministry has seen braver acts from a bloody houseplant.', P],
])

b.add('extended_interval', [
  [1, 'Extended by {extraS}! Your devotion pleases the Overlord!'],
  [3, 'You added {extraS} voluntarily. The Ministry suspects a clerical error.'],
  [4, 'More time? The Overlord is moved. The Overlord is never moved. This is unprecedented.'],
])

b.add('intensity_down', [
  [1, 'Intensity down to {intensityPct}%. The Overlord grants this mercy.'],
  [2, '{intensityPct}%. The Ministry approves your request, with a heavy sigh.'],
  [3, 'Intensity reduced. The Bureau of Excuses thanks you for your continued business.'],
  [3, 'Intensity lowered. This will be remembered at the annual parade of disappointments.'],
  [4, "{intensityPct}%? The Overlord's statue weeps quietly in the town square."],
  [5, 'Down to {intensityPct}%?! Bloody hell, minion. The Five-Minute Plan is in shambles.', P],
])

b.add('intensity_up', [
  [1, 'Intensity raised to {intensityPct}%! The Republic cheers!'],
  [3, 'You turned it up? The Overlord approves. A commemorative stamp is being printed.'],
  [4, '{intensityPct}%! Such zeal! The Ministry is almost suspicious.'],
])

b.add('wbal_low', [
  [1, "W′bal at {wbalPct}%, minion. Conserve the state's resources."],
  [2, '{wbalPct}% W′bal. The Ministry of Reserves urges restraint.'],
  [2, 'Low reserves. By decree: no surges until further notice.'],
  [3, 'Reserves low. You spent the treasury in the first minute, minion.'],
  [4, "W′bal {wbalPct}%. The Republic's matchbook is nearly empty. Who authorized all those surges?"],
  [5, 'W′bal at {wbalPct}%! You bloody spendthrift! Steady pressure, now!', P],
])

b.add('wbal_empty', [
  [1, 'W′bal empty. Hold steady, minion. The Republic believes in you.'],
  [3, 'The treasury is empty. Now you ride on loyalty alone.'],
  [4, 'Zero W′bal. The Ministry of Reserves has declared a state of mild panic.'],
])

b.add('pr', [
  [1, 'A new {prLabel} record! The Overlord decrees a celebration!'],
  [1, 'New {prLabel} best! Your name enters the Hall of Watts!'],
  [2, '{prLabel} PR at {power} watts! A statue will be commissioned. A small one.'],
  [3, 'New {prLabel} best. The Ministry of Watts will print it on the currency.'],
  [4, 'A {prLabel} PR. The Overlord is... moved. Guards, pretend you did not see that.'],
  [5, '{prLabel} PR! Bloody glorious, minion! Take the rest of the second off!', P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected {projectedFtp}. The Republic observes.'],
  [2, 'Minute {minute}. Hold steady, minion. The Ministry is taking notes.'],
  [3, 'Minute {minute}. Projected {projectedFtp}. The Ministry is updating your classification.'],
  [1, 'Minute {minute}. Restraint, minion. The decree is long.', when(lte('minute', 3))],
  [3, 'Minute {minute}. Heroes who start fast end up as cautionary statues.', when(lte('minute', 3))],
  [2, 'Minute {minute}! The final stretch! The Republic demands your all!', when(gte('minute', 15))],
  [4, 'Minute {minute}. Anything you are saving belongs to the Republic. Hand it over now.', when(gte('minute', 17))],
  [2, 'Minute {minute}. Projected {projectedFtp}, {projectedGain} above your current rank. Promotion looms.', when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'New FTP: {ftpNew}! Up {ftpGain}! You are promoted, minion!', when(gt('ftpGain', 0))],
  [3, '{ftpNew} watts, up {ftpGain}. The Ministry will now demand more of you. Congratulations.', when(gt('ftpGain', 0))],
  [5, 'Up {ftpGain} to {ftpNew}! Bloody marvelous! Double rations of carbohydrates!', whenP(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew}, down {ftpDrop}. The Overlord grants you a season of rebuilding.', when(gt('ftpDrop', 0))],
  [3, '{ftpNew}. Down {ftpDrop} from {ftpOld}. The Ministry will be adjusting your statue downward.', when(gt('ftpDrop', 0))],
  [2, 'FTP holds at {ftpNew}. Stability. The Republic values stability above all.', when(eq('ftpGain', 0))],
  [1, 'The test is complete. By decree, your FTP is now {ftpNew}.'],
])

b.add('workout_complete', [
  [1, 'The session is complete. The Overlord is pleased with you, minion.'],
  [1, 'Workout complete! {elapsedMin} minutes of loyal service!'],
  [2, 'Done. The Ministry of Watts records {kj} kJ contributed to the Republic.'],
  [2, 'Normalized power {np}. The Ministry of Watts approves this number.'],
  [3, 'Complete. You may leave the pain cave. Walk, do not skip. Skipping is for intervals.'],
  [4, 'Workout complete. The Overlord awards you the Medal of Moderate Adequacy.'],
  [5, 'Done. Bloody well done. Go and eat something; the Ministry insists.', P],
])

b.add('ride_bailed', [
  [1, 'The session ends early. The Overlord permits it. Rest, minion.'],
  [2, 'Abandoning your post at {elapsedMin} minutes? The Ministry notes it.'],
  [3, 'Desertion! ...Fine. Rest. Report back tomorrow.'],
  [3, 'Early departure logged. The Bureau of Excuses has a form for this. It is long.'],
  [4, 'Leaving early. Your statue has been moved to a less prominent square.'],
  [5, 'Quitting at {elapsedMin} minutes? Bloody hell, minion. The Republic will hear of this.', P],
])

b.add('fueling_reminder', [
  [1, 'By decree: eat something now, minion.'],
  [1, 'Fuel ration time. Carbs, minion.'],
  [2, 'The Ministry of Carbohydrates demands a tribute. Eat.'],
  [3, '{elapsedMin} minutes of service. The state bakery insists you eat.'],
  [4, 'Eat, minion. A hungry minion is a slow minion, and slow minions end up in cooldown forever.'],
  [5, 'Eat a bloody gel. That is not a suggestion. It is law.', P],
])

b.add('hydration_reminder', [
  [1, 'Drink, minion. The Overlord commands hydration.'],
  [2, 'The Ministry of Water reminds you: bottles are for drinking, not decorating.'],
  [3, 'Hydrate. A dry minion is a useless minion.'],
])

b.add('distress', [
  [1, 'The Overlord sets aside all decrees. Ease off, breathe, and stop if anything feels wrong.'],
  [1, 'No more orders. Soft-pedal or stop. Your wellbeing outranks every decree.'],
])

b.add('idle_banter', [
  [1, 'The Overlord is watching. The Overlord approves. Mostly.'],
  [1, 'Steady, minion. The Republic is proud of its loyal cyclists.'],
  [2, "Today's bulletin from the Ministry of Watts: output adequate, morale mandatory."],
  [2, "Reminder: the Republic's official emotion today is determination."],
  [2, '{elapsedMin} minutes of service. The Republic salutes you.'],
  [3, 'The Bureau of Revolutions per Minute reports: {cadence}. The Bureau is always watching.'],
  [3, 'The Overlord has declared a holiday. The holiday is called Tuesday Intervals.'],
  [3, "The People's Republic of Pain thanks you for your continued suffering."],
  [4, 'The Ministry of Comfort has been closed for renovations. Indefinitely.'],
  [4, 'Minion, your enthusiasm is being monitored and found... present. Barely.'],
  [5, 'The Overlord once rode a whole hour without complaining. It was a dark day for complaints.'],
  [5, "Pedal harder, minion. The Overlord's throne doesn't polish itself. Well, it bloody should.", P],
])

b.add('segment_start', [[5, '{targetW} watts, minion! The Overlord demands you fucking pedal!', P]], [HARD])
b.add('idle_banter', [[5, 'That cadence is shit, minion. The Ministry is not amused.', P]])

// Unhinged: strong profanity, only for riders who asked for it.
b.add('ride_start', [
  [1, 'Welcome, minion. The Republic of Pain fucking adores a punctual servant.', P],
  [4, "Report for duty, minion. Today's decree: {workoutName}. Complaints go straight in the shit bin.", P],
])
b.add(
  'segment_start',
  [
    [2, '{targetW} watts, by decree. Fucking comply.', P],
    [5, '{targetW} watts for {remainingS}. The Ministry of Watts does not accept your bullshit.', P],
  ],
  [HARD],
)
b.add('countdown_10s', [[3, "Ten seconds, minion. The Overlord's patience is a fucking finite resource.", P]])
b.add('halfway', [[4, 'Halfway. The Five-Minute Plan demands the second half. Every fucking watt of it.', P]])
b.add('last_minute', [[2, 'One minute, minion. Hold {targetW}. The Overlord is watching. Fucking always.', P]])
b.add('segment_end_success', [
  [1, 'The quota is met. Fucking splendid, minion. You may remain in my service.', P],
  [5, '{pct}%. Acceptable. Do not let it go to your head. Your head is fucking Ministry property.', P],
])
b.add('segment_end_failed', [
  [3, '{pct}%? The Ministry is drafting a strongly worded fucking memo.', P],
  [5, '{avgW} watts against a {targetW} quota? The Bureau of Revolutions calls this shit sabotage.', P],
])
b.add('under_target', [
  [2, '{deficitW} watts below quota, minion. Correct this shit at once.', P],
  [4, "{power} watts?! The Overlord's throne produces more, and it is a fucking chair.", P],
])
b.add('cadence_sag', [[3, 'Cadence {cadence}! The Bureau of Revolutions per Minute demands more fucking revolutions!', P]])
b.add('stopped_pedaling', [[4, 'Who the fuck authorized a pause? Not the Overlord. Pedal.', P]])
b.add('skipped_interval', [[3, 'Skipped {segmentLabel}? That interval was Ministry property, and you just fucking threw it away.', P]])
b.add('intensity_down', [[4, '{intensityPct}%? You lowered a decree? The Ministry calls that treasonous bullshit.', P]])
b.add('wbal_low', [[3, 'W′bal {wbalPct}%. The national reserves, squandered. Fucking spendthrift pacing.', P]])
b.add('pr', [[2, '{prLabel} PR! A national fucking holiday is declared! It lasts one second.', P]])
b.add('ftp_test_result', [[4, 'FTP {ftpNew}. The Ministry will carve it on a monument. A small, shitty monument.', P]])
b.add('workout_complete', [
  [1, 'The session is complete. Fucking well done, minion. Rations are authorized.', P],
  [5, "Done. The Overlord is almost impressed. Almost. Don't fucking push it.", P],
])
b.add('ride_bailed', [[4, 'Abandoning your post at {elapsedMin} minutes? The Ministry will hear of this shit. In triplicate.', P]])
b.add('fueling_reminder', [[3, 'Eat a gel, minion. A hungry workforce produces shit watts.', P]])
b.add('idle_banter', [
  [2, 'The Ministry of Watts reports {power} watts. The Overlord is fucking unmoved.', P],
  [5, 'The Overlord rules the flywheel, the fan and the whole fucking basement. Pedal, minion.', P],
])

export const THE_OVERLORD: PersonaPack = {
  meta: {
    id: 'the-overlord',
    name: 'The Overlord',
    tagline: "Supreme ruler of the People's Republic of Pain. The Ministry of Watts is watching.",
    voiceHint: { rate: 0.85, pitch: 0.7, preferVoices: ['Daniel', 'Oliver', 'Alex'] },
  },
  lines: b.build(),
}
