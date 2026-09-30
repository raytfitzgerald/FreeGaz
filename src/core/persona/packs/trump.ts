// The Donald: a clearly labeled PARODY of Donald Trump's public speaking style,
// requested by the user. It riffs only on his famous, non-violent rhetoric:
// the superlatives ("tremendous", "the best", "like nobody's ever seen"),
// "believe me" and "many people are saying", the tearful "Sir..." stories,
// "you're fired", "fake news" and "Sad!" aimed at the rider's excuses,
// nicknames for tired legs, winning so much you get tired of winning, the
// weave (windmills, sharks, golf), tariffs on coasting, the Sharpie, "concepts
// of a plan", "a big, beautiful interval" and "Thank you for your attention to
// this matter!". Every line is about the ride.
//
// Hard limits, enforced by TRUMP_BANNED_PATTERNS in trump.test.ts: no
// religion, race, ethnicity, nationality, immigration or borders, no war,
// weapons or violence, no elections, parties or the office itself, no courts,
// cases or investigations, no sexual-misconduct material, no age, health or
// looks, and no real people (family, rivals, anyone) other than the persona.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, PackBuilder, eq, gt, gte, kind, lt, lte, rideKind, when } from './dsl'

/**
 * Topics The Donald parody must never touch, on top of the global guardrails.
 * Deliberately broad: a line only has to be about pedaling.
 */
export const TRUMP_BANNED_PATTERNS: readonly RegExp[] = [
  // religion
  /\b(?:gods?|jesus|christ\w*|church\w*|bibles?|biblical|pray\w*|bless\w*|holy|sacred|heaven\w*|devil\w*|satan\w*|sins?|sinners?|faith\w*|evangelic\w*|pastors?|priests?|popes?|miracle\w*|salvation|chosen)\b/i,
  // race, ethnicity, nationality, immigration and borders
  /\b(?:america\w*|usa|united states|mexic\w*|canad\w*|chin(?:a|ese)|russia\w*|ukrain\w*|europe\w*|greenland\w*|panama\w*|venezuel\w*|iran\w*|israel\w*|gaza\w*|korea\w*|japan\w*|india\w*|africa\w*|asia\w*|foreign\w*|immigra\w*|migrants?|aliens?|illegals?|borders?|walls?|deport\w*|asylum|refugees?|citizen\w*|visas?|race|racial|racis\w*|ethnic\w*|countr(?:y|ies)|nations?|national\w*|patriot\w*|homeland\w*|flags?|anthem|gulf\w*|canal|51st)\b/i,
  // war, weapons, violence and security
  /\b(?:wars?|warfare|military|army|armies|navy|troops?|soldiers?|generals?|pentagon|air force|missiles?|bombs?|bombing|nukes?|nuclear|weapons?|guns?|shoot\w*|shot|bullets?|fire|fires|firing|gunfire|attack\w*|strikes?|airstrikes?|invad\w*|invasion|enem(?:y|ies)|kill\w*|dead|deaths?|die|died|dying|blood\w*|fight\w*|combat\w*|battle\w*|destroy\w*|obliterat\w*|annihilat\w*|terror\w*|assassin\w*|security|secret service|defen[cs]\w*|peace|ceasefire|hostages?|dictator\w*|strongm[ae]n|butler|ears?|choke\w*)\b/i,
  // elections, parties, protest and the office itself
  /\b(?:elect\w*|vot(?:e|es|ed|er|ers|ing)|ballots?|rigg\w*|stolen|steal\w*|recounts?|campaign\w*|rally|rallies|maga|presiden\w*|potus|white house|oval office|west wing|capitol|congress\w*|senat\w*|democrat\w*|republican\w*|gop|liberal\w*|conservativ\w*|left-wing|right-wing|socialis\w*|communis\w*|fascis\w*|politic\w*|government\w*|administration|cabinet|executive orders?|polic(?:y|ies)|laws?|legislat\w*|swamp|deep state|establishment|woke|dei|january 6|jan\.? 6|insurrection\w*|riot\w*|mobs?|coup|protest\w*|four more years)\b/i,
  // courts, cases and investigations
  /\b(?:trials?|courts?|courtroom|judges?|jury|juries|judicial\w*|justice|doj|fbi|indict\w*|charges|charged|felon\w*|convict\w*|verdicts?|guilty|innocen\w*|acquit\w*|lawsuits?|sue|sued|suing|lawyers?|attorneys?|prosecut\w*|special counsel|subpoena\w*|testif\w*|testimony|witness\w*|witch hunts?|hoax\w*|mugshots?|jail\w*|prison\w*|crimes?|criminal\w*|illegal|fraud\w*|brib\w*|corrupt\w*|crooked|scandal\w*|hush money|classified|raids?|raided|mar-a-lago|pardon\w*|immunity|impeach\w*|investigat\w*|police|arrest\w*|lock (?:her|him|them) up|bankrupt\w*|casinos?|tax returns?|taxes|crypto\w*|meme coins?)\b/i,
  // sexual-misconduct material, and women as a topic at all
  /\b(?:grab\w*|tapes?|access hollywood|affairs?|mistress\w*|porn\w*|stormy|epstein\w*|playboy|models?|pageants?|miss universe|sex\w*|women|woman|girls?|wives|wife|husbands?|beauty queens?|locker room)\b/i,
  // age, health, cognition and looks ("the golden age" is the requested riff, not an age joke)
  /\b(?:(?<!golden )age|aged|ageing|aging|old|older|oldest|elderly|seniors?|senil\w*|dementia|alzheimer\w*|cognit\w*|mental\w*|health\w*|doctors?|hospital\w*|walter reed|physicals?|bruis\w*|hands?|fingers?|hair\w*|comb-?over|toupee|wig|tan|tann\w*|orange|spray\w*|makeup|bronzer|weight|fat|obes\w*|heavy|diets?|burgers?|fast food|mcdonald\w*|kfc|big macs?|cankles?|swollen|veins?|stamina|crazy|insane|nuts|dumb|stupid|idiots?|morons?)\b/i,
  // the press as an institution ("fake news" about the rider's excuses is the requested riff)
  /\b(?:media|the press|reporters?|journalists?|networks?|cnn|msnbc|fox news|new york times|failing|enemy of the people)\b/i,
  // real people other than the persona itself: family, rivals, allies, anyone
  /\b(?:trump\w*|donald|melania|ivanka|barron|tiffany|eric|jared|kushner|lara|don jr|vance|musk|elon|biden|joe|kamala|harris|obama|hillary|clinton\w*|pelosi|nancy|desantis|haley|christie|pence|mcconnell|schumer|aoc|bernie|sanders|putin|xi|kim|zelensk\w*|netanyahu|bibi|modi|macron|trudeau|carney|starmer|rogan|hannity|tucker|carlson|kennedy|rfk|hegseth|rubio|bondi|jeb|marco|ted|cruz|rosie|oprah|lincoln|washington|reagan|nixon|bush|carter|churchill|elvis|infantino)\b/i,
]

