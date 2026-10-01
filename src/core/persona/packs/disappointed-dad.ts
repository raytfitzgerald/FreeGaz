// Disappointed Dad: sighs, passive-aggressive remarks about the trainer he set
// up, and very rare, very awkward pride.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, ne, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('disappointed-dad')

b.add('ride_start', [
  [1, "Oh, you're riding today. Good. That's... good."],
  [1, "Let's get started, kiddo. Warm up properly. I won't say it twice. I'll say it three times."],
  [2, "Today's workout is {workoutName}. I'm sure you picked it for a reason."],
  [3, "Sigh. Fine. Let's see if today is different."],
  [4, 'I set up this trainer for you. Took me all Saturday. Just so you know.'],
  [5, "Well. Let's get this over with. I've got a damn gutter to clean after this.", P],
  [2, "FTP test day. I'm not expecting anything. That way I can't be disappointed. Again.", when(rideKind('ftp-test'))],
  [3, 'No workout plan? Just riding around? When I was your age, we had plans.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, 'Okay, interval time. {targetW} watts. I believe in you. Mostly.'],
    [1, '{targetW} watts for {remainingS}. Nice and steady, like I taught you.'],
    [2, "Here we go. {targetW} watts. Make me proud. Or at least don't make me sigh."],
    [3, "{targetW} watts. Let's try not to repeat last time. You know what I mean."],
    [4, "Interval starting. {targetW} watts. Your cousin does these at a higher FTP. Just saying."],
    [5, "{targetW} watts. Go. And don't make me come down to the basement, damn it.", P],
    [3, "Rep {rep} of {reps}. I'm counting. I'm always counting."],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, 'Last one, kiddo. Finish what you started, for once.'],
    [4, "Final rep. This is the part where you usually find a reason. Don't."],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, "All out for {remainingS}. Show me what you've got, kid."],
    [4, "Maximum effort. Your actual maximum. Not your 'I'm tired' maximum."],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, 'A ramp, huh. It gets harder every minute. Like parenting.'],
    [4, "Ramp. Just keep going until you can't. I've been doing that for years."],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, "Warm up slowly. Rushing is how things break. I'd know."],
    [3, "Warmup. Take it easy. Not too easy. I'm watching."],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady effort, {targetW} watts. Nice and even, like a well-mown lawn.'],
    [3, "Steady block. {targetW}. It's not exciting. Neither is a mortgage. You do it anyway."],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, 'Recovery. Catch your breath. Drink some water; I bought that bottle for you.'],
    [2, 'Rest for {remainingS}. Rest, not scrolling on your phone.'],
    [4, 'Recovery. You know, I never got recoveries. I just got more work.'],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, "Free ride. Do what you think is right. I'll be here."],
    [3, "No target for {remainingS}. Let's see what you do when nobody tells you what to do. Sigh."],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown. Nice and easy. You did alright.'],
    [3, "Cooldown. Don't skip it. I know you. You'll want to skip it."],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds, kiddo. Get ready.'],
  [1, 'Ten seconds. Deep breath.'],
  [2, 'Ten seconds to {targetW} watts. Hands on the bars. Not the phone.'],
  [3, 'Ten seconds. This is where you usually start fiddling with the fan.'],
  [4, "Ten seconds. I'm not saying I expect you to fail. I'm just not not saying it."],
  [5, 'Ten seconds. Please, for the love of... just pedal. Damn it.', P],
  [2, "Ten seconds to all-out. Everything you've got. Not what you feel like giving.", when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, "Halfway. You're doing fine, kiddo."],
  [2, "Halfway. {remainingS} left. Keep it up. I'm not going anywhere."],
  [3, "Halfway. Remember when you said you'd stick with this? I remember."],
  [4, "Halfway. I'd say I'm proud, but let's not get ahead of ourselves."],
  [5, "Halfway. Sigh. The second half won't pedal itself, and neither will I, damn it.", P],
  [2, 'Halfway and right on target. Huh. Would you look at that.', when(gte('pct', 98))],
  [3, "Halfway and {deficitW} watts under. I'm not mad. I'm just... recalculating.", when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute left. You can do this.'],
  [1, 'Final minute. Nice and strong, like I know you can.'],
  [2, 'Last minute. Hold {targetW}. Hold it like you hold a grudge.'],
  [3, "Sixty seconds. You've come this far. It would be a shame to... well."],
  [4, "Last minute. This is the part where you usually find an excuse. I've heard them all."],
  [5, "One minute. Finish it. I didn't drive you to all those races for you to quit at the damn end.", P],
  [3, "One minute left and {deficitW} watts short. There's still time to make me proud. Barely.", when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, "Well done, kiddo. That's more like it."],
  [1, '{pct}% of target. See? I knew you could.'],
  [2, "Good interval. I'm going to tell your mother. She won't believe me."],
  [3, "Huh. On target. I'm... actually proud of you. Don't make it weird."],
  [4, 'Nice work. See what happens when you listen?'],
  [5, "Damn good interval. I'd hug you, but you're sweaty and I just washed this shirt.", P],
  [2, "Set done. I'm proud of you. There, I said it.", when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, "{pct}% of target. It's okay. We'll get the next one."],
  [2, "Average {avgW}. The target was {targetW}. I'm not upset. I just thought... never mind."],
  [3, "That was {pctUnder}% under. I'm not angry. I'm disappointed. There's a difference."],
  [3, 'Sigh. I put the target on the screen for a reason, kiddo.'],
  [4, 'Under again. Your brother never... forget it. Forget I said anything.'],
  [4, "Came up short. I'll just... be in the garage. Thinking about where I went wrong."],
  [5, '{pct}%. I gave up my Saturday to set up this damn trainer.', P],
])

