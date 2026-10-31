import * as collect from "@hexhue/core/collect";
import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { getAudio } from "../audio";
import { Haptics } from "../haptics";
import type { Insets } from "../layout";
import { theme } from "../theme";
import { whenSaveReady } from "../save";
import { ensureTextures, TEX } from "../view/textures";
import { fadeIn } from "../view/transition";
import { CubeLayer } from "./CubeLayer";
import { FamiliarLayer } from "./FamiliarLayer";
import { CollectSpellbookScene } from "./CollectSpellbookScene";
import { CompletionOverlay } from "./CompletionOverlay";
import { ParticleLayer } from "./ParticleLayer";
import { PanelsView, paintPanelFrames } from "./PanelsView";
import { planCues, playCues, rejectionCue, type CueSinks } from "./cues";
import { Emitter, Particles } from "./particles";
import { getRewards, safeShow, type AdResult } from "../rewards";
import { stepFrame } from "./frameStep";
import { CollectHud } from "./CollectHud";
import { BoosterTray } from "./BoosterTray";
import { buildSettingsPanel } from "./SettingsPanel";
import { GameplayTracker, emitVia } from "./gameplayTracker";
import { getAnalytics, safeFlush, track } from "../analytics";
import {
  canAfford,
  MAX_EXTRA_SLOTS,
  POWER_NAMES,
  useCall,
  useExtraSlot,
  useHint,
  useLantern,
  useSweep,
  type UseResult,
} from "./boosterUse";
import {
  award,
  type Booster,
  paymentFor,
  PRICES,
  readPouch,
  savePouch,
  startingPouch,
  type Pouch,
} from "./pouch";
import {
  applyAdResult,
  BOOST,
  type Speed,
  initialSpeedState,
  restoreSpeed,
  speedView,
  type SpeedState,
  type SpeedView,
} from "./speedRule";
import { buildEndCard } from "./EndCard";
import { Toast } from "./Toast";
import type { Tutorial } from "./tutorial";
import { TutorialLayer } from "./TutorialLayer";
import { createTutorial } from "./tutorialLevels";
import {
  emptyTutorialBook,
  markDone,
  markSkipped,
  nextAfter,
  readTutorialBook,
  saveTutorialBook,
  type TutorialBook,
} from "./tutorialBook";
import { progressOf } from "./progress";
import {
  HUD_BUTTON_CSS,
  activeColumnRects,
  frontBoxRect,
  computeCollectLayout,
  hudButtonX,
  type CollectLayout,
} from "./collectLayout";
import { RingStats } from "./profile";
import { shadeTonesGrid, tonesFor } from "./cubePaint";
import type { Species } from "./familiarArt";
import { familiarFor, readFamiliar } from "./familiarChoice";
import { ensureFamiliarAtlas } from "./familiarTextures";
import { demoLineFromSearch, dailyFromSearch, levelFromSearch, tutorialStart } from "./levels";
import { SHOWN_TICKS_PER_SECOND, TickClock, ticksPerSecondFor } from "./tickClock";
import { worldMoment, type WorldMoment } from "./worldMoment";
import {
  dailyMoment,
  isDone,
  practiceLine,
  readDailyBook,
  recordDaily,
  saveDailyBook,
  shareOrCopy,
} from "./dailyBook";
import { utcDate } from "./daily";
import { browserStore, readSpellbook, recordWin, saveSpellbook } from "./v2Spellbook";
import { eventNote } from "./notes";
import { sealMap } from "./sealView";
import { VisualModel } from "./visuals";
import { IdleLoop } from "./idleLoop";
import { LevelSelectScene } from "./LevelSelectScene";
import { challengeOf } from "./journey";
import { comboAfter, NO_COMBO, type Combo } from "./combo";
import { paintBoard, paintHole, paintHoleFront, paintTable, plankWidth, TABLE } from "./tableLook";

type CollectState = collect.CollectState;

const SEAL_HINT = "Wax-sealed cubes wake once their key colour is gathered";

/** Said as a Hard or Extreme level opens. */
const CHALLENGE_HINT = {
  hard: "Hard level: pick boxes whose colour you can reach, or the trays jam",
  extreme: "Extreme level: plan every pick. Lantern, Call and Extra Tray can save you",
} as const;

const REASON_TEXT: Record<Exclude<collect.ActionCheck, "ok">, string> = {
  gameOver: "The game is over",
  unavailable: "Nothing there",
  fieldFull: "Every tray is busy",
  noReachableCube: "No cube to reach yet, and no free tray",
  sealed: "Wax-sealed, and no free tray",
};

/**
 * The board: summon familiars from a column, watch them fetch, carry and deliver
 * cubes. The scene only draws and routes input; every rule lives in `@hexhue/core`'s collect engine,
 * and the renderer drives time (see TickClock), so 1× and 3× play out identically.
 */