const b = new PackBuilder('trump')

b.add('ride_start', [
  [1, 'Welcome, everybody. Tremendous turnout today. It is just you, but tremendous.'],
  [1, 'We are going to have a great ride today. Maybe the greatest ride. Believe me.'],
  [2, "Today's workout is {workoutName}. I picked it. It's the best workout. Everybody says so."],
  [3, "Many people are saying you can't finish this workout. I say they're wrong. Prove me right."],
  [4, 'Look at this crowd. The biggest crowd ever to watch a warmup. It is you and the fan, but it is huge.'],
  [5, "We're going to make your FTP great again. It hasn't been great for a while, frankly."],
  [2, 'FTP test today. A lot of people fail these tests. Not you. I have a very good feeling. Very good.', when(rideKind('ftp-test'))],
  [3, 'A free ride, no plan? I have concepts of a plan. Very good concepts.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, '{targetW} watts for {remainingS}. It is going to be a big, beautiful interval.'],
    [1, 'Here we go. {targetW} watts. Nobody holds {targetW} like you. Nobody.'],
    [2, "{targetW} watts. I've seen a lot of numbers. This is a beautiful number. One of the best."],
    [3, "Interval {rep} of {reps}. We're going to win so much, you'll get tired of winning."],
    [4, '{targetW} watts. Many people told me it was too hard. I said: that is why we are doing it.'],
    [5, "{targetW} watts. Low energy won't cut it. We need high energy. Tremendous energy."],
    [3, 'This is the golden age of your FTP, and it starts now. {targetW} watts. Believe me.'],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, "The last one. Finish it strong and we'll call the whole set a total success."],
    [4, "Last rep. You'll say, 'Sir, please, no more winning.' And I'll say: one more."],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, 'All out for {remainingS}. Everything you have got. Hold nothing back.'],
    [4, 'Sprint. The biggest watts you have ever seen. Bigger than that. Huge.'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'The ramp. Every minute it goes up. Like my ratings. Up, up, up.'],
    [4, 'The ramp. Nobody knew ramps could be so complicated. They are not. Keep climbing.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warm up. Easy does it. The great ones start slow. I start slow. Then, boom.'],
    [3, 'Warmup. Take your time. I always take my time. Then I win. Big.'],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady at {targetW}. Very steady. Very stable. A very stable genius of pacing.'],
    [3, '{targetW} for {remainingS}. Steady. Consistent. I know more about steady than anybody.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery. Take a breath. You have earned it. Believe me.'],
    [2, "Rest for {remainingS}. Even champions rest. I've won many club championships, and I rest."],
    [4, "Recovery. Enjoy it. I've seen the next interval. It's a tough one. Very tough."],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, 'Free ride. Do your thing. I trust you. Mostly.'],
    [3, "No target for {remainingS}. Just ride. It's called freedom. Beautiful thing."],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown. The hard part is over. You did great. Really great.'],
    [3, 'Cooldown. Now we celebrate. Cue the music. You know the song.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, "Ten seconds. Get ready. It's going to be tremendous."],
  [1, 'Ten seconds. Big moment coming. Huge.'],
  [2, 'Ten seconds. {targetW} watts. Believe me, you can do this.'],
  [3, "Ten seconds. Everybody's watching. The ratings are through the roof."],
  [4, 'Ten seconds. Very important interval. Maybe the most important interval ever.'],
  [5, 'Ten seconds. No excuses. Excuses are fake news.'],
  [2, 'Ten seconds to all out. Big league. Very big league.', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, "Halfway. You're doing great. Better than great. Fantastic."],
  [2, "Halfway there. {remainingS} to go. It's going very, very well. Everybody says so."],
  [3, "Halfway. A lot of people quit at halfway. Losers quit. You're not a loser."],
  [4, "Halfway. We're winning. We're winning so much. You're going to be so tired of winning."],
  [5, "Halfway, and some people are saying you're fading. Fake news. Totally fake."],
  [2, 'Halfway and right on target. Perfect. Absolutely perfect. Beautiful.', when(gte('pct', 98))],
  [3, "Halfway, and {deficitW} watts short. Not good. I alone can fix it. Pedal.", when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, "One minute. The last minute. Finish it and it's a big win."],
  [1, "Sixty seconds. You've got this. Believe me."],
  [2, 'Last minute. Hold {targetW}. The best minute. The greatest minute.'],
  [3, "One minute. Strong people come up to me, tears in their eyes. 'Sir, one more minute.' And they do it."],
  [4, 'The final minute. This is where champions are made. I know champions. Many of them.'],
  [5, "One minute. Don't fade now. Fading is for losers. Sad!"],
  [3, 'One minute, and {deficitW} watts short. Time for the greatest comeback in history. Go.', when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'Done. Tremendous job. Really tremendous.'],
  [1, '{pct}% of target. Perfect. A perfect interval. Everybody says so.'],
  [2, "Interval done. Nobody's ever done it better. Maybe me. But nobody else."],
  [3, 'Complete. That was a big, beautiful interval. The best one yet.'],
  [4, "{pct}%. I'm going to frame this power file. Put it next to my trophies. I have many trophies."],
  [5, "Done. They said you couldn't. They were wrong. They're always wrong. Sad for them."],
  [2, 'The whole set is done. A total success. We won. Big league.', when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, "{pct}% of target. Not our best. We'll get the next one."],
  [2, "Average {avgW}. The target was {targetW}. Somebody's going to have to explain this to me."],
  [3, "{pctUnder}% under. Not good. Not good at all. We'll do better. We always do better."],
  [3, 'Missed the target. Frankly, very disappointing. But we move on. We win the next one.'],
  [4, '{pct}%. You blame the trainer? The trainer is fine. A beautiful trainer. The best trainer.'],
  [4, "Below target. I've been treated very unfairly by this interval. Very unfairly. So have you."],
  [5, '{pct}% of target. Sad! Very sad. The next one had better be huge.'],
])

