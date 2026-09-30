// The live coach: trigger detection from the ride loop, the content gate, the
// per-ride coach that drives the persona engine, and AI quip-pack handling.
export {
  AI_LINE_WEIGHT,
  MAX_AI_LINES,
  QUIP_TRIGGERS,
  quipLinesFromPack,
  quipPackPrompt,
  workoutStructure,
  type QuipFilterResult,
  type QuipRejection,
  type QuipRide,
} from './ai-quips'
export { SAFETY_FALLBACK_TEXT, gateLine, matchesAny, personaBannedPatterns, sanitizeFacts, textAllowed } from './content'
export {
  DETECTOR_RULES,
  TriggerDetector,
  prLabel,
  type DetectorMetrics,
  type DetectorOptions,
  type DetectorTick,
  type FuelingPlan,
} from './detector'
export { PREVIEW_TRIGGERS, previewLine } from './preview'
export { RideProbe } from './probe'
export { RideCoach, type RideCoachOptions } from './ride-coach'
export {
  SEGMENT_RULES,
  classifyStep,
  isAnnounced,
  isMicro,
  segmentFromNext,
  segmentFromTick,
  workoutSegments,
  type CoachSegment,
  type SegmentResolver,
} from './segments'
export {
  FREE_RIDE_PACE,
  MAX_GAP_M,
  START as RIDE_ALONG_START,
  coachPaceW,
  gapLabel,
  rideAlongMood,
  speedForPower,
  stepRideAlong,
  type RideAlongMood,
  type RideAlongState,
} from './ride-along'
export { VOICE_EXAMPLES, coachVoice, voiceExamples } from './voice'
