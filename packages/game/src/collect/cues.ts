import type { CollectEvent } from "@hexhue/core/collect";
import type { SoundName, SoundOptions } from "../audio";
import type { HapticKind } from "../haptics";

/** One sound (and optional vibration) to play for something that happened on the board. */
export interface Cue {
  sound: SoundName;
  options?: SoundOptions;
  haptic?: HapticKind;
}

/** What a cue player needs: the audio engine and haptics both ignore calls when switched off. */
export interface CueSinks {
  sound: (name: SoundName, options?: SoundOptions) => void;
  haptic: (kind: HapticKind) => void;
}

/**
 * The cues for one batch of events. A busy tick can hold many pickups and deliveries (one per
 * familiar), and 2× shows ticks twice as fast, so those two are thinned: one pickup sound per
 * batch, and one delivery note, the one from the group closest to finishing (the highest pitch,
 * so a group being emptied still plays a rising run). Everything that marks a decision or an end
 * (summon, park, completion, win, loss) always plays. A win replaces the completion chime of the
 * same batch. The delivery tick is a light vibration, so it is dropped when the batch already has
 * a stronger one (a new vibration replaces the one in progress). Decisions come first, then pickup,
 * delivery and the finish; sounds all start at the same audio time, so the order is for readers and
 * tests, not for hearing. Pure, so scheduling is testable without audio.
 */
export function planCues(events: readonly CollectEvent[]): Cue[] {
  const cues: Cue[] = [];
  let pickup = false;
  let delivery: Cue | null = null;
  let deliveryLeft = Infinity;
  let completion: Cue | null = null;
  let won = false;
  for (const e of events) {
    switch (e.type) {
      case "groupSelected":
        cues.push({ sound: "tap", haptic: "tap" });
        break;
      case "groupResumed":
        cues.push({ sound: "launch", haptic: "tap" });
        break;
      case "cubePickedUp":
        pickup = true;
        break;
      case "cubeDelivered":
        if (e.remaining < deliveryLeft) {
          deliveryLeft = e.remaining;
          delivery = { sound: "collect", options: { chargeLeft: e.remaining }, haptic: "collect" };
        }
        break;
      case "groupParked":
        cues.push({ sound: "park", haptic: "park" });
        break;
      case "groupCompleted":
        completion = { sound: "portal", haptic: "portal" };
        break;
      case "won":
        won = true;
        break;
      case "lost":
        cues.push({ sound: "lose", haptic: "lose" });
        break;
      default:
        break;
    }
  }
  if (pickup) cues.push({ sound: "pickup" });
  if (delivery) {
    const stronger = cues.some((c) => c.haptic) || won || completion !== null;
    const { haptic, ...quiet } = delivery;
    cues.push(stronger || !haptic ? quiet : delivery);
  }
  if (won) cues.push({ sound: "win", haptic: "win" });
  else if (completion) cues.push(completion);
  return cues;
}

/** The cue for a tap the engine refused, or null when the tap should stay silent. */
export function rejectionCue(reason: string): Cue | null {
  return reason === "fieldFull" || reason === "noReachableCube" || reason === "sealed"
    ? { sound: "invalid", haptic: "invalid" }
    : null;
}

/** Plays `cues` in order. Never throws: audio and vibration must not be able to stop play. */
export function playCues(cues: readonly Cue[], sinks: CueSinks): void {
  for (const c of cues) {
    try {
      sinks.sound(c.sound, c.options);
      if (c.haptic) sinks.haptic(c.haptic);
    } catch {
      // A broken audio device or vibration API is not a reason to interrupt the game.
    }
  }
}
