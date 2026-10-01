// Roast Comic: insult-comedy club energy. Roasts effort, choices, gear and
// excuses. Never looks, body or health: the rider is the audience, not the joke.
import type { PersonaPack } from '../types'
import { HARD, LAST_REP, P, PackBuilder, eq, gt, gte, kind, lt, lte, ne, rideKind, when, whenP } from './dsl'

const b = new PackBuilder('roast-comic')

b.add('ride_start', [
  [1, "Ladies and gentlemen, welcome to the pain cave! Tonight's headliner is... you. Good luck."],
  [1, "Is this thing on? Great. You're on too. Let's ride."],
  [2, "Tonight's show: {workoutName}. Early reviews say it's too hard for you."],
  [3, "Look at you, all clipped in. Big shoes for someone about to pedal like a screensaver."],
  [4, 'You bought a smart trainer so it could watch you struggle in high definition. Iconic.'],
  [5, 'Welcome back to the show nobody asked for: you, pretending this is easy. Hell of a premise.', P],
  [2, "FTP test night! It's like a roast, except the numbers do the insulting.", when(rideKind('ftp-test'))],
  [3, 'A free ride. No plan, no structure. Bold. Like a comedian with no material.', when(rideKind('free'))],
])

b.add(
  'segment_start',
  [
    [1, "Interval time! {targetW} watts. Let's see what you've got. Or haven't."],
    [1, "Here we go: {targetW} watts for {remainingS}. The crowd is on its feet. The crowd is me."],
    [2, '{targetW} watts! Show the people what you paid all that money for!'],
    [3, "{targetW} watts, starting now. I'd wish you luck, but luck doesn't make watts."],
    [4, '{targetW} watts! Try to make it look less like a struggle and more like a sport.'],
    [5, "{targetW} watts, go! Pedal like your excuses are chasing you. They're fast as hell.", P],
    [3, "Rep {rep} of {reps}. We're at the part of the show where the audience checks their phones."],
  ],
  [HARD],
)
b.add(
  'segment_start',
  [
    [2, "Last rep! Big finish! Don't make me do a callback to rep one."],
    [4, 'Final rep! Your legs have been heckling you all night. Time to heckle back.'],
  ],
  [HARD, LAST_REP],
)
b.add(
  'segment_start',
  [
    [1, 'All out for {remainingS}! No target, no excuses, no mercy!'],
    [4, 'Max effort! Finally, a chance to prove the last ten minutes were a warmup. Were they?'],
  ],
  [HARD, kind('maxeffort')],
)
b.add(
  'segment_start',
  [
    [2, "Ramp time! It's like a standup set: the longer you stay up there, the harder it gets."],
    [4, 'The ramp! Every minute it gets harder. Kind of like watching you do it.'],
  ],
  [HARD, kind('ramp')],
)
b.add(
  'segment_start',
  [
    [1, 'Warmup! Easy spin. Pace yourself; the jokes get meaner later.'],
    [3, "Warmup. The only part of the workout you're genuinely good at."],
  ],
  [kind('warmup')],
)
b.add(
  'segment_start',
  [
    [1, 'Steady block at {targetW} watts. The comedy equivalent of a long setup.'],
    [3, 'Steady at {targetW}. Monotonous, like your rotation of excuses.'],
  ],
  [kind('steady')],
)
b.add(
  'segment_start',
  [
    [1, "Recovery! Catch your breath. You'll need it for the next roasting."],
    [2, "Rest for {remainingS}. Enjoy it. It's the only applause you're getting."],
    [4, "Recovery. The power file can't see you sweat, but it can see you coast."],
  ],
  [kind('off')],
)
b.add(
  'segment_start',
  [
    [1, "Free ride. Improv night! Let's see what you come up with."],
    [3, 'No target for {remainingS}. Nothing to fail at. Your favorite kind of segment.'],
  ],
  [kind('freeride')],
)
b.add(
  'segment_start',
  [
    [1, 'Cooldown! Tip your coach. The coach accepts carbs.'],
    [3, 'Cooldown. The encore nobody requested, but here we are.'],
  ],
  [kind('cooldown')],
)

