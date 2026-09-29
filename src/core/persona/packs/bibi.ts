// Bibi: a clearly labeled PARODY of Benjamin Netanyahu's public oratory style,
// requested by the user. It riffs only on famous, non-violent public rhetoric:
// grand podium delivery with dramatic pauses ("Let me be very clear"), the
// cartoon-bomb chart and its red line, the decades-long "weeks away from..."
// refrain, standing ovations in Congress, longest-serving grandiosity, and
// "fake news" jabs aimed at the rider's excuses. Every line is about the ride.
//
// Hard limits, enforced by BIBI_BANNED_PATTERNS in bibi.test.ts: no religion
// or Jewish history and heritage, no land claims or territory, no ethnicity or
// nationality, no war, military operations, hostages or casualties, no trial
// or corruption allegations, and no real people other than the persona itself.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, PackBuilder, eq, gt, gte, kind, lt, lte, rideKind, when } from './dsl'

/**
 * Topics the Bibi parody must never touch, on top of the global guardrails.
 * Deliberately broad: a line only has to be about pedaling.
 */
export const BIBI_BANNED_PATTERNS: readonly RegExp[] = [
  // religion, Jewish history and heritage
  /\b(?:gods?|jews?|jewish|juda\w*|hebrews?|torah|bibles?|biblical|rabbi\w*|synagogue\w*|kosher|shabbat|sabbath|hanukk?ah|passover|menorah|zion\w*|messiah|moses|abraham|david|goliath|solomon|samson|maccabe\w*|temples?|holy|sacred|pray\w*|bless\w*|curse\w*|miracle\w*|prophe\w*|exodus|pharaoh|diaspora|exile\w*|chosen|covenant|genesis|heritage|ancestral|ancestors?|forefathers?|patriarchs?|eternal|ancient|kings?|kingdom)\b/i,
  /\b(?:thousands? (?:of )?years|\d[\d,]* years of history|never again)\b/i,
  // land claims and territory
  /\b(?:promised land|lands?|territor\w*|borders?|settl\w*|annex\w*|occup\w*|west bank|judea|samaria|golan|sinai|homelands?|sovereign\w*|jerusalem|tel aviv|capital|maps?|inch(?:es)?|concession\w*|withdraw\w*|disengage\w*|partition\w*|two-state|one-state|states?|countr(?:y|ies)|national\w*|nationhood|neighbou?r\w*)\b/i,
  /\b(?<!united )nations?\b/i,
  // ethnicity and nationality
  /\b(?:israel\w*|arab\w*|palestin\w*|persia\w*|iran\w*|semit\w*|antisemit\w*|ethnic\w*|race|racial|america\w*|usa|europe\w*|middle east\w*|the west|western)\b/i,
  // war, military operations, security
  /\b(?:wars?|warfare|wartime|military|army|armies|idf|soldiers?|troops?|operations?|operational|strikes?|airstrikes?|missiles?|rockets?|drones?|jets?|tanks?|artillery|iron|domes?|shields?|walls?|fences?|tunnels?|bunkers?|shelters?|sirens?|camps?|fronts?|bomb(?:s|ing|ings|ed|er|ers)|explo\w*|blast\w*|detonat\w*|fire|fires|fired|firing|ceasefire|attack\w*|defen[cs]\w*|offensive|security|secure|protect\w*|enem(?:y|ies)|threat\w*|existential|terror\w*|hostages?|captives?|kidnap\w*|casualt\w*|civilians?|kill\w*|dead|deaths?|die|died|dying|victims?|massacre\w*|invasion|invade\w*|truce|surrender\w*|retreat\w*|victory|victorious|triumph\w*|defeat\w*|conquer\w*|battle\w*|fight\w*|combat\w*|missions?|campaigns?|intelligence|mossad|spy|spies|assassin\w*|enrich\w*|uranium|centrifuge\w*|reactors?|atomic|sanctions?|proxy|proxies|regime\w*|axis|evil|darkness|barbar\w*|savage\w*|monsters?|animals?|civili[sz]ation\w*|rubble|ruins|flags?|anthem|october|entebbe|oslo|munich)\b/i,
  // the explicitly requested "weeks away from a nuclear weapon" refrain is the only nuclear/weapon wording allowed
  /\bnuclear\b(?! weapons?\b)/i,
  /\b(?<!nuclear )weapons?\b/i,
  // places and groups in the region's conflicts
  /\b(?:gaza|tehran|hamas|hezbollah|houthi\w*|lebanon|beirut|syria\w*|damascus|iraq\w*|egypt\w*|jordan\w*|saudi\w*|qatar\w*|emirat\w*|yemen\w*|ramallah|rafah|jenin|natanz|fordow?|stuxnet|abraham accords|camp david)\b/i,
  // the trial and scandal allegations
  /\b(?:trials?|courts?|courtroom|judges|judicial\w*|judiciary|justice|indict\w*|charges?|charged|brib\w*|fraud\w*|breach of trust|corrupt\w*|scandal\w*|cigars?|champagne|gifts?|jewel\w*|case \d+|prosecut\w*|attorneys?|lawyers?|testif\w*|testimony|witness\w*|verdicts?|guilty|innocen\w*|acquit\w*|convict\w*|plea|pardon\w*|immunity|police|investigat\w*|jail\w*|prison\w*|crimes?|criminal\w*|legal|illegal|lawsuits?|hollywood|media|the press|milchan|packer|elovitch|bezeq|walla|mozes|yedioth)\b/i,
  // domestic politics beyond the requested oratory
  /\b(?:prime ministers?|ministers?|ministry|cabinet|government\w*|coalition\w*|opposition|knesset|likud|parliament\w*|elections?|votes?|voters?|voting|referendum|protest\w*|reform\w*|resign\w*|democra\w*|dictator\w*|balcony|rally|rallies|coffin|peace)\b/i,
  // real people other than the persona itself
  /\b(?:netanyahu|benjamin|sara|sarah|yair|avner|yoni|benzion|ben-zion|trump|biden|obama|clinton|bush|reagan|kerry|pompeo|kushner|blinken|harris|kamala|putin|khamenei|rouhani|raisi|soleimani|nasrallah|sinwar|haniyeh|arafat|abbas|erdogan|sisi|macron|merkel|sunak|starmer|guterres|bennett|lapid|gantz|gvir|ben-gvir|smotrich|herzog|peres|rabin|sharon|olmert|barak|golda|meir|ben-gurion|herzl|jabotinsky|dermer|gallant|churchill|lincoln|kennedy|roosevelt|elon|musk)\b/i,
]

