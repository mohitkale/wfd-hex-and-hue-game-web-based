import { track as trackEvent } from "../analytics";
import type { EventName, EventProps, PlayKind, PlayPaid } from "../analytics/types";

/** Where events go: `(name, props)`; the scene passes the registered provider (consent is the provider's). */
export type Emit = <E extends EventName>(event: E, props: EventProps[E]) => void;

/** Emits through the game's analytics provider (a no-op one when none is registered). */
export const emitVia =
  (scene: { registry: { get(key: string): unknown } }): Emit =>
  (event, props) =>
    trackEvent(scene, event, props);

const whole = (ms: number): number => Math.round(ms / 1000);

/**
 * Gameplay-quality events for one level on the v2 board (M14.5, docs/V2_ANALYTICS.md). It holds only
 * counters and active time (the scene reports play time, so ads, menus and hidden tabs never count)
 * and emits level ids, counts, seconds and choices: nothing that identifies a player. It never
 * decides whether anything is sent: consent is enforced by the provider, so without it every event
 * is dropped there. Each method is cheap and cannot throw into play (`emit` is wrapped by `track`).
 */
export class GameplayTracker {
  private activeMs = 0;
  private moves = 0;
  private undos = 0;
  private boosters = 0;
  /** An attempt is open from `start` until it is won, lost, retried or abandoned. */
  private open = false;
  private attempts = 0;
  private offered = false;
  /** The attempt ended in a loss: an Undo or an Extra Slot can bring it back. */
  private lost = false;

  constructor(
    private readonly emit: Emit,
    readonly level: string,
    private readonly kind: PlayKind,
  ) {}

  private get seconds(): number {
    return whole(this.activeMs);
  }

  /** A new attempt: the level was opened, or Retry was pressed. */
  start(): void {
    this.activeMs = 0;
    this.moves = 0;
    this.undos = 0;
    this.boosters = 0;
    this.open = true;
    this.lost = false;
    this.emit("play_start", { level: this.level, kind: this.kind, replay: this.attempts > 0 });
    this.attempts++;
  }

  /** Time actually spent playing (call every frame with the frame time while the game runs). */
  active(ms: number): void {
    if (this.open && ms > 0) this.activeMs += ms;
  }

  /** A summon or resume was accepted. */
  move(): void {
    if (!this.open) return;
    if (this.moves++ === 0)
      this.emit("play_first_move", { level: this.level, seconds: this.seconds });
  }

  /** A booster that continues a lost attempt (Undo, Extra Slot) reopens it, so its win is counted. */
  private revive(): void {
    if (this.lost) {
      this.open = true;
      this.lost = false;
    }
  }

  undo(paid: PlayPaid): void {
    this.revive();
    this.undos++;
    this.emit("play_undo", { level: this.level, paid });
  }

  booster(booster: "extraSlot" | "hint" | "call" | "sweep" | "lantern", paid: PlayPaid): void {
    this.revive();
    this.boosters++;
    this.emit("play_booster", { level: this.level, booster, paid });
  }

  win(): void {
    if (!this.open) return;
    this.open = false;
    this.emit("play_win", {
      level: this.level,
      seconds: this.seconds,
      moves: this.moves,
      undos: this.undos,
      boosters: this.boosters,
    });
  }

  loss(reason: "slotsFull" | "deadlock"): void {
    if (!this.open) return;
    this.open = false;
    this.lost = true;
    this.emit("play_loss", { level: this.level, seconds: this.seconds, moves: this.moves, reason });
  }

  /** Retry: reports how the attempt stood, then begins the next one. */
  retry(after: "playing" | "won" | "lost"): void {
    this.emit("play_retry", { level: this.level, after, seconds: this.seconds });
    this.open = false;
    this.start();
  }

  /** Once per level: whether the optional 2× ad could be offered. */
  adOffer(placement: string, available: boolean): void {
    if (this.offered) return;
    this.offered = true;
    this.emit("play_ad_offer", { level: this.level, placement, available });
  }

  /** Leaving an unfinished attempt (another level, the page closing). Safe to call more than once. */
  abandon(): void {
    if (!this.open) return;
    this.open = false;
    this.emit("play_abandon", { level: this.level, seconds: this.seconds, moves: this.moves });
  }
}