b.add('countdown_10s', [
  [1, 'Ten seconds! Places, everyone!'],
  [1, 'Ten seconds to showtime!'],
  [2, 'Ten seconds to {targetW} watts. Somebody cue the dramatic music.'],
  [3, 'Ten seconds. Last chance to fake a sensor dropout.'],
  [4, "Ten seconds! Start working on your excuse now. You'll need it in about ninety."],
  [5, 'Ten seconds! Stop stalling and get your ass ready!', P],
  [2, 'Ten seconds to all-out. Leave it all on stage!', when(kind('maxeffort'))],
])

b.add('halfway', [
  [1, "Halfway! You're doing great. I'm contractually required to say that."],
  [2, 'Halfway there. {remainingS} left. The show must go on.'],
  [3, 'Halfway. This is the part of the set where amateurs panic. Are you panicking?'],
  [4, 'Halfway, and your power line looks like a nervous seismograph.'],
  [5, "Halfway! Nobody's clapping, but hell, keep going anyway.", P],
  [2, 'Halfway and right on target! Who wrote your material?', when(gte('pct', 98))],
  [3, 'Halfway and {deficitW} watts short. Classic. Ride it out and fix it in post.', when(lt('pct', 95))],
])

b.add('last_minute', [
  [1, 'One minute left! Big finish!'],
  [2, 'Last minute! Hold {targetW}! Stick the landing!'],
  [2, 'One minute! This is where legends are made. Or at least ride files.'],
  [3, 'Sixty seconds. Even a bad set ends eventually.'],
  [4, 'Final minute! Quit now and my next five minutes of material write themselves.'],
  [5, "Last minute! Dig in! Don't make this the saddest damn finale I've ever hosted.", P],
  [3, "Last minute and {deficitW} short. You're one minute from a comeback story. Or a cautionary tale.", when(lt('pct', 95))],
])

b.add('segment_end_success', [
  [1, 'Nailed it! {pct}% of target! Give it up for the rider!'],
  [1, "That's the one! Great interval!"],
  [2, "Look at that. Competence. Didn't see that coming."],
  [3, "Solid interval. I had jokes ready and now I can't use them. Rude."],
  [4, "{pct}% of target. The trainer wants your autograph, mostly to check it's really you."],
  [5, 'Damn. Good interval. My writers are furious.', P],
  [2, "Set complete! Standing ovation! Well, I'm standing. You keep sitting.", when(LAST_REP)],
])

b.add('segment_end_failed', [
  [1, 'Came in at {pct}%. Hey, not every joke lands.'],
  [2, '{pct}% of target. The target called. It feels ghosted.'],
  [3, "Average {avgW}, target {targetW}. That's not a gap, that's a canyon with a gift shop."],
  [3, 'That interval had the energy of a group chat on mute.'],
  [4, '{pctUnder}% under. If effort were currency, that one bounced.'],
  [4, 'Under target. Your excuses are in better shape than your intervals.'],
  [5, "{pct}%? That wasn't an interval, that was a half-assed rumor of one.", P],
])

b.add('under_target', [
  [1, 'Hey, {deficitW} watts short. Close the gap, champ.'],
  [1, "{power} watts. The target's {targetW}. Just saying."],
  [2, "Under target. The trainer's doing more work than you, and it's plugged into a wall."],
  [3, "{power} watts? My phone charger puts out more effort, and it's embarrassed about it."],
  [4, "{deficitW} watts short! What's the plan, pedal slower so the time goes faster?"],
  [5, "Under target again. This isn't a slump, it's a lifestyle. Pick it up, damn it.", P],
  [3, "{pct}% of target. That's not a workout, that's a very expensive nap.", when(lt('pct', 85))],
])

