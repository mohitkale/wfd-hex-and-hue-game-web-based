import type * as collect from "@hexhue/core/collect";
import Phaser from "phaser";
import { hexToNumber, inkFor } from "../theme";
import { symbolTexture } from "../view/textures";
import type { CollectLayout } from "./collectLayout";
import { familiarScale } from "./collectLayout";
import { bake } from "./bake";
import { paintCube, type CubeTones } from "./cubePaint";
import {
  FAMILIAR_H,
  FAMILIAR_W,
  FRAME_NAMES,
  SS,
  WALK_FRAMES,
  badgeRect,
  type FrameName,
  type Species,
} from "./familiarArt";
import type { Emitter } from "./particles";
import {
  CellSpreader,
  bump,
  squashX,
  squashY,
  drawnCoord,
  drift,
  ease,
  hover as hoverOf,
  interpolate,
  popDuration,
  type Offset,
} from "./swarm";
import { frameFor, type FamiliarVisual, type VisualModel } from "./visuals";
import { gait, headingOf, STILL, strideCycle, strideFrame, turnToward } from "./gait";
import { holeFrontY } from "./tableLook";

type CollectEvent = collect.CollectEvent;

interface Entry {
  img: Phaser.GameObjects.Image;
  cube: Phaser.GameObjects.Image;
  cubeColor: number;
  /** Colour-blind symbols: one on the chest, one on the carried cube (null when the mode is off). */
  chest: Phaser.GameObjects.Image | null;
  mark: Phaser.GameObjects.Image | null;
  retiring: boolean;
  popping: boolean;
  /** Per-familiar constants (drift, hover, pop length), set once when the entry is attached to an id. */
  drift: Offset;
  hoverPhase: number;
  hoverRate: number;
  popMs: number;
  /** The eased crowd offset (cells) currently applied, so it glides instead of snapping. */
  spread: number;
  /** Pickup lift: the carried cube rises from the cube's cell to above the head (decorative, timed). */
  liftFromX: number;
  liftFromY: number;
  liftUntil: number;
  /** Pickup squash: the familiar flattens and springs back until this time. */
  squashUntil: number;
  /** How far it has gone down the hole, 0 (feet on the rim) to 1 (out of sight). */
  sink: number;
  /** When its dive into the hole began (-1: not diving), and how long the dive takes. */
  sinkFrom: number;
  sinkMs: number;
  /** A tap made it jump for joy: the jump runs until this time. */
  joyUntil: number;
  /** Which way its head points (radians, 0 = up), eased toward the way it walks. */
  heading: number;
  /** Where across the hole's opening it goes in (px from the centre), so arrivals do not stack. */
  lane: number;
  /** Where the dive into the hole began, and the heading then. */
  sinkX0: number;
  sinkY0: number;
  sinkRot0: number;
}

// Above the group boxes (depth 10 to 12), so familiars fly out of and into their open tray in front of them.
const D = { sprite: 14, cube: 15, effect: 16 } as const;
/** Specks in the dust puff at the hole when a familiar dives in. */
const DUST_SPECKS = 4;
/** How long a tapped familiar's jump for joy lasts. */
const JOY_MS = 520;
/** How far (css px) from a familiar a tap may land and still reach it. */
const BOOP_REACH_CSS = 26;
/** The dive into the hole goes on at walking pace, but never quicker or slower than these. */
const DIVE_MIN_MS = 140;
const DIVE_MAX_MS = 420;
/** How quickly a familiar turns to face the way it walks (ms to turn most of the way). */
const TURN_MS = 70;
/** The sprite's feet are its origin (0.78 down); it turns about its middle (0.5 down). */
const PIVOT = 0.78 - 0.5;
/** The pickup squash lasts this many ticks (so it is twice as quick in wall time at 2×). */
const SQUASH_TICKS = 2;
const TAU = Math.PI * 2;
const FRAME_INDEX = Object.fromEntries(FRAME_NAMES.map((n, i) => [n, i])) as Record<
  FrameName,
  number