export class CollectScene extends Phaser.Scene {
  private session!: collect.CollectSession;
  private model!: VisualModel;
  private layout!: CollectLayout;
  private cubes!: CubeLayer;
  private familiars!: FamiliarLayer;
  private panels!: PanelsView;
  private emitter!: Emitter;
  private particleLayer!: ParticleLayer;
  private readonly haptics = new Haptics();
  private readonly sinks: CueSinks = {
    sound: (name, options) => getAudio(this).play(name, options),
    haptic: (kind) => this.haptics.play(kind),
  };
  /**
   * `?demo=win|lose` (review builds): taps a recorded line one action at a time whenever the board
   * has settled, so a reviewer can watch a winning or a losing sequence. Any manual tap or
   * restart ends it.
   */
  private demo: { line: readonly collect.Action[]; next: number; readyAt: number } | null = null;
  /** The time of the latest frame, for effects started by events between frames. */
  private frameTime = 0;
  private atlas = "";
  /** One cell per tick; how many ticks a second follows the cell size (`ticksPerSecondFor`), set in `build`. */
  private clock = new TickClock(SHOWN_TICKS_PER_SECOND);
  private speed: Speed = 1;
  /** The speed-up rule (M14.3, 3× since M15.6): per level, through an optional rewarded ad; kept across scene restarts. */
  private speedState: SpeedState = initialSpeedState();
  /** Which wait for an ad is the current one, and how to end it early (the button, Retry). */
  private adToken = 0;
  private adCancel: (() => void) | null = null;
  /** How many HUD buttons there are: retry, plus speed when something is offered (no Undo). */
  private hudButtons = 1;
  private marks = new Map<number, number>();
  private toaster!: Toast;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayTimer: Phaser.Time.TimerEvent | null = null;
  /** The picture reveal shown after a win on a level with a known picture (M11.5). */
  private reveal: CompletionOverlay | null = null;
  /** What recording this win in the Spellbook did, so a relayout does not count it twice. */
  private winRecord: {
    isNew: boolean;
    saved: boolean;
    world: WorldMoment | null;
    daily: { line: string; shareText: string | null } | null;
  } | null = null;
  /** The UTC date of the daily challenge being played (M13.5), or null on any other level. */
  private dailyDate: string | null = null;
  private sharing = false;
  /** The reveal has finished or been skipped once for this win: a relayout must not replay it. */
  private revealSeen = false;
  /** The tap zone of each summon column; they follow the columns as these centre (see `placeColumns`). */
  private columnZones: Phaser.GameObjects.Zone[] = [];
  /** Which tray each box sits in, kept across a rebuild (resize, Extra Slot) so boxes do not jump. */
  private trayMemory: ReadonlyMap<number, number> = new Map();
  private hud!: CollectHud;
  private tray: BoosterTray | null = null;
  /** A power-up waiting for its target: a box behind a column's front (Call) or a box in a tray (Sweep). */
  private armed: "call" | "sweep" | null = null;
  /** Tap zones over the trays, live only while Sweep waits for its box. */
  private trayZones: Phaser.GameObjects.Zone[] = [];
  /** The Crystal Lantern was lit for this level (reopening it is free), and its panel if open. */
  private lanternLit: string | null = null;
  private lanternObjects: Phaser.GameObjects.GameObject[] = [];
  /** The settings panel is open over the board: play waits, and a rebuild keeps it open. */
  private settingsOpen = false;
  private settingsObjects: Phaser.GameObjects.GameObject[] = [];
  /** Anonymous gameplay events for this level (M14.5); the provider enforces consent. */
  private stats!: GameplayTracker;
  /** The v2 pouch (M14.4): coins and booster stock; it is only written back when it was read cleanly. */
  private pouch: Pouch = startingPouch();
  private pouchOk = false;
  /** This win's coins were paid (a relayout or end card must not pay twice). */
  private winPaid = false;
  /** How many coins this win paid, for the win card (null before a win, or when it paid none). */
  private winCoins: number | null = null;
  /** The power-up this win gave (every third first clear), shown on the win card. */
  private winGift: Booster | null = null;
  /** The tutorial being played (M14.2), its level id and layer, and whether its win was recorded. */
  private tutorial: Tutorial | null = null;
  private tutorialId: string | null = null;
  private tutorialLayer: TutorialLayer | null = null;
  private tutorialBook: TutorialBook = emptyTutorialBook();
  private tutorialSaved = false;
  private unsubscribe: (() => void)[] = [];
  /** Colour-blind mode (M6.5): each colour also shows its symbol. `?cb=1` forces it for review. */
  private colorblind = false;
  /** No box is left to choose: the board is shown at 3× until the level ends (see `update`). */
  private finishing = false;
  /** Boxes finished in a streak, and the play time (ms at the shown speed) that streaks are timed in. */
  private combo: Combo = NO_COMBO;
  private playMs = 0;
  /** Stops drawing while the board is still (`idleLoop.ts`). */
  private idle: IdleLoop | null = null;
  /** `?profile=1`: records the CPU time of every `update` so a build can be measured (see perf()). */
  private profile: { update: RingStats; render: RingStats; ticks: number } | null = null;

  constructor() {
    super("collect");
  }

  private get dpr(): number {
    return (this.registry.get("dpr") as number | undefined) ?? 1;
  }