b.add('over_target_early', [
  [1, 'Whoa, {surplusW} over already. Pace yourself, superstar.'],
  [3, "Starting at {power} when the target's {targetW}? Opening with your best material. Rookie move."],
  [4, "Too hot too early. You're going to blow up like a heckler at a two-drink minimum."],
])

b.add('cadence_sag', [
  [1, 'Cadence is slipping. Spin it up!'],
  [2, 'Cadence {cadence}. Down {cadenceDrop}. Pedal like you mean it.'],
  [2, 'Cadence sag! Quick feet, light gear, less drama.'],
  [3, 'Your cadence is dropping faster than my ratings.'],
  [3, '{cadence} rpm. Are you pedaling or kneading bread?'],
  [4, "Cadence {cadence}. That's not a pedal stroke, that's a slow-motion replay."],
  [5, 'Cadence down {cadenceDrop} rpm. Spin, damn it! The flywheel is falling asleep.', P],
])

b.add('hr_high', [
  [1, 'Heart rate {hr}. Over your cap of {hrCap}. Ease off a little, champ.'],
  [2, "{hr} bpm. Your heart's doing an encore nobody asked for. Back it off."],
  [3, "Heart rate over the cap. Dial it back; the show's not over yet."],
])

b.add('hr_spike_no_power', [
  [1, 'Heart rate {hr} at {power} watts? Either your strap is glitching or you just read the comments section.'],
  [2, '{hr} bpm while barely pedaling. Wet the strap, or tell me who texted you.'],
  [3, 'That heart-rate spike has more drama than your whole interval. Strap glitch, probably.'],
])

b.add('stopped_pedaling', [
  [1, 'Intermission! Take your time.'],
  [1, 'Break time. Grab some water. The show resumes when you do.'],
  [2, 'Pedals stopped. Dramatic pause? I respect it.'],
  [3, "Stopped at {elapsedMin} minutes. Is this a bit? Because it's not landing."],
  [4, "You stopped. The flywheel's still going. The flywheel has more commitment than you."],
  [5, "Oh, we're stopping? Hell, why not. I'll just stand here and riff.", P],
])

b.add('resumed', [
  [1, "And we're back! Welcome back, folks."],
  [2, 'Back after {pausedS}. That was a long intermission.'],
  [4, "You're back! I was about to cancel the tour."],
])

b.add('skipped_interval', [
  [1, 'Skipped it. Hey, even good sets cut a bit.'],
  [2, 'Skipped {segmentLabel}. Bold editing choice.'],
  [3, "You skipped an interval. That's buying a ticket and leaving before the headliner."],
  [3, 'Skipping intervals: the fast-forward button of champions. Not real champions. The other kind.'],
  [4, 'Skip! Somewhere, your future self is watching this and groaning.'],
  [5, 'You skipped the interval? Damn. Even your excuses are taking shortcuts now.', P],
])

b.add('extended_interval', [
  [1, 'Extended by {extraS}! Bonus content!'],
  [3, 'You added {extraS}? Voluntarily? I need to rewrite my whole set.'],
  [4, "Extra time! Look who's angling for a callback."],
])

b.add('intensity_down', [
  [1, 'Intensity down to {intensityPct}%. Smart. Know your audience.'],
  [2, '{intensityPct}%. Lowering expectations. A classic move.'],
  [3, 'Intensity down. You negotiated with a spreadsheet and lost.'],
  [3, "Down to {intensityPct}%. The workout's disappointed, but it'll get over it. Will you?"],
  [4, "Turning it down to {intensityPct}%? Your legs filed a union grievance, didn't they?"],
  [5, '{intensityPct}%? Hell, why not just ride the couch?', P],
])

b.add('intensity_up', [
  [1, 'Intensity up to {intensityPct}%! The crowd goes wild!'],
  [3, "You turned it UP? Confident. Let's see if the legs got the memo."],
  [4, '{intensityPct}%! Bold of you to assume you survive this set.'],
])

