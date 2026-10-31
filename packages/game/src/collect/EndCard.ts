import type Phaser from "phaser";
import { Button } from "../view/Button";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { endCardText } from "./endCardText";

export interface EndCardOptions {
  won: boolean;
  lossReason: "slotsFull" | "deadlock" | null;
  delivered: number;
  /** Fade-in delay and whether to skip the fade (reduced motion). */
  delay: number;
  reduced: boolean;
  onRetry: () => void;
  /** A slots-full loss: Extra Slot revives the game (label says what it costs). */
  revive?: { label: string; onPress: () => void };
  /** A win's way on: the next level, or in the tutorial "Next" / "Play" after its last level. */
  next?: { label: string; onPress: () => void };
  /** Whether to offer Retry (default yes; a win outside the tutorial goes home instead). */
  retry?: boolean;
  /** The power-up this win gave, by name, or null. */
  gift?: string | null;
  /** Coins this win paid (shown under the title), or null when it paid none. */
  coins?: number | null;
}

/**
 * The plain win/lose card of a level with no picture to reveal: a title, one line of why, Retry
 * (always free; there is no Undo, owner decision M15.13). Returns the objects it added (the board treats a non-empty
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
  const said = text.detail;
  const reward = [o.coins ? `+${o.coins} ✦ earned` : "", o.gift ? `+1 ${o.gift}` : ""]
    .filter(Boolean)
    .join("   ");
  const detail = o.won && reward ? `${said}\n${reward}` : said;
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
  const showRetry = o.retry !== false;
  const retry = new Button(
    scene,
    cx,
    l.frame.y + l.frame.h * (lead ? 0.5 + 0.12 : 0.5),
    bw,
    "Retry",
    {
      dpr,
      primary: !lead,
      onPress: o.onRetry,
    },
  ).setDepth(51);
  const parts: Phaser.GameObjects.GameObject[] = [shade, heading, sub];
  if (showRetry) {
    scene.add.existing(retry);
    retry.setAlpha(0);
    parts.push(retry);
  } else retry.destroy();
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
  if (!o.won && o.revive) {
    const revive = new Button(
      scene,
      cx,
      l.frame.y + l.frame.h * 0.5 + 60 * dpr,
      bw,
      o.revive.label,
      { dpr, primary: false, onPress: o.revive.onPress },
    ).setDepth(51);
    scene.add.existing(revive);
    revive.setAlpha(0);
    parts.push(revive);
  }
  scene.tweens.add({ targets: parts, alpha: 1, delay: o.delay, duration: o.reduced ? 1 : 260 });
  return parts;
}