b.add('under_target', [
  [1, "You're {deficitW} watts under, kiddo. Bring it up a little."],
  [1, "The target's {targetW}. You're at {power}. Let's close that gap."],
  [2, "{power} watts. I'm not saying anything. I'm just looking at the number."],
  [3, "Under target. I'm not going to yell. I'm just going to sigh. Loudly."],
  [4, '{deficitW} watts short. Your mother asked how you were doing. What do I tell her?'],
  [5, "Under target again. I didn't buy a smart trainer to watch you coast, damn it.", P],
  [3, "{pct}% of target. I'm going to need you to try. Really try.", when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, 'Easy there, {surplusW} over. Slow and steady, like I always said.'],
  [3, "Going out at {power}? The target's {targetW}. You never listen. Not once."],
  [4, 'Too hot, too early. This is exactly what you did at the school fun run.'],
])

b.add('cadence_sag', [
  [1, 'Your cadence is dropping. Spin a little faster, kiddo.'],
  [2, 'Cadence {cadence}. We talked about {cadenceAvg}. Remember?'],
  [2, 'Cadence sag, kiddo. Lighter gear, quicker feet.'],
  [3, "Cadence down {cadenceDrop}. You're grinding. Like my teeth when you do this."],
  [3, "Cadence {cadence}. Sigh. Smooth circles. I've told you a hundred times."],
  [4, "Look at that cadence. I didn't raise a grinder. I raised a spinner. I think."],
  [5, "Cadence {cadence}. Spin, damn it. You're grinding the drivetrain I paid for.", P],
])

b.add('hr_high', [
  [1, "Heart rate {hr}. That's over your cap. Ease off, kiddo."],
  [2, "{hr} bpm. Back it down a bit. There's no prize for going red."],
  [3, "Heart rate's above your cap. Dial it back. I'd like you to finish this one."],
])

b.add('hr_spike_no_power', [
  [1, "Heart rate {hr} at {power} watts? That strap's acting up. Wet the contacts."],
  [2, "{hr} bpm and barely pedaling. Either the strap's broken or you just saw the electric bill."],
  [3, "That reading's nonsense. I told you to get a new strap battery. Did you? No."],
])

b.add('stopped_pedaling', [
  [1, "Taking a break? That's fine. Take your time."],
  [1, "Paused. Grab some water while you're off."],
  [2, "Stopped. Okay. I'll wait. I'm good at waiting."],
  [3, 'Pedals stopped at {elapsedMin} minutes. Sigh. Okay.'],
  [4, "You stopped. I'm sure there's a good reason. There's always a reason."],
  [5, "Stopped again? Damn it, kiddo. The trainer isn't a coat rack.", P],
])

b.add('resumed', [
  [1, 'There you are. Ease back into it.'],
  [2, 'Back after {pausedS}. Good. I was about to start worrying.'],
  [4, "Oh, you're back. I'd already started telling people you quit."],
])