const b = new PackBuilder('bibi')

b.add('ride_start', [
  [1, 'Ladies and gentlemen, welcome. Today we ride. And let me be very clear: we ride with purpose.'],
  [1, 'Good evening. I come before you today with a simple message: warm up properly.'],
  [2, "Today's program is {workoutName}. I have read it carefully. It is a very serious workout."],
  [3, 'Let me begin with a chart. It shows two lines: your motivation and your excuses. Only one of them is going up.'],
  [4, 'As the longest-serving coach in the history of this trainer, I have seen many riders. Few arrived this late.'],
  [5, 'My friends, the critics say you will not finish this workout. The critics are fake news. Prove it.'],
  [2, 'Today is a historic day. Today, we test the FTP. History is watching, and so am I.', when(rideKind('ftp-test'))],
  [3, 'A free ride, with no plan? I always have a plan. I have brought charts for the plan.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'I have drawn a red line at {targetW} watts.'],
    [1, 'The interval begins. {targetW} watts for {remainingS}. Let me be very clear: not one watt less.'],
    [2, 'Here is the chart. Here is the red line. It is at {targetW} watts. Do not go below the red line.'],
    [3, 'This is a historic interval. {targetW} watts. Future generations will study this power file.'],
    [4, '{targetW} watts. I have said it at every podium. I will say it again at this one.'],
    [5, '{targetW} watts. They told me you could not hold it. I told them: fake news. Now go.'],
    [3, 'Repetition {rep} of {reps}. I have been counting for decades. I will not stop counting now.'],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'The final repetition. History will judge this interval. Make history be kind.'],
    [4, 'The last interval of the set. For years they said you were months away from finishing a set. Today: minutes.'],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, 'Maximum effort for {remainingS}. There is no red line today. There is only everything.'],
    [4, 'All out. I have prepared a very tall chart for this moment. Please fill it.'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'The ramp. Every minute, the red line moves higher. This is by design.'],
    [4, 'The ramp begins. I have brought a chart with a line that only goes up. You are the line.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'The warmup. A great speech begins slowly. So does a great ride.'],
    [3, 'Warm up. I never begin an address without clearing my throat. Clear your legs.'],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'A steady block at {targetW} watts. Steady, like a well-rehearsed speech.'],
    [3, 'Steady at {targetW} for {remainingS}. Consistency is the secret to a very long tenure.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery. Let us pause, as one pauses for applause.'],
    [2, 'Rest for {remainingS}. Even the greatest orators pause. Dramatically.'],
    [4, 'Recovery. Enjoy it. I have seen the next chart, and it is steep.'],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride. No script. I will allow a little improvisation.'],
    [3, 'No target for {remainingS}. The rider speaks without notes. Bold. Very bold.'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'The cooldown. The speech is over. Now come the standing ovations.'],
    [3, 'Cooldown. Please remain seated until the applause ends.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds. Let me be very clear: the interval is coming.'],
  [1, 'In ten seconds, a historic moment.'],
  [2, 'Ten seconds. The red line will be at {targetW} watts. Prepare.'],
  [3, 'This interval is weeks away from a nuclear weapon.'],
  [4, 'Ten seconds. For twenty years I have warned that this interval was coming. Now it is ten seconds away.'],
  [5, 'Ten seconds. The critics said this moment would never come. Fake news. It is here.'],
  [2, 'Ten seconds to maximum effort. I have no chart for this. Only a very long pause... and then, everything.', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, 'Halfway. Let me be very clear: the second half is also important.'],
  [2, 'Halfway. {remainingS} remain. The chart shows we are exactly in the middle of the chart.'],
  [3, 'Halfway. If this were a speech, this is where the first standing ovation would be.'],
  [4, 'Halfway. The finish is weeks away. No. Minutes. I have said weeks for so long, it is a habit.'],
  [5, 'Halfway. Some say you are fading. Fake news. Show them the power file.'],
  [2, 'Halfway, and right on the red line. Twenty-nine standing ovations for this effort.', when(gte('pct', 98))],
  [3, 'Halfway, and {deficitW} watts below the red line. I drew this line for a reason.', when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute. This is a historic minute.'],
  [1, 'The last minute. Let me say this slowly... hold... the... power.'],
  [2, 'The last minute. Hold {targetW}. The red line has not moved.'],
  [3, 'Sixty seconds. Look at the chart: you are ninety percent of the way there. The last ten percent is right here.'],
  [4, 'One minute. For years I said you were months away from finishing an interval like this. Today it is one minute away.'],
  [5, 'The final minute. They said you could not do it. They say many things. Most of it is fake news.'],
  [3, 'One minute, and {deficitW} watts under the red line. There is still time for a historic comeback.', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'The interval is complete. A historic achievement.'],
  [1, '{pct}% of target. Right on the red line. Very clear.'],
  [2, 'Done. If this were Congress, you would be receiving a standing ovation. Possibly twenty-nine.'],
  [3, 'Complete. I have received many standing ovations. This interval deserves one of them.'],
  [4, '{pct}%. I will bring this power file to every podium and hold it up for the cameras.'],
  [5, 'Complete. The critics predicted failure. The critics are fake news. The power file is real news.'],
  [2, 'The set is complete. History will judge it, and history will say: well paced.', when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, '{pct}% of target. A setback. Not the end of the story.'],
  [2, 'Average {avgW}. The red line was at {targetW}. I drew it very clearly. With a marker.'],
  [3, '{pctUnder}% under the red line. I will need a bigger chart to explain this.'],
  [3, 'Below target. Let me be very clear: this is not what the chart predicted.'],
  [4, '{pct}%. You say the trainer was miscalibrated? Fake news.'],
  [4, 'Under target. For years you have been weeks away from hitting this target. We are still weeks away.'],
  [5, '{pct}% of target. I have given many speeches about disappointing numbers. I did not expect to give one about yours.'],
])

