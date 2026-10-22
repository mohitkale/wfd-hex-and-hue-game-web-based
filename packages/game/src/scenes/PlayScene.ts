import Phaser from "phaser";
import {
  GameSession,
  createRng,
  wandColors,
  trackFor,
  wispAt,
  type BuiltLevel,
  type LaunchSource,
  type SessionEvent,
  type TrackCell,
  type TrackWisp,
} from "@hexhue/core";
import { computeLayout, type Insets, type Layout } from "../layout";
import { getAudio } from "../audio";
import { PRICES, pay, paymentFor, winCoins } from "../economy";
import { Haptics } from "../haptics";
import { IDLE_HINT_MS } from "../hint";
import { getHinter } from "../hinter";
import { ComboTracker, confettiColors, isComboMilestone } from "../juice";
import { flatLevels } from "../progress";
import {
  AD_COINS,
  getRewards,
  safeShow,
  speedButton,
  speedOffer,
  unlockSpeed,
  type AdResult,
  type Placement,
} from "../rewards";
import { getSave, starsFor, type BoosterKind } from "../save";
import { keyToSource } from "../keys";
import { levelAt, worlds } from "../levels";
import {
  LAUNCH_FLIGHT_MS,
  TICK_MS,
  accumulate,
  approach,
  flightPoint,
  trackPosition,
  type Point,
  type Speed,
} from "../motion";
import { hexToNumber, theme } from "../theme";
import { revealOrder, revealedCount } from "../reveal";
import { drawBoardChrome } from "../view/BoardChrome";
import { BoosterBar } from "../view/BoosterBar";
import { Button } from "../view/Button";
import { MosaicView } from "../view/MosaicView";
import { WispView } from "../view/WispView";
import { TEX, ensureTextures } from "../view/textures";
import { fadeIn, go } from "../view/transition";

export interface PlayData {
  world: number;
  level: number;
}

/** Draw order; explicit so rebuilt layers never cover persistent wisps. */
// The HUD stays above result cards so Back always works.
const DEPTH = {
  chrome: 0,
  mosaic: 1,
  hint: 1.5,
  wisps: 2,
  fx: 3,
  overlay: 4,
  confetti: 4.5,
  hud: 5,
} as const;

/** Losses in a row on one level before the lose card offers a free skip. */
const SKIP_AFTER = 3;

/** Win reveal: how long the finished artwork takes to bloom back in. */
const REVEAL_MS = 1100;

/** How many wisps of each summon column are drawn (the rest show as "+n"). */
const VISIBLE_STACK = 3;

/** Where a wisp view should be: following the track, or resting at a spot. */
type Target =
  | { kind: "track"; wisp: TrackWisp }
  | { kind: "rest"; x: number; y: number; r: number; alpha: number };

/** A wisp hopping from a column or slot onto the track. */
interface Flight {
  from: Point;
  fromR: number;
  elapsed: number;
}

export class PlayScene extends Phaser.Scene {
  private data_!: PlayData;
  private built!: BuiltLevel;
  private session!: GameSession;
  private track!: readonly TrackCell[];
  private layout!: Layout;
  private mosaic: MosaicView | null = null;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private hud: Phaser.GameObjects.GameObject[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private moreLabels: Phaser.GameObjects.Text[] = [];
  private wisps = new Map<number, WispView>();
  private targets = new Map<number, Target>();
  private flights = new Map<number, Flight>();
  /** Wisps tapped but waiting for the entry; refreshed with targets, read every frame. */
  private queued = new Set<number>();
  /** Spent wisps still animating into the portal. */
  private departing = new Set<WispView>();
  private speedLabel: Phaser.GameObjects.Text | null = null;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayKind: "win" | "lose" | null = null;
  /** Win reveal progress; `null` when not revealing. */
  private reveal: { order: number[]; shown: number; elapsed: number } | null = null;
  /** Won, waiting for the last wisp to reach the portal before the reveal starts. */
  private revealPending = false;
  private lastLayoutKey = "";
  private readonly haptics = new Haptics();
  private acc = 0;
  private speed: Speed = 1;
  /** Undos and boosters used this attempt; lowers the star rating, never blocks progress. */
  private assists = 0;
  private boosterBar: BoosterBar | null = null;
  private wandPicker: Phaser.GameObjects.GameObject[] = [];
  private toastText: Phaser.GameObjects.Text | null = null;
  /** Coins earned by the last win, shown on the win card. */
  private earned = 0;
  /** The last win was this level's first: its art just joined the Spellbook. */
  private firstClear = false;
  /** 2× has been unlocked for this level (GAME_DESIGN §3: it lasts the rest of the level). */
  private speedUnlocked = false;
  /** An ad turn came up empty this level: 1× until the next level (whose 2× is then free). */
  private speedDeclined = false;
  /** This win's coins were already doubled by an ad (survives card rebuilds on resize). */
  private doubled = false;
  private adOffer: Phaser.GameObjects.Text | null = null;
  /** Bumped every run; async ad results from an earlier run are ignored. */
  private runId = 0;
  /** Fragment bursts and portal rings; rebuilt with the layout (sizes follow the cell). */
  private burst: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly combo = new ComboTracker();
  /** How long the board has sat idle and waiting for the player. */
  private idleMs = 0;
  /** A hint search was started for the current idle board. */
  private hintAsked = false;
  /** The hint's answer, shown once the board has been idle for `IDLE_HINT_MS`. */
  private hintMove: LaunchSource | null = null;
  private hintView: Phaser.GameObjects.Image | null = null;

  constructor() {
    super("play");
  }

  init(data: PlayData): void {
    this.data_ = data;
    this.built = levelAt(data.world, data.level)!;
  }

  create(): void {
    // Phaser reuses this instance across restarts and destroys all game objects on shutdown, so
    // per-run state must start fresh here.
    this.wisps = new Map();
    this.targets = new Map();
    this.mosaic = null;
    this.chrome = [];
    this.hud = [];
    this.zones = [];
    this.moreLabels = [];
    this.flights = new Map();
    this.queued = new Set();
    this.departing = new Set();
    this.overlay = [];
    this.overlayKind = null;
    this.reveal = null;
    this.revealPending = false;
    this.speedLabel = null;
    this.lastLayoutKey = "";
    this.acc = 0;
    this.speed = 1;
    this.assists = 0;
    this.boosterBar = null;
    this.wandPicker = [];
    this.toastText = null;
    this.earned = 0;
    this.firstClear = false;
    this.speedUnlocked = false;
    this.speedDeclined = false;
    this.doubled = false;
    this.adOffer = null;
    this.burst = null;
    this.confetti = null;
    this.combo.reset();
    this.idleMs = 0;
    this.hintAsked = false;
    this.hintMove = null;
    this.hintView = null;
    this.runId++;
    const save = getSave(this);
    const unsubscribeSave = save?.subscribe((d) => this.boosterBar?.update(d));
    this.haptics.enabled = save?.data.settings.haptics ?? true;
    save?.update((d) => {
      d.stats.plays++;
      d.lastPlayed = { world: this.data_.world, level: this.data_.level };
    });

    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    const level = this.built.level;
    this.track = trackFor(level.width, level.height);
    this.session = new GameSession(level);
    const unsubscribe = this.session.subscribe((e) => this.onEvent(e));
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const source = keyToSource(e.code, level.columns.length, this.session.state.slots.length);
      if (source) this.tap(source);
    };
    this.input.keyboard?.on("keydown", onKey);
    this.scale.on("resize", this.relayout, this);
    this.events.once("shutdown", () => {
      unsubscribe();
      unsubscribeSave?.();
      this.input.keyboard?.off("keydown", onKey);
      this.scale.off("resize", this.relayout, this);
      this.mosaic?.destroy();
      this.mosaic = null;
      getHinter().cancel();
    });
    this.relayout();
    fadeIn(this);
  }

