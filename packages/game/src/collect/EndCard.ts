import type Phaser from "phaser";
import { Button } from "../view/Button";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { endCardText } from "./endCardText";

export interface EndCardOptions {
  won: boolean;
  lossReason: "slotsFull" | "deadlock" | null;
  delivered: number;
  /** Offer "Undo last move" after a loss. */
  canUndo: boolean;
  /** Fade-in delay and whether to skip the fade (reduced motion). */
  delay: number;
  reduced: boolean;
  onRetry: () => void;
  onUndo: () => void;
  /** A tutorial win: the way on ("Next", or "Play" after the last tutorial level). */
  next?: { label: string; onPress: () => void };
  /** A tutorial loss: Undo is the thing to press, so it becomes the primary button and says why. */
  emphasizeUndo?: boolean;
}

/**
 * The plain win/lose card of a level with no picture to reveal: a title, one line of why, Retry
 * (always free) and, after a loss, Undo. Returns the objects it added (the board treats a non-empty
 * overlay as "game over"); they fade in together.
 */
export function buildEndCard(
  scene: Phaser.Scene,
  l: CollectLayout,
  o: EndCardOptions,
): Phaser.GameObjects.GameObject[] {
  const dpr = l.dpr;
  const cx = l.frame.x + l.frame.w / 2;
  const text = endCardText(o);
  const title = text.title;
  const detail = o.emphasizeUndo && o.canUndo ? "Tap Undo to take it back" : text.detail;
  const shade = scene.add
    .rectangle(cx, l.frame.y + l.frame.h / 2, l.frame.w, l.frame.h, 0x140b2e, 0.72)
    .setDepth(50)
    .setAlpha(0);
  const heading = scene.add
    .text(cx, l.frame.y + l.frame.h * 0.36, title, {
      fontFamily: theme.font,
      fontStyle: "bold",
      fontSize: `${Math.round(26 * dpr)}px`,
      color: o.won ? "#f6d97a" : theme.text,
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setAlpha(0);
  const sub = scene.add
    .text(cx, l.frame.y + l.frame.h * 0.36 + 34 * dpr, detail, {
      fontFamily: theme.font,
      fontSize: `${Math.round(15 * dpr)}px`,
      color: theme.textDim,
      align: "center",
      wordWrap: { width: l.frame.w * 0.86 },
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setAlpha(0);
  const bw = Math.min(l.frame.w * 0.6, 220 * dpr);
  const lead = o.next ?? null;
  const undoLeads = !o.won && o.canUndo && o.emphasizeUndo === true;
  const retry = new Button(
    scene,
    cx,
    l.frame.y + l.frame.h * (lead || undoLeads ? 0.5 + 0.12 : 0.5),
    bw,
    "Retry",
    {
      dpr,
      primary: !lead && !undoLeads,
      onPress: o.onRetry,
    },
  ).setDepth(51);
  scene.add.existing(retry);
  retry.setAlpha(0);
  const parts: Phaser.GameObjects.GameObject[] = [shade, heading, sub, retry];
  if (lead) {
    const next = new Button(scene, cx, l.frame.y + l.frame.h * 0.5, bw, lead.label, {
      dpr,
      primary: true,
      onPress: lead.onPress,
    }).setDepth(51);
    scene.add.existing(next);
    next.setAlpha(0);
    parts.push(next);
  }
  if (!o.won && o.canUndo) {
    const undo = new Button(
      scene,
      cx,
      // Normally below Retry; when Undo is what the tutorial points at, it takes the main place.
      l.frame.y + l.frame.h * 0.5 + (undoLeads ? 0 : 60 * dpr),
      bw,
      "Undo last move",
      {
        dpr,
        primary: undoLeads,
        onPress: o.onUndo,
      },
    ).setDepth(51);
    scene.add.existing(undo);
    undo.setAlpha(0);
    parts.push(undo);
  }
  scene.tweens.add({ targets: parts, alpha: 1, delay: o.delay, duration: o.reduced ? 1 : 260 });
  return parts;
}