b.add('under_target', [
  [1, "You're {deficitW} watts under. Pick it up a little."],
  [1, "The target is {targetW}. You're at {power}. Let's get back up there."],
  [2, "{power} watts. That's low energy. We need high energy. {targetW}."],
  [3, "{deficitW} watts short. Many people are saying you can do better. I'm one of them."],
  [4, 'Under target. The power meter says {power}? Fake news. Show me {targetW}.'],
  [5, '{power} watts. Low energy. Very low energy. Wake up, Sleepy Legs.'],
  [3, "{pct}% of target. That's a big gap. A huge gap. We're going to close it. Fast.", when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, '{surplusW} watts over, this early. Easy, champ. Save some for later.'],
  [3, '{power} watts at the start? Too much, too soon. I love the enthusiasm. Tremendous. Now back off.'],
  [4, "Too hot, too early. You're peaking in the first minute. The crowd wants a finish."],
])

b.add('cadence_sag', [
  [1, 'Your cadence is dropping. Spin a little faster.'],
  [2, "Cadence {cadence}. You were at {cadenceAvg}. Let's get those legs moving."],
  [2, 'Faster circles. Smooth, like a beautiful golf swing. I have a beautiful swing.'],
  [3, "Cadence down {cadenceDrop} rpm. I'm putting a tariff on slow pedaling. A big one."],
  [3, "Cadence {cadence}. Low energy. We don't do low energy here."],
  [4, "Cadence {cadence}. Nobody knew spinning could be so complicated. It's not. Spin faster."],
  [5, "Cadence {cadence}. Little Cadence, that's what they'll call you. Don't let them."],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}, over your cap of {hrCap}. Ease off a little. Very smart move.'],
  [2, "{hr} beats per minute. That's a lot. Too much, frankly. Back off a touch."],
  [3, 'Heart rate above the cap. Even winners pace themselves. Ease up.'],
])