  override update(_time: number, delta: number): void {
    const s = this.session.state;
    if (s.status === "playing" && (s.track.length > 0 || this.session.pending.length > 0)) {
      const { steps, acc } = accumulate(this.acc, delta, this.speed);
      this.acc = acc;
      for (let i = 0; i < steps; i++) {
        // Refresh per tick that changed something, so a wisp launched in one tick has a view
        // before it collects in the next.
        if (this.session.tick().length > 0) this.refreshTargets();
      }
    } else if (s.status === "playing") {
      // Idle (nothing moving): the player can wait forever without the loop doing any work.
      this.acc = 0;
    }
    if (this.reveal) this.stepReveal(delta);
    this.mosaic?.flush();
    this.moveWisps(delta);
    this.updateHint(delta);
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  private relayout(): void {
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as Insets | undefined) ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const level = this.built.level;
    this.layout = computeLayout({
      width,
      height,
      dpr,
      insets,
      boardWidth: level.width,
      boardHeight: level.height,
      slots: this.session.state.slots.length,
      columns: level.columns.length,
    });
    // Resize events arrive in bursts; the layout is pure, so skip identical ones.
    const key = JSON.stringify(this.layout);
    if (key === this.lastLayoutKey) return;
    this.lastLayoutKey = key;

    for (const o of [...this.chrome, ...this.hud, ...this.zones, ...this.moreLabels]) o.destroy();
    this.boosterBar?.destroy();
    this.closeWandPicker();
    this.adOffer?.destroy();
    this.adOffer = null;
    this.mosaic?.destroy();
    this.chrome = drawBoardChrome(
      this,
      this.layout,
      level.width,
      level.height,
      this.session.state.slots.length,
    );
    for (const o of this.chrome) {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.chrome);
    }
    this.mosaic = new MosaicView(this, this.layout, level, this.session.state.cells);
    this.mosaic.image.setDepth(DEPTH.mosaic);
    this.createEmitters();
    // Redrawn at the new spot by the next idle frame.
    this.hideHint();
    if (this.reveal) this.paintArtwork(this.reveal.shown);
    else if (this.session.state.status === "won" && !this.revealPending) {
      this.paintArtwork(level.cells.length);
    }
    this.drawHud();
    this.createTapZones();
    // Below the result-card blocker, so boosters can't be used behind a card.
    this.boosterBar = new BoosterBar(this, this.layout.boosters, dpr, DEPTH.wisps, (k) =>
      this.useBooster(k),
    );
    const saved = getSave(this)?.data;
    if (saved) this.boosterBar.update(saved);
    this.moreLabels = this.layout.columns.map((zone) =>
      this.add
        .text(zone.x + zone.w / 2, zone.y + zone.h - 10 * dpr, "", {
          fontFamily: theme.font,
          fontSize: `${Math.round(12 * dpr)}px`,
          color: theme.textDim,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.wisps)
        .setVisible(false),
    );
    this.refreshTargets(true);
    // Views keep their identity across relayouts; snap them to their new spots.
    for (const [id, view] of this.wisps) this.snap(id, view);
    if (this.overlayKind) this.showCard(this.overlayKind, false);
  }

