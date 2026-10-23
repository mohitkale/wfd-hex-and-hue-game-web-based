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
import { AmbientLayer } from "./ambient";
import { atmosphereForTheme } from "./worldIdentity";
import { planCues, playCues, rejectionCue, type CueSinks } from "./cues";
import { Emitter, Particles } from "./particles";
import { CollectHud } from "./CollectHud";
import { PortalView } from "./PortalView";
import { buildEndCard } from "./EndCard";
import { Toast } from "./Toast";
import { progressOf } from "./progress";
import { cellCenter, computeCollectLayout, hudButtonX, type CollectLayout } from "./collectLayout";
import { RingStats } from "./profile";
import { shadeTonesGrid, tonesFor } from "./cubePaint";
import { ensureFamiliarAtlas } from "./familiarTextures";
import { demoLineFromSearch, dailyFromSearch, levelFromSearch } from "./levels";
import { TickClock } from "./tickClock";
import { worldMoment, type WorldMoment } from "./worldMoment";
import {
  dailyMoment,
  practiceLine,
  readDailyBook,
  recordDaily,
  saveDailyBook,
  shareOrCopy,
} from "./dailyBook";
import { utcDate } from "./daily";
import { browserStore, readSpellbook, recordWin, saveSpellbook } from "./v2Spellbook";
import { sealMap } from "./sealView";
import { VisualModel } from "./visuals";

type CollectState = collect.CollectState;

/** HUD buttons: undo, retry, speed. The baked circles and the tap zones share `hudButtonX`. */
const HUD_BUTTONS = 3;

const SEAL_HINT = "Wax-sealed cubes wake once their key colour is gathered";