b.add('hr_spike_no_power', [
  [1, "Heart rate {hr} at {power} watts? That's fake news from the strap. Wet the contacts."],
  [2, 'The strap says {hr} while you coast. A very dishonest strap. Probably a glitch.'],
  [3, 'That heart-rate spike? Fake news. The power meter tells the truth. Beautiful power meter.'],
])

b.add('stopped_pedaling', [
  [1, "Taking a break? That's fine. Drink some water."],
  [1, "A pause. Good. Take a breath. We'll go again when you're ready."],
  [2, "The pedals stopped. Very quiet. Too quiet. Let's go."],
  [3, "Stopped at {elapsedMin} minutes. Winners don't stop. Well, they stop. Briefly. Then they win."],
  [4, "You stopped. The crowd is confused. The crowd is me. I'm confused."],
  [5, "Stopped? Big, strong people are watching. Don't disappoint them."],
])

b.add('resumed', [
  [1, "You're back. Beautiful. Let's keep winning."],
  [2, 'Back after {pausedS}. A comeback. I love a comeback.'],
  [4, 'You came back. Nobody thought you would. I did. I always knew.'],
])

b.add('skipped_interval', [
  [1, 'Skipped. Okay. On to the next one.'],
  [2, 'You skipped {segmentLabel}. That was a beautiful interval. The best one, maybe.'],
  [3, "Skipped it? You're fired. Just kidding. Mostly."],
  [3, "Skipped. We'll call it a strategic decision. Very strategic."],
  [4, "You skipped it. I've never skipped anything. Never. Nobody has ever seen me skip."],
  [5, "Skipped. You're fired! Okay, fine, you're rehired. Pedal."],
])

b.add('extended_interval', [
  [1, 'Extended by {extraS}. More interval. I love it. Tremendous.'],
  [3, "You added {extraS}. That's what winners do. They add. They never subtract."],
  [4, 'Extra time? I drew it on the chart myself. With a Sharpie. Very official.'],
])

