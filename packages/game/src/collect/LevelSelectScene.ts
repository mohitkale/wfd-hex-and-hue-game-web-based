import Phaser from "phaser";
import { theme } from "../theme";
import { Button } from "../view/Button";
import { fadeIn } from "../view/transition";
import { bake } from "./bake";
import { CollectSpellbookScene } from "./CollectSpellbookScene";
import { computeCollectLayout } from "./collectLayout";
import { levelLine, lineStatus, type LineEntry, type LineStatus } from "./levels";
import { SPECIES, type Species } from "./familiarArt";
import { FAMILIAR_NAMES, readFamiliar, saveFamiliar } from "./familiarChoice";
import { drawFrame, FRAME_H, FRAME_W, type Painter } from "./familiarDraw";
import { readPouch } from "./pouch";
import { TABLE } from "./tableLook";
import { browserStore } from "./v2Spellbook";
import { IdleLoop } from "./idleLoop";
import {
  clampScroll,
  decay,
  mapGeometry,
  scrollToStop,
  stopAt,
  TAP_SLOP_CSS,
  type MapGeometry,
} from "./levelMap";
import { drawDecor, type Decor } from "./mapDecor";

/** The map's sky: deep midnight at the far end, a violet dusk where the journey starts. */
const SKY = { top: 0x120a2a, bottom: 0x3a1f5e } as const;
/** Radius of a level stop, css px. */
const STOP_R_CSS = 26;
/** How long the twinkles and glows play after the last touch before the screen rests (ms). */
const AMBIENT_MS = 4000;
/** The landmarks along each chapter of the journey. */
const CHAPTER_DECOR: readonly (readonly Decor[])[] = [
  ["candle", "twinkle", "moon"],
  ["toadstool", "potion", "twinkle"],
  ["crystal", "twinkle", "crystal"],
  ["moon", "twinkle", "moon"],
  ["toadstool", "candle", "moon"],
  ["candle", "potion", "crystal"],
];
/** The ring a Hard or Extreme stop wears. */
const CHALLENGE_RING = { hard: 0xb06cff, extreme: 0xff5a4a } as const;

/**
 * The v2 home screen (M15.13): the level map, a night sky the player drags (or scrolls) through, with
 * every level as a stop on a winding trail of stepping stones from the first level at the bottom up to
 * the last: cleared stops are gold coins, the next one glows with the chosen familiar beside it, and
 * later ones are stone and locked until the one before is cleared; Hard and Extreme stops wear their
 * colour. Below it, on a wooden shelf, the familiar picker, today's daily, the Spellbook and the Grimoire. A win
 * leads here, and the player picks what to play next.
 */
export class LevelSelectScene extends Phaser.Scene {
  /** Stops drawing once nothing has moved for a while (the map only moves when dragged). */
  private idle: IdleLoop | null = null;
  /** The camera that shows the map, scrolled by dragging; the rest is drawn by the main camera. */
  private mapCam: Phaser.Cameras.Scene2D.Camera | null = null;
  private map: {
    geo: MapGeometry;
    view: { x: number; y: number; w: number; h: number };
    stops: Phaser.GameObjects.Image[];
    line: LineEntry[];
    status: LineStatus[];
  } | null = null;
  private scrollY = 0;
  /** Flick speed (px per ms) after a drag, slowing down by itself. */
  private flick = 0;
  private drag: {
    startY: number;
    startScroll: number;
    moved: number;
    lastY: number;
    lastT: number;
  } | null = null;
  /** The twinkles and glows play for a while after the last touch, then the screen rests. */
  private ambientUntil = 0;

  constructor() {
    super("collect-levels");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(SKY.top);
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.input.on("pointerdown", this.onDown, this);
    this.input.on("pointermove", this.onMove, this);
    this.input.on("pointerup", this.onUp, this);
    this.input.on("wheel", this.onWheel, this);
    this.layout();
    fadeIn(this);
    this.ambientUntil = this.time.now + AMBIENT_MS;
    this.idle = new IdleLoop(
      this.game,
      () => this.drag !== null || this.flick !== 0 || this.time.now < this.ambientUntil,
    );
    this.events.once("shutdown", () => {
      this.idle?.destroy();
      this.idle = null;
      this.input.setDefaultCursor("default");
    });
  }