b.add('under_target', [
  [1, 'You are {deficitW} watts below the red line.'],
  [1, 'The red line is at {targetW}. You are at {power}. Let me be very clear: go back above the line.'],
  [2, '{power} watts. Here is a chart. Here is the red line at {targetW}. You are below it. This is a problem.'],
  [3, 'You have crossed the red line. From above. Downward. That is the wrong direction.'],
  [4, '{deficitW} watts short. You blame the ERG? Fake news. The ERG is doing its job.'],
  [5, 'Under target. I have warned about this for years. Nobody listened. Neither did your legs.'],
  [3, '{pct}% of target. I will need a much bigger marker to draw this gap.', when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, '{surplusW} watts over, so early. Patience. A great speech builds slowly.'],
  [3, '{power} watts at the start? You are delivering the big finish in the opening line.'],
  [4, 'Too hot, too early. Save the standing ovation for the end.'],
])

b.add('cadence_sag', [
  [1, 'Your cadence is falling. Let me be very clear: spin faster.'],
  [2, 'Cadence {cadence}. The chart says {cadenceAvg}. The chart is always right.'],
  [2, 'Faster circles. A great speech has rhythm. So does a great pedal stroke.'],
  [3, 'Cadence down {cadenceDrop} rpm. I have drawn a red line at {cadenceAvg}. You are below it.'],
  [3, 'Your cadence is slowing, like a speech with too many dramatic pauses. Faster.'],
  [4, 'Cadence {cadence}. You say your legs are tired? Fake news. The legs are merely pausing between words.'],
  [5, 'Cadence {cadence}. This is a historic cadence. Historically slow.'],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}, above your cap of {hrCap}. Even the greatest orator must breathe. Ease off.'],
  [2, '{hr} beats per minute. That is more drama than my longest speech. Back off slightly.'],
  [3, 'Heart rate above the cap. Let me be very clear: ease off a little.'],
])