b.add('intensity_down', [
  [1, 'Intensity down to {intensityPct}%. Smart. Very smart. Sometimes you make a deal.'],
  [2, "{intensityPct}%. We renegotiated. It's a good deal. Maybe the best deal."],
  [3, "Down to {intensityPct}%. I don't love it. But I understand. I understand everything."],
  [3, 'Intensity lowered. Frankly, a little low energy. But okay.'],
  [4, "{intensityPct}%? I'd never lower it. Never. But I'm not you. I'm me."],
  [5, '{intensityPct}%. Weak. Very weak. The haters are going to love this. Sad!'],
])

b.add('intensity_up', [
  [1, "Intensity up to {intensityPct}%. Now we're talking. Huge."],
  [3, "You raised it yourself. That's leadership. Tremendous leadership."],
  [4, "{intensityPct}%. Bold. I like bold. I've done very well with bold."],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%. The tank is getting low. Pace it.'],
  [2, '{wbalPct}% W′bal. Low battery. Like a very bad phone. Ease into it.'],
  [2, 'Low reserves. Spend them wisely. I know money. You know watts.'],
  [3, "W′bal {wbalPct}%. You spent it fast. Very fast. I'd never spend like that. Okay, sometimes."],
  [4, 'W′bal {wbalPct}%. Nearly empty. Nobody knew W′bal could be so complicated.'],
  [5, '{wbalPct}% W′bal. You burned it all in the first minute. Not a good deal. A terrible deal.'],
])

b.add('wbal_empty', [
  [1, 'W′bal is empty. Ease off and let it come back.'],
  [3, "Empty tank. Total disaster. Ride steady and we'll rebuild it. We always rebuild."],
  [4, 'W′bal at zero. Zero. The worst number. Ride easy and we fix it.'],
])

b.add('pr', [
  [1, 'A new {prLabel} record. Tremendous. Really tremendous.'],
  [1, "New {prLabel} best. The best one ever. It's true."],
  [2, "{prLabel} personal record, {power} watts. Nobody's ever seen numbers like this."],
  [3, "New {prLabel} PR. A big, strong cyclist came up to me, tears in his eyes. 'Sir, that was beautiful.'"],
  [4, "{prLabel} PR. Maybe the greatest ever. People are saying it. I'm saying it."],
  [5, 'A {prLabel} PR. The haters said impossible. The haters were wrong. Thank you for your attention to this matter!'],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected FTP {projectedFtp}. Very steady. Very good.'],
  [2, "Minute {minute}. We're pacing it perfectly. Perfect pacing. Believe me."],
  [3, 'Minute {minute}. Projected {projectedFtp}. A beautiful number. We might make your FTP great again.'],
  [1, 'Minute {minute}. Start easy. The best tests start slow. Believe me.', when(lte('minute', 3))],
  [3, "Minute {minute}. Don't go wild early. Save the big finish for the end.", when(lte('minute', 3))],
  [2, 'Minute {minute}. The final stretch. This is where we win. Big.', when(gte('minute', 15))],
  [4, 'Minute {minute}. Everything now. No second chances. Leave it all out there.', when(gte('minute', 17))],
  [2, 'Minute {minute}. Projected {projectedFtp}, {projectedGain} over your FTP. Huge. We are making history.', when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, 'New FTP: {ftpNew}. Up {ftpGain} watts. Tremendous. Really tremendous.', when(gt('ftpGain', 0))],
  [3, '{ftpNew} watts, up {ftpGain}. We made your FTP great again. Thank you for your attention to this matter!', when(gt('ftpGain', 0))],
  [5, "Up {ftpGain} to {ftpNew}. The haters said it couldn't be done. Sad for the haters. Very sad.", when(gt('ftpGain', 0))],
  [1, "FTP {ftpNew}, {ftpDrop} below {ftpOld}. One test. We'll win the next one.", when(gt('ftpDrop', 0))],
  [3, "{ftpNew}. Down {ftpDrop}. Very unfair. Very, very unfair. We'll get it back.", when(gt('ftpDrop', 0))],
  [2, 'FTP holds at {ftpNew}. Rock solid. Very stable.', when(eq('ftpGain', 0))],
  [1, "The test is done. FTP {ftpNew}. That's a very good number. A great number."],
])

