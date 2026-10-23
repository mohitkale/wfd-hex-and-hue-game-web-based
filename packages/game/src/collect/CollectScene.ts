import * as collect from "@hexhue/core/collect";
import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import type { Insets } from "../layout";
import { theme } from "../theme";
import { Button } from "../view/Button";
import { whenSaveReady } from "../save";
import { ensureTextures, TEX } from "../view/textures";
import { fadeIn } from "../view/transition";
import { CubeLayer } from "./CubeLayer";
import { FamiliarLayer } from "./FamiliarLayer";
import { PanelsView } from "./PanelsView";
import { cellCenter, computeCollectLayout, type CollectLayout } from "./collectLayout";
import { tonesFor } from "./cubePaint";
import { ensureFamiliarAtlas } from "./familiarTextures";
import { levelFromSearch } from "./levels";
import { TickClock } from "./tickClock";
import { VisualModel } from "./visuals";

type CollectState = collect.CollectState;

const REASON_TEXT: Record<Exclude<collect.ActionCheck, "ok">, string> = {
  gameOver: "The game is over",
  unavailable: "Nothing there",
  fieldFull: "Too many groups are working",
  noReachableCube: "No reachable cube of this colour yet",
};

/**
 * The v2 board (`?engine=v2`): summon familiars from a column, watch them fetch, carry and deliver
 * cubes. The scene only draws and routes input; every rule lives in `@hexhue/core`'s collect engine,
 * and the renderer drives time (see TickClock), so 1× and 2× play out identically.
 */
export class CollectScene extends Phaser.Scene {
  private session!: collect.CollectSession;
  private model!: VisualModel;
  private layout!: CollectLayout;
  private cubes!: CubeLayer;
  private familiars!: FamiliarLayer;
  private panels!: PanelsView;
  private atlas = "";
  /** 24 ticks a second at 1× (one cell per tick): crossing a 20-cell board takes under a second. */
  private readonly clock = new TickClock(24);
  private speed: 1 | 2 = 1;
  private marks = new Map<number, number>();
  private toastText: Phaser.GameObjects.Text | null = null;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayTimer: Phaser.Time.TimerEvent | null = null;
  private portalGlow: Phaser.GameObjects.Image | null = null;
  private speedLabel: Phaser.GameObjects.Text | null = null;
  private unsubscribe: (() => void)[] = [];
  /** Colour-blind mode (M6.5): each colour also shows its symbol. `?cb=1` forces it for review. */
  private colorblind = false;

  constructor() {
    super("collect");
  }

  private get dpr(): number {
    return (this.registry.get("dpr") as number | undefined) ?? 1;
  }