  create(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("hexhue:ready"));
    // Phaser reuses this instance when the scene is started again (Spellbook, then "Back to the
    // board"): field initialisers do not re-run, so anything left from the last session is reset.
    this.overlayTimer?.remove();
    this.overlayTimer = null;
    this.settingsOpen = false;
    this.lanternLit = null;
    this.finishing = false;
    this.combo = NO_COMBO;
    this.playMs = 0;
    this.overlay = [];
    this.reveal = null;
    this.winRecord = null;
    this.winPaid = false;
    this.winCoins = null;
    this.winGift = null;
    this.revealSeen = false;
    this.demo = null;
    this.marks = new Map();
    const read = readPouch(browserStore());
    this.pouch = read.pouch;
    this.pouchOk = read.ok;
    this.frameTime = 0;
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(TABLE.wood);
    const search = typeof window !== "undefined" ? window.location.search : "";
    // `v2.level`: a level chosen in the game (Spellbook replay), kept so "Back to the board" returns to it.
    const chosen = this.registry.get("v2.level") as string | undefined;
    // `?level=daily`: today's challenge, remembered by its date so the win is recorded for that day.
    const daily = dailyFromSearch(search, Date.now(), chosen);
    this.dailyDate = daily?.date ?? null;
    this.sharing = false;
    // First visits start in the tutorial (M14.2); a daily never does.
    this.tutorialBook = readTutorialBook(browserStore()).book;
    const tutorialId = daily ? null : tutorialStart(search, chosen, this.tutorialBook);
    this.tutorialId = tutorialId;
    this.tutorial = tutorialId
      ? createTutorial(tutorialId, this.registry.get("v2.tutorialSkipped") === true)
      : null;
    this.tutorialSaved = false;
    const params = new URLSearchParams(search);
    // A visit without a level asked for starts at home, once (the tutorial and the daily never do):
    // straight there, before the board is built, so no board flashes up first.
    if (
      !chosen &&
      !tutorialId &&
      !daily &&
      !params.has("level") &&
      !params.has("demo") &&
      !params.has("view") &&
      !this.registry.get("v2.homeShown")
    ) {
      this.registry.set("v2.homeShown", true);
      this.goHome();
      return;
    }
    const level = levelFromSearch(search, daily ? daily.levelId : (tutorialId ?? chosen));
    // 3× is unlocked for this level only (a retry keeps it, another level starts at 1×). `?speed=3` is
    // a review override and exists in development builds only: it is not an ad reward.
    // Every attempt starts at 1×: 3× bought for one attempt never carries to another (M15.13).
    // `?speed=3` is a review override in development builds only; it is not an ad reward.
    const restored = restoreSpeed(
      undefined,
      1,
      level.id,
      params.get("speed") === "3" && import.meta.env?.DEV === true,
    );
    this.speedState = restored.state;
    this.speed = restored.speed;
    // Any ad wait left from before this level started no longer counts.
    this.adToken++;
    this.adCancel = null;
    this.saveSpeed();
    // `?view=spellbook` opens the v2 Spellbook first (once: "Back to the board" returns here).
    if (params.get("view") === "spellbook" && !this.registry.get("v2.spellbookShown")) {
      this.registry.set("v2.spellbookShown", true);
      this.time.delayedCall(0, () => this.openSpellbook());
    }
    this.colorblind = params.get("cb") === "1";
    // The game's own policy: a pending box goes back to work by itself (docs/V2_AUTORESUME.md).
    this.session = new collect.CollectSession(level, undefined, undefined, true);
    this.stats = new GameplayTracker(
      emitVia(this),
      level.id,
      this.tutorialId ? "tutorial" : this.dailyDate ? "daily" : level.subject ? "picture" : "other",
    );
    this.stats.start();
    // Closing the page mid-attempt is an abandon; flush with a beacon, which survives the unload.
    const onHide = () => {
      this.stats.abandon();
      safeFlush(getAnalytics(this), true);
    };
    // Backgrounding a phone often fires no `pagehide`: flush then too (without ending the attempt).
    const onVisibility = () => {
      if (document.hidden) safeFlush(getAnalytics(this), true);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    this.events.once("shutdown", () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      this.stats.abandon();
    });
    const line = demoLineFromSearch(search, level);
    if (line) this.demo = { line, next: 0, readyAt: 0 };
    // A Hard or Extreme level says so as it opens (it never waits on a tap).
    const challenge = challengeOf(level.id);
    if (challenge && !this.tutorialId)
      this.time.delayedCall(400, () => this.toaster.show(CHALLENGE_HINT[challenge], 4200));
    // The first sealed level of a visit explains the seals once; it never waits on a tap.
    if (level.seals && !this.registry.get("v2.sealIntro")) {
      this.registry.set("v2.sealIntro", true);
      this.time.delayedCall(500, () => this.toaster.show(SEAL_HINT, 4200));
    }
    this.unsubscribe.push(
      this.session.subscribe((batch) => this.onBatch(batch)),
      this.session.onReplace((reason) => {
        // Retry is always free: it also ends any wait for an ad, and starts a tutorial lesson over.
        this.adCancel?.();
        if (this.tutorialId) {
          this.tutorial = createTutorial(
            this.tutorialId,
            this.registry.get("v2.tutorialSkipped") === true,
          );
          this.tutorialSaved = false;
        }
        this.demo = null;
        // A retry is a fresh attempt: the Lantern and 3× bought for the last one do not carry over.
        if (reason === "restart") {
          this.lanternLit = null;
          this.speed = 1;
          this.speedState = initialSpeedState();
          this.saveSpeed();
        }
        this.winRecord = null;
        this.winPaid = false;
        this.winCoins = null;
        this.winGift = null;
        this.revealSeen = false;
        this.rebuild();
      }),
    );
    this.scale.on("resize", this.rebuild, this);
    // A restored WebGL context loses the contents of render textures (the baked board and cubes):
    // redraw everything from the session's state.
    const renderer = this.game.renderer;
    if (renderer.type === Phaser.WEBGL) {
      renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.rebuild, this);
      this.events.once("shutdown", () =>
        renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.rebuild, this),
      );
    }
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.rebuild, this);
      for (const u of this.unsubscribe) u();
      this.unsubscribe = [];
    });
    this.build();
    // Saved settings arrive after the scene starts: pick up the colour-blind setting (and a changed
    // reduced-motion setting) when they do, rebuilding once if they differ from what was drawn.
    whenSaveReady(this, (save) => {
      this.haptics.enabled = save?.data.settings.haptics ?? true;
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
    this.idle?.destroy();
    this.idle = new IdleLoop(this.game, () => this.busy());
    this.events.once("shutdown", () => {
      this.idle?.destroy();
      this.idle = null;
    });
    if (params.get("profile") === "1") {
      const profile = { update: new RingStats(), render: new RingStats(), ticks: 0 };
      this.profile = profile;
      // CPU time Phaser spends submitting a frame (independent of vsync and of the GPU).
      let renderStart = 0;
      const onPre = () => (renderStart = performance.now());
      const onPost = () => profile.render.push(performance.now() - renderStart);
      this.game.events.on(Phaser.Core.Events.PRE_RENDER, onPre);
      this.game.events.on(Phaser.Core.Events.POST_RENDER, onPost);
      this.events.once("shutdown", () => {
        this.game.events.off(Phaser.Core.Events.PRE_RENDER, onPre);
        this.game.events.off(Phaser.Core.Events.POST_RENDER, onPost);
      });
    }
    // Handle for browser-driven checks and measurements of the review build.
    if (import.meta.env?.DEV || this.profile) {
      (window as unknown as { __collect?: CollectScene }).__collect = this;
    }
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
    this.idle?.wake();
    this.tweens.killAll();
    this.overlayTimer?.remove();
    this.overlayTimer = null;
    this.overlay = [];
    this.reveal = null;
    this.children.removeAll(true);
    this.build();
  }

  private build(): void {
    // The HUD is drawn afresh: the next frame sets its speed label for the finishing 3× again.
    this.finishing = false;
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
      // Slots gained from the Extra Slot booster are part of the state.
      slots: state.params.slots,
      columns: level.columns.length,
      fieldCap: state.params.fieldCap,
      sharedTrays: state.params.sharedTrays === true,
      portalX: level.portalX ?? collect.defaultPortalX(level.width),
      // The tutorial teaches without a shop: its boosters are free and there is no tray.
      tray: this.tutorialId === null,
    });
    this.toaster = new Toast(this, this.layout);
    this.clock = new TickClock(ticksPerSecondFor(this.layout.cell / dpr));
    // Cats trot for the `familiar` pictures; everything else is flown by bats.
    // The familiar the player chose on the home screen, else the one the picture suggests.
    const species = familiarFor(
      (this.registry.get("v2.familiar") as Species | undefined) ?? readFamiliar(browserStore()),
      level.subject?.theme,
    );
    this.atlas = ensureFamiliarAtlas(this, level.palette, species);
    const reduced = isReducedMotion(this);
    const tones = level.palette.map(tonesFor);

    // Two HUD buttons, or three when there is a 3× offer (or an unlocked switch) to show.
    this.hudButtons = this.speedView().show ? 2 : 1;
    // Whether the optional 3× ad can be offered here (once per level, never in the tutorial).
    if (!this.tutorialId) this.stats.adOffer("speed2x", getRewards(this).isAvailable("speed2x"));
    this.bakeStaticLayer();
    // The hole's front lip goes over the familiars, so the ones going in slip down behind it.
    paintHoleFront(this.add.graphics().setDepth(15.5), this.layout.hole);
    this.model = new VisualModel(state.params.portal, (g) => this.session.state.groups[g]!.color);
    this.model.resync(state);
    this.emitter = new Emitter(new Particles(160), this.layout.cell, reduced);
    // The table is the backdrop (M15.13): calm and still, nothing drifts over it.
    this.cameras.main.setBackgroundColor(TABLE.wood);
    this.cubes = new CubeLayer(
      this,
      this.layout,
      level.palette,
      state.grid.slice(),
      // The picture's own colours while playing, as it looks when finished (owner request); the
      // boxes match a cube's colour family.
      // Picture boards have one flat colour per shade: the full bevel makes each cube a clear block.
      shadeTonesGrid(level, 0.38),
    );
    this.cubes.setSeals(sealMap(state));
    this.familiars = new FamiliarLayer(
      this,
      this.layout,
      this.atlas,
      this.model,
      tones,
      reduced,
      this.colorblind ? level.palette : null,
      this.emitter,
      species,
    );
    this.familiars.anchorFor = (group) => this.panels.anchor(group);
    this.familiars.gate = state.params.gate ?? 0;
    this.particleLayer = new ParticleLayer(this, this.emitter.particles, TEX.glow, 8);
    // No bump on the box per delivery: with a steady stream it made the boxes dance (M15.13).
    this.familiars.onDelivered = () => undefined;
    this.panels = new PanelsView(
      this,
      this.layout,
      level.palette,
      dpr,
      this.colorblind,
      reduced,
      this.trayMemory,
    );
    this.panels.onTrays = (trays) => (this.trayMemory = trays);
    this.rebuildMarks(state);
    this.panels.sync(state);
    this.placeColumns();
    this.buildHud();
    this.tray = this.tutorialId
      ? null
      : new BoosterTray(this, this.layout, {
          onSlot: () => this.boost(useExtraSlot(this.pouch, this.session, false)),
          onHint: () => this.boost(useHint(this.pouch, this.session, false)),
          onMenu: () => this.openSettings(),
          onCall: () => this.armCall(),
          onSweep: () => this.armSweep(),
          onLantern: () => this.openLantern(),
        });
    this.syncPouch();
    this.tutorialLayer = this.tutorial
      ? new TutorialLayer(
          this,
          this.layout,
          () => this.skipTutorial(),
          this.hudButtons,
          (i) => this.columnRectNow(i),
          (slot) => this.slotRectNow(slot),
        )
      : null;
    this.refreshTutorial();
    this.buildInput();
    this.clock.reset();
    this.settingsObjects = [];
    if (this.settingsOpen) this.showSettings();
    // A rebuild clears the board's objects: the lantern view and a waiting power-up end with it.
    this.lanternObjects = [];
    this.disarm();
    if (state.status !== "playing") this.showEnd(0);
  }

  /**
   * Everything that never changes while playing (the wooden table, the cream tray under the picture,
   * the tray plates and the HUD button discs) is drawn once into a single RenderTexture, so it costs
   * one textured quad per frame instead of re-tessellating rounded rectangles every frame.
   */
  private bakeStaticLayer(): void {
    const l = this.layout;
    const dpr = this.dpr;
    const { width, height } = this.scale.gameSize;
    const g = this.make.graphics({}, false);
    paintTable(g, { x: 0, y: 0, w: width, h: height }, plankWidth(l.frame.w), dpr);
    // The picture's board: padded all round (owner feedback), so no cube touches its edge; the
    // familiars walk round the picture on it.
    const pad = Math.max(l.boardPad, l.cell);
    paintBoard(
      g,
      {
        x: l.boardRect.x + l.cell - pad,
        y: l.boardRect.y + l.cell - pad,
        w: l.boardRect.w - 2 * l.cell + 2 * pad,
        h: l.boardRect.h - 2 * l.cell + 2 * pad,
      },
      Math.max(l.cell * 0.6, pad * 0.6),
      dpr,
    );
    paintPanelFrames(g, l, dpr);
    paintHole(g, l.hole);
    const cy = l.hud.y + l.hud.h / 2;
    const size = Math.round(HUD_BUTTON_CSS * dpr);
    for (let i = 0; i < this.hudButtons; i++) {
      const x = hudButtonX(l, i + 1, 3);
      g.fillStyle(TABLE.buttonEdge, 1);
      g.fillCircle(x, cy + 2 * dpr, size / 2);
      g.fillStyle(TABLE.button, 1);
      g.fillCircle(x, cy, size / 2);
    }
    const rt = this.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(0);
    rt.draw(g, 0, 0);
    rt.render();
    g.destroy();
  }

  private buildHud(): void {
    this.hud = new CollectHud(this, this.layout, this.session.level.name, this.speedView(), {
      onRestart: () => this.retry(),
      onSpeed: () => this.onSpeedTap(),
    });
    this.hud.setProgress(progressOf(this.session.state).fraction);
  }

  // -------------------------------------------------------------------------------------------
  // Boosters (M14.4, docs/V2_BOOSTERS.md)
  // -------------------------------------------------------------------------------------------

  /** Stores a changed pouch (never over one that could not be read) and refreshes what shows it. */
  private commitPouch(next: Pouch): void {
    this.pouch = next;
    if (this.pouchOk) savePouch(browserStore(), next);
    this.syncPouch();
  }

  private syncPouch(): void {
    this.tray?.sync(this.pouch, this.session.extraSlots < MAX_EXTRA_SLOTS);
  }

  /** Retry: always free and instant; the events say how the attempt stood and begin the next. */
  private retry(): void {
    this.stats.retry(this.session.state.status);
    this.session.restart();
  }

  /** Settings over the board (sound, motion, colour symbols...): the game waits and the level is kept. */
  private openSettings(): void {
    if (this.settingsOpen || this.overlay.length > 0) return;
    this.settingsOpen = true;
    this.showSettings();
  }

  private showSettings(): void {
    this.settingsObjects = buildSettingsPanel(this, this.layout, {
      onChanged: (id, value) => {
        if (id === "haptics") this.haptics.enabled = value;
        // Colour symbols change what is drawn: redraw from the session (the panel reopens).
        else if (id === "colorblind") {
          this.colorblind = value;
          this.rebuild();
        }
      },
      onHome: () => this.goHome(),
      onClose: () => {
        this.settingsOpen = false;
        for (const o of this.settingsObjects) o.destroy();
        this.settingsObjects = [];
      },
    });
  }

  /** Applies the outcome of a booster: store the pouch, say what happened, show a hint's target. */
  private boost(r: UseResult): void {
    this.idle?.wake();
    if (this.overlay.length > 0 && !r.used) return;
    this.commitPouch(r.pouch);
    this.toaster.show(r.message, 2600);
    if (!r.used) return;
    if (r.paid?.booster === "undo") this.stats.undo(r.paid.how);
    else if (r.paid) this.stats.booster(r.paid.booster, r.paid.how);
    if (r.suggest) this.highlight(r.suggest);
    // The layout changes with the slot count; Undo and Retry rebuild on their own.
    else if (r.relayout) this.rebuild();
  }

  /** A hint's target pulses briefly on the board. */
  private highlight(action: collect.Action): void {
    const r =
      action.kind === "select" ? this.columnRectNow(action.column) : this.slotRectNow(action.slot);
    if (!r) return;
    const ring = this.add
      .rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h)
      .setStrokeStyle(Math.max(2, 3 * this.dpr), theme.glow, 1)
      .setDepth(30);
    this.tweens.add({
      targets: ring,
      alpha: { from: 1, to: 0.15 },
      duration: isReducedMotion(this) ? 1 : 420,
      yoyo: true,
      repeat: 3,
      onComplete: () => ring.destroy(),
    });
  }

  private reviveProps(): { revive?: { label: string; onPress: () => void } } {
    const revive = this.reviveOffer();
    return revive ? { revive } : {};
  }

  /** The end card's Extra Slot offer after a loss one more tray would undo, with what it costs. */
  private reviveOffer(): { label: string; onPress: () => void } | undefined {
    const state = this.session.state;
    if (this.tutorialId || state.status !== "lost" || !this.session.canAddSlot) return undefined;
    if (this.session.extraSlots >= MAX_EXTRA_SLOTS) return undefined;
    const pay = paymentFor(this.pouch, "extraSlot");
    if (pay.kind === "short") return undefined;
    const label =
      pay.kind === "owned"
        ? `Extra slot (${this.pouch.boosters.extraSlot} left)`
        : `Extra slot · ${PRICES.extraSlot}✦`;
    return { label, onPress: () => this.boost(useExtraSlot(this.pouch, this.session, false)) };
  }

  /** Pays coins for a win once: the first clear of a level pays by size, a replay a token. */
  private payWin(): void {
    if (this.winPaid || this.tutorialId) return;
    this.winPaid = true;
    const date = this.dailyDate;
    const dailyBonus =
      date !== null &&
      date === utcDate(Date.now()) &&
      !isDone(readDailyBook(browserStore()).book, date);
    const r = award(this.pouch, this.session.level.id, {
      cubes: this.session.state.cubesTotal,
      dailyBonus,
      challenge: challengeOf(this.session.level.id),
    });
    this.commitPouch(r.pouch);
    this.winCoins = r.coins;
    this.winGift = r.gift;
    this.toaster.show(`+${r.coins} ✦`, 2400);
  }

  private speedView(): SpeedView {
    return speedView({
      levelId: this.session.level.id,
      state: this.speedState,
      // No ad offer while learning (the tutorial's own levels): it would only be noise.
      providerAvailable: !this.tutorialId && getRewards(this).isAvailable("speed2x"),
      speed: this.speed,
    });
  }

  private saveSpeed(): void {
    this.registry.set("v2.speedState", this.speedState);
    this.registry.set("v2.speed", this.speed);
  }

  /** The speed button: switch 1×/3× once unlocked, or watch the optional ad that unlocks it. */
  private onSpeedTap(): void {
    const view = this.speedView();
    if (view.action === "toggle") {
      this.speed = this.speed === 1 ? BOOST : 1;
      this.saveSpeed();
      this.hud.setSpeedLabel(`${this.speed}×`);
    } else if (view.action === "watch") {
      void this.watchForSpeed();
    } else if (view.action === "cancel") {
      this.adCancel?.();
    }
  }

  /**
   * Shows the rewarded ad for 3×. The game waits while it is on screen, but never for long and never
   * for good: the button, Retry or Undo end the wait at any moment (a provider that hangs just becomes
   * "no ad"), and whatever happens play carries on, at 1× unless the ad was completed.
   */
  private async watchForSpeed(): Promise<void> {
    const levelId = this.session.level.id;
    const token = ++this.adToken;
    this.speedState = { ...this.speedState, adPending: true };
    this.hud.setSpeedLabel("…");
    const cancelled = new Promise<AdResult>((resolve) => {
      this.adCancel = () => resolve("unavailable");
    });
    const result = await Promise.race([safeShow(getRewards(this), "speed2x"), cancelled]);
    this.idle?.wake();
    if (token === this.adToken) this.adCancel = null;
    // The scene may have moved on (shut down, another level, a newer wait) while the ad was up.
    if (!this.scene.isActive() || this.session.level.id !== levelId) return;
    const current = token === this.adToken;
    // A late result of an older wait never touches a newer one's state; only a completed ad still counts.
    if (!current && result !== "rewarded") return;
    track(this, "ad_result", { placement: "speed2x", result });
    const outcome = applyAdResult(this.speedState, levelId, result);
    this.speedState = current
      ? outcome.state
      : { ...outcome.state, adPending: this.speedState.adPending };
    if (outcome.speed === BOOST) this.speed = BOOST;
    this.saveSpeed();
    const view = this.speedView();
    // Rebuild only when the HUD changed shape (a button appeared or went away); else just the label.
    if (view.show !== (this.hudButtons === 2)) this.rebuild();
    else this.hud.setSpeedLabel(view.label);
    if (outcome.message) this.toaster.show(outcome.message, 2200);
  }

  private buildInput(): void {
    this.columnZones = this.layout.columns.map((r, column) => {
      const zone = this.add
        // A column's zone spans the gap beside it, so neighbouring columns leave no dead strip.
        .zone(r.x + r.w / 2, r.y + r.h / 2, r.w + this.layout.gap, r.h)
        .setDepth(25)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
        if (this.armed === "call") this.callAt(column, p.worldY);
        else this.tap({ kind: "select", column });
      });
      return zone;
    });
    this.placeColumns();
    // Tapping a familiar on the board makes it jump for joy (just for fun, M15.13).
    const b = this.layout.boardRect;
    this.add
      .zone(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h)
      .setDepth(5)
      .setInteractive()
      .on("pointerdown", (p: Phaser.Input.Pointer) => {
        if (this.familiars.boop(p.worldX, p.worldY)) this.idle?.wake();
      });
    // Normally there is no tap on a tray (a pending box goes back to work by itself); these zones
    // only listen while Besom Sweep waits for the box to sweep.
    this.trayZones = this.layout.trays.map((r, tray) => {
      const zone = this.add
        .zone(r.x + r.w / 2, r.y + r.h / 2, r.w + this.layout.gap, r.h + this.layout.gap)
        .setDepth(25)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.sweepTray(tray));
      if (zone.input) zone.input.enabled = false;
      return zone;
    });
  }

  // -------------------------------------------------------------------------------------------
  // Power-ups (M15.13): Familiar's Call, Besom Sweep, Crystal Lantern
  // -------------------------------------------------------------------------------------------

  private arm(which: "call" | "sweep", message: string): void {
    this.armed = which;
    this.tray?.setArmed(which);
    for (const z of this.trayZones) if (z.input) z.input.enabled = which === "sweep";
    this.toaster.show(message, 2600);
  }

  private disarm(): void {
    this.armed = null;
    this.tray?.setArmed(null);
    for (const z of this.trayZones) if (z.input) z.input.enabled = false;
  }

  /** Paw: the next tap on a box behind a column's front brings it forward. Tapping Paw again cancels. */
  private armCall(): void {
    if (this.armed === "call") return this.disarm();
    if (this.overlay.length > 0 || this.session.state.status !== "playing") return;
    const short = canAfford(this.pouch, "call");
    if (short) return this.toaster.show(short, 2600);
    if (!this.session.state.columns.some((c) => c.length > 1))
      return this.toaster.show("No box is waiting behind another", 2400);
    this.arm("call", "Tap a box behind the front row to call it forward");
  }

  /** Which drawn box of `column` a tap at `y` hit (0 = the front), from the column's grid. */
  private callAt(column: number, y: number): void {
    const r = this.layout.columns[column]!;
    const depth = Math.floor((y - r.y) / (this.layout.tile + this.layout.gap));
    if (depth <= 0) return this.toaster.show("That one is already at the front", 2000);
    const r2 = useCall(this.pouch, this.session, column, depth);
    this.disarm();
    this.boost(r2);
  }

  /** Broom: one stuck box is swept at once; with several in the trays the player picks one. */
  private armSweep(): void {
    if (this.armed === "sweep") return this.disarm();
    if (this.overlay.length > 0 || this.session.state.status !== "playing") return;
    const short = canAfford(this.pouch, "sweep");
    if (short) return this.toaster.show(short, 2600);
    const can = this.session.state.groups.filter(
      (g) => this.panels.trayOfGroup(g.id) !== null && this.session.canSweep(g.id),
    );
    if (can.length === 0) return this.toaster.show("No box in a tray to sweep", 2400);
    if (can.length === 1) return this.boost(useSweep(this.pouch, this.session, can[0]!.id));
    this.arm("sweep", "Tap a box in a tray: its familiars will fly to buried cubes");
  }

  private sweepTray(tray: number): void {
    if (this.armed !== "sweep") return;
    const group = this.panels.groupInTray(tray);
    if (group === null) return this.toaster.show("That tray is empty", 1800);
    this.disarm();
    this.boost(useSweep(this.pouch, this.session, group));
  }

  /** Lantern: lit once per level (paid), then free to reopen; shows every box still to come. */
  private openLantern(): void {
    if (this.lanternObjects.length > 0 || this.overlay.length > 0 || this.settingsOpen) return;
    this.disarm();
    const levelId = this.session.level.id;
    if (this.lanternLit !== levelId) {
      const r = useLantern(this.pouch, this.session);
      if (!r.used) return this.boost(r);
      this.lanternLit = levelId;
      this.commitPouch(r.pouch);
      if (r.paid) this.stats.booster("lantern", r.paid.how);
    }
    // The Lantern's view is its own chunk, loaded the first time it is opened (the board's chunk has a
    // size budget). Play waits from the tap on: a placeholder marks the panel as open meanwhile.
    const level = this.session.level;
    this.lanternObjects = [this.add.zone(0, 0, 1, 1)];
    void import("./LanternPanel")
      .then(({ buildLanternPanel }) => {
        for (const o of this.lanternObjects) o.destroy();
        // The level changed or the board was rebuilt while it loaded: nothing to show.
        if (this.session.level !== level || this.lanternObjects.length === 0) {
          this.lanternObjects = [];
          return;
        }
        this.lanternObjects = buildLanternPanel(
          this,
          this.layout,
          this.session.state,
          level.palette,
          () => {
            for (const o of this.lanternObjects) o.destroy();
            this.lanternObjects = [];
          },
        );
        this.idle?.wake();
      })
      .catch((e: unknown) => {
        console.error("The Lantern could not be loaded.", e);
        this.lanternObjects = [];
        this.toaster.show("Could not open the Lantern. Check your connection", 2600);
      });
  }

  /** Where the box waiting in engine slot `slot` sits now: its tray. */
  private slotRectNow(slot: number): { x: number; y: number; w: number; h: number } | null {
    const g = this.session.state.slots[slot];
    const tray = g === null || g === undefined ? null : this.panels.trayOfGroup(g);
    return tray === null ? null : (this.layout.trays[tray] ?? null);
  }

  /**
   * What a ring around column `i` should hug: its front box, where the column is drawn now (columns that
   * ran out are gone and the rest are centred). The tap zone is the whole column; the ring is the box.
   */
  private columnRectNow(i: number): { x: number; y: number; w: number; h: number } | null {
    const r = activeColumnRects(
      this.layout,
      this.session.state.columns.map((c) => c.length > 0),
    )[i];
    if (!r) return null;
    return frontBoxRect(this.layout, r);
  }

  /** Puts each column's tap zone where its boxes are now: columns that ran out are off, the rest centred. */
  private placeColumns(): void {
    const rects = activeColumnRects(
      this.layout,
      this.session.state.columns.map((c) => c.length > 0),
    );
    this.columnZones.forEach((zone, i) => {
      const r = rects[i];
      if (zone.input) zone.input.enabled = r !== null;
      if (r) zone.setPosition(r.x + r.w / 2, r.y + r.h / 2);
    });
  }

  /** `fromDemo` marks taps made by the demo player; any other tap takes over and ends the demo. */
  private tap(action: collect.Action, fromDemo = false): void {
    this.idle?.wake();
    if (!fromDemo) this.demo = null;
    if (this.overlay.length > 0 || this.settingsOpen || this.lanternObjects.length > 0) return;
    const result = this.session.tap(action);
    if (!result.ok) {
      const reason = result.reason;
      if (reason !== "ok" && reason !== "unavailable") {
        this.toaster.show(REASON_TEXT[reason]);
        this.tutorial?.note("rejected");
        this.refreshTutorial();
      }
      const cue = rejectionCue(reason);
      if (cue) playCues([cue], this.sinks);
      return;
    }
    if (!fromDemo) this.stats.move();
    this.panels.sync(this.session.state);
    this.placeColumns();
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
      // The first time a group goes to wait, say why (the tutorial's own hints do this in its levels).
      const note = eventNote(e);
      if (note && !this.tutorial && !this.registry.get("v2.parkNote")) {
        this.registry.set("v2.parkNote", true);
        this.toaster.show(note, 2400);
      }
      if (e.type === "groupCompleted") {
        this.cubes.setSeals(sealMap(this.session.state));
        this.celebrateGroup(e.group);
      } else if (e.type === "lost") {
        this.stats.loss(e.reason);
      } else if (e.type === "won") {
        this.celebrateWin();
        this.stats.win();
        this.payWin();
      }
    }
    playCues(planCues(batch.events), this.sinks);
    if (marksChanged) this.cubes.setMarks(this.marks);
    this.panels.sync(this.session.state);
    this.placeColumns();
    this.hud.setProgress(progressOf(this.session.state).fraction);
    this.refreshTutorial();
    const status = this.session.state.status;
    if (status !== "playing" && this.overlay.length === 0 && !this.overlayTimer) {
      this.overlayTimer = this.time.delayedCall(700, () => this.showEnd(0));
    }
  }

  /** Plays the next demo action once the board has settled and a short pause has passed. */
  private stepDemo(time: number): void {
    const d = this.demo;
    if (!d || this.overlay.length > 0 || this.session.state.status !== "playing") return;
    if (d.readyAt === 0) d.readyAt = time + 1200 / this.speed; // let the board be seen first
    if (!collect.isSettled(this.session.state)) {
      d.readyAt = time + 900 / this.speed;
      return;
    }
    if (time < d.readyAt || d.next >= d.line.length) return;
    this.tap(d.line[d.next++]!, true);
  }

  /** A finished group: its badge blooms and throws sparks in its own colour. */
  private celebrateGroup(group: number): void {
    const colorIndex = this.session.state.groups[group]!.color;
    const color = tonesFor(this.session.level.palette[colorIndex]!).light;
    const badge = this.panels.badge(group);
    const at = badge ?? this.layout.portal;
    this.emitter.bloom(at.x, at.y, color, this.frameTime);
    // Boxes finished one soon after another make a streak: more sparks, and a word of praise.
    const { combo, word } = comboAfter(this.combo, this.playMs);
    this.combo = combo;
    this.emitter.sparks(
      at.x,
      at.y,
      color,
      10 + 4 * Math.min(3, combo.count - 1),
      this.frameTime,
      1.8,
    );
    if (word && !this.tutorialId) this.cheer(word, at.x, at.y);
  }

  /** A word of praise that pops up over `x, y`, rises and fades (decorative, M15.13). */
  private cheer(word: string, x: number, y: number): void {
    const dpr = this.dpr;
    const f = this.layout.frame;
    const text = this.add
      .text(Math.max(f.x + 60 * dpr, Math.min(f.x + f.w - 60 * dpr, x)), y - 18 * dpr, word, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(20 * dpr)}px`,
        color: "#ffd426",
        stroke: "#5a2a9c",
        strokeThickness: Math.round(5 * dpr),
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setScale(0.4);
    this.idle?.wake();
    if (isReducedMotion(this)) {
      text.setScale(1);
      this.time.delayedCall(900, () => text.destroy());
      return;
    }
    this.tweens.add({ targets: text, scale: 1, duration: 220, ease: "Back.easeOut" });
    this.tweens.add({
      targets: text,
      y: text.y - 34 * dpr,
      alpha: 0,
      delay: 520,
      duration: 480,
      ease: "Sine.easeIn",
      onComplete: () => text.destroy(),
    });
  }

  /** Every cube is in: a fountain of the level's colours from the portal. */
  private celebrateWin(): void {
    const p = this.layout.portal;
    const colors = this.session.level.palette.map((hex) => tonesFor(hex).light);
    this.emitter.fountain(p.x, p.y, colors, this.frameTime);
  }

  override update(time: number, delta: number): void {
    if (!this.session) return;
    this.frameTime = time;
    const profileStart = this.profile ? performance.now() : 0;
    // The game waits while an ad is on screen.
    const adWait = this.speedState.adPending || this.settingsOpen || this.lanternObjects.length > 0;
    // Active play only: not an ad wait, an end card or a hidden tab.
    if (!adWait && this.session.state.status === "playing" && !document.hidden) {
      this.stats.active(delta);
    }
    // Once no box is left to choose (every column empty), the rest plays itself out at 3× (owner
    // request, M15.13); otherwise the speed is the one the player chose.
    const finishing =
      !this.tutorialId &&
      this.session.state.status === "playing" &&
      this.session.state.columns.every((c) => c.length === 0);
    const shown = finishing ? BOOST : this.speed;
    if (finishing !== this.finishing) {
      this.finishing = finishing;
      this.hud.setSpeedLabel(finishing ? `${BOOST}×` : this.speedView().label);
    }
    this.panels.speed = shown;
    const due = stepFrame(this.session, this.clock, delta, shown, adWait);
    if (!adWait) this.playMs += delta * shown;
    if (this.profile) this.profile.ticks += due;
    this.familiars.update(
      this.session.state.tick,
      this.clock.alpha,
      time,
      this.clock.tickMs / shown,
    );
    this.stepDemo(time);
    this.particleLayer.update(time);
    this.reveal?.update(time);
    if (this.reveal?.done) this.revealSeen = true;
    this.cubes.flush();
    this.profile?.update.push(performance.now() - profileStart);
    this.idle?.frame(time);
  }

  /** Something on screen is moving (or about to): the loop must keep drawing. */
  private busy(): boolean {
    const s = this.session.state;
    if (s.status === "playing" && !collect.isSettled(s)) return true;
    if (this.tweens.getTweens().length > 0) return true;
    if (this.emitter.particles.count(this.frameTime) > 0) return true;
    if (this.overlayTimer || this.demo || this.speedState.adPending) return true;
    return this.reveal !== null && !this.reveal.done;
  }

  /**
   * Profiler summary (`?profile=1` builds): CPU milliseconds of the scene's own `update` per frame
   * (ticks, interpolation, sprite placement, cube redraws; not the GPU or Phaser's own rendering),
   * plus draw-side counters and a check that what is on screen equals the engine.
   */
  perf(): Record<string, unknown> {
    const p = this.profile;
    const upd = p?.update.summary();
    const ren = p?.render.summary();
    const s = this.session.state;
    return {
      frames: p?.update.size ?? 0,
      updateMsMedian: upd?.median ?? null,
      updateMsP95: upd?.p95 ?? null,
      updateMsMax: upd?.max ?? null,
      renderSubmitMsMedian: ren?.median ?? null,
      renderSubmitMsP95: ren?.p95 ?? null,
      renderSubmitMsMax: ren?.max ?? null,
      ticksRun: p?.ticks ?? 0,
      familiarsLive: s.familiars.length,
      // Sprites actually on screen (attached to a familiar, not retiring), counted by the layer.
      familiarsDrawn: this.familiars.stats.live,
      spritesCreated: this.familiars.stats.created,
      peakFamiliars: this.familiars.stats.peakLive,
      maxPossible: s.params.squad * s.params.fieldCap,
      cubeFullPaints: this.cubes.stats.fullPaints,
      cubePaintMs: +this.cubes.stats.paintMs.toFixed(2),
      cubeClears: this.cubes.stats.clears,
      cubeFlushes: this.cubes.stats.flushes,
      ringRedraws: this.cubes.stats.ringRedraws,
      tick: s.tick,
      delivered: s.deliveredTotal,
      cubesTotal: s.cubesTotal,
      countsMatch: this.familiars.stats.live === s.familiars.length,
    };
  }

  /** Clears the profiler's samples (call after selecting groups so idle frames do not skew them). */
  resetProfile(): void {
    this.profile?.update.clear();
    this.profile?.render.clear();
  }

  // -------------------------------------------------------------------------------------------
  // End of game
  // -------------------------------------------------------------------------------------------

  /**
   * A win on a level with a known picture: record it in the v2 Spellbook, then reveal the finished
   * illustration with its subject's effect and show its lore. Returns false when the level has no
   * shaded picture to show (the plain end card is used instead).
   */
  private showReveal(subject: collect.LevelSubject): boolean {
    const level = this.session.level;
    if (!level.shades) return false;
    if (!this.winRecord) {
      const store = browserStore();
      const read = readSpellbook(store);
      const result = recordWin(read.book, subject.id, Date.now());
      // An unreadable book is never overwritten: better to forget one win than the collection.
      const saved = read.ok && saveSpellbook(store, result.book);
      this.winRecord = {
        isNew: result.isNew,
        saved,
        // Progress is only claimed for a win that is really in the book.
        world: saved ? worldMoment(result.book, subject.id, result.isNew) : null,
        daily: this.recordDaily(),
      };
    }
    const { isNew, saved, world, daily } = this.winRecord;
    const overlay = new CompletionOverlay(this, {
      layout: this.layout,
      level: { ...level, subject },
      dpr: this.dpr,
      reduced: isReducedMotion(this),
      isNew,
      saved,
      world,
      daily,
      onShare: (text) => this.share(text),
      instant: this.revealSeen,
      onSpellbook: () => this.openSpellbook(),
      onAgain: () => this.retry(),
      ...(this.tutorialId ? {} : this.winExtras()),
    });
    this.reveal = overlay;
    this.overlay = overlay.objects;
    return true;
  }

  /** Records today's daily (first completion of a day counts) and says what the win card shows. */
  private recordDaily(): { line: string; shareText: string | null } | null {
    const date = this.dailyDate;
    if (!date) return null;
    // Only today's challenge counts: any other day (`?date=`) is practice and leaves no trace.
    if (date !== utcDate(Date.now())) return { line: practiceLine(date), shareText: null };
    const store = browserStore();
    const read = readDailyBook(store);
    const moves = Math.max(1, this.session.moves);
    const result = recordDaily(read.book, date, moves, Date.now());
    // As with the Spellbook, a book that could not be read is never overwritten.
    const saved = read.ok && (!result.isNew || saveDailyBook(store, result.book));
    return dailyMoment(result.book, date, { isNew: result.isNew, saved, moves });
  }

  /** Shares the daily's text (share sheet, else clipboard) and says what happened on the card. */
  private share(text: string): void {
    // One share at a time: a second tap while a sheet is open would only be refused.
    if (this.sharing) return;
    this.sharing = true;
    const nav = typeof navigator === "undefined" ? null : navigator;
    void shareOrCopy(text, nav).then((r) => {
      this.sharing = false;
      // A dismissed share sheet needs no note.
      if (r === "cancelled") return;
      this.reveal?.note(
        r === "copied" ? "Copied to clipboard" : r === "shared" ? "Shared" : "Could not share",
      );
    });
  }

  private openSpellbook(): void {
    if (!this.scene.get("collect-spellbook"))
      this.scene.add("collect-spellbook", CollectSpellbookScene, false);
    this.scene.start("collect-spellbook");
  }

  /** Shows the tutorial's current hint (or nothing). */
  private refreshTutorial(): void {
    this.tutorialLayer?.show(
      this.tutorial?.update(this.session.state) ?? null,
      this.tutorial !== null && !this.tutorial.finished,
    );
  }

  /** "Skip": no more hints, and the tutorial is not offered again on later visits. */
  private skipTutorial(): void {
    this.tutorial?.skip();
    // For the rest of the visit (a retry or Next must not bring the hints back) and for later visits.
    this.registry.set("v2.tutorialSkipped", true);
    this.tutorialBook = markSkipped(this.tutorialBook);
    saveTutorialBook(browserStore(), this.tutorialBook);
    this.refreshTutorial();
  }

  /** Home: the level list, where the player picks what to play next (M15.13). */
  private goHome(): void {
    // The loop may be asleep (a still board): starting a scene needs it running.
    this.idle?.wake();
    if (!this.scene.get("collect-levels"))
      this.scene.add("collect-levels", LevelSelectScene, false);
    this.scene.start("collect-levels");
  }

  /** A win outside the tutorial ends on its reward and one way on: home. */
  private winExtras(): {
    next: { label: string; onPress: () => void };
    coins: number | null;
    gift: string | null;
  } {
    return {
      next: { label: "Continue", onPress: () => this.goHome() },
      coins: this.winCoins,
      gift:
        this.winGift && this.winGift in POWER_NAMES
          ? POWER_NAMES[this.winGift as keyof typeof POWER_NAMES]
          : null,
    };
  }

  /** A won tutorial level is remembered, and the end card leads on to the next one (or to the game). */
  private tutorialWin(): { label: string; onPress: () => void } | undefined {
    const id = this.tutorialId;
    if (!id) return undefined;
    if (!this.tutorialSaved) {
      this.tutorialSaved = true;
      this.tutorialBook = markDone(this.tutorialBook, id);
      saveTutorialBook(browserStore(), this.tutorialBook);
    }
    const following = nextAfter(this.tutorialBook, id);
    return {
      label: following ? "Next" : "Play",
      onPress: () => {
        // On to the next level not finished; after the last, on to the slice.
        this.registry.set("v2.level", following ?? "slice");
        this.scene.restart();
      },
    };
  }

  private showEnd(delay: number): void {
    const state = this.session.state;
    if (state.status === "playing" || this.overlay.length > 0) return;
    const won = state.status === "won";
    const subject = this.session.level.subject;
    if (won && subject && this.showReveal(subject)) return;
    this.overlay = buildEndCard(this, this.layout, {
      won,
      lossReason: state.lossReason,
      delivered: state.deliveredTotal,
      delay,
      reduced: isReducedMotion(this),
      onRetry: () => this.retry(),
      ...(!won ? this.reviveProps() : {}),
      ...(won && this.tutorialId ? { next: this.tutorialWin()! } : {}),
      ...(won && !this.tutorialId ? { ...this.winExtras(), retry: false } : {}),
    });
  }
}
