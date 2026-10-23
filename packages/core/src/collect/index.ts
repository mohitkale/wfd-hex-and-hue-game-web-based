export {
  COLLECT_LIMITS,
  defaultPortalX,
  parseCollectLevel,
  validateCollectLevel,
  type CellShades,
  type CollectLevel,
  type LevelSubject,
  type GroupSpec,
} from "./level";
export {
  cloneState,
  createCollectState,
  fromJSON,
  hashState,
  stateKey,
  type CollectParams,
  type CollectState,
  type Familiar,
  type FamiliarStatus,
  type GameStatus,
  type GroupState,
  type GroupStatus,
} from "./state";
export {
  apply,
  explain,
  IllegalActionError,
  legalActions,
  type Action,
  type ActionCheck,
} from "./actions";
export { isSettled, runUntilSettled, step } from "./sim";
export { nearestTarget, hasAssignable, type Target } from "./targeting";
export { computeDist, paddedIndex, topologyFor } from "./grid";
export type { CollectEvent, LossReason, TickBatch } from "./events";
export { groupViews, remaining, uncommitted, type GroupView } from "./groups";
export { firstFreeSlot, freeSlots, slotViews, type SlotView } from "./slots";
export { CollectSession, ReplayError, replay, type LogEntry, type ReplayResult } from "./session";
export {
  CollectSolver,
  DEFAULT_NODE_BUDGET,
  minSlots,
  replayLine,
  solve,
  type SolveResult,
  type Verdict,
} from "./solver";
export {
  PROFILES,
  generateLevel,
  peel,
  randomLossRate,
  reachableByColor,
  score as generatorScore,
  type GenMetrics,
  type GenerateOptions,
  type Generated,
  type GeneratorArt,
  type Profile,
} from "./generator";
export {
  DETERMINISTIC_PLAYERS,
  RANDOM_RUNS,
  runPlayer,
  strategyReport,
  type PlayerId,
  type RunResult,
  type StrategyReport,
} from "./players";
export {
  SCORE_SPEC,
  TICKS_PER_SECOND,
  UNSCORED,
  difficultyScore,
  measureLevel,
  type DifficultyScore,
  type MeasureOptions,
  type Measures,
  type ScoreComponent,
} from "./measures";