b.add('wbal_low', [
  [1, 'W′bal at {wbalPct}%. Save some for the encore.'],
  [2, "{wbalPct}% W′bal left. That's running on fumes, folks."],
  [2, 'Reserves low. Ride smart. Smarter than usual, anyway.'],
  [3, 'Your W′bal is lower than my expectations, and those were already on the floor.'],
  [4, 'W′bal {wbalPct}%. You spent your matches like a tourist with free drinks.'],
  [5, "W′bal at {wbalPct}%. Blew it all on the first act, didn't you? Damn rookie.", P],
])

b.add('wbal_empty', [
  [1, 'W′bal empty. Running on pure stubbornness now.'],
  [3, 'The tank is empty. This is the part of the show where it gets real.'],
  [4, "Zero W′bal. The matchbook is empty. You burned them all in the warmup, didn't you?"],
])

b.add('pr', [
  [1, 'New {prLabel} PR! Give it up for the rider!'],
  [1, "That's a new {prLabel} best! Take a bow! A small one, you're still pedaling."],
  [2, "{prLabel} personal record! {power} watts! Okay, that's actually impressive."],
  [3, 'A {prLabel} PR? I had a whole bit prepared. Scrapping it. Respect.'],
  [4, 'New {prLabel} best! Who are you, and what have you done with my usual material?'],
  [5, '{prLabel} PR! Damn! Somebody frame that power file!', P],
])

b.add('ftp_test_minute', [
  [1, 'Minute {minute}. Projected {projectedFtp}. Keep it rolling.'],
  [2, "Minute {minute}! Still here! I respect the commitment to the bit."],
  [3, 'Minute {minute}. Projected {projectedFtp}. The numbers are roasting you gently, for now.'],
  [1, "Minute {minute}. Easy start. Don't open with your closer.", when(lte('minute', 3))],
  [3, 'Minute {minute}. Everyone feels great this early. Talk to me at minute twelve.', when(lte('minute', 3))],
  [2, 'Minute {minute}! Final stretch! Leave it all on stage!', when(gte('minute', 15))],
  [4, "Minute {minute}. Whatever you're saving for a rainy day: it's raining.", when(gte('minute', 17))],
  [
    2,
    "Minute {minute}. Projected {projectedFtp}, that's {projectedGain} up. Don't choke. I mean that supportively.",
    when(gt('projectedGain', 0)),
  ],
])

b.add('ftp_test_result', [
  [1, 'New FTP {ftpNew}! Up {ftpGain}! Give it up, folks!', when(gt('ftpGain', 0))],
  [3, 'Up {ftpGain} watts to {ftpNew}. Great, now I need all new material.', when(gt('ftpGain', 0))],
  [5, "{ftpNew}! Up {ftpGain}! Damn it, you've ruined my whole act.", whenP(gt('ftpGain', 0))],
  [1, 'FTP {ftpNew}, down {ftpDrop}. Every comedian has a rough night.', when(gt('ftpDrop', 0))],
  [3, '{ftpNew}, down {ftpDrop} from {ftpOld}. Tough crowd. The crowd was the power meter.', when(gt('ftpDrop', 0))],
  [2, 'FTP stays at {ftpNew}. Consistent. Like my act: reliable, a little predictable.', when(eq('ftpGain', 0))],
  [1, "Test done! FTP {ftpNew}! That's the show!"],
])

b.add('workout_complete', [
  [1, "That's the show! Thank you, you've been great!"],
  [1, 'Workout complete! {elapsedMin} minutes! Tip your coach!'],
  [2, "Done! NP {np}. I'd roast it, but honestly, it's solid."],
  [2, "{kj} kJ of work. That's more output than most of my audiences."],
  [3, 'You finished. Against all odds and most of my predictions.'],
  [4, 'Workout complete. The trainer would like a moment alone to process what it saw.'],
  [5, "That's a wrap. Damn good show. I'll deny it in the review.", P],
])