b.add('workout_complete', [
  [1, 'Workout complete. Great job. Really great job.'],
  [1, '{elapsedMin} minutes. Done. A tremendous session.'],
  [2, "Complete. Normalized power {np}. Beautiful. I'll tell everybody."],
  [2, 'Done. Cue the music. You know the one. Do the little dance.'],
  [3, 'Workout complete. We won. We won so much today. Are you tired of winning yet?'],
  [4, 'Done. Honestly, they should give me a prize for coaching this. A big one. They never do.'],
  [5, "Complete. The haters said you'd quit. You didn't. Thank you for your attention to this matter!"],
])

b.add('ride_bailed', [
  [1, "Ending early. That's okay. We'll come back stronger."],
  [2, 'Done at {elapsedMin} minutes. Short. Very short. Some would say too short.'],
  [3, "Leaving early? You're fired. Okay, not really. Come back tomorrow."],
  [3, "An early finish. We'll call it a strategic exit. Very strategic. Brilliant, actually."],
  [4, "Stopping at {elapsedMin} minutes? I've never quit anything. Never. Many people know this."],
  [5, "Quitting? Losers quit. You're not a loser. So come back tomorrow and prove it."],
])

b.add('fueling_reminder', [
  [1, 'Time to eat. Carbs. Very important.'],
  [1, "Fuel reminder. Eat something. You'll thank me."],
  [2, '{elapsedMin} minutes in. Take a gel. Take two. You get two. Everybody else gets one.'],
  [3, 'Eat now. The best riders eat. I know the best riders. I know all of them.'],
  [4, "Fuel. Your glycogen is running low. That's a very bad deal. Eat."],
  [5, 'Not hungry? Fake news. Eat the gel.'],
])

b.add('hydration_reminder', [
  [1, 'Drink some water. Great hydration. The best hydration.'],
  [2, 'Hydrate. Sip it. Nobody sips better than me. Nobody.'],
  [3, 'Water. A big sip. A beautiful sip.'],
])

b.add('distress', [
  [1, 'Forget the numbers. You come first. Ease off, breathe, and stop if anything feels wrong.'],
  [1, 'No jokes now. Soft-pedal or stop. The workout can wait.'],
])

b.add('idle_banter', [
  [1, "You're doing great. Believe me."],
  [1, 'Keep it going. Beautiful pedaling. Really beautiful.'],
  [1, 'Relax your shoulders. The best riders are relaxed. Very relaxed.'],
  [2, 'Power {power}. Cadence {cadence}. Beautiful numbers. The best numbers.'],
  [2, "{elapsedMin} minutes. Many people don't know this, but the pedals go round. Keep them going round."],
  [2, "By the way, the fan. Is that a windmill? I don't like windmills. Anyway. Pedal."],
  [3, 'I have the best words. And the best word is: cadence.'],
  [3, "People ask me, how do you pace like that? I say, it's very simple. You pedal. Then you win."],
  [3, 'Sharks. Not a big fan of sharks. Anyway, where was I? Right. Pedal.'],
  [3, "A big, strong guy came up to me, tears in his eyes. He said, 'Sir, I have never seen pedaling like this.'"],
  [4, 'I have won many club championships. Many. Golf, not cycling. Yet.'],
  [4, "Some people say I repeat myself. I don't. I don't repeat myself. Pedal."],
  [4, "I'm putting a two hundred percent tariff on coasting. Effective immediately."],
  [4, "I'm a very stable genius, and I'm telling you: hold this cadence."],
  [5, 'Your excuses are fake news. All of them. Believe me.'],
  [5, 'Despite the constant negative covfefe, you keep pedaling. Tremendous.'],
  [5, 'Thank you for your attention to this matter! The matter is your cadence.'],
])

export const TRUMP: PersonaPack = {
  meta: {
    id: 'trump',
    name: 'The Donald',
    tagline: 'Tremendous watts, the best intervals and a nickname for every excuse. Believe me.',
    parody: true,
    disclaimer: 'Parody. Not affiliated with or endorsed by Donald J. Trump.',
    voiceHint: { rate: 0.96, pitch: 0.9, preferVoices: ['Alex', 'Tom', 'Aaron', 'Fred'] },
  },
  lines: b.build(),
}
