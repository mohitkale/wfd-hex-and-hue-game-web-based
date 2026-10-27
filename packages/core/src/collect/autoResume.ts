import { apply, explain, type Action } from "./actions";
import type { CollectEvent } from "./events";
import { isSettled, step } from "./sim";
import type { CollectState } from "./state";

/**
 * Auto-resume (v2.0.0, docs/V2_AUTORESUME.md): a pending box does not wait for the player to tap it.
 * As soon as a waiting group has a cube it can reach and a working place is free, it goes back to
 * work by itself, in slot order. It is the game's own `resume` action applied for the player at once,
 * so the rules are unchanged; what changes is that the player no longer chooses *when*.
 *
 * Applied between ticks (after a tick's events), never mid-tick. Returns the actions it applied, with
 * their events, so a session can log them.
 */
export function autoResume(s: CollectState): { action: Action; events: CollectEvent[] }[] {
  const out: { action: Action; events: CollectEvent[] }[] = [];
  if (s.status !== "playing") return out;
  for (let slot = 0; slot < s.slots.length; slot++) {
    if (s.slots[slot] === null) continue;
    const action: Action = { kind: "resume", slot };
    if (explain(s, action) === "ok") out.push({ action, events: apply(s, action) });
  }
  return out;
}

/**
 * Like `runUntilSettled`, but the game's own policy: after every tick (and once at the start) waiting
 * groups that can work again are resumed. Settled means no familiar, no working group and nothing
 * left to resume. Returns every event.
 */
export function runUntilSettledAuto(s: CollectState, maxTicks = 100_000): CollectEvent[] {
  const events: CollectEvent[] = [];
  const resume = () => {
    for (const r of autoResume(s)) events.push(...r.events);
  };
  resume();
  for (let i = 0; i < maxTicks && s.status === "playing" && !isSettled(s); i++) {
    events.push(...step(s));
    resume();
  }
  return events;
}