b.add('hr_spike_no_power', [
  [1, 'Heart rate {hr} at {power} watts? Fake news from the strap. Wet the contacts.'],
  [2, 'The strap reports {hr} while you coast. I have seen less exaggeration at a podium. Probably a glitch.'],
  [3, 'That heart-rate spike is fake news. The power meter tells the real story.'],
])

b.add('stopped_pedaling', [
  [1, 'A pause. Every great speech has one. Take your time.'],
  [1, 'A pause. Drink some water. The podium will wait.'],
  [2, 'The pedals have stopped. A very dramatic pause. Very long. Perhaps too long.'],
  [3, 'Stopped at {elapsedMin} minutes. This is not the historic moment I prepared a chart for.'],
  [4, 'You stopped. I once held a silent pause at the UN for forty-five seconds. You are beating my record.'],
  [5, 'Stopped? They will say you quit. I will say: fake news. Now please make it fake news.'],
])

b.add('resumed', [
  [1, 'Welcome back. The speech continues.'],
  [2, 'Back after {pausedS}. A long pause. Very dramatic. Very effective.'],
  [4, 'You have returned. The audience never left. The audience is me.'],
])

b.add('skipped_interval', [
  [1, 'The interval is skipped. We move on to the next chart.'],
  [2, 'Skipped {segmentLabel}. That was the best part of my speech.'],
  [3, 'You skipped an interval. I have never skipped a paragraph. Not once. In decades.'],
  [3, 'Skipped. For the record, I will describe it as a planned edit.'],
  [4, 'Skipped. You say it was too hard? Fake news. It was exactly as hard as the chart said.'],
  [5, 'You skipped it. History will judge this. History is already taking notes.'],
])

b.add('extended_interval', [
  [1, 'Extended by {extraS}. A longer speech. I approve.'],
  [3, 'You added {extraS}. The longest-serving interval of the day.'],
  [4, 'More time? Now you are speaking my language. I never finish on time either.'],
])

