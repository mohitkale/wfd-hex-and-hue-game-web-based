/**
 * Hex & Hue v3, the Grimoire: the pure learning engine (lessons and the runner that plays them).
 * No DOM, no Phaser; deterministic, like `core`. The plan is in docs/V3_PLAN.md.
 */
export {
  BRANCHES,
  act,
  checkLesson,
  lessonProgress,
  lessonSummary,
  sameAction,
  startLesson,
  type Action,
  type Branch,
  type Lesson,
  type LessonRun,
  type Reply,
  type Step,
  type StepSummary,
} from "./lesson";