b.add('ride_bailed', [
  [1, 'Early exit. Hey, sometimes the show gets cut short.'],
  [2, "Leaving at {elapsedMin} minutes? You're walking out on your own show."],
  [3, 'Bailed. The first rule of comedy is you finish the set. The first rule of you is apparently snacks.'],
  [3, "Early exit. I'll tell everyone it was a scheduling conflict."],
  [4, 'Quitting already? I had twenty more minutes of material about your cadence.'],
  [5, 'You bailed? Hell, even the flywheel stuck around longer.', P],
])

b.add('fueling_reminder', [
  [1, 'Snack time! Eat something.'],
  [1, 'Fuel check! Carbs in, jokes out.'],
  [2, 'Fuel up! Even comedians need a bite between sets.'],
  [3, 'Eat something. Running on empty makes you ride like my opening act.'],
  [4, "{elapsedMin} minutes in. Eat now, or you'll hit the wall and blame the trainer."],
  [5, 'Eat a damn gel. Hungry you is a terrible performer.', P],
])

b.add('hydration_reminder', [
  [1, 'Drink some water! Stay hydrated, stay funny.'],
  [2, "Hydration break. The bottle's right there. It's not decorative."],
  [3, 'Drink. Your bottle is the only thing in this room still full of potential.'],
])

b.add('distress', [
  [1, "Show's paused. Seriously: ease off and breathe. Stop if something feels wrong."],
  [1, 'No jokes for a minute. Soft-pedal or stop. You matter more than the workout.'],
])

b.add('idle_banter', [
  [1, "You're doing fine. That's not a joke, it's just true."],
  [1, 'Keep going! The crowd loves consistency. The crowd is me.'],
  [2, "Nice form. I'd heckle, but there's nothing to work with."],
  [2, '{elapsedMin} minutes in and still pedaling. The bar was low, and you cleared it.'],
  [2, 'Power {power}, cadence {cadence}. Consistent. Suspiciously consistent. Is this a replay?'],
  [3, "You own a smart trainer, a fan and a heart-rate strap, and you're still negotiating with a Tuesday."],
  [3, 'Your power file is going to be a great read. A mystery novel. Where did the watts go?'],
  [3, "I've seen screensavers with more drive."],
  [4, 'You ride indoors so nobody sees your pacing. Good instinct.'],
  [4, 'Carbon everything, and the slowest part of the bike is still the engine.'],
  [5, "If excuses were watts, you'd be a world champion. Instead, you're here. With me."],
  [5, "You're pedaling like the power meter owes you money and you're too polite to ask. Ask, damn it!", P],
])

b.add('segment_start', [[5, '{targetW} watts. Quit stalling and get the fuck on it.', P]], [HARD])
b.add('under_target', [[5, '{power} watts. Fucking embarrassing. The target was right there.', P]])
b.add('idle_banter', [[5, 'This pace is bullshit. Even the flywheel looks embarrassed.', P]])