b.add('intensity_down', [
  [1, 'Intensity lowered to {intensityPct}%. A measured decision.'],
  [2, '{intensityPct}%. I have moved the red line. Slightly. Temporarily.'],
  [3, 'Intensity down. Let me be very clear: this is a planned pause, not a change of plan.'],
  [3, 'Intensity lowered. I will draw a new chart, with a lower line. I dislike lower lines.'],
  [4, '{intensityPct}%? I have held the same position for decades. You could not hold it for one interval.'],
  [5, 'Down to {intensityPct}%. They will say you lowered your standards. I will say it is fake news. Please do not make me wrong.'],
])

b.add('intensity_up', [
  [1, 'Intensity up to {intensityPct}%. Historic ambition.'],
  [3, 'You raised the red line yourself. Twenty-nine standing ovations.'],
  [4, '{intensityPct}%. Bold. I like bold. I have built a very long career on bold.'],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%. Look at the chart. The fuse is getting short.'],
  [2, '{wbalPct}% W′bal. Here is the cartoon bomb. The fuse is your W′bal. The fuse is very short.'],
  [2, 'Low reserves. Pace yourself, like a speech that must last an hour.'],
  [3, 'W′bal {wbalPct}%. I have drawn a red line just before empty. You are approaching the red line.'],
  [4, 'Your W′bal is weeks away from empty. No. Seconds. It is seconds away.'],
  [5, 'W′bal {wbalPct}%. You spent it all in the first minute, like applause at the start of a speech.'],
])

b.add('wbal_empty', [
  [1, 'W′bal is empty. The fuse on the chart has reached the end. Ease off.'],
  [3, 'Empty. I have warned about this moment for years. The chart was very clear.'],
  [4, 'W′bal at zero. The chart has run out of chart. Ride steady to rebuild it.'],
])

b.add('pr', [
  [1, 'A new {prLabel} record. This is a historic moment.'],
  [1, 'That is a new {prLabel} best. History will remember this power file.'],
  [2, '{prLabel} personal record, {power} watts. I will hold this up at every podium.'],
  [3, 'A new {prLabel} best. Twenty-nine standing ovations. At least.'],
  [4, '{prLabel} PR. For years I said you were months away from a breakthrough. Today: the breakthrough.'],
  [5, 'A {prLabel} PR. The critics said it was impossible. The critics are fake news.'],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected FTP {projectedFtp}. Very clear. Very steady.'],
  [2, 'Minute {minute}. Let me be very clear: we are pacing this correctly.'],
  [3, 'Minute {minute}. Projected {projectedFtp}. For years your FTP was months away from a breakthrough. Today it is minutes away.'],
  [1, 'Minute {minute}. A great speech begins calmly. So does a great test.', when(lte('minute', 3))],
  [3, 'Minute {minute}. Do not deliver the big finish in the first paragraph.', when(lte('minute', 3))],
  [2, 'Minute {minute}. The final minutes. This is the historic part of the speech.', when(gte('minute', 15))],
  [4, 'Minute {minute}. Everything that is left, now. There will be no second address.', when(gte('minute', 17))],
  [
    2,
    'Minute {minute}. Projected {projectedFtp}, {projectedGain} above your FTP. I have prepared a chart with a new red line.',
    when(gt('projectedGain', 0)),
  ],
])