  private drawHud(): void {
    const { hud, dpr } = this.layout;
    const world = worlds[this.data_.world]!;
    const touch = 48 * dpr;
    const font = (size: number) => `${Math.round(size * dpr)}px`;

    const backZone = this.add
      .zone(hud.x + 4 * dpr, hud.y + (hud.h - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => go(this, "levels"));
    const back = this.add
      .text(backZone.x + touch / 2, hud.y + hud.h / 2, "‹", {
        fontFamily: theme.font,
        fontSize: font(34),
        color: theme.text,
      })
      .setOrigin(0.5, 0.55);
    const title = this.add
      .text(hud.x + hud.w / 2, hud.y + hud.h / 2 - 8 * dpr, this.built.level.name, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: font(18),
        color: theme.text,
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(
        hud.x + hud.w / 2,
        hud.y + hud.h / 2 + 12 * dpr,
        `${world.name} · ${this.data_.level + 1}`,
        {
          fontFamily: theme.font,
          fontSize: font(12),
          color: theme.textDim,
        },
      )
      .setOrigin(0.5);

    const speedZone = this.add
      .zone(hud.x + hud.w - touch - 4 * dpr, hud.y + (hud.h - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.toggleSpeed());
    this.speedLabel = this.add
      .text(speedZone.x + touch / 2, hud.y + hud.h / 2, "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: font(16),
        color: theme.text,
        backgroundColor: "#2a1650",
        padding: { x: Math.round(8 * dpr), y: Math.round(4 * dpr) },
      })
      .setOrigin(0.5);
    this.updateSpeedLabel();

    this.hud = [backZone, back, title, subtitle, speedZone, this.speedLabel];
    for (const o of [backZone, back, title, subtitle, speedZone, this.speedLabel]) {
      o.setDepth(DEPTH.hud);
    }
  }

  /**
   * Whole summon columns and slots are tap targets (thumb-sized by layout). Feedback happens on
   * pointerdown, in the same frame as the touch.
   */
  private createTapZones(): void {
    const add = (r: { x: number; y: number; w: number; h: number }, source: LaunchSource) =>
      this.add
        .zone(r.x, r.y, r.w, r.h)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.tap(source));
    this.zones = [
      ...this.layout.columns.map((r, index) => add(r, { kind: "column", index })),
      ...this.layout.slots.map((r, index) => add(r, { kind: "slot", index })),
    ];
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private tap(source: LaunchSource): void {
    if (this.session.state.status !== "playing") return;
    this.clearHint();
    const id = this.session.tapTarget(source);
    if (id === null) {
      this.rejectTap(source);
      return;
    }
    this.session.tap(source);
    this.haptics.play("tap");
    getAudio(this).play("tap");
    const view = this.wisps.get(id);
    if (view) {
      // Squish: immediate acknowledgement, even if the launch has to wait for the entry.
      this.tweens.killTweensOf(view);
      view.setScale(0.82);
      this.tweens.add({ targets: view, scale: 1, duration: 180, ease: "Back.easeOut" });
    } else if (source.kind === "column") {
      // The wisp is still hidden in the "+n" part of the stack: pulse that count instead.
      const more = this.moreLabels[source.index];
      if (more) {
        this.tweens.killTweensOf(more);
        more.setScale(1.35);
        this.tweens.add({ targets: more, scale: 1, duration: 200, ease: "Back.easeOut" });
      }
    }
    this.refreshTargets();
  }

  /**
   * Nothing to launch there (empty column or slot, or everything in it already queued): shake the
   * wisp that's there, or flash the empty zone, and buzz.
   */
  private rejectTap(source: LaunchSource): void {
    this.haptics.play("invalid");
    getAudio(this).play("invalid");
    const s = this.session.state;
    const w = source.kind === "column" ? s.columns[source.index]?.[0] : s.slots[source.index];
    const view = w ? this.wisps.get(w.id) : undefined;
    const amplitude = 6 * this.layout.dpr;
    if (view) {
      view.shake(amplitude);
      return;
    }
    const zone =
      source.kind === "column"
        ? this.layout.columns[source.index]
        : this.layout.slots[source.index];
    if (!zone) return;
    const g = this.flashZone(zone);
    const x0 = g.x;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 280,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        g.x = x0 + amplitude * Math.sin(t * Math.PI * 5) * (1 - t);
      },
    });
  }

  /** A brief outline over an empty zone, used as the thing that shakes. */
  private flashZone(r: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x: r.x, y: r.y }).setDepth(DEPTH.fx);
    g.lineStyle(Math.max(1, 2 * this.layout.dpr), 0xff8fa3, 0.9);
    g.strokeRoundedRect(0, 0, r.w, Math.min(r.h, r.w), r.w * 0.2);
    this.tweens.add({
      targets: g,
      alpha: 0,
      delay: 200,
      duration: 200,
      onComplete: () => g.destroy(),
    });
    return g;
  }

  /**
   * Once 2× is unlocked for this level, the button toggles freely. Before that, a tap unlocks it:
   * free on alternate turns, otherwise by an optional rewarded ad (see rewards/speed.ts).
   */
  private async toggleSpeed(): Promise<void> {
    const save = getSave(this);
    const turns = save?.data.speedTurns ?? 0;
    const button = speedButton(this.speedState());
    if (button.action === "toggle") {
      this.speed = this.speed === 1 ? 2 : 1;
      this.updateSpeedLabel();
      return;
    }
    if (button.action === "explain") {
      this.toast("No ad right now — 2× is free next level");
      return;
    }
    const run = this.runId;
    const ad = speedOffer(turns) === "ad" && getRewards(this).isAvailable("speed2x");
    if (ad) this.pauseForAd();
    const outcome = await unlockSpeed(turns, getRewards(this));
    if (ad) this.resumeAfterAd();
    if (run !== this.runId) return; // the level was left or restarted meanwhile
    save?.update((d) => (d.speedTurns = outcome.turns));
    if (outcome.granted) {
      this.speedUnlocked = true;
      this.speed = 2;
      this.haptics.play("tap");
    } else if (outcome.message) {
      // No ad this time: 1× for the rest of this level, as promised; the next level's 2× is free.
      this.speedDeclined = true;
      this.toast(outcome.message);
    }
    this.updateSpeedLabel();
  }

  private speedState() {
    return {
      unlocked: this.speedUnlocked,
      declined: this.speedDeclined,
      speed: this.speed,
      turns: getSave(this)?.data.speedTurns ?? 0,
      adAvailable: getRewards(this).isAvailable("speed2x"),
    };
  }

  private updateSpeedLabel(): void {
    const { label } = speedButton(this.speedState());
    this.speedLabel
      ?.setText(label)
      .setColor(this.speedUnlocked && this.speed === 2 ? "#f6d97a" : theme.text);
  }

  // ── Rewarded ads (always optional) ──────────────────────────────────────

  /** Freeze the board while an ad is on screen. */
  private pauseForAd(): void {
    this.scene.pause();
  }

  private resumeAfterAd(): void {
    if (this.sys.isPaused()) this.scene.resume();
  }

  private async watchAd(placement: Placement): Promise<AdResult> {
    const rewards = getRewards(this);
    if (!rewards.isAvailable(placement)) return "unavailable";
    this.pauseForAd();
    try {
      return await safeShow(rewards, placement);
    } finally {
      this.resumeAfterAd();
    }
  }

  /** When coins are short: a small, dismissible "watch an ad for coins" offer (if ads exist). */
  private offerCoinsAd(): void {
    if (!getRewards(this).isAvailable("coins")) return;
    const { boosters, dpr, frame } = this.layout;
    this.adOffer?.destroy();
    let pressed = false;
    const offer = this.add
      .text(frame.x + frame.w / 2, boosters.y - 44 * dpr, `▶ Watch an ad for +${AD_COINS} ◉`, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(14 * dpr)}px`,
        color: "#1a0f33",
        backgroundColor: "#f6d97a",
        padding: { x: Math.round(14 * dpr), y: Math.round(12 * dpr) },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => (pressed = true))
      .on("pointerout", () => (pressed = false))
      .on("pointerup", async () => {
        if (!pressed) return;
        offer.destroy();
        this.adOffer = null;
        const run = this.runId;
        const result = await this.watchAd("coins");
        if (run !== this.runId) return;
        if (result === "rewarded") {
          getSave(this)?.update((d) => (d.coins += AD_COINS));
          this.boosterBar?.pulseCoins();
          this.toast(`+${AD_COINS} ◉ — thank you for supporting Hex & Hue`);
        }
      });
    this.adOffer = offer;
    this.tweens.add({
      targets: offer,
      alpha: 0,
      delay: 5000,
      duration: 400,
      onComplete: () => offer.destroy(),
    });
  }

  // ── Engine events ───────────────────────────────────────────────────────

  private onEvent(e: SessionEvent): void {
    switch (e.type) {
      case "wand": {
        this.clearHint();
        this.haptics.play("portal");
        getAudio(this).play("booster");
        e.cells.forEach((cell, i) => {
          this.mosaic?.clearCell(cell);
          if (i % 3 === 0 && this.mosaic) this.sparkle(this.mosaic.cellCenter(cell));
        });
        for (const id of e.spent) this.departToPortal(id);
        this.refreshTargets();
        break;
      }
      case "slotAdded":
        this.clearHint();
        getAudio(this).play("booster");
        // Slot count changed: the layout (slot row) must be rebuilt.
        this.lastLayoutKey = "";
        this.relayout();
        if (e.revivedWispId !== null) this.closeCard();
        break;
      case "shuffled":
        this.clearHint();
        getAudio(this).play("booster");
        this.refreshTargets();
        break;
      case "launched":
        getAudio(this).play("launch");
        break;
      case "collected": {
        this.haptics.play("collect");
        getAudio(this).play("collect", { chargeLeft: e.chargeLeft });
        this.mosaic?.clearCell(e.cell);
        const view = this.wisps.get(e.wispId);
        if (view) {
          view.setCharge(e.chargeLeft);
          this.spark(e.cell, view);
        }
        if (this.mosaic) {
          const at = this.mosaic.cellCenter(e.cell);
          this.burst?.setParticleTint(hexToNumber(this.built.level.palette[e.color]!));
          this.burst?.explode(5, at.x, at.y);
          const chain = this.combo.hit(this.session.state.step);
          if (isComboMilestone(chain)) this.showCombo(chain, view ?? at);
        }
        break;
      }
      case "portal": {
        this.haptics.play("portal");
        getAudio(this).play("portal");
        const { x, y } = this.layout.portal;
        this.burst?.setParticleTint(theme.glow);
        this.burst?.explode(10, x, y);
        this.departToPortal(e.wispId);
        break;
      }
      case "parked":
        this.haptics.play("park");
        getAudio(this).play("park");
        break;
      case "won":
        this.haptics.play("win");
        getAudio(this).play("win");
        this.recordWin();
        // Let the last wisp reach the portal, then bloom the artwork back in.
        this.revealPending = true;
        this.time.delayedCall(450, () => {
          this.revealPending = false;
          const cells = this.built.level.cells;
          this.reveal = {
            order: revealOrder(this.built.level.width, this.built.level.height, cells),
            shown: 0,
            elapsed: 0,
          };
        });
        break;
      case "lost":
        this.haptics.play("lose");
        getAudio(this).play("lose");
        getSave(this)?.update((d) => d.stats.losses++);
        this.lossStreaks().set(
          this.built.level.id,
          (this.lossStreaks().get(this.built.level.id) ?? 0) + 1,
        );
        this.time.delayedCall(350, () => {
          if (this.session.state.status === "lost") this.showCard("lose");
        });
        break;
      case "undone":
      case "restarted":
        this.assists = e.type === "undone" ? this.assists + 1 : 0;
        this.combo.reset();
        this.clearHint();
        if (e.type === "restarted") getSave(this)?.update((d) => d.stats.plays++);
        if (e.type === "undone" && e.reverted !== "tap") {
          // Undoing a booster gives it back (as stock), so nothing paid is lost.
          const kind = e.reverted;
          getSave(this)?.update((d) => d.boosters[kind]++);
          this.toast("Booster returned");
        }
        this.closeCard();
        this.closeWandPicker();
        for (const view of this.departing) view.destroy();
        this.departing.clear();
        // The slot count may have changed (revive undone, or retry after a revive).
        this.relayout();
        this.rebuildMosaic();
        this.refreshTargets(true);
        // Undo can land back on a lost board: show its card so Retry is always reachable.
        if (this.session.state.status === "lost") this.showCard("lose", false);
        break;
      default:
        break;
    }
  }

  /** A fragment flies from its cell into the collecting wisp. */
  private spark(cell: number, view: WispView): void {
    if (!this.mosaic) return;
    const from = this.mosaic.cellCenter(cell);
    const size = this.layout.cell * 0.7;
    const fx = this.add
      .image(from.x, from.y, TEX.spark)
      .setTint(hexToNumber(view.colorHex))
      .setDisplaySize(size, size)
      .setDepth(DEPTH.fx);
    this.tweens.add({
      targets: fx,
      x: view.x,
      y: view.y,
      scale: fx.scale * 0.3,
      duration: 160,
      ease: "Quad.easeIn",
      onComplete: () => fx.destroy(),
    });
    this.tweens.killTweensOf(view);
    view.setScale(1.18);
    this.tweens.add({ targets: view, scale: 1, duration: 140, ease: "Quad.easeOut" });
  }

  private departToPortal(id: number): void {
    const view = this.wisps.get(id);
    this.wisps.delete(id);
    this.targets.delete(id);
    this.flights.delete(id);
    if (!view) return;
    this.tweens.killTweensOf(view);
    this.departing.add(view);
    const { x, y } = this.layout.portal;
    this.tweens.add({
      targets: view,
      x,
      y,
      scale: 0.25,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.departing.delete(view);
        view.destroy();
      },
    });
  }

  private rebuildMosaic(): void {
    this.mosaic?.destroy();
    this.mosaic = new MosaicView(this, this.layout, this.built.level, this.session.state.cells);
    this.mosaic.image.setDepth(DEPTH.mosaic);
  }

  // ── Wisp reconciliation ─────────────────────────────────────────────────

  /**
   * Recomputes where every wisp belongs from the session state, creating views for new wisps and
   * removing views for wisps that no longer exist (undo / restart). Track targets reference the
   * engine's live wisp objects, so this only needs to run when something structural changed (an
   * event was emitted), not on every tick. `snapNew` places new views exactly (level start,
   * undo); otherwise wisps surfacing in a column fade in from below.
   */
  private refreshTargets(snapNew = false): void {
    const s = this.session.state;
    const { dpr } = this.layout;
    const palette = this.built.level.palette;
    const next = new Map<number, Target>();

    s.columns.forEach((column, c) => {
      const zone = this.layout.columns[c]!;
      const front = Math.min(zone.w * 0.3, zone.h * 0.16, 30 * dpr);
      column.forEach((w, depth) => {
        if (depth >= VISIBLE_STACK) return;
        next.set(w.id, {
          kind: "rest",
          x: zone.x + zone.w / 2,
          y: zone.y + front * 1.3 + depth * front * 1.75,
          r: front * (1 - depth * 0.18),
          alpha: 1 - depth * 0.3,
        });
      });
      const more = this.moreLabels[c];
      if (more) {
        const hidden = column.length - VISIBLE_STACK;
        more.setVisible(hidden > 0);
        if (hidden > 0) more.setText(`+${hidden}`);
      }
    });

    s.slots.forEach((w, i) => {
      if (!w) return;
      const r = this.layout.slots[i]!;
      next.set(w.id, { kind: "rest", x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w * 0.32, alpha: 1 });
    });

    for (const w of s.track) {
      next.set(w.id, { kind: "track", wisp: w });
      // Leaving a column or slot: fly onto the track instead of teleporting.
      const view = this.wisps.get(w.id);
      if (view && this.targets.get(w.id)?.kind !== "track") {
        this.flights.set(w.id, {
          from: { x: view.x, y: view.y },
          fromR: view.currentRadius,
          elapsed: 0,
        });
      }
    }

    const all = [...s.columns.flat(), ...s.slots.filter((w) => w !== null), ...s.track];
    for (const w of all) {
      const target = next.get(w.id);
      if (!target || this.wisps.has(w.id)) continue;
      const view = new WispView(this, w.id, palette[w.color]!, w.charge, 1).setDepth(DEPTH.wisps);
      this.wisps.set(w.id, view);
      this.snap(w.id, view, target);
      if (!snapNew && target.kind === "rest") {
        view
          .setPosition(target.x, target.y + target.r * 1.6)
          .setRadius(target.r * 0.7)
          .setAlpha(0);
      }
    }
    this.queued = new Set(this.session.pending);
    for (const w of all) this.wisps.get(w.id)?.setCharge(w.charge).setQueued(this.queued.has(w.id));
    for (const [id, view] of this.wisps) {
      if (!next.has(id)) {
        view.destroy();
        this.wisps.delete(id);
        this.flights.delete(id);
      }
    }
    this.targets = next;
  }

  /** Places a view exactly at its target (new views and relayouts). */
  private snap(id: number, view: WispView, target = this.targets.get(id)): void {
    if (!target) return;
    this.flights.delete(id);
    if (target.kind === "track") {
      const p = trackPosition(this.layout, this.track, target.wisp, this.alpha());
      view.setPosition(p.x, p.y).setRadius(this.trackRadius()).setAlpha(1);
    } else {
      view.setPosition(target.x, target.y).setRadius(target.r).setAlpha(target.alpha);
    }
  }

  private moveWisps(delta: number): void {
    const alpha = this.alpha();
    const trackR = this.trackRadius();
    const pulse = this.queued.size > 0 ? 0.5 + 0.5 * Math.sin(this.time.now / 140) : 0;
    for (const [id, view] of this.wisps) {
      if (this.queued.has(id)) view.pulseRing(pulse);
      const target = this.targets.get(id);
      if (!target) continue;
      if (target.kind === "track") {
        const exact = trackPosition(this.layout, this.track, target.wisp, alpha);
        const flight = this.flights.get(id);
        if (flight) {
          // Fixed-length hop that lands exactly on the moving track point, at any speed.
          flight.elapsed += delta;
          const p = flightPoint(flight.from, exact, flight.elapsed);
          const t = Math.min(1, flight.elapsed / LAUNCH_FLIGHT_MS);
          view.setPosition(p.x, p.y).setRadius(flight.fromR + (trackR - flight.fromR) * t);
          if (t >= 1) this.flights.delete(id);
        } else {
          view.setPosition(exact.x, exact.y).setRadius(trackR);
        }
        view.setAlpha(1);
      } else {
        view.setPosition(approach(view.x, target.x, delta), approach(view.y, target.y, delta));
        view.setRadius(approach(view.currentRadius, target.r, delta));
        view.setAlpha(approach(view.alpha, target.alpha, delta));
      }
    }
  }

  private alpha(): number {
    return this.acc / TICK_MS;
  }

  private trackRadius(): number {
    return this.layout.cell * 0.42;
  }

  // ── Juice & hints ───────────────────────────────────────────────────────

  /** Particle emitters sized to the current cell; rebuilt with the layout. */
  private createEmitters(): void {
    this.burst?.destroy();
    this.confetti?.destroy();
    const { cell, dpr } = this.layout;
    // The spark texture is 16px; particles are scaled from that.
    const flake = 16;
    this.burst = this.add
      .particles(0, 0, TEX.spark, {
        emitting: false,
        lifespan: { min: 240, max: 480 },
        speed: { min: cell * 1.2, max: cell * 4 },
        angle: { min: 0, max: 360 },
        scale: { start: (cell * 0.32) / flake, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        maxParticles: 240,
      })
      .setDepth(DEPTH.fx);
    this.confetti = this.add
      .particles(0, 0, TEX.spark, {
        emitting: false,
        lifespan: { min: 1400, max: 2200 },
        speed: { min: 260 * dpr, max: 560 * dpr },
        angle: { min: 235, max: 305 },
        gravityY: 520 * dpr,
        rotate: { start: 0, end: 540 },
        scale: { min: (7 * dpr) / flake, max: (12 * dpr) / flake },
        alpha: { start: 1, end: 0, ease: "Quad.easeIn" },
        tint: confettiColors(this.built.level.palette),
        maxParticles: 160,
      })
      .setDepth(DEPTH.confetti);
  }

  /** Win: two fountains of palette-colored confetti from under the finished artwork. */
  private celebrate(): void {
    const { boardRect } = this.layout;
    const y = boardRect.y + boardRect.h;
    this.confetti?.explode(40, boardRect.x + boardRect.w * 0.25, y);
    this.confetti?.explode(40, boardRect.x + boardRect.w * 0.75, y);
  }

  /** A run of back-to-back collections: a gold "Combo ×n" pops up by the wisp. */
  private showCombo(length: number, at: Point): void {
    const { cell, dpr, frame } = this.layout;
    const margin = 60 * dpr;
    const x = Math.min(frame.x + frame.w - margin, Math.max(frame.x + margin, at.x));
    const y = Math.max(frame.y + 24 * dpr, at.y - cell * 1.4);
    const label = this.add
      .text(x, y, `Combo ×${length}`, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(16 * dpr)}px`,
        color: "#f6d97a",
        stroke: "#140b2e",
        strokeThickness: Math.round(4 * dpr),
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.fx)
      .setScale(0.6);
    this.tweens.add({ targets: label, scale: 1, duration: 200, ease: "Back.easeOut" });
    this.tweens.add({
      targets: label,
      y: y - cell * 1.5,
      alpha: 0,
      delay: 450,
      duration: 500,
      ease: "Quad.easeIn",
      onComplete: () => label.destroy(),
    });
    this.burst?.setParticleTint(theme.glow);
    this.burst?.explode(12, at.x, at.y);
  }

  /**
   * Idle hints: once nothing has moved for a moment, a worker searches for a launch that keeps the
   * board winnable; after `IDLE_HINT_MS` without a tap, that column or slot glows. Free, and never
   * counted as an assist.
   */
  private updateHint(delta: number): void {
    const s = this.session.state;
    const idle =
      s.status === "playing" &&
      s.track.length === 0 &&
      this.session.pending.length === 0 &&
      this.overlayKind === null &&
      this.wandPicker.length === 0;
    if (!idle) {
      if (this.hintAsked) this.clearHint();
      return;
    }
    if (!this.hintAsked) {
      this.hintAsked = true;
      const run = this.runId;
      getHinter().request(s, (move) => {
        if (run === this.runId && this.hintAsked) this.hintMove = move;
      });
    }
    this.idleMs += delta;
    if (this.idleMs >= IDLE_HINT_MS && this.hintMove && !this.hintView) this.showHint();
  }

  private showHint(): void {
    const w = this.hintMove ? wispAt(this.session.state, this.hintMove) : null;
    const view = w ? this.wisps.get(w.id) : undefined;
    if (!view) return;
    const size = view.currentRadius * 4.2;
    const glow = this.add
      .image(view.x, view.y, TEX.glow)
      .setTint(theme.glow)
      .setDisplaySize(size, size)
      .setDepth(DEPTH.hint)
      .setAlpha(0.25);
    this.tweens.add({
      targets: glow,
      alpha: 0.9,
      scale: glow.scale * 1.25,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.hintView = glow;
  }

  /** The board changed or the player acted: forget the hint and restart the idle timer. */
  private clearHint(): void {
    this.idleMs = 0;
    this.hintAsked = false;
    this.hintMove = null;
    getHinter().cancel();
    this.hideHint();
  }

  private hideHint(): void {
    if (!this.hintView) return;
    this.tweens.killTweensOf(this.hintView);
    this.hintView.destroy();
    this.hintView = null;
  }

  // ── End of level ────────────────────────────────────────────────────────

  /** Losses in a row per level this session; after `SKIP_AFTER` the lose card offers a free skip. */
  private lossStreaks(): Map<string, number> {
    let streaks = this.registry.get("lossStreaks") as Map<string, number> | undefined;
    if (!streaks) {
      streaks = new Map();
      this.registry.set("lossStreaks", streaks);
    }
    return streaks;
  }

  /** The level after this one in play order (crossing into the next world), if any. */
  private nextData(): PlayData | null {
    const all = flatLevels(worlds);
    const i = all.findIndex((r) => r.world === this.data_.world && r.level === this.data_.level);
    const next = all[i + 1];
    return next ? { world: next.world, level: next.level } : null;
  }

  /** Never stuck: marks the level skipped (it stays replayable) and moves on. */
  private skipLevel(): void {
    const id = this.built.level.id;
    getSave(this)?.update((d) => {
      if (!d.skipped.includes(id)) d.skipped.push(id);
    });
    this.lossStreaks().delete(id);
    const next = this.nextData();
    if (next) go(this, "play", next);
    else go(this, "levels");
  }

  private recordWin(): void {
    const id = this.built.level.id;
    this.lossStreaks().delete(id);
    const stars = starsFor(this.assists);
    getSave(this)?.update((d) => {
      const prev = Object.hasOwn(d.levels, id) ? d.levels[id] : undefined;
      this.firstClear = !prev;
      this.earned = winCoins({ difficulty: this.built.difficulty, stars, firstClear: !prev });
      d.coins += this.earned;
      d.levels[id] = { stars: Math.max(stars, prev?.stars ?? 0), wins: (prev?.wins ?? 0) + 1 };
      d.stats.wins++;
    });
  }

  // ── Boosters ────────────────────────────────────────────────────────────

  /**
   * Uses a booster, paying from stock first, then coins. Never blocks: if the player can't pay,
   * a toast explains how coins are earned (and Retry stays free).
   */
  private useBooster(kind: BoosterKind, color?: number): void {
    const save = getSave(this);
    const status = this.session.state.status;
    if (!save || status === "won") return;
    const payment = paymentFor(save.data, kind);
    if (kind === "wand" && color === undefined && payment.kind !== "short") {
      return this.openWandPicker();
    }
    if (payment.kind === "short") {
      this.haptics.play("invalid");
      getAudio(this).play("invalid");
      this.toast(`Need ${payment.missing} more ◉ — clear mosaics to earn coins`);
      this.offerCoinsAd();
      return;
    }
    // Count the assist first: a booster can win the level synchronously (Wand), and the win
    // records its stars immediately. Undo counts itself through the "undone" event.
    if (kind !== "undo") this.assists++;
    const used =
      kind === "undo"
        ? this.session.undo()
        : kind === "shuffle"
          ? this.session.shuffle(createRng(Date.now() >>> 0))
          : kind === "extraSlot"
            ? this.session.extraSlot()
            : this.session.wand(color!);
    if (!used) {
      if (kind !== "undo") this.assists--;
      this.haptics.play("invalid");
      this.toast(
        kind === "undo"
          ? "Nothing to undo yet"
          : kind === "shuffle"
            ? "No other order works right now"
            : "Nothing to collect there",
      );
      return;
    }
    save.update((d) => pay(d, kind, payment));
    this.haptics.play("tap");
    if (payment.kind === "coins") {
      this.boosterBar?.pulseCoins();
      getAudio(this).play("coin");
    }
  }

  /** Wand: pick one of the colors that currently has exposed fragments. */
  private openWandPicker(): void {
    if (this.wandPicker.length > 0) return this.closeWandPicker();
    const colors = wandColors(this.session.state);
    if (this.session.state.status !== "playing") return;
    if (colors.length === 0) {
      this.toast("Nothing exposed to collect right now");
      return;
    }
    const { boosters, dpr, frame } = this.layout;
    const r = 16 * dpr;
    const y = boosters.y - 26 * dpr;
    const gap = 12 * dpr;
    const total = colors.length * (2 * r) + (colors.length - 1) * gap;
    const startX = frame.x + (frame.w - total) / 2 + r;
    const blocker = this.add
      .rectangle(0, 0, this.scale.gameSize.width, this.scale.gameSize.height, 0x07040f, 0.35)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(DEPTH.overlay)
      .on("pointerup", () => this.closeWandPicker());
    const label = this.add
      .text(frame.x + frame.w / 2, y - r - 10 * dpr, "Pick a color to collect", {
        fontFamily: theme.font,
        fontSize: `${Math.round(14 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.overlay);
    const chips = colors.map((c, i) =>
      this.add
        .circle(startX + i * (2 * r + gap), y, r, hexToNumber(this.built.level.palette[c]!))
        .setStrokeStyle(Math.max(1, 2 * dpr), 0xffffff, 0.9)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH.overlay)
        .on("pointerup", () => {
          this.closeWandPicker();
          this.useBooster("wand", c);
        }),
    );
    this.wandPicker = [blocker, label, ...chips];
  }

  private closeWandPicker(): void {
    for (const o of this.wandPicker) o.destroy();
    this.wandPicker = [];
  }

  private toast(message: string): void {
    const { boosters, dpr, frame } = this.layout;
    this.toastText?.destroy();
    this.toastText = this.add
      .text(frame.x + frame.w / 2, boosters.y - 8 * dpr, message, {
        fontFamily: theme.font,
        fontSize: `${Math.round(13 * dpr)}px`,
        color: theme.text,
        backgroundColor: "#2a1650",
        padding: { x: Math.round(12 * dpr), y: Math.round(8 * dpr) },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1800, duration: 400 });
  }

  private canReviveByAd(): boolean {
    const save = getSave(this)?.data;
    return (
      !!save &&
      paymentFor(save, "extraSlot").kind === "short" &&
      getRewards(this).isAvailable("revive")
    );
  }

  private reviveLabel(): string {
    return this.canReviveByAd() ? "+1 Slot ▶ ad" : this.boosterLabel("extraSlot", "+1 Slot");
  }

  /** Revive from the lose card: from stock or coins, or (if both are short) an optional ad. */
  private async revive(): Promise<void> {
    if (!this.canReviveByAd()) return this.useBooster("extraSlot");
    const run = this.runId;
    const result = await this.watchAd("revive");
    if (run !== this.runId) return;
    if (result === "unavailable") {
      this.toast("No ad right now — Retry is free");
      return;
    }
    if (result !== "rewarded") return;
    this.assists++;
    // extraSlot only refuses on a won level, which can't be the case on the lose card.
    if (!this.session.extraSlot()) this.assists--;
  }

  /** "Revive +1 slot (2)" / "+1 Slot ◉40" for the lose card. */
  private boosterLabel(kind: BoosterKind, label: string): string {
    const save = getSave(this)?.data;
    if (!save) return label;
    const p = paymentFor(save, kind);
    return p.kind === "owned" ? `${label} (${save.boosters[kind]})` : `${label} ◉${PRICES[kind]}`;
  }

  private stepReveal(delta: number): void {
    const r = this.reveal!;
    r.elapsed += delta;
    const target = revealedCount(r.order.length, r.elapsed, REVEAL_MS);
    const cells = this.built.level.cells;
    for (; r.shown < target; r.shown++) {
      const cell = r.order[r.shown]!;
      this.mosaic?.paintCell(cell, cells[cell]!);
      // A few sparkles ride the bloom's edge.
      if (r.shown % 9 === 0 && this.mosaic) this.sparkle(this.mosaic.cellCenter(cell));
    }
    if (r.elapsed >= REVEAL_MS) {
      this.reveal = null;
      this.cameras.main.flash(260, 246, 217, 122);
      this.celebrate();
      this.showCard("win");
    }
  }

  /** Paints the first `count` cells of the original artwork in reveal order. */
  private paintArtwork(count: number): void {
    const { width, height, cells } = this.built.level;
    for (const cell of revealOrder(width, height, cells).slice(0, count)) {
      this.mosaic?.paintCell(cell, cells[cell]!);
    }
    this.mosaic?.flush();
  }

  private sparkle(at: { x: number; y: number }): void {
    const size = this.layout.cell * 0.9;
    const s = this.add
      .image(at.x, at.y, TEX.glow)
      .setTint(theme.glow)
      .setDisplaySize(size, size)
      .setDepth(DEPTH.fx);
    this.tweens.add({
      targets: s,
      y: at.y - this.layout.cell * 1.5,
      alpha: 0,
      scale: s.scale * 1.8,
      duration: 600,
      ease: "Quad.easeOut",
      onComplete: () => s.destroy(),
    });
  }

  /**
   * Result card over the lower half of the screen, so a revealed artwork stays visible above it.
   * Win: lore + Continue / Replay. Lose: Retry (always free) and, when possible, Undo.
   */
  private showCard(kind: "win" | "lose", animate = true): void {
    this.closeCard();
    this.closeWandPicker();
    this.overlayKind = kind;
    const { frame, dpr, boardRect } = this.layout;
    const px = (v: number) => Math.round(v * dpr);
    const font = (size: number) => `${px(size)}px`;
    const width = Math.min(frame.w - px(24), px(380));
    const cx = frame.x + frame.w / 2;

    // Swallows taps so nothing behind the card can be launched.
    const blocker = this.add
      .rectangle(
        0,
        0,
        this.scale.gameSize.width,
        this.scale.gameSize.height,
        0x07040f,
        kind === "win" ? 0.25 : 0.55,
      )
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(DEPTH.overlay);

    const card = this.add.container(cx, 0).setDepth(DEPTH.overlay);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let y = px(22);
    const text = (
      value: string,
      size: number,
      color: string,
      style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
    ) => {
      const t = this.add
        .text(0, y, value, {
          fontFamily: theme.font,
          fontSize: font(size),
          color,
          align: "center",
          wordWrap: { width: width - px(40) },
          ...style,
        })
        .setOrigin(0.5, 0);
      parts.push(t);
      y += t.height + px(8);
      return t;
    };

    if (kind === "win") {
      text("✦  Mosaic complete  ✦", 14, "#f6d97a", { fontStyle: "bold" });
      text(this.built.level.name, 24, theme.text, { fontStyle: "bold" });
      text(this.built.lore, 15, theme.textDim, { fontStyle: "italic" });
      if (this.firstClear) text("✦ Added to your Spellbook", 13, "#c9b8ff");
      if (animate && this.earned > 0) this.time.delayedCall(250, () => getAudio(this).play("coin"));
      if (this.earned > 0) {
        text(`+${this.earned} ◉`, 18, "#f6d97a", { fontStyle: "bold" });
        if (this.doubled) {
          text("Doubled ✦", 14, "#c9b8ff");
        } else if (getRewards(this).isAvailable("doubleCoins")) {
          // Optional: one ad doubles this win's coins.
          let pressed = false;
          const link = text(`▶ Watch an ad to double`, 14, theme.text, {
            padding: { x: px(14), y: px(10) },
          });
          link
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => (pressed = true))
            .on("pointerout", () => (pressed = false))
            .on("pointerup", async () => {
              if (!pressed || !link.input?.enabled || this.doubled) return;
              link.disableInteractive();
              const run = this.runId;
              const result = await this.watchAd("doubleCoins");
              if (run !== this.runId) return;
              if (result === "rewarded" && !this.doubled) {
                this.doubled = true;
                const bonus = this.earned;
                getSave(this)?.update((d) => (d.coins += bonus));
                this.earned += bonus;
              }
              // Re-render from scene state (the card may have been rebuilt during the ad).
              if (this.overlayKind === "win") this.showCard("win", false);
            });
        }
      }
    } else {
      text("The slots are full", 22, theme.text, { fontStyle: "bold" });
      text(
        "Every wisp needs somewhere to rest. Try launching them in a different order.",
        15,
        theme.textDim,
      );
    }

    y += px(8);
    const gap = px(12);
    const half = (width - px(40) - gap) / 2;
    const left = -half / 2 - gap / 2;
    const right = half / 2 + gap / 2;
    const by = y + px(24);
    if (kind === "win") {
      const next = this.nextData();
      parts.push(
        new Button(this, left, by, half, "Replay", {
          dpr,
          onPress: () => go(this, "play", this.data_),
        }),
        new Button(this, right, by, half, next ? "Continue" : "Levels", {
          dpr,
          primary: true,
          onPress: () => (next ? go(this, "play", next) : go(this, "levels")),
        }),
      );
    } else {
      // Retry is always free. Revive (+1 slot) and Undo are boosters, paid from stock or coins.
      parts.push(
        new Button(this, left, by, half, "Retry", {
          dpr,
          primary: true,
          onPress: () => this.session.restart(),
        }),
        new Button(this, right, by, half, this.reviveLabel(), {
          dpr,
          onPress: () => void this.revive(),
        }),
      );
    }
    let height = by + px(24) + px(22);
    if (kind === "lose" && this.session.canUndo) {
      let pressed = false;
      const undo = this.add
        .text(0, height - px(8), this.boosterLabel("undo", "Undo last move"), {
          fontFamily: theme.font,
          fontSize: font(14),
          color: theme.text,
          padding: { x: px(16), y: px(14) },
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => (pressed = true))
        .on("pointerout", () => (pressed = false))
        .on("pointerup", () => pressed && this.useBooster("undo"));
      parts.push(undo);
      height += undo.height - px(8);
    }
    const beaten = Object.hasOwn(getSave(this)?.data.levels ?? {}, this.built.level.id);
    if (
      kind === "lose" &&
      !beaten &&
      (this.lossStreaks().get(this.built.level.id) ?? 0) >= SKIP_AFTER
    ) {
      // Like Button: only a press that starts and ends on the link counts, so a finger lifting
      // off the board as the card appears can't skip by accident.
      let pressed = false;
      const skip = this.add
        .text(0, height + px(4), "Skip this level for now ›", {
          fontFamily: theme.font,
          fontSize: font(14),
          color: theme.textDim,
          padding: { x: px(16), y: px(16) },
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => (pressed = true))
        .on("pointerout", () => (pressed = false))
        .on("pointerup", () => pressed && this.skipLevel());
      parts.push(skip);
      height += skip.height + px(8);
    }

    const panel = this.add.graphics();
    panel.fillStyle(theme.panel, 0.96);
    panel.fillRoundedRect(-width / 2, 0, width, height, px(20));
    panel.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.35);
    panel.strokeRoundedRect(-width / 2, 0, width, height, px(20));
    card.add([panel, ...parts]);

    // Centered in the space below the board; on short screens anchored to the bottom so it covers
    // as little of the (revealed) artwork as possible.
    const below = frame.y + frame.h - (boardRect.y + boardRect.h);
    const top =
      below >= height + px(16)
        ? boardRect.y + boardRect.h + (below - height) / 2
        : frame.y + frame.h - height - px(12);
    card.y = top;
    if (animate) {
      card.y = top + px(40);
      card.setAlpha(0);
      this.tweens.add({ targets: card, y: top, alpha: 1, duration: 320, ease: "Back.easeOut" });
    }
    this.overlay = [blocker, card];
  }

  private closeCard(): void {
    for (const o of this.overlay) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.overlay = [];
    this.overlayKind = null;
  }
}
