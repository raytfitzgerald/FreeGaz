/** A file that can't be read as a workout at all (bad XML, wrong root, running workout...). */
export class WorkoutFormatError extends Error {
  override name = 'WorkoutFormatError'
}