  override update(time: number, delta: number): void {
    if (!this.drag && this.flick !== 0 && this.map) {
      const before = this.scrollY;
      this.setScroll(this.scrollY + this.flick * delta);
      this.flick = decay(this.flick, delta);
      // Stopped by the end of the map, or slow enough to rest.
      if (this.scrollY === before || Math.abs(this.flick) < 0.01) this.flick = 0;
    }
    this.idle?.frame(time);
  }

  private setScroll(y: number): void {
    if (!this.map || !this.mapCam) return;
    this.scrollY = clampScroll(y, this.map.geo.height, this.map.view.h);
    this.mapCam.setScroll(0, this.scrollY);
  }

  private inMap(p: Phaser.Input.Pointer): boolean {
    const v = this.map?.view;
    return !!v && p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    this.ambientUntil = this.time.now + AMBIENT_MS;
    if (!this.inMap(p)) return;
    this.flick = 0;
    this.drag = {
      startY: p.y,
      startScroll: this.scrollY,
      moved: 0,
      lastY: p.y,
      lastT: this.time.now,
    };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || !p.isDown) {
      this.hover(p);
      return;
    }
    this.ambientUntil = this.time.now + AMBIENT_MS;
    d.moved = Math.max(d.moved, Math.abs(p.y - d.startY));
    this.setScroll(d.startScroll - (p.y - d.startY));
    const now = this.time.now;
    const dt = Math.max(1, now - d.lastT);
    // The flick speed follows the last moves, smoothed.
    this.flick = this.flick * 0.6 + ((d.lastY - p.y) / dt) * 0.4;
    d.lastY = p.y;
    d.lastT = now;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.map) return;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    if (d.moved >= TAP_SLOP_CSS * dpr) {
      // Let go after a drag: it glides on, unless the finger had stopped.
      if (this.time.now - d.lastT > 80) this.flick = 0;
      return;
    }
    this.flick = 0;
    const { geo, view } = this.map;
    const i = stopAt(
      geo,
      { x: p.x - view.x, y: p.y - view.y + this.scrollY },
      STOP_R_CSS * dpr * 1.6,
    );
    if (i < 0) return;
    if (this.map.status[i] === "locked") this.nudge(i);
    else this.play(this.map.line[i]!.key);
  }

  /** A pointer over a stop that can be played shows the hand cursor (owner feedback). */
  private hover(p: Phaser.Input.Pointer): void {
    let playable = false;
    if (this.map && this.inMap(p)) {
      const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
      const { geo, view, status } = this.map;
      const i = stopAt(
        geo,
        { x: p.x - view.x, y: p.y - view.y + this.scrollY },
        STOP_R_CSS * dpr * 1.6,
      );
      playable = i >= 0 && status[i] !== "locked";
    }
    this.input.setDefaultCursor(playable ? "pointer" : "default");
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void {
    this.ambientUntil = this.time.now + AMBIENT_MS;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    this.flick = 0;
    this.setScroll(this.scrollY + dy * dpr);
  }

  /** A locked stop shakes its head: the one before it has to be cleared first. */
  private nudge(i: number): void {
    const stop = this.map?.stops[i];
    if (!stop) return;
    const x = stop.x;
    this.tweens.add({
      targets: stop,
      x: { from: x - 6, to: x + 6 },
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => stop.setX(x),
    });
  }

  private layout(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    if (this.mapCam) this.cameras.remove(this.mapCam);
    this.mapCam = null;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as
      { top: number; right: number; bottom: number; left: number } | undefined) ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const { width, height } = this.scale.gameSize;
    const frame = computeCollectLayout({
      width,
      height,
      dpr,
      insets,
      boardWidth: 10,
      boardHeight: 10,
      slots: 1,
      columns: 1,
      fieldCap: 1,
      portalX: 4,
    }).frame;
    const cx = frame.x + frame.w / 2;
    const pouch = readPouch(browserStore()).pouch;
    const line = levelLine();
    const status = lineStatus(line, new Set(pouch.paid));
    const next = Math.max(0, status.indexOf("open"));
    const cleared = status.filter((s) => s === "done").length;

    // The header: the name in gold over the night sky, then coins and progress.
    this.add
      .text(cx, frame.y + 30 * dpr, "Hex & Hue", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(28 * dpr)}px`,
        color: "#ffd98a",
        stroke: "#3a1d6e",
        strokeThickness: Math.round(4 * dpr),
      })
      .setOrigin(0.5)
      .setShadow(0, 2 * dpr, "#000000", 6 * dpr, false, true);
    this.add
      .text(cx, frame.y + 64 * dpr, `✦ ${pouch.coins}     ★ ${cleared} of ${line.length} cleared`, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(13 * dpr)}px`,
        color: "#e9dcff",
      })
      .setOrigin(0.5);

    const header = 88 * dpr;
    const footer = (8 + 96 + 60) * dpr;
    const view = { x: frame.x, y: frame.y + header, w: frame.w, h: frame.h - header - footer };
    const geo = mapGeometry(line.length, view.w, dpr);
    const R = STOP_R_CSS * dpr;

    // Everything below belongs to the map (its own camera, scrolled by dragging).
    const world: Phaser.GameObjects.GameObject[] = [];
    const W = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      world.push(o);
      return o;
    };
    const rng = mulberry(17);

    // The sky: midnight at the far end of the journey, dusk where it starts, with soft glows and stars.
    const sky = W(this.add.graphics());
    sky.fillGradientStyle(SKY.top, SKY.top, SKY.bottom, SKY.bottom, 1);
    sky.fillRect(0, 0, view.w, geo.height);
    for (let y = 0; y < geo.height; y += 260 * dpr) {
      const x = rng() * view.w;
      sky.fillStyle(rng() < 0.5 ? 0x7a3fd0 : 0x2f8fa8, 0.08);
      sky.fillCircle(x, y + rng() * 200 * dpr, (90 + rng() * 80) * dpr);
    }
    const stars = W(this.add.graphics());
    const starCount = Math.round((view.w * geo.height) / (2600 * dpr * dpr));
    for (let i = 0; i < starCount; i++) {
      stars.fillStyle(0xffffff, 0.25 + rng() * 0.55);
      stars.fillCircle(rng() * view.w, rng() * geo.height, (0.6 + rng() * 1.1) * dpr);
    }
    // A few stars twinkle.
    const twinkle = bake(this, `map-twinkle:${dpr}`, 12 * dpr, 12 * dpr, (g) => {
      const c = 6 * dpr;
      g.fillStyle(0xfff4c8, 1);
      g.fillTriangle(c - dpr, c, c + dpr, c, c, 0);
      g.fillTriangle(c - dpr, c, c + dpr, c, c, 2 * c);
      g.fillTriangle(c, c - dpr, c, c + dpr, 0, c);
      g.fillTriangle(c, c - dpr, c, c + dpr, 2 * c, c);
    });
    for (let i = 0; i < Math.round(starCount / 12); i++) {
      const t = W(this.add.image(rng() * view.w, rng() * geo.height, twinkle).setAlpha(0.2));
      this.tweens.add({
        targets: t,
        alpha: 0.95,
        scale: 1.3,
        duration: 900 + rng() * 900,
        delay: rng() * 1500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Landmarks between the stops, on the side the path swings away from.
    const decor = W(this.add.graphics());
    for (let i = 0; i < line.length; i++) {
      const t = i + 0.5;
      const p = geo.pathAt(t);
      // Near the screen's edge, clear of the path and the names under the stops.
      const margin = (26 + rng() * 22) * dpr;
      const x = p.x > view.w / 2 ? margin : view.w - margin;
      const kinds = CHAPTER_DECOR[(line[i]!.chapter - 1) % CHAPTER_DECOR.length]!;
      drawDecor(decor, kinds[i % kinds.length]!, x, p.y + 16 * dpr, (30 + rng() * 14) * dpr);
    }

    // The trail: a soft glowing ribbon, then stepping stones, gold up to the next level.
    const trail = W(this.add.graphics());
    const steps = Math.max(2, (line.length - 1) * 24);
    const end = line.length - 1;
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k <= steps; k++) pts.push(geo.pathAt((k / steps) * end));
    for (const [w, a] of [
      [26, 0.05],
      [12, 0.06],
    ] as const) {
      trail.lineStyle(w * dpr, 0xffffff, a);
      trail.beginPath();
      pts.forEach((q, k) => (k === 0 ? trail.moveTo(q.x, q.y) : trail.lineTo(q.x, q.y)));
      trail.strokePath();
    }
    let since = Infinity;
    const stone = 15 * dpr;
    for (let k = 1; k <= steps; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      since += Math.hypot(b.x - a.x, b.y - a.y);
      if (since < stone) continue;
      since = 0;
      const t = (k / steps) * end;
      const lit = t <= next;
      trail.fillStyle(lit ? 0xffd27a : 0xa99bd6, lit ? 0.95 : 0.4);
      trail.fillEllipse(b.x, b.y, 7 * dpr, 5 * dpr);
    }

    // The stops.
    const stops: Phaser.GameObjects.Image[] = [];
    line.forEach((entry, i) => {
      const s = status[i]!;
      const p = geo.stops[i]!;
      const ring = entry.challenge ? CHALLENGE_RING[entry.challenge] : null;
      if (s === "open") {
        // The next level glows and breathes.
        const aura = W(this.add.image(p.x, p.y, glowTexture(this, R, ring ?? 0xffd27a)));
        this.tweens.add({
          targets: aura,
          scale: { from: 0.9, to: 1.15 },
          alpha: { from: 0.9, to: 0.45 },
          duration: 1100,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
      const stop = W(this.add.image(p.x, p.y, stopTexture(this, s, ring, R, dpr)));
      if (s === "open") stop.setScale(1.18);
      stops.push(stop);
      W(
        this.add
          .text(
            p.x,
            p.y + (s === "locked" ? 0 : -1 * dpr),
            s === "done" ? "✓" : s === "open" ? String(i + 1) : "",
            {
              fontFamily: theme.font,
              fontStyle: "bold",
              fontSize: `${Math.round(R * (s === "done" ? 0.95 : 0.85))}px`,
              color: s === "open" ? "#4a1f86" : "#6b3f08",
            },
          )
          .setOrigin(0.5),
      );
      if (entry.challenge) {
        W(
          this.add
            .text(
              p.x,
              p.y - R * (s === "open" ? 1.18 : 1) - 4 * dpr,
              entry.challenge === "hard" ? "HARD" : "EXTREME",
              {
                fontFamily: theme.font,
                fontStyle: "bold",
                fontSize: `${Math.round(9 * dpr)}px`,
                color: "#ffffff",
                backgroundColor: entry.challenge === "hard" ? "#8a3fd6" : "#d2342b",
                padding: { x: Math.round(5 * dpr), y: Math.round(2 * dpr) },
              },
            )
            .setOrigin(0.5, 1)
            .setAlpha(s === "locked" ? 0.6 : 1),
        );
      }
      // The name on a little plaque under the stop.
      const label = W(
        this.add
          .text(p.x, p.y + R * (s === "open" ? 1.18 : 1) + 12 * dpr, `${i + 1}. ${entry.name}`, {
            fontFamily: theme.font,
            fontStyle: s === "open" ? "bold" : "normal",
            fontSize: `${Math.round((s === "open" ? 13 : 12) * dpr)}px`,
            color: s === "locked" ? "#a99bd6" : s === "open" ? "#ffe6a6" : "#f3ead8",
          })
          .setOrigin(0.5)
          .setDepth(1),
      );
      const plaque = W(this.add.graphics());
      const pw = label.width + 16 * dpr;
      const ph = label.height + 6 * dpr;
      plaque.fillStyle(0x140b2e, s === "locked" ? 0.45 : 0.7);
      plaque.fillRoundedRect(label.x - pw / 2, label.y - ph / 2, pw, ph, ph / 2);
      if (s === "open") {
        plaque.lineStyle(1.5 * dpr, 0xffd27a, 0.9);
        plaque.strokeRoundedRect(label.x - pw / 2, label.y - ph / 2, pw, ph, ph / 2);
      }
      if (i === next && s === "open") {
        // The chosen familiar waits beside the next level, hopping on the spot.
        const species = readFamiliar(browserStore()) ?? "bat";
        const side = p.x > view.w / 2 ? -1 : 1;
        const pet = W(
          this.add.image(p.x + side * R * 2, p.y + 4 * dpr, familiarPreview(this, species)),
        );
        pet.setScale((R * 1.5) / pet.width);
        this.tweens.add({
          targets: pet,
          y: p.y - 4 * dpr,
          duration: 520,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    });

    // The far end and the start of the journey.
    const top = geo.stops[end]!.y - 92 * dpr;
    drawDecor(decor, "moon", view.w / 2, top + 6 * dpr, 44 * dpr);
    W(
      this.add
        .text(view.w / 2, top + 26 * dpr, "More spells are brewing…", {
          fontFamily: theme.font,
          fontStyle: "italic",
          fontSize: `${Math.round(13 * dpr)}px`,
          color: "#cbbcf2",
        })
        .setOrigin(0.5),
    );
    // A ribbon across the trail where each chapter begins.
    line.forEach((entry, i) => {
      if (i > 0 && line[i - 1]!.chapter === entry.chapter) return;
      const y = i === 0 ? geo.stops[0]!.y + R + 46 * dpr : geo.pathAt(i - 0.5).y;
      const label = W(
        this.add
          .text(view.w / 2, y, `CHAPTER ${entry.chapter} · ${entry.chapterName.toUpperCase()}`, {
            fontFamily: theme.font,
            fontStyle: "bold",
            fontSize: `${Math.round(12 * dpr)}px`,
            color: "#ffe6a6",
          })
          .setOrigin(0.5)
          .setDepth(2),
      );
      const band = W(this.add.graphics().setDepth(1));
      const w = label.width + 36 * dpr;
      const h = label.height + 12 * dpr;
      band.fillStyle(0x000000, 0.25);
      band.fillRoundedRect(view.w / 2 - w / 2, y - h / 2 + 3 * dpr, w, h, 6 * dpr);
      band.fillStyle(0x5a2a9c, 1);
      band.fillRoundedRect(view.w / 2 - w / 2, y - h / 2, w, h, 6 * dpr);
      band.lineStyle(1.5 * dpr, 0xffd27a, 0.9);
      band.strokeRoundedRect(
        view.w / 2 - w / 2 + 3 * dpr,
        y - h / 2 + 3 * dpr,
        w - 6 * dpr,
        h - 6 * dpr,
        4 * dpr,
      );
      // Swallowtail ends.
      for (const side of [-1, 1]) {
        const x = view.w / 2 + side * (w / 2 + 2 * dpr);
        band.fillStyle(0x3d1a6e, 1);
        band.fillTriangle(
          x,
          y - h / 2 + 4 * dpr,
          x + side * 14 * dpr,
          y - h / 2 + 4 * dpr,
          x,
          y + h / 2 + 4 * dpr,
        );
        band.fillTriangle(
          x,
          y + h / 2 + 4 * dpr,
          x + side * 14 * dpr,
          y + h / 2 + 4 * dpr,
          x + side * 7 * dpr,
          y + 4 * dpr,
        );
      }
    });

    // Edges: the sky fades into the header above and lies in the shelf's shadow below.
    const edges = W(this.add.graphics().setScrollFactor(0).setDepth(5));
    const fade = 26 * dpr;
    edges.fillGradientStyle(SKY.top, SKY.top, SKY.top, SKY.top, 1, 1, 0, 0);
    edges.fillRect(0, 0, view.w, fade);
    edges.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.35, 0.35);
    edges.fillRect(0, view.h - fade, view.w, fade);

    // The map's camera, opened on the next level.
    const cam = this.cameras.add(view.x, view.y, view.w, view.h);
    this.mapCam = cam;
    this.map = { geo, view, stops, line, status };
    this.cameras.main.ignore(world);
    cam.ignore(this.children.list.filter((o) => !world.includes(o)));
    this.flick = 0;
    this.setScroll(scrollToStop(geo, next, view.h));

    // The shelf: wood, like the table the game is played on, holding the picker and the buttons.
    const shelfTop = frame.y + frame.h - footer;
    const shelf = this.add.graphics();
    shelf.fillStyle(TABLE.shadow, 0.35);
    shelf.fillRoundedRect(frame.x, shelfTop - 2 * dpr, frame.w, footer + 40 * dpr, 18 * dpr);
    shelf.fillStyle(TABLE.wood, 1);
    shelf.fillRoundedRect(frame.x, shelfTop, frame.w, footer + 40 * dpr, 18 * dpr);
    shelf.fillStyle(0xffffff, 0.35);
    shelf.fillRect(frame.x + 18 * dpr, shelfTop + 2 * dpr, frame.w - 36 * dpr, 2 * dpr);
    cam.ignore(shelf);

    const before = this.children.list.length;
    this.drawPicker(frame, shelfTop + 6 * dpr, 96 * dpr, dpr);
    const by = shelfTop + (8 + 96 + 30) * dpr;
    // Three doors on the shelf: today's daily, the Spellbook and the Grimoire (v3, on the site).
    const gap = 8 * dpr;
    const third = (frame.w - 48 * dpr - 2 * gap) / 3;
    const doors: [string, () => void][] = [
      ["Daily", () => this.play("daily")],
      ["Spellbook", () => this.openSpellbook()],
      ["Grimoire", () => window.location.assign("/grimoire/")],
    ];
    doors.forEach(([label, onPress], i) => {
      const x = cx + (i - 1) * (third + gap);
      this.add.existing(new Button(this, x, by, third, label, { dpr, onPress }));
    });
    cam.ignore(this.children.list.slice(before));
  }

  /** "Your familiar": one tile per species, the chosen one ringed; a tap chooses (and remembers) it. */
  private drawPicker(frame: { x: number; w: number }, top: number, h: number, dpr: number): void {
    const chosen = readFamiliar(browserStore()) ?? "bat";
    const cx = frame.x + frame.w / 2;
    this.add
      .text(cx, top + 12 * dpr, "Your familiar", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(14 * dpr)}px`,
        color: TABLE.ink,
      })
      .setOrigin(0.5);
    const n = SPECIES.length;
    const gap = 6 * dpr;
    const tile = Math.min(58 * dpr, (frame.w - 32 * dpr - (n - 1) * gap) / n);
    const x0 = cx - ((n - 1) * (tile + gap)) / 2;
    const y = top + 26 * dpr + tile / 2;
    SPECIES.forEach((species, i) => {
      const x = x0 + i * (tile + gap);
      const on = species === chosen;
      // The chosen tile is unmistakable: a thick purple ring with a gold edge, a warm fill, a little
      // larger, with a tick; the others are dimmed.
      const ring = Math.max(3, Math.round(4 * dpr));
      const card = bake(this, `pick-card:${on}:${Math.round(tile)}`, tile, tile, (g) => {
        if (on) {
          g.fillStyle(0x5a2a9c, 1);
          g.fillRoundedRect(0, 0, tile, tile, tile * 0.2);
          g.fillStyle(0xffd426, 1);
          g.fillRoundedRect(ring, ring, tile - 2 * ring, tile - 2 * ring, tile * 0.17);
          g.fillStyle(0xfff3c4, 1);
          g.fillRoundedRect(
            ring * 1.7,
            ring * 1.7,
            tile - 3.4 * ring,
            tile - 3.4 * ring,
            tile * 0.15,
          );
        } else {
          g.fillStyle(0xead8c0, 1);
          g.fillRoundedRect(0, 0, tile, tile, tile * 0.2);
          g.fillStyle(0xffffff, 1);
          g.fillRoundedRect(2 * dpr, 2 * dpr, tile - 4 * dpr, tile - 4 * dpr, tile * 0.17);
        }
      });
      const grow = on ? 1.12 : 1;
      const dim = on ? 1 : 0.62;
      this.add
        .image(x, y, card)
        .setScale(grow)
        .setAlpha(on ? 1 : 0.9);
      const face = this.add.image(x, y - 4 * dpr, familiarPreview(this, species));
      face.setScale((tile * 0.8 * grow) / face.width).setAlpha(dim);
      this.add
        .text(x, y + (tile * grow) / 2 - 9 * dpr, FAMILIAR_NAMES[species], {
          fontFamily: theme.font,
          fontStyle: on ? "bold" : "normal",
          fontSize: `${Math.round(10 * dpr)}px`,
          color: on ? "#3b1a6b" : TABLE.ink,
        })
        .setOrigin(0.5)
        .setAlpha(on ? 1 : 0.75);
      if (on) {
        const r = 9 * dpr;
        const bx = x + (tile * grow) / 2 - r * 0.6;
        const by = y - (tile * grow) / 2 + r * 0.6;
        this.add.circle(bx, by, r, 0x1f9e4a).setStrokeStyle(2 * dpr, 0xffffff);
        this.add
          .text(bx, by, "✓", {
            fontFamily: theme.font,
            fontStyle: "bold",
            fontSize: `${Math.round(12 * dpr)}px`,
            color: "#ffffff",
          })
          .setOrigin(0.5);
      }
      this.add
        .zone(x, y, tile, tile)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          saveFamiliar(browserStore(), species);
          this.registry.set("v2.familiar", species);
          this.layout();
        });
    });
  }

  private play(key: string): void {
    this.registry.set("v2.level", key);
    // The loop may be asleep (nothing moves here): starting a scene needs it running.
    this.idle?.wake();
    this.scene.start("collect");
  }

  private openSpellbook(): void {
    if (!this.scene.get("collect-spellbook"))
      this.scene.add("collect-spellbook", CollectSpellbookScene, false);
    this.scene.start("collect-spellbook");
  }
}

/** A picker tile's picture of `species`: its idle frame in purple, drawn once per species. */
function familiarPreview(scene: Phaser.Scene, species: Species): string {
  const key = `pick:${species}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, FRAME_W, FRAME_H);
  if (!tex) return key;
  drawFrame(tex.getContext() as unknown as Painter, "idle0", "#9a4ee0", species);
  tex.refresh();
  return key;
}

/** A small seeded random source, so the sky looks the same every visit. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stop's medallion: a gold coin (cleared), bright gold (next) or a locked stone, ringed in `ring` if given. */
function stopTexture(
  scene: Phaser.Scene,
  s: LineStatus,
  ring: number | null,
  r: number,
  dpr: number,
): string {
  const size = Math.ceil(2 * r + 8 * dpr);
  const c = size / 2;
  return bake(scene, `map-stop:${s}:${ring ?? "-"}:${Math.round(r)}`, size, size, (g) => {
    const look = {
      done: { edge: 0xfff0c0, fill: 0xf2b632, shine: 0xffe08a },
      open: { edge: 0xffffff, fill: 0xffd426, shine: 0xfff3a0 },
      locked: { edge: 0x8a7fb5, fill: 0x3d3363, shine: 0x4a3f75 },
    }[s];
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(c, c + 3 * dpr, r);
    g.fillStyle(ring ?? look.edge, s === "locked" && ring ? 0.75 : 1);
    g.fillCircle(c, c, r);
    const inner = r - (ring ? 4.5 : 3) * dpr;
    g.fillStyle(look.fill, 1);
    g.fillCircle(c, c, inner);
    g.fillStyle(look.shine, 0.8);
    g.fillCircle(c - inner * 0.22, c - inner * 0.26, inner * 0.62);
    g.fillStyle(look.fill, 1);
    g.fillCircle(c + inner * 0.08, c + inner * 0.1, inner * 0.62);
    if (s === "locked") {
      // A padlock.
      const w = r * 0.7;
      const h = r * 0.5;
      g.lineStyle(r * 0.14, 0xb4a8e0, 1);
      g.beginPath();
      g.arc(c, c - h * 0.15, w * 0.32, Math.PI, 0, false);
      g.strokePath();
      g.fillStyle(0xb4a8e0, 1);
      g.fillRoundedRect(c - w / 2, c - h * 0.15, w, h, r * 0.1);
      g.fillStyle(0x3d3363, 1);
      g.fillCircle(c, c + h * 0.25, r * 0.08);
    }
  });
}

/** The soft glow round the next level's stop. */
function glowTexture(scene: Phaser.Scene, r: number, color: number): string {
  const size = Math.ceil(r * 4);
  return bake(scene, `map-glow:${color}:${Math.round(r)}`, size, size, (g) => {
    for (let k = 10; k >= 1; k--) {
      g.fillStyle(color, 0.05);
      g.fillCircle(size / 2, size / 2, r * 0.9 + (k / 10) * r * 1.1);
    }
  });
}