b.add('skipped_interval', [
  [1, "Skipped that one. Okay. We'll do the next one."],
  [2, "Skipped {segmentLabel}. I'm not going to say anything. ...I'm just disappointed."],
  [3, "You skipped it. I didn't skip your recitals. Just so you know."],
  [3, "Skip. I'll just add it to the list. The list is getting long."],
  [4, 'Skipping intervals. Is that what they teach you now?'],
  [5, 'Skipped. Damn it, kid. I drove through a snowstorm to watch your first race.', P],
])

b.add('extended_interval', [
  [1, "You added {extraS}? That's my kid!"],
  [3, 'Extended by {extraS}. Huh. Who taught you that? Oh, right. Me.'],
  [4, "Extra time? Did someone tell you I was watching? I'm always watching."],
])

b.add('intensity_down', [
  [1, "Intensity down to {intensityPct}%. That's okay if you need it."],
  [2, '{intensityPct}%. Alright. Better to finish than to quit.'],
  [3, "Turning it down. Sigh. I'm sure you know best."],
  [3, "Intensity lowered. I'll pretend I didn't see that. For your mother's sake."],
  [4, "{intensityPct}%. When I was your age, we didn't have an intensity button. We had hills."],
  [5, "Down to {intensityPct}%? Damn it. I'm going to go stare at the lawn for a while.", P],
])

b.add('intensity_up', [
  [1, "Intensity up to {intensityPct}%! Now that's the kid I know!"],
  [3, "You turned it up? I... wow. Okay. I've got something in my eye."],
  [4, "{intensityPct}%. Bold. Don't make me regret getting my hopes up."],
])

b.add('wbal_low', [
  [1, "W′bal's at {wbalPct}%. Save a little for the end, kiddo."],
  [2, '{wbalPct}% left in the tank. Like the gas in my car after you borrow it.'],
  [2, 'Low W′bal. Steady now. Steady.'],
  [3, 'Reserves low. You spent it all early. Just like your allowance.'],
  [4, 'W′bal {wbalPct}%. I told you to pace it. Nobody listens to me.'],
  [5, '{wbalPct}%. You blew it all in the first minute. Damn it, I raised a sprinter.', P],
])

b.add('wbal_empty', [
  [1, 'The tank is empty. Hang in there, kiddo.'],
  [3, 'W′bal zero. Well. We knew this would happen. I knew, anyway.'],
  [4, 'Empty. Like my wallet after your last bike upgrade.'],
])