  create(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("hexhue:ready"));
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    const search = typeof window !== "undefined" ? window.location.search : "";
    const level = levelFromSearch(search);
    const params = new URLSearchParams(search);
    if (params.get("speed") === "2") this.speed = 2;
    this.colorblind = params.get("cb") === "1";
    this.session = new collect.CollectSession(level);
    this.unsubscribe.push(
      this.session.subscribe((batch) => this.onBatch(batch)),
      this.session.onReplace(() => this.rebuild()),
    );
    this.scale.on("resize", this.rebuild, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.rebuild, this);
      for (const u of this.unsubscribe) u();
      this.unsubscribe = [];
    });
    this.build();
    // Saved settings arrive after the scene starts: pick up the colour-blind setting (and a changed
    // reduced-motion setting) when they do, rebuilding once if they differ from what was drawn.
    whenSaveReady(this, (save) => {
      const wanted = params.get("cb") === "1" || (save?.data.settings.colorblind ?? false);
      if (wanted !== this.colorblind) {
        this.colorblind = wanted;
        this.rebuild();
      }
    });
    const onMotion = () => this.rebuild();
    this.registry.events.on("changedata-reducedMotion", onMotion);
    this.events.once("shutdown", () =>
      this.registry.events.off("changedata-reducedMotion", onMotion),
    );
    fadeIn(this);
    // Dev handle for browser-driven checks of the review build.
    if (import.meta.env?.DEV) (window as unknown as { __collect?: CollectScene }).__collect = this;
  }

  /** Test/review hook: the live session (the same object the board reads). */
  get liveSession(): collect.CollectSession {
    return this.session;
  }

  // -------------------------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------------------------

  private insets(): Insets {
    return (
      (this.registry.get("insets") as Insets | undefined) ?? {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      }
    );
  }

  /** (Re)creates everything from the session's current state. */
  private rebuild(): void {
    this.tweens.killAll();
    this.overlayTimer?.remove();
    this.overlayTimer = null;
    this.overlay = [];
    this.children.removeAll(true);
    this.toastText = null;
    this.build();
  }

  private build(): void {
    const state = this.session.state;
    const level = this.session.level;
    const { width, height } = this.scale.gameSize;
    const dpr = this.dpr;
    this.layout = computeCollectLayout({
      width,
      height,
      dpr,
      insets: this.insets(),
      boardWidth: level.width,
      boardHeight: level.height,
      slots: level.slots,
      columns: level.columns.length,
      fieldCap: level.fieldCap,
      portalX: level.portalX ?? collect.defaultPortalX(level.width),
    });
    this.atlas = ensureFamiliarAtlas(this, level.palette);
    const reduced = isReducedMotion(this);
    const tones = level.palette.map(tonesFor);

    this.drawBoardBackground();
    this.model = new VisualModel(state.params.portal, (g) => this.session.state.groups[g]!.color);
    this.model.resync(state);
    this.cubes = new CubeLayer(this, this.layout, level.palette, state.grid.slice());
    this.familiars = new FamiliarLayer(
      this,
      this.layout,
      this.atlas,
      this.model,
      tones,
      reduced,
      this.colorblind ? level.palette : null,
    );
    this.familiars.onDelivered = (_color, group) => {
      this.pulsePortal();
      this.panels.badge(group)?.pulse();
    };
    this.panels = new PanelsView(
      this,
      this.layout,
      level.palette,
      this.atlas,
      dpr,
      this.colorblind,
    );
    this.rebuildMarks(state);
    this.panels.sync(state);
    this.buildHud();
    this.buildInput();
    this.clock.reset();
    if (state.status !== "playing") this.showEnd(0);
  }

  private drawBoardBackground(): void {
    const l = this.layout;
    const dpr = this.dpr;
    const g = this.add.graphics().setDepth(0);
    // The ring (where familiars walk) is a faint path around the picture's panel.
    g.fillStyle(theme.dusk, 0.55);
    g.fillRoundedRect(l.boardRect.x, l.boardRect.y, l.boardRect.w, l.boardRect.h, l.cell * 0.8);
    g.fillStyle(theme.panel, 1);
    g.fillRect(
      l.boardRect.x + l.cell,
      l.boardRect.y + l.cell,
      l.boardRect.w - 2 * l.cell,
      l.boardRect.h - 2 * l.cell,
    );
    g.lineStyle(Math.max(1, dpr), theme.mist, 0.18);
    g.strokeRoundedRect(l.boardRect.x, l.boardRect.y, l.boardRect.w, l.boardRect.h, l.cell * 0.8);
    // The portal: a glowing gate in the bottom ring.
    const p = cellCenter(l, this.session.state.params.portal);
    this.portalGlow = this.add
      .image(p.x, p.y, TEX.glow)
      .setTint(0xb48cff)
      .setDepth(0.5)
      .setDisplaySize(l.cell * 3.2, l.cell * 3.2)
      .setAlpha(0.8);
    const gate = this.add.graphics().setDepth(3);
    gate.fillStyle(0x140b2e, 1);
    gate.fillEllipse(p.x, p.y, l.cell * 1.6, l.cell * 1.15);
    gate.lineStyle(Math.max(1, Math.round(dpr * 1.5)), 0xf6d97a, 0.95);
    gate.strokeEllipse(p.x, p.y, l.cell * 1.6, l.cell * 1.15);
    if (!isReducedMotion(this)) {
      this.tweens.add({
        targets: this.portalGlow,
        alpha: 0.45,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private pulsePortal(): void {
    if (!this.portalGlow || isReducedMotion(this)) return;
    const base = this.layout.cell * 3.2;
    this.tweens.add({
      targets: this.portalGlow,
      displayWidth: base * 1.3,
      displayHeight: base * 1.3,
      duration: 90,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  private buildHud(): void {
    const l = this.layout;
    const dpr = this.dpr;
    const cy = l.hud.y + l.hud.h / 2;
    this.add
      .text(l.frame.x + 14 * dpr, cy, this.session.level.name, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(16 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(20);
    const size = Math.round(36 * dpr);
    const buttons: [string, () => void][] = [
      ["↶", () => this.session.undo()],
      ["⟲", () => this.session.restart()],
      [`${this.speed}×`, () => this.toggleSpeed()],
    ];
    buttons.forEach(([label, onPress], i) => {
      const x =
        l.frame.x + l.frame.w - 14 * dpr - size / 2 - (buttons.length - 1 - i) * (size + 8 * dpr);
      const bg = this.add.graphics().setDepth(20);
      bg.fillStyle(theme.dusk, 1);
      bg.fillCircle(x, cy, size / 2);
      bg.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.5);
      bg.strokeCircle(x, cy, size / 2);
      const text = this.add
        .text(x, cy, label, {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.round(17 * dpr)}px`,
          color: theme.text,
        })
        .setOrigin(0.5)
        .setDepth(21);
      if (i === 2) this.speedLabel = text;
      const zone = this.add
        .zone(x, cy, size + 8 * dpr, size + 8 * dpr)
        .setDepth(22)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", onPress);
    });
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.speedLabel?.setText(`${this.speed}×`);
  }

  private buildInput(): void {
    this.layout.columns.forEach((r, column) => {
      const zone = this.add
        .zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h)
        .setDepth(25)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.tap({ kind: "select", column }));
    });
    this.layout.slots.forEach((r, slot) => {
      const zone = this.add
        .zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h)
        .setDepth(25)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.tap({ kind: "resume", slot }));
    });
  }

  private tap(action: collect.Action): void {
    if (this.overlay.length > 0) return;
    const result = this.session.tap(action);
    if (!result.ok) {
      const reason = result.reason;
      if (reason !== "ok" && reason !== "unavailable") this.toast(REASON_TEXT[reason]);
      return;
    }
    this.panels.sync(this.session.state);
  }

  private toast(text: string): void {
    this.toastText?.destroy();
    const l = this.layout;
    const t = this.add
      .text(l.frame.x + l.frame.w / 2, l.field[0]!.y - 6 * this.dpr, text, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(13 * this.dpr)}px`,
        color: "#ffffff",
        backgroundColor: "#2a1650",
        padding: { x: 10 * this.dpr, y: 5 * this.dpr },
      })
      .setOrigin(0.5, 1)
      .setDepth(40);
    this.toastText = t;
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1200,
      duration: 300,
      onComplete: () => {
        if (this.toastText === t) this.toastText = null;
        t.destroy();
      },
    });
  }

  // -------------------------------------------------------------------------------------------
  // Events and time
  // -------------------------------------------------------------------------------------------

  private rebuildMarks(state: Readonly<CollectState>): void {
    this.marks.clear();
    for (const f of state.familiars) {
      if ((f.status === "toCube" || f.status === "pickup") && f.cube >= 0) {
        this.marks.set(f.cube, state.groups[f.group]!.color);
      }
    }
    this.cubes?.setMarks(this.marks);
  }

  private onBatch(batch: collect.TickBatch): void {
    // The scene may be rebuilding (undo/restart notify first): views are rebuilt from state then.
    if (!this.model || !this.cubes) return;
    let marksChanged = false;
    for (const e of batch.events) {
      this.model.apply(e, batch.tick);
      if (e.type === "cubeReserved") {
        const v = this.model.familiars.get(e.familiar);
        if (v) {
          this.marks.set(e.cube, v.colorIndex);
          marksChanged = true;
        }
      } else if (e.type === "cubePickedUp") {
        this.cubes.remove(e.cube);
        marksChanged = this.marks.delete(e.cube) || marksChanged;
      }
      this.familiars.handle(e);
    }
    if (marksChanged) this.cubes.setMarks(this.marks);
    this.panels.sync(this.session.state);
    const status = this.session.state.status;
    if (status !== "playing" && this.overlay.length === 0 && !this.overlayTimer) {
      this.overlayTimer = this.time.delayedCall(700, () => this.showEnd(0));
    }
  }

  override update(time: number, delta: number): void {
    if (!this.session) return;
    const due = this.clock.advance(delta, this.speed);
    for (let i = 0; i < due; i++) {
      if (this.session.tick() === null) {
        // Nothing is ticking (settled or over): drop the backlog but keep the position inside the
        // current tick, so familiars never snap back.
        this.clock.drain();
        break;
      }
    }
    if (due === 0 && this.session.state.status !== "playing") this.clock.drain();
    this.familiars.update(
      this.session.state.tick,
      this.clock.alpha,
      time,
      this.clock.tickMs / this.speed,
    );
    this.cubes.flush();
  }

  // -------------------------------------------------------------------------------------------
  // End of game
  // -------------------------------------------------------------------------------------------

  private showEnd(delay: number): void {
    const state = this.session.state;
    if (state.status === "playing" || this.overlay.length > 0) return;
    const l = this.layout;
    const dpr = this.dpr;
    const won = state.status === "won";
    const shade = this.add
      .rectangle(
        l.frame.x + l.frame.w / 2,
        l.frame.y + l.frame.h / 2,
        l.frame.w,
        l.frame.h,
        0x140b2e,
        0.72,
      )
      .setDepth(50)
      .setAlpha(0);
    const title = this.add
      .text(
        l.frame.x + l.frame.w / 2,
        l.frame.y + l.frame.h * 0.36,
        won ? "Every cube collected!" : state.lossReason === "slotsFull" ? "Out of slots" : "Stuck",
        {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.round(26 * dpr)}px`,
          color: won ? "#f6d97a" : theme.text,
        },
      )
      .setOrigin(0.5)
      .setDepth(51)
      .setAlpha(0);
    const sub = this.add
      .text(
        l.frame.x + l.frame.w / 2,
        l.frame.y + l.frame.h * 0.36 + 34 * dpr,
        won
          ? `Delivered ${state.deliveredTotal} cubes`
          : state.lossReason === "slotsFull"
            ? "A group ran out of cubes with every slot full"
            : "No group can reach the cubes that are left",
        {
          fontFamily: theme.font,
          fontSize: `${Math.round(15 * dpr)}px`,
          color: theme.textDim,
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(51)
      .setAlpha(0);
    const bw = Math.min(l.frame.w * 0.6, 220 * dpr);
    const retry = new Button(
      this,
      l.frame.x + l.frame.w / 2,
      l.frame.y + l.frame.h * 0.5,
      bw,
      "Retry",
      {
        dpr,
        primary: true,
        onPress: () => this.session.restart(),
      },
    ).setDepth(51);
    this.add.existing(retry);
    retry.setAlpha(0);
    const parts: Phaser.GameObjects.GameObject[] = [shade, title, sub, retry];
    if (!won && this.session.canUndo) {
      const undo = new Button(
        this,
        l.frame.x + l.frame.w / 2,
        l.frame.y + l.frame.h * 0.5 + 60 * dpr,
        bw,
        "Undo last move",
        { dpr, onPress: () => this.session.undo() },
      ).setDepth(51);
      this.add.existing(undo);
      undo.setAlpha(0);
      parts.push(undo);
    }
    this.overlay = parts;
    this.tweens.add({
      targets: parts,
      alpha: 1,
      delay,
      duration: isReducedMotion(this) ? 1 : 260,
    });
  }
}