// Unhinged: strong profanity, only for riders who asked for it.
b.add('ride_start', [
  [1, "Welcome to the show, folks. Tonight's headliner is you, and it's fucking sold out. Mostly to me.", P],
  [4, "Clip in. Tonight's set: an hour of me roasting your shit effort. Tip your trainer.", P],
])
b.add(
  'segment_start',
  [
    [2, "{targetW} watts. Easy, right? Right? Fuck, this is going to be fun to watch.", P],
    [5, '{targetW} watts for {remainingS}. Let me guess, you already have an excuse. Save that shit.', P],
  ],
  [HARD],
)
b.add('countdown_10s', [[3, "Ten seconds. Fuck around now and you'll find out at {targetW} watts.", P]])
b.add('halfway', [[4, 'Halfway. Half the interval, half the effort. Your whole fucking brand.', P]])
b.add('last_minute', [[3, "Last minute. This is the closer. Don't fuck up the closer.", P]])
b.add('segment_end_success', [
  [1, 'Okay, that was fucking good. Nobody tell my manager I said that.', P],
  [5, 'You actually hit it? Fuck. I had a whole bit ready.', P],
])
b.add('segment_end_failed', [
  [3, "{pct}%. That wasn't an interval, that was a shitty rough draft.", P],
  [5, 'Average {avgW}, target {targetW}. That gap has its own fucking zip code.', P],
])
b.add('under_target', [
  [2, "{deficitW} watts short. Come on, that's some bargain-bin bullshit.", P],
  [4, '{power} watts? My fucking phone charger pulls more than that.', P],
])
b.add('cadence_sag', [[3, "Cadence {cadence}. You're pedaling like the crank owes you money and you're shit at collections.", P]])
b.add('stopped_pedaling', [[4, "Oh, we're stopping? Great. Dead air. Every comic's favourite fucking thing.", P]])
b.add('skipped_interval', [[3, "Skipped {segmentLabel}. Even your intervals are getting ghosted now. That's fucked.", P]])
b.add('intensity_down', [[4, "{intensityPct}%? You turned it down? That's not training, that's fucking karaoke.", P]])
b.add('wbal_low', [[3, 'W′bal {wbalPct}%. You blew your whole fucking budget on the opening joke.', P]])
b.add('pr', [[2, '{prLabel} PR? Well, shit. Guess I have to write new material.', P]])
b.add('ftp_test_result', [[4, 'FTP {ftpNew}. Put that shit on a T-shirt. Nobody will ask, but put it on.', P]])
b.add('workout_complete', [
  [1, "That's the show. Honestly? You were fucking great tonight.", P],
  [5, "That's a wrap. {tss} TSS. Not bad for someone who opened like absolute shit.", P],
])
b.add('ride_bailed', [[5, 'Leaving at {elapsedMin} minutes? Walking out mid-set? Rude as fuck. I will roast you from here.', P]])
b.add('fueling_reminder', [[3, 'Eat something. Hangry you is a shit crowd.', P]])
b.add('idle_banter', [
  [2, 'Power {power}, cadence {cadence}. Solid numbers. Boring as shit, but solid.', P],
  [4, 'This ride has the energy of a Tuesday open mic. And I fucking hate open mics.', P],
  [5, "You call this suffering? I've had shittier crowds try harder.", P],
])

const NOT_END = [ne('milestoneKind', 'halfway'), ne('milestoneKind', 'finish')]
b.add(
  'journey_milestone',
  [
    [1, 'Ladies and gentlemen, {place}! Give it up for {place}!'],
    [2, '{place}! Great crowd tonight. Small, but they came.'],
    [3, '{place}. I did ten minutes here once. They still talk about it. Not kindly.'],
    [4, 'We are in {place}! The tourist board did not expect you to arrive like this.'],
    [5, '{place}! {kmLeft} km to go and the damn tour bus has more legs than this act!', P],
    [5, '{place}! {kmLeft} km to go. The tour must go on.'],
  ],
  NOT_END,
)
b.add('journey_milestone', [
  [1, 'Welcome to {place}! New country, same material.'],
  [3, '{place}! They let you in. Their standards are lower than mine.'],
], [eq('milestoneKind', 'border')])
b.add('journey_milestone', [
  [1, 'The top of {place}! A standing ovation from the mountain goats!'],
  [3, 'You got up {place}. The road had jokes. You had better ones.'],
], [eq('milestoneKind', 'summit')])
b.add('journey_milestone', [
  [1, "Halfway! That's the intermission, folks. Grab a drink."],
  [3, 'Halfway through {journeyName}. Like most of my sets: the second half is better.'],
], [eq('milestoneKind', 'halfway')])
b.add('journey_milestone', [
  [1, "{place}! That's the show! {journeyName}, done!"],
  [3, "{place}. You made it. I'd roast you, but you just rode {kmDone} km. I got nothing."],
], [eq('milestoneKind', 'finish')])

export const ROAST_COMIC: PersonaPack = {
  meta: {
    id: 'roast-comic',
    name: 'Roast Comic',
    tagline: 'Insult-comedy club energy. Roasts your effort, choices and excuses.',
    voiceHint: { rate: 1.1, pitch: 1, preferVoices: ['Tom', 'Evan', 'Alex'] },
  },
  lines: b.build(),
}