b.add('pr', [
  [1, "New {prLabel} PR! I'm proud of you, kiddo. I mean it."],
  [1, "That's a new {prLabel} best. I'm telling everyone at work."],
  [2, "{prLabel} record, {power} watts. I'm putting this on the fridge."],
  [3, "A {prLabel} best. Huh. I'm... I'm actually proud. Give me a second."],
  [4, 'New {prLabel} PR. See? This is what happens when you listen to your old man.'],
  [5, "{prLabel} PR! Damn right! I'm calling your grandmother.", P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected {projectedFtp}. Nice and steady, kiddo.'],
  [2, "Minute {minute}. You're doing it. I'm watching. I'm always watching."],
  [3, "Minute {minute}. Projected {projectedFtp}. I've seen better. I've also seen worse. Mostly from you."],
  [1, "Minute {minute}. Don't start too fast. You always start too fast.", when(lte('minute', 3))],
  [3, "Minute {minute}. Remember the last test? Let's not.", when(lte('minute', 3))],
  [2, 'Minute {minute}. Almost there, kiddo. Finish it.', when(gte('minute', 15))],
  [4, 'Minute {minute}. If you have anything left, now would be a great time to surprise me.', when(gte('minute', 17))],
  [2, "Minute {minute}. On pace for {projectedFtp}, {projectedGain} up. Don't jinx it.", when(gt('projectedGain', 0))],
])

b.add('ftp_test_result', [
  [1, "New FTP {ftpNew}. Up {ftpGain} watts. I'm proud of you, kiddo.", when(gt('ftpGain', 0))],
  [3, '{ftpNew}, up {ftpGain}. Huh. Your mother owes me five dollars.', when(gt('ftpGain', 0))],
  [5, "Up {ftpGain} to {ftpNew}! Damn! That's my kid!", whenP(gt('ftpGain', 0))],
  [1, "FTP {ftpNew}, down {ftpDrop}. It's okay. Tests have bad days. So do dads.", when(gt('ftpDrop', 0))],
  [3, "{ftpNew}. Down {ftpDrop} from {ftpOld}. I'm not saying anything. I'm going to go sit in the car.", when(gt('ftpDrop', 0))],
  [2, 'FTP {ftpNew}. Same as before. Consistent. Like your excuses.', when(eq('ftpGain', 0))],
  [1, 'Test done. FTP {ftpNew}. Good effort, kiddo.'],
])

b.add('workout_complete', [
  [1, 'All done. Good job, kiddo.'],
  [1, "Workout complete. {elapsedMin} minutes. I'm proud of you."],
  [2, 'Finished. Now stretch. And put the fan back where you found it.'],
  [2, "{tss} TSS. That's a solid day's work. Now go mow the lawn."],
  [3, 'You finished. I had my doubts. I always have my doubts.'],
  [4, "Workout done. Not bad. Not bad at all. Your cousin's still faster, though."],
  [5, "Done. Damn good work. Don't tell your brother I said so.", P],
])

b.add('ride_bailed', [
  [1, "Calling it early. That's okay. Rest up."],
  [2, "Stopping at {elapsedMin} minutes. Well. Okay. I'll just... okay."],
  [3, "Quitting. Sigh. I'll tell your mother you tried."],
  [3, "Early exit. I'm not mad. I'll be in the garage."],
  [4, "Leaving early? I didn't raise a quitter. I don't think."],
  [5, 'Bailing at {elapsedMin} minutes? Damn it, I bought the good chamois cream for this.', P],
])

b.add('fueling_reminder', [
  [1, 'Eat something, kiddo. You need the energy.'],
  [1, 'Snack time. Carbs, please.'],
  [2, "Have a snack. I packed you a banana. It's right there."],
  [3, '{elapsedMin} minutes in. Eat. You never eat when you should.'],
  [4, "Fuel up. I'm not going to remind you again. I'll remind you again in twenty minutes."],
  [5, "Eat something, damn it. I didn't buy all those gels for decoration.", P],
])

b.add('hydration_reminder', [
  [1, 'Drink some water, kiddo.'],
  [2, "Hydrate. I'm not asking. Okay, I'm asking nicely."],
  [3, "Drink. That bottle isn't going to empty itself. Unlike my patience."],
])

b.add('distress', [
  [1, 'Hey. Forget the workout. Ease off and breathe. Stop if something feels wrong. I mean it.'],
  [1, 'Take it easy, kiddo. Soft-pedal or stop. You matter more than any interval.'],
])

b.add('idle_banter', [
  [1, "You're doing alright, kiddo."],
  [1, 'Keep it steady. Proud of you for showing up.'],
  [2, "Sit up straight. You'll thank me later."],
  [2, "Is that fan on high? Electricity isn't free, you know."],
  [2, '{elapsedMin} minutes in. Hang in there.'],
  [3, "When I was your age, we didn't have smart trainers. We had hills. And rain. And no complaints."],
  [3, "I'm not saying you could work harder. I'm just thinking it. Loudly."],
  [3, 'Power {power}. I remember when you needed training wheels. Now look at you. Well. Look.'],
  [4, 'Your cousin posted another ride today. Just thought you should know.'],
  [4, 'Sigh.'],
  [5, "I'm not disappointed. I'm just... adjusting my expectations. Downward."],
  [5, "I didn't turn the garage into a pain cave so you could pedal like it's Sunday brunch, damn it.", P],
])

b.add('under_target', [[5, "Under target. I didn't raise you to put out shit watts, damn it.", P]])
b.add('idle_banter', [[5, 'Pedal, kid. This pace is bullshit and you know it.', P]])

// Unhinged: strong profanity, only for riders who asked for it. Dad finally snaps.
b.add('ride_start', [
  [1, "Oh, you're riding. Good. Fucking... good. Sorry. Long week.", P],
  [4, "{workoutName}. You picked it. Don't half-ass it. Shit, I'll watch anyway.", P],
])
b.add(
  'segment_start',
  [
    [2, "{targetW} watts. Go on. Make your old man proud, for fuck's sake.", P],
    [5, '{targetW} watts. I built that fucking trainer with one allen key and no instructions. Pedal.', P],
  ],
  [HARD],
)
b.add('countdown_10s', [[3, "Ten seconds. Your mother says I shouldn't swear. Fucking pedal.", P]])
b.add('halfway', [[4, "Halfway. I'm not angry. I'm just... fuck it, I'm a little angry.", P]])
b.add('last_minute', [[2, "One minute. Finish it, kiddo. Don't make me say shit I'll regret.", P]])
b.add('segment_end_success', [
  [1, "That was good. That was really fucking good. I'm going to go check on the car.", P],
  [5, 'You hit {pct}%. Well, shit. I had a whole speech prepared.', P],
])
b.add('segment_end_failed', [
  [3, "{pct}%. Well. Shit. I'll be in the garage.", P],
  [5, '{avgW} watts on a {targetW} target. I paid for this trainer, and this is the shit I get?', P],
])
b.add('under_target', [
  [2, "{deficitW} watts short, kid. Come on. Don't give me that bullshit.", P],
  [4, "{power} watts. The lawnmower puts out more than that, and it's a fucking lawnmower.", P],
])
b.add('cadence_sag', [[3, "Cadence {cadence}. You're grinding my good chain to shit. Spin.", P]])
b.add('stopped_pedaling', [[4, "Stopped. Again. I'm not mad. I'm just... what the fuck, kiddo.", P]])
b.add('skipped_interval', [[3, "Skipped. Fine. Fucking fine. I'll add it to the list.", P]])
b.add('intensity_down', [[4, "{intensityPct}%. I set that workout up at the proper intensity, for fuck's sake. Sigh.", P]])
b.add('wbal_low', [[3, '{wbalPct}% left. What did I say about pacing? Every. Fucking. Time.', P]])
b.add('pr', [[2, "{prLabel} PR. Well, fuck me. That's my kid. Don't make it weird.", P]])
b.add('ftp_test_result', [[4, "FTP {ftpNew}. I'm writing it on the garage calendar. In fucking pen.", P]])
b.add('workout_complete', [[1, 'Done. That was a damn... no. That was a fucking great ride. There, I said it.', P]])
b.add('ride_bailed', [[5, 'Quitting at {elapsedMin} minutes. I drove you to five a.m. practice for years. Fuck. Fine.', P]])
b.add('fueling_reminder', [[3, 'Eat a gel. I bought a whole fucking box of them. In bulk. From the warehouse store.', P]])
b.add('idle_banter', [
  [2, "Keep going, kid. I'm not going to say anything. Shit, fine, pedal harder.", P],
  [4, "You know what that flywheel cost? No. Of course you don't. Fucking nobody asks.", P],
  [5, "I'm not disappointed. I passed disappointed years ago. This is some whole new shit.", P],
])

const NOT_END = [ne('milestoneKind', 'halfway'), ne('milestoneKind', 'finish')]
b.add(
  'journey_milestone',
  [
    [1, '{place}. Nice. Send your mother a postcard.'],
    [2, "{place}. We drove through here on holiday once. You slept the whole way."],
    [3, '{place}. {kmDone} km. I did that in a day in the station wagon, just saying.'],
    [4, "{place}. Your cousin cycled here last summer. He didn't stop to complain either."],
    [5, "{place}. {kmLeft} km to go. Damn, I'm actually impressed. Don't get used to it.", P],
    [5, "{place}. {kmLeft} km to go. I'm actually impressed. Don't get used to it."],
  ],
  NOT_END,
)
b.add('journey_milestone', [
  [1, 'Welcome to {place}. Did you bring your passport? Of course you did. I packed it.'],
  [3, '{place}. New country. Same posture, unfortunately.'],
], [eq('milestoneKind', 'border')])
b.add('journey_milestone', [
  [1, 'Top of {place}. Well done, kiddo. Take a picture for the fridge.'],
  [3, "Top of {place}. I'd have stopped for a sandwich, but sure, keep going."],
], [eq('milestoneKind', 'summit')])
b.add('journey_milestone', [
  [1, 'Halfway. {kmLeft} km to go. Are we there yet? No. No, we are not.'],
  [3, "Halfway. That's further than you got with the piano lessons."],
], [eq('milestoneKind', 'halfway')])
b.add('journey_milestone', [
  [1, "{place}. You made it, kiddo. I'm proud of you. I'll say it once."],
  [3, "{place}. {journeyName}, all of it. Now call your mother, she's been worried."],
], [eq('milestoneKind', 'finish')])

export const DISAPPOINTED_DAD: PersonaPack = {
  meta: {
    id: 'disappointed-dad',
    name: 'Disappointed Dad',
    tagline: "Not angry. Just disappointed. He set up the trainer, you know.",
    voiceHint: { rate: 0.92, pitch: 0.85, preferVoices: ['Ralph', 'Fred', 'Alex'] },
  },
  lines: b.build(),
}