const REASON_TEXT: Record<Exclude<collect.ActionCheck, "ok">, string> = {
  gameOver: "The game is over",
  unavailable: "Nothing there",
  fieldFull: "Too many groups are working",
  noReachableCube: "No reachable cube of this colour yet",
  sealed: "Wax-sealed: finish the key colour first",
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
  private emitter!: Emitter;
  private particleLayer!: ParticleLayer;
  private ambient!: AmbientLayer;
  private readonly haptics = new Haptics();
  private readonly sinks: CueSinks = {
    sound: (name, options) => getAudio(this).play(name, options),
    haptic: (kind) => this.haptics.play(kind),
  };
  /**
   * `?demo=win|lose` (review builds): taps a recorded line one action at a time whenever the board
   * has settled, so a reviewer can watch a winning or a losing sequence. Any manual tap, undo or
   * restart ends it.
   */
  private demo: { line: readonly collect.Action[]; next: number; readyAt: number } | null = null;
  /** The time of the latest frame, for effects started by events between frames. */
  private frameTime = 0;
  private atlas = "";
  /** 24 ticks a second at 1× (one cell per tick): crossing a 20-cell board takes under a second. */
  private readonly clock = new TickClock(24);
  private speed: 1 | 2 = 1;
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
  private portal!: PortalView;
  private hud!: CollectHud;
  private unsubscribe: (() => void)[] = [];
  /** Colour-blind mode (M6.5): each colour also shows its symbol. `?cb=1` forces it for review. */
  private colorblind = false;
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
    this.overlay = [];
    this.reveal = null;
    this.winRecord = null;
    this.revealSeen = false;
    this.demo = null;
    this.marks = new Map();
    this.frameTime = 0;
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    const search = typeof window !== "undefined" ? window.location.search : "";
    // `v2.level`: a level chosen in the game (Spellbook replay), kept so "Back to the board" returns to it.
    const chosen = this.registry.get("v2.level") as string | undefined;
    // `?level=daily`: today's challenge, remembered by its date so the win is recorded for that day.
    const daily = dailyFromSearch(search, Date.now(), chosen);
    this.dailyDate = daily?.date ?? null;
    this.sharing = false;
    const level = levelFromSearch(search, daily ? daily.levelId : chosen);
    const params = new URLSearchParams(search);
    if (params.get("speed") === "2") this.speed = 2;
    // `?view=spellbook` opens the v2 Spellbook first (once: "Back to the board" returns here).
    if (params.get("view") === "spellbook" && !this.registry.get("v2.spellbookShown")) {
      this.registry.set("v2.spellbookShown", true);
      this.time.delayedCall(0, () => this.openSpellbook());
    }
    this.colorblind = params.get("cb") === "1";
    this.session = new collect.CollectSession(level);
    const line = demoLineFromSearch(search, level);
    if (line) this.demo = { line, next: 0, readyAt: 0 };
    // The first sealed level of a visit explains the seals once; it never waits on a tap.
    if (level.seals && !this.registry.get("v2.sealIntro")) {
      this.registry.set("v2.sealIntro", true);
      this.time.delayedCall(500, () => this.toaster.show(SEAL_HINT, 4200));
    }
    this.unsubscribe.push(
      this.session.subscribe((batch) => this.onBatch(batch)),
      this.session.onReplace(() => {
        this.demo = null;
        this.winRecord = null;
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
    this.tweens.killAll();
    this.overlayTimer?.remove();
    this.overlayTimer = null;
    this.overlay = [];
    this.reveal = null;
    this.children.removeAll(true);
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
    this.toaster = new Toast(this, this.layout);
    this.atlas = ensureFamiliarAtlas(this, level.palette);
    const reduced = isReducedMotion(this);
    const tones = level.palette.map(tonesFor);

    this.bakeStaticLayer();
    this.portal = new PortalView(this, this.layout, this.session.state.params.portal);
    this.model = new VisualModel(state.params.portal, (g) => this.session.state.groups[g]!.color);
    this.model.resync(state);
    this.emitter = new Emitter(new Particles(160), this.layout.cell, reduced);
    // Each world has its own atmosphere (docs/V2_WORLDS.md); a level without a known picture keeps the default.
    const look = level.subject ? atmosphereForTheme(level.subject.theme) : undefined;
    this.ambient = new AmbientLayer(
      this,
      this.layout.frame,
      TEX.glow,
      reduced,
      this.layout.cell,
      look,
    );
    this.cameras.main.setBackgroundColor(look?.backdrop ?? theme.night);
    this.cubes = new CubeLayer(
      this,
      this.layout,
      level.palette,
      state.grid.slice(),
      shadeTonesGrid(level),
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
    );
    this.particleLayer = new ParticleLayer(this, this.emitter.particles, TEX.glow, 8);
    this.familiars.onDelivered = (_color, group) => {
      this.portal.pulse();
      this.panels.badge(group)?.pulse();
    };
    this.panels = new PanelsView(
      this,
      this.layout,
      level.palette,
      this.atlas,
      dpr,
      this.colorblind,
      reduced,
    );
    this.rebuildMarks(state);
    this.panels.sync(state);
    this.buildHud();
    this.buildInput();
    this.clock.reset();
    if (state.status !== "playing") this.showEnd(0);
  }

  /**
   * Everything that never changes while playing (board panel and ring, field and slot outlines, HUD
   * button circles) is drawn once into a single RenderTexture, so it costs one textured quad per
   * frame instead of re-tessellating rounded rectangles and circles every frame.
   */
  private bakeStaticLayer(): void {
    const l = this.layout;
    const dpr = this.dpr;
    const g = this.make.graphics({}, false);
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
    paintPanelFrames(g, l, dpr);
    const cy = l.hud.y + l.hud.h / 2;
    const size = Math.round(36 * dpr);
    for (let i = 0; i < HUD_BUTTONS; i++) {
      const x = hudButtonX(l, i, HUD_BUTTONS);
      g.fillStyle(theme.dusk, 1);
      g.fillCircle(x, cy, size / 2);
      g.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.5);
      g.strokeCircle(x, cy, size / 2);
    }
    // Only the area with static content (HUD, board, field and slot rows), not the columns below.
    const bottom = Math.max(...l.slots.map((r) => r.y + r.h), l.boardRect.y + l.boardRect.h);
    const rt = this.add
      .renderTexture(l.frame.x, l.frame.y, l.frame.w, bottom - l.frame.y)
      .setOrigin(0, 0)
      .setDepth(0);
    rt.draw(g, -l.frame.x, -l.frame.y);
    rt.render();
    g.destroy();
  }

  private buildHud(): void {
    this.hud = new CollectHud(this, this.layout, this.session.level.name, this.speed, {
      onUndo: () => this.session.undo(),
      onRestart: () => this.session.restart(),
      onSpeed: () => this.toggleSpeed(),
    });
    this.hud.setProgress(progressOf(this.session.state).fraction);
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.hud.setSpeed(this.speed);
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

  /** `fromDemo` marks taps made by the demo player; any other tap takes over and ends the demo. */
  private tap(action: collect.Action, fromDemo = false): void {
    if (!fromDemo) this.demo = null;
    if (this.overlay.length > 0) return;
    const result = this.session.tap(action);
    if (!result.ok) {
      const reason = result.reason;
      if (reason !== "ok" && reason !== "unavailable") this.toaster.show(REASON_TEXT[reason]);
      const cue = rejectionCue(reason);
      if (cue) playCues([cue], this.sinks);
      return;
    }
    this.panels.sync(this.session.state);
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
      if (e.type === "groupCompleted") {
        this.cubes.setSeals(sealMap(this.session.state));
        this.celebrateGroup(e.group);
      } else if (e.type === "won") this.celebrateWin();
    }
    playCues(planCues(batch.events), this.sinks);
    if (marksChanged) this.cubes.setMarks(this.marks);
    this.panels.sync(this.session.state);
    this.hud.setProgress(progressOf(this.session.state).fraction);
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
    const at = badge ?? cellCenter(this.layout, this.session.state.params.portal);
    this.emitter.bloom(at.x, at.y, color, this.frameTime);
    this.emitter.sparks(at.x, at.y, color, 10, this.frameTime, 1.8);
  }

  /** Every cube is in: a fountain of the level's colours from the portal. */
  private celebrateWin(): void {
    const p = cellCenter(this.layout, this.session.state.params.portal);
    const colors = this.session.level.palette.map((hex) => tonesFor(hex).light);
    this.emitter.fountain(p.x, p.y, colors, this.frameTime);
  }

  override update(time: number, delta: number): void {
    if (!this.session) return;
    this.frameTime = time;
    const profileStart = this.profile ? performance.now() : 0;
    const due = this.clock.advance(delta, this.speed);
    if (this.profile) this.profile.ticks += due;
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
    this.stepDemo(time);
    this.ambient.update(time);
    this.particleLayer.update(time);
    this.reveal?.update(time);
    if (this.reveal?.done) this.revealSeen = true;
    this.cubes.flush();
    this.profile?.update.push(performance.now() - profileStart);
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
      onAgain: () => this.session.restart(),
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
    const moves = Math.max(1, this.session.log.length);
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
      canUndo: this.session.canUndo,
      delay,
      reduced: isReducedMotion(this),
      onRetry: () => this.session.restart(),
      onUndo: () => this.session.undo(),
    });
  }
}