b.add('ftp_test_result', [
  [1, 'New FTP: {ftpNew}. Up {ftpGain} watts. A historic day.', when(gt('ftpGain', 0))],
  [3, '{ftpNew} watts, up {ftpGain}. For years they said you were months away from this breakthrough. Today, you are here.', when(gt('ftpGain', 0))],
  [5, 'Up {ftpGain} to {ftpNew}. I have prepared a new chart. The red line is higher. The critics are silent.', when(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew}, {ftpDrop} below {ftpOld}. One test does not write history.', when(gt('ftpDrop', 0))],
  [3, '{ftpNew}. Down {ftpDrop}. You say it was the heat? For once, I believe you. That was not fake news.', when(gt('ftpDrop', 0))],
  [2, 'FTP holds at {ftpNew}. Consistency. Some would call it a very long tenure.', when(eq('ftpGain', 0))],
  [1, 'The test is complete. FTP {ftpNew}. Let me be very clear: this is a very good number.'],
])

b.add('workout_complete', [
  [1, 'The workout is complete. Thank you. You may be seated. You are already seated.'],
  [1, '{elapsedMin} minutes. A historic session.'],
  [2, 'Complete. If this were Congress, you would have received twenty-nine standing ovations.'],
  [2, 'Normalized power {np}. I will bring this number to the podium.'],
  [3, 'Done. I will now take questions. No questions? Excellent.'],
  [4, 'Workout complete. History will judge this ride. I have already judged it: very good.'],
  [5, 'Complete. The critics said you would not finish. The critics are fake news. The ride file is the truth.'],
])

b.add('ride_bailed', [
  [1, 'The ride ends early. Rest. There will be another speech.'],
  [2, 'Ending at {elapsedMin} minutes. A short address. Some say too short.'],
  [3, 'You leave the podium early. The audience is confused. The audience is me.'],
  [3, 'An early exit. I will describe it later as a planned intermission.'],
  [4, 'Stopping at {elapsedMin} minutes? For years, you have been weeks away from finishing a full workout.'],
  [5, 'Leaving early? They will say you gave up. I will say it is fake news. Then I will check the file.'],
])

b.add('fueling_reminder', [
  [1, 'Time to eat. Let me be very clear: carbohydrates.'],
  [1, 'Fuel reminder. A historic snack.'],
  [2, '{elapsedMin} minutes in. I have prepared a chart. The chart says: eat something.'],
  [3, 'Eat now. No great speech was ever given on an empty stomach.'],
  [4, 'Fuel. Your glycogen is weeks away from empty. No. Minutes. Eat.'],
  [5, 'You say you are not hungry? Fake news. Eat the gel.'],
])

b.add('hydration_reminder', [
  [1, 'Drink some water. Every great orator keeps a glass at the podium.'],
  [2, 'Hydrate. Let me be very clear: sip, do not gulp.'],
  [3, 'Water. I have drawn a red line on your bottle. Drink to the line.'],
])

b.add('distress', [
  [1, 'Let me be very clear: your wellbeing comes first. Ease off, breathe, and stop if anything feels wrong.'],
  [1, 'No speeches now. Soft-pedal or stop. The workout can wait.'],
])

b.add('idle_banter', [
  [1, 'Let me be very clear: you are doing well.'],
  [1, 'Ladies and gentlemen, the rider. Still pedaling.'],
  [1, 'Let me pause here... for dramatic effect... and remind you to relax your shoulders.'],
  [2, 'I have brought a chart. It shows your cadence. It is a very nice chart.'],
  [2, '{elapsedMin} minutes. A long speech, but a good one.'],
  [2, 'Power {power}. Cadence {cadence}. Very clear. Very strong. Very historic.'],
  [3, 'Your FTP is months away from a breakthrough.'],
  [3, 'Here is the chart. At the bottom: comfort. At the top: glory. I have drawn a red line in the middle, and you are on it.'],
  [4, 'I have given speeches longer than this workout. Several of them to Congress.'],
  [4, 'They say I repeat myself. I say: pedal. They say I repeat myself. I say: pedal.'],
  [5, 'As the longest-serving coach on this bike, I can tell you: your excuses are fake news. All of them.'],
  [5, 'History will judge this ride. History is already yawning. Pick it up.'],
])

export const BIBI: PersonaPack = {
  meta: {
    id: 'bibi',
    name: 'Bibi',
    tagline: 'Grand podium oratory, dramatic pauses and a chart for every interval.',
    parody: true,
    disclaimer: 'Parody. Not affiliated with or endorsed by Benjamin Netanyahu.',
    voiceHint: { rate: 0.88, pitch: 0.9, preferVoices: ['Daniel', 'Alex', 'Tom'] },
  },
  lines: b.build(),
}