>;

/**
 * Draws the familiars from the visual model: pooled sprites, a carried cube above the head, a soft
 * and the effects for spawning, picking up, delivering and retiring. It reads state from the
 * model and never touches game state. Per-frame work allocates nothing (frame names are
 * precomputed, positions are plain numbers).
 */
export class FamiliarLayer {
  private readonly entries = new Map<number, Entry>();
  private readonly pool: Entry[] = [];
  /** `frameNames[colorIndex][frameIndex]`: the atlas frame names, built once. */
  private readonly frameNames: string[][];
  private now = 0;
  private tickMs = 42;
  /** Frames left in which new sprites appear without the pop-in (after a rebuild mid-game). */
  private quietFrames = 2;
  private readonly spreader = new CellSpreader();
  /** One baked texture per palette colour for the carried and delivered cube. */
  private readonly cubeKeys: string[];
  /** Counters for the profiler (`?profile=1`): sprites ever created, and the live/pooled counts. */
  readonly stats = { created: 0, peakLive: 0, live: 0 };
  /** Called when a cube lands in the portal: (palette index, group id). */
  onDelivered: (colorIndex: number, group: number) => void = () => undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    private readonly atlas: string,
    private readonly model: VisualModel,
    private readonly tones: readonly CubeTones[],
    private readonly reduced: boolean,
    /** Palette hex colours when colour-blind symbols are on, otherwise null. */
    private readonly symbolPalette: readonly string[] | null = null,
    private readonly emitter: Emitter | null = null,
    private readonly species: Species = "bat",
  ) {
    this.frameNames = tones.map((_, c) => FRAME_NAMES.map((f) => `${c}:${f}`));
    const size = Math.max(4, Math.round(layout.cell * 0.82));
    this.cubeKeys = tones.map((tone, c) =>
      bake(scene, `cube:${c}:${tone.base}:${size}`, size, size, (g) =>
        paintCube(g, 0, 0, size, tone),
      ),
    );
  }

  private get scale(): number {
    return familiarScale(this.layout.cell, this.layout.dpr);
  }

  /** Where a group's familiars come out of and return to: its box's open tray (set by the scene). */
  anchorFor: (group: number) => { x: number; y: number } | null = () => null;

  /**
   * The portal cell is where a familiar's route starts and ends. Going out it is drawn at the tray of
   * its own group's box (or, with no box, at the walkway cell), so the familiars visibly leave the box;
   * coming back with a cube (`home`) it is the hole between the picture and the trays (M15.13).
   */
  private cx(cell: number, group?: number, home = false): number {
    if (cell === this.model.portal) {
      if (home) return this.layout.hole.x;
      return (group === undefined ? null : this.anchorFor(group))?.x ?? this.layout.portal.x;
    }
    return this.layout.boardRect.x + ((cell % this.layout.stride) + 0.5) * this.layout.cell;
  }

  private cy(cell: number, group?: number, home = false): number {
    if (cell === this.model.portal) {
      if (home) return this.layout.hole.y;
      return (group === undefined ? null : this.anchorFor(group))?.y ?? this.layout.portal.y;
    }
    return (
      this.layout.boardRect.y + (Math.floor(cell / this.layout.stride) + 0.5) * this.layout.cell
    );
  }

  /** Ticks at the portal end of every trip (`CollectParams.gate`), walked off the board. */
  gate = 0;
  private readonly ptFrom = { x: 0, y: 0 };
  private readonly ptTo = { x: 0, y: 0 };
  private readonly lanePts = new Array<number>(8).fill(0);
  /** Set by `place`: the last home position asked for was the hole itself. */
  private reachedHole = false;
  /** The lane across the hole of the familiar being placed (`Entry.lane`). */
  private laneX = 0;

  /**
   * Where a familiar at route index `at` on `cell` is drawn, into `out`. Returns false when it must not
   * be seen (its box's tray has not opened yet). On the board it is the cell's centre. During the gate
   * (the first `gate` steps of a route, M15.13), at `cell`, the bottom-edge cell where its route meets
   * the board: going out it climbs straight up from its tray (stepping aside round the hole) to the
   * bottom edge, then along the edge to that cell; coming back, from that cell straight to the hole on
   * a diagonal. Every familiar has its own edge cell, so they spread out instead of queueing on one
   * line. Allocates nothing.
   */
  private place(
    cell: number,
    at: number,
    group: number,
    home: boolean,
    out: { x: number; y: number },
  ): boolean {
    this.reachedHole = false;
    const l = this.layout;
    const bx = l.boardRect.x + ((cell % l.stride) + 0.5) * l.cell;
    const by = l.boardRect.y + (Math.floor(cell / l.stride) + 0.5) * l.cell;
    const gate = this.gate;
    const inGate = gate > 0 ? at <= gate : cell === this.model.portal;
    if (!inGate) {
      out.x = bx;
      out.y = by;
      return true;
    }
    if (home) {
      // From its edge cell to the hole at the walking pace on the board (a cell a tick), however long
      // the gate is, so it never slows down after leaving the board; it arrives early and goes in.
      const hx = l.hole.x + this.laneX;
      const dist = Math.hypot(hx - bx, l.hole.y - by);
      const t = gate > 0 && dist > 0 ? Math.min(1, ((gate - at) * l.cell) / dist) : 1;
      out.x = bx + (hx - bx) * t;
      out.y = by + (l.hole.y - by) * t;
      this.reachedHole = t >= 1;
      return true;
    }
    const tray = this.anchorFor(group);
    if (!tray) {
      out.x = bx;
      out.y = by;
      return false;
    }
    if (gate <= 0) {
      out.x = tray.x;
      out.y = tray.y;
      return true;
    }
    // Straight up from the tray, beside the hole if the tray is right under it, then along the edge.
    const clear = l.hole.rx + l.cell;
    const ux =
      Math.abs(tray.x - l.hole.x) < clear
        ? l.hole.x + (tray.x >= l.hole.x ? clear : -clear)
        : tray.x;
    const pts = this.lanePts;
    pts[0] = tray.x;
    pts[1] = tray.y;
    pts[2] = ux;
    pts[3] = tray.y;
    pts[4] = ux;
    pts[5] = by;
    pts[6] = bx;
    pts[7] = by;
    let total = 0;
    for (let i = 2; i < 8; i += 2)
      total += Math.abs(pts[i]! - pts[i - 2]!) + Math.abs(pts[i + 1]! - pts[i - 1]!);
    let want = total * (Math.min(at, gate) / gate);
    out.x = bx;
    out.y = by;
    for (let i = 2; i < 8; i += 2) {
      const seg = Math.abs(pts[i]! - pts[i - 2]!) + Math.abs(pts[i + 1]! - pts[i - 1]!);
      if (want <= seg) {
        const f = seg > 0 ? want / seg : 1;
        out.x = pts[i - 2]! + (pts[i]! - pts[i - 2]!) * f;
        out.y = pts[i - 1]! + (pts[i + 1]! - pts[i - 1]!) * f;
        break;
      }
      want -= seg;
    }
    return true;
  }

  private acquire(): Entry {
    const reused = this.pool.pop();
    if (reused) {
      reused.img.setVisible(true);
      return reused;
    }
    this.stats.created++;
    const img = this.scene.add
      .image(0, 0, this.atlas, "0:idle0")
      .setOrigin(0.5, 0.78)
      .setDepth(D.sprite);
    const cube = this.scene.add.image(0, 0, this.cubeKeys[0]!).setDepth(D.cube).setVisible(false);
    const chest = this.symbolPalette
      ? this.scene.add
          .image(0, 0, symbolTexture(this.scene, 0))
          .setDepth(D.sprite + 0.2)
          .setVisible(false)
      : null;
    const mark = this.symbolPalette
      ? this.scene.add
          .image(0, 0, symbolTexture(this.scene, 0))
          .setDepth(D.cube + 0.2)
          .setVisible(false)
      : null;
    return {
      img,
      cube,
      chest,
      mark,
      cubeColor: -1,
      retiring: false,
      popping: false,
      drift: { x: 0, y: 0 },
      hoverPhase: 0,
      hoverRate: 1,
      popMs: 140,
      spread: 0,
      liftFromX: 0,
      liftFromY: 0,
      liftUntil: 0,
      squashUntil: 0,
      sink: 0,
      sinkFrom: -1,
      sinkMs: 0,
      joyUntil: 0,
      heading: 0,
      lane: 0,
      sinkX0: 0,
      sinkY0: 0,
      sinkRot0: 0,
    };
  }

  private release(e: Entry): void {
    this.scene.tweens.killTweensOf([e.img, e.cube]);
    e.img.setVisible(false).setScale(1).setAlpha(1).setRotation(0);
    e.cube.setVisible(false).setAlpha(1);
    e.chest?.setVisible(false);
    e.mark?.setVisible(false);
    e.retiring = false;
    e.popping = false;
    e.cubeColor = -1;
    e.liftUntil = 0;
    e.squashUntil = 0;
    e.sink = 0;
    e.sinkFrom = -1;
    e.joyUntil = 0;
    e.heading = 0;
    e.img.setCrop();
    this.pool.push(e);
  }

  /**
   * A tap on the board at `x, y`: the nearest familiar within reach jumps for joy and throws a few
   * sparks (decorative, never changes play). Returns whether one was reached.
   */
  boop(x: number, y: number): boolean {
    const reach = BOOP_REACH_CSS * this.layout.dpr;
    let best: Entry | null = null;
    let bestD = reach;
    for (const [id, e] of this.entries) {
      const v = this.model.familiars.get(id);
      if (e.retiring || e.popping || e.sink > 0 || e.img.alpha === 0 || !v) continue;
      const d = Math.hypot(e.img.x - x, e.img.y - FAMILIAR_H * this.scale * 0.3 - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best || this.now < best.joyUntil) return false;
    if (this.reduced) return true;
    best.joyUntil = this.now + JOY_MS;
    this.emitter?.sparks(
      best.img.x,
      best.img.y - FAMILIAR_H * this.scale * 0.5,
      0xffd426,
      5,
      this.now,
    );
    return true;
  }

  /** Effects driven by events (the model already holds the state). */
  handle(e: CollectEvent): void {
    if (e.type === "cubeDelivered") {
      this.flyCubeIntoPortal(e.color, e.group);
    } else if (e.type === "cubePickedUp") {
      const entry = this.entries.get(e.familiar);
      if (entry && !this.reduced) {
        entry.liftFromX = this.cx(e.cube);
        entry.liftFromY = this.cy(e.cube);
        entry.liftUntil = this.now + this.tickMs * 3;
        entry.squashUntil = this.now + this.tickMs * SQUASH_TICKS;
      }
    }
  }

  /**
   * Per-frame update: place, pose and tint every sprite. `tick` is the engine tick, `alpha` the
   * progress through it, `timeMs` wall time and `tickMs` the current tick length (it shortens at 2×).
   */
  update(tick: number, alpha: number, timeMs: number, tickMs: number): void {
    const dt = Math.max(0, Math.min(100, timeMs - this.now));
    const turn = 1 - Math.exp(-dt / TURN_MS);
    this.now = timeMs;
    this.tickMs = tickMs;
    if (this.emitter) this.emitter.tickMs = tickMs;
    const s = this.scale;
    const cell = this.layout.cell;
    const cubeSize = Math.max(4, Math.round(cell * 0.82));
    const lift = FAMILIAR_H * s * 0.78 + cubeSize * 0.1;
    const quiet = this.quietFrames > 0;
    // Css px walked since the level began by a familiar that never stopped (one cell a tick).
    const walked = (tick + alpha) * (cell / this.layout.dpr);
    // Familiars standing on one cell fan out sideways so none hides another (cosmetic only).
    const spreader = this.spreader;
    spreader.begin();
    for (const v of this.model.familiars.values()) spreader.add(v.id, v.to);
    spreader.finish();
    if (this.model.familiars.size > this.stats.peakLive)
      this.stats.peakLive = this.model.familiars.size;
    let live = 0;
    for (const v of this.model.familiars.values()) {
      let e = this.entries.get(v.id);
      if (!e) {
        e = this.acquire();
        this.entries.set(v.id, e);
        e.drift = drift(v.id);
        const h = hoverOf(v.id);
        e.hoverPhase = h.phase;
        e.hoverRate = h.rate;
        e.popMs = popDuration(v.id);
        e.lane = (h.phase / TAU - 0.5) * this.layout.hole.rx * 0.9;
        e.spread = spreader.offset(v.id);
        if (!this.reduced && !quiet && v.mode !== "retiring") this.popIn(e, s, e.popMs);
      }
      // Position: interpolate along this tick's move, otherwise stand on the cell. Each familiar
      // keeps its own drift off the centre and glides to its share of a crowded cell (cosmetic
      // only; reduced motion keeps it, as it is placement, not motion).
      const moving = v.mode === "walk" || v.mode === "carry";
      // Where it is in its stride: by the distance walked (a cell a tick), so legs keep pace with
      // the ground at any speed; the frame and the gait below both follow it.
      const cycle = strideCycle(this.species, walked, e.hoverPhase / TAU);
      const stride = this.reduced ? 0 : strideFrame(cycle, WALK_FRAMES);
      const frame = this.frameNames[v.colorIndex]![FRAME_INDEX[frameFor(v, tick, stride)]]!;
      if (e.img.frame.name !== frame) e.img.setFrame(frame);
      // Carrying home ends in the hole; the cube goes in with the familiar, which then comes out of
      // its tray again for the next one (it is hidden while it is down the hole).
      const home = v.mode === "carry" || v.mode === "deliver" || v.mode === "retiring";
      this.laneX = e.lane;
      const toSeen = this.place(v.to, v.atTo, v.group, home, this.ptTo);
      const fromSeen = !moving || this.place(v.from, v.atFrom, v.group, home, this.ptFrom);
      e.spread = ease(e.spread, spreader.offset(v.id));
      // Hidden while down the hole, and while its box's tray has not opened yet (nothing comes out
      // of a closed tray).
      const unseen = !toSeen || !fromSeen;
      if (!e.retiring && !e.popping) e.img.setAlpha(unseen ? 0 : 1);
      // Off the walkway (in the lane or the hole) familiars walk single file, without drift.
      const offBoard = (this.gate > 0 && v.atTo <= this.gate) || v.mode === "idle";
      const x = drawnCoord(
        moving ? interpolate(this.ptFrom.x, this.ptTo.x, alpha) : this.ptTo.x,
        offBoard ? 0 : e.drift.x,
        offBoard ? 0 : e.spread,
        cell,
      );
      const y = drawnCoord(
        moving ? interpolate(this.ptFrom.y, this.ptTo.y, alpha) : this.ptTo.y,
        offBoard ? 0 : e.drift.y,
        0,
        cell,
      );
      // Each species moves its own way (`gait.ts`), out of step between familiars; none for reduced
      // motion, and none while it grabs a cube or drops into the hole.
      const g =
        this.reduced || v.mode === "pickup" || v.mode === "deliver"
          ? STILL
          : gait(this.species, moving, cycle, timeMs * e.hoverRate, e.hoverPhase / TAU);
      // A tap's jump for joy: up and back down with a full spin.
      const joy = timeMs < e.joyUntil ? 1 - (e.joyUntil - timeMs) / JOY_MS : -1;
      const jump = joy >= 0 ? -Math.sin(joy * Math.PI) * s * 7 : 0;
      const hover = g.dy * s + jump;
      // Facing (owner request): the head and body point the way it walks, turning smoothly at
      // corners; standing in its tray it faces up, and picking up it keeps the way it came.
      const mx = this.ptTo.x - this.ptFrom.x;
      const my = this.ptTo.y - this.ptFrom.y;
      if (moving && mx * mx + my * my > 0.25)
        e.heading = this.reduced
          ? headingOf(mx, my)
          : turnToward(e.heading, headingOf(mx, my), turn);
      else if (v.mode === "idle") e.heading = turnToward(e.heading, 0, turn);
      // It turns about its middle, not its feet, so turning never shifts where it stands.
      const d = PIVOT * FAMILIAR_H * s;
      const px = x - d * Math.sin(e.heading);
      const py = y + hover - d + d * Math.cos(e.heading);
      e.img.setPosition(px, py);
      if (!e.retiring && !e.popping) {
        e.img.setRotation(e.heading + (joy >= 0 ? joy * Math.PI * 2 : g.rot));
        // Pickup squash: flatten a little and spring back over a couple of ticks (never delays play).
        if (timeMs < e.squashUntil) {
          const b = bump(1 - (e.squashUntil - timeMs) / (this.tickMs * SQUASH_TICKS));
          e.img.setScale(squashX(s, b) / SS, squashY(s, b) / SS);
        } else {
          e.img.setScale((s * g.sx) / SS, (s * g.sy) / SS);
        }
      }
      // Into the hole (M15.13): during its last step the familiar shrinks and sinks below the rim,
      // then its retire finishes the dive; it is seen going in, never just gone.
      // Into the hole: the dive is timed on its own (not by the engine's steps, which at 14 fps left
      // only two or three frames of it), and the familiar is kept until it is all the way in.
      const atHole = home && this.place(v.to, v.atTo, v.group, true, this.ptTo) && this.reachedHole;
      if (
        (v.mode === "deliver" || v.mode === "retiring" || (atHole && v.mode === "carry")) &&
        e.sinkFrom < 0 &&
        !e.popping
      ) {
        // Head first, on at the pace it walked (a cell a tick), from wherever it is now.
        e.sinkFrom = timeMs;
        e.sinkX0 = e.img.x;
        e.sinkY0 = e.img.y;
        e.sinkRot0 = e.img.rotation;
        const end = this.diveEnd(e);
        const dist = Math.hypot(end.x - e.sinkX0, end.y - e.sinkY0);
        e.sinkMs = Math.min(DIVE_MAX_MS, Math.max(DIVE_MIN_MS, (dist * this.tickMs) / cell));
      }
      if (e.sinkFrom >= 0) {
        // Linear: it keeps its walking pace all the way in.
        const k = this.reduced ? 1 : Math.min(1, (timeMs - e.sinkFrom) / e.sinkMs);
        this.sinkTo(e, k);
        if (k >= 1 && e.retiring) {
          this.finishRetire(v.id);
          continue;
        }
      }

      // The carried cube rides above the head from the grab until the drop, rising from its cell.
      if (v.carried !== null && v.mode !== "retiring") {
        if (e.cubeColor !== v.carried) {
          e.cubeColor = v.carried;
          e.cube.setTexture(this.cubeKeys[v.carried]!);
        }
        // Held at the head (from the feet, along the way the head points).
        let cubeX = px + lift * Math.sin(e.heading);
        let cubeY = py - lift * Math.cos(e.heading);
        if (timeMs < e.liftUntil) {
          const k = 1 - (e.liftUntil - timeMs) / (this.tickMs * 3);
          const eased = 1 - (1 - k) * (1 - k);
          cubeX = e.liftFromX + (cubeX - e.liftFromX) * eased;
          cubeY = e.liftFromY + (cubeY - e.liftFromY) * eased;
        }
        // Going into the hole the cube goes in with it, ahead of its head.
        if (e.sinkFrom >= 0) {
          cubeX = e.img.x;
          cubeY = e.img.y + lift * 0.5;
        }
        e.cube
          .setPosition(cubeX, cubeY)
          .setVisible(e.sinkFrom < 0 || (e.img.visible && cubeY < holeFrontY(this.layout.hole)))
          .setScale(v.mode === "pickup" ? 1.15 : 1);
        if (e.mark) this.placeMark(e, v, cubeX, cubeY, cubeSize);
      } else {
        e.cube.setVisible(false);
        e.mark?.setVisible(false);
        e.cubeColor = -1;
      }
      if (e.chest) this.placeChest(e, v, frameFor(v, tick, stride), x, y + hover);
      if (v.mode === "retiring" && !e.retiring) this.retire(v.id, e);
      if (!e.retiring) live++;
    }
    // Sprites whose familiar vanished from the model (restart/undo) are released.
    for (const [id, e] of this.entries) {
      if (!this.model.familiars.has(id)) {
        this.release(e);
        this.entries.delete(id);
      }
    }
    this.stats.live = live;
    if (this.quietFrames > 0) this.quietFrames--;
  }

  /** Colour-blind symbol on the chest, at the frame's badge anchor, following the sprite's current scale. */
  private placeChest(e: Entry, v: FamiliarVisual, frame: FrameName, x: number, y: number): void {
    if (!this.symbolPalette || !e.chest) return;
    const r = badgeRect(frame, this.species);
    const s = e.img.scaleX * SS; // not the target scale: the sprite may be mid pop-in
    // Never smaller than 7 css px: the symbol is the colour cue in colour-blind mode.
    const size = Math.max(Math.min(r.w, r.h) * s * 0.95, 7 * this.layout.dpr);
    e.chest
      .setTexture(symbolTexture(this.scene, v.colorIndex))
      .setTint(hexToNumber(inkFor(this.symbolPalette[v.colorIndex]!)))
      .setPosition(
        x + (r.x + r.w / 2 - FAMILIAR_W / 2) * s,
        y + (r.y + r.h / 2 - FAMILIAR_H * 0.78) * s,
      )
      .setDisplaySize(size, size)
      .setVisible(!e.retiring);
  }

  private placeMark(e: Entry, v: FamiliarVisual, x: number, y: number, cubeSize: number): void {
    if (!this.symbolPalette || !e.mark) return;
    e.mark
      .setTexture(symbolTexture(this.scene, v.colorIndex))
      .setTint(hexToNumber(inkFor(this.symbolPalette[v.colorIndex]!)))
      .setPosition(x, y)
      .setDisplaySize(cubeSize * 0.62, cubeSize * 0.62)
      .setVisible(!e.retiring);
  }

  private popIn(e: Entry, s: number, ms: number): void {
    e.popping = true;
    e.img.setScale((s * 0.2) / SS);
    this.scene.tweens.add({
      targets: e.img,
      scale: s / SS,
      duration: ms,
      ease: "Back.easeOut",
      onComplete: () => {
        e.popping = false;
      },
    });
  }

  private retire(id: number, e: Entry): void {
    e.retiring = true;
    const group = this.model.familiars.get(id)?.group;
    if (this.reduced) {
      this.finishRetire(id);
      return;
    }
    if (e.sinkFrom >= 0) {
      // Going down the hole: `update` finishes the dive and then lets it go.
      e.cube.setVisible(false);
      return;
    }
    this.scene.tweens.add({
      targets: e.img,
      x: this.cx(this.model.portal, group, true),
      y: this.cy(this.model.portal, group, true),
      scale: (this.scale * 0.15) / SS,
      alpha: 0,
      duration: 170,
      ease: "Sine.easeIn",
      onComplete: () => this.finishRetire(id),
    });
  }

  /** Where a dive into the hole ends: in its lane, head down, just past the opening's near edge. */
  private diveEnd(e: Entry): { x: number; y: number } {
    const hole = this.layout.hole;
    const sc = this.diveScale(e, 1);
    return { x: hole.x + e.lane, y: holeFrontY(hole) + (1 - 0.78) * e.img.frame.height * sc + 2 };
  }

  /** The sprite scale `p` of the way into the dive: narrowed to fit the opening early on. */
  private diveScale(e: Entry, p: number): number {
    const base = this.scale / SS;
    const fit = Math.min(1, (this.layout.hole.rx * 1.1) / (e.img.frame.width * base));
    return base * (1 - (1 - fit) * Math.min(1, p * 2.5));
  }

  /**
   * Places a familiar `p` of the way into the hole (M15.13): it goes on from where it began the dive,
   * at its walking pace, turning head down, into its lane of the opening, and everything of it past
   * the opening's near edge is cut off (the hole's front lip is drawn over the rest), until nothing is
   * left. Lanes keep familiars that arrive together from piling up on one spot.
   */
  private sinkTo(e: Entry, p: number): void {
    const hole = this.layout.hole;
    e.sink = Math.min(1, Math.max(0, p));
    const sc = this.diveScale(e, e.sink);
    const end = this.diveEnd(e);
    const x = e.sinkX0 + (end.x - e.sinkX0) * e.sink;
    const y = e.sinkY0 + (end.y - e.sinkY0) * e.sink;
    e.img
      .setScale(sc)
      .setRotation(turnToward(e.sinkRot0, Math.PI, e.sink * 3))
      .setPosition(x, y)
      .setAlpha(1);
    // Head down, texture row r is drawn at y + (0.78 h - r) sc: only rows above the cut show.
    const h = e.img.frame.height;
    const from = Math.max(0, 0.78 * h - (holeFrontY(hole) - y) / sc);
    e.img.setCrop(0, from, e.img.frame.width, Math.max(0, h - from));
    e.img.setVisible(e.sink < 1 && from < h - 0.5);
  }

  private finishRetire(id: number): void {
    const e = this.entries.get(id);
    this.model.remove(id);
    if (e) {
      this.release(e);
      this.entries.delete(id);
    }
  }

  /**
   * A small puff of dust kicked up at the hole's rim as a familiar dives in (M15.13): soft tan specks
   * that drift outward and up and fade. Decorative; none with reduced motion.
   */
  private dust(x: number, y: number): void {
    if (this.reduced) return;
    const hole = this.layout.hole;
    const size = Math.max(3, Math.round(hole.ry * 0.45));
    const key = bake(this.scene, `dust:${size}`, size, size, (g) => {
      g.fillStyle(0xe6c79c, 1);
      g.fillCircle(size / 2, size / 2, size / 2);
    });
    const ms = Math.max(120, 360 * (this.tickMs / 70));
    for (let i = 0; i < DUST_SPECKS; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spread = 0.5 + (0.5 * ((i * 37) % 10)) / 10;
      const puff = this.scene.add
        .image(x + side * hole.rx * 0.5, y, key)
        .setDepth(D.effect)
        .setAlpha(0.85)
        .setScale(0.5);
      this.scene.tweens.add({
        targets: puff,
        x: x + side * hole.rx * (0.9 + spread),
        y: y - hole.ry * (0.8 + spread),
        scale: 1.3,
        alpha: 0,
        duration: ms,
        ease: "Sine.easeOut",
        onComplete: () => puff.destroy(),
      });
    }
  }

  /**
   * A cube is in: the familiar carried it down the hole itself (M15.13), so only a soft puff of dust
   * shows at the rim (no second cube, and no sparks, which fell like stray cubes round the hole).
   */
  private flyCubeIntoPortal(colorIndex: number, group: number): void {
    if (!this.tones[colorIndex] || this.reduced) {
      this.onDelivered(colorIndex, group);
      return;
    }
    this.dust(this.layout.hole.x, this.layout.hole.y);
    this.onDelivered(colorIndex, group);
  }
}
