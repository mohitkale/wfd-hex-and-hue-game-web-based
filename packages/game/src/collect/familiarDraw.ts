import {
  FAMILIAR_H,
  FAMILIAR_W,
  FIXED,
  SS,
  WALK_FRAMES,
  palette,
  type FrameName,
  type Rgb,
  type Species,
} from "./familiarArt";

/**
 * Draws one familiar frame as smooth vector shapes into a 2D canvas context (v2.0.0 look). The
 * drawing is in texture pixels (`FRAME_W` x `FRAME_H`, the sprite's 16 x 14 units times `SS`); the
 * frame is centred on x = 32 with the feet on y = 50. It talks to a small `Painter` interface (a
 * canvas context satisfies it), so tests can record the calls without a browser.
 *
 * Every species faces the player and is left-right symmetric (the cat's tail aside), so a familiar
 * reads the same whichever way it flies or trots. Each is a single colour, the cube's: body, ears,
 * wings, limbs and tail all share it (with a deeper outline); only the eyes (white with a dark pupil)
 * and the delivery sparkles contrast.
 */

/** Lowest point (texture px, standing) of each species' eyes (the only face): the colour-blind badge sits below it. */
export const FACE_BOTTOM_PX = { bat: 32, cat: 31, ant: 30, owl: 31, frog: 28, spider: 31 } as const;

export const FRAME_W = FAMILIAR_W * SS;
export const FRAME_H = FAMILIAR_H * SS;

export interface Gradient {
  addColorStop(offset: number, color: string): void;
}

export interface Painter {
  fillStyle: string | Gradient;
  strokeStyle: string;
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "round" | "bevel" | "miter";
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  fill(): void;
  stroke(): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient;
}

const TAU = Math.PI * 2;

/** What one frame shows: the wings or tail, the limbs, how crouched, and sparkles. */
interface Pose {
  /** Wings (bat) or tail swish (cat): 1 up, 0 level, -1 down. */
  flap: number;
  /** Wings tucked behind the body (picking up). */
  tuck?: boolean;
  limbs: "none" | "walk" | "v" | "toss" | "reach";
  /** Pixels the body sinks (crouching). */
  crouch: number;
  sparkle?: boolean;
  /** Which beat of a walk or idle: nudges the body a little. */
  bob: number;
  /** Walking and carrying: how far through one stride this frame is (0..1); the legs follow it. */
  phase?: number;
}

/**
 * One stride drawn as `WALK_FRAMES` frames (M15.13, owner request: a natural walk): the wings or tail
 * follow the cosine of the stride and the legs its sine, so the feet step left, right, left as the
 * frames play in turn. Walking and carrying share the legs; carrying holds the cube up in a V.
 */
function stride(kind: "walk" | "carry"): Record<string, Pose> {
  const out: Record<string, Pose> = {};
  for (let k = 0; k < WALK_FRAMES; k++) {
    // Each frame shows the middle of its share of the stride (the share `strideFrame` shows it for).
    const phase = (k + 0.5) / WALK_FRAMES;
    out[`${kind}${k}`] = {
      flap: Math.cos(phase * TAU),
      limbs: kind === "walk" ? "walk" : "v",
      crouch: 0,
      bob: 0,
      phase,
    };
  }
  return out;
}

export const POSES = {
  idle0: { flap: 1, limbs: "none", crouch: 0, bob: 0 },
  idle1: { flap: -1, limbs: "none", crouch: 0, bob: 1 },
  ...stride("walk"),
  ...stride("carry"),
  pickup: { flap: 0, tuck: true, limbs: "reach", crouch: 5, bob: 0 },
  deliver: { flap: 1, limbs: "toss", crouch: 0, bob: 0, sparkle: true },
} as Record<FrameName, Pose>;

/** The sine of the stride (-1..1; 0 when not walking): which side's legs are lifted, and how far. */
const step = (pose: Pose): number => (pose.phase === undefined ? 0 : Math.sin(pose.phase * TAU));

/** The owl's beak: warm, and apart from the delivery sparkle's glow colour. */
const BEAK: Rgb = [240, 158, 64];

const css = (c: Rgb, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const CX = FRAME_W / 2;

interface Tones {
  outline: Rgb;
  mid: Rgb;
  light: Rgb;
  dark: Rgb;
}

function ellipse(p: Painter, x: number, y: number, rx: number, ry: number): void {
  p.beginPath();
  p.ellipse(x, y, rx, ry, 0, 0, TAU);
}

/** Fills the current path, then outlines it. */
function paint(p: Painter, fill: string | Gradient, line: Rgb | null, width = 2): void {
  p.fillStyle = fill;
  p.fill();
  if (line) {
    p.strokeStyle = css(line);
    p.lineWidth = width;
    p.stroke();
  }
}

function polygon(p: Painter, pts: readonly [number, number][]): void {
  p.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
}

/** One thick line with rounded ends (an arm, a tail), outlined by a wider dark one. */
function limb(
  p: Painter,
  from: [number, number],
  ctrl: [number, number],
  to: [number, number],
  width: number,
  t: Tones,
): void {
  p.lineCap = "round";
  for (const [w, c] of [
    [width + 3, t.outline],
    [width, t.mid],
  ] as const) {
    p.beginPath();
    p.moveTo(from[0], from[1]);
    p.quadraticCurveTo(ctrl[0], ctrl[1], to[0], to[1]);
    p.strokeStyle = css(c);
    p.lineWidth = w;
    p.stroke();
  }
}

function sparkle(p: Painter, x: number, y: number, r: number): void {
  p.beginPath();
  p.moveTo(x, y - r);
  p.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
  p.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
  p.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
  p.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
  paint(p, css(FIXED.glow), null);
}

/** Two arms: raised in a V (carrying), thrown up (delivering) or reaching down (picking up). */
function arms(p: Painter, pose: Pose, dy: number, t: Tones): void {
  const sx = 12;
  const y = 36 + dy;
  const hands: Record<string, [[number, number], [number, number]]> = {
    v: [
      [15, 20 + dy],
      [20, 26 + dy],
    ],
    toss: [
      [18, 6 + dy],
      [20, 20 + dy],
    ],
    reach: [
      [20, 51],
      [22, 44],
    ],
  };
  const spec = hands[pose.limbs];
  if (!spec) return;
  const [tip, ctrl] = spec;
  for (const side of [-1, 1]) {
    const x = CX + side * sx * 0.9;
    limb(
      p,
      [x, y],
      [CX + side * (CX - ctrl[0]), ctrl[1]],
      [CX + side * (CX - tip[0]), tip[1]],
      4,
      t,
    );
    if (pose.sparkle) sparkle(p, CX + side * (CX - tip[0]), tip[1] - 2, 4.5);
  }
}

/** Feet: two small ovals; walking, each lifts in turn (the other one is on the ground). */
function feet(p: Painter, pose: Pose, dy: number, t: Tones): void {
  const walking = pose.phase !== undefined;
  const spread = pose.limbs === "reach" ? 9 : walking ? 6 : 5;
  const s = step(pose);
  for (const side of [-1, 1]) {
    const lift = walking ? Math.max(0, s * side) * 4 : 0;
    ellipse(p, CX + side * spread, 48 + dy - lift, 4.2, 2.8);
    paint(p, css(t.mid), t.outline, 1.6);
  }
}

function eyes(p: Painter, y: number, dx: number, rx: number, ry: number): void {
  for (const s of [-1, 1]) {
    ellipse(p, CX + s * dx, y, rx, ry);
    paint(p, css(FIXED.eyeWhite), null);
    ellipse(p, CX + s * dx + 0.6, y + 1, rx * 0.55, ry * 0.62);
    paint(p, css(FIXED.pupil), null);
    ellipse(p, CX + s * dx - 0.2, y - 0.8, rx * 0.2, rx * 0.2);
    paint(p, "#ffffff", null);
  }
}

// ---------------------------------------------------------------------------------------------
// Bat
// ---------------------------------------------------------------------------------------------

/** One wing (the right one; the left is the mirror image). */
function wing(p: Painter, pose: Pose, dy: number, t: Tones): void {
  const shoulder: [number, number] = [CX + 8, 28 + dy];
  const k = (pose.flap + 1) / 2; // 0 down .. 1 up
  const tipY = pose.tuck ? 30 + dy : 38 - 24 * k + dy;
  const tipX = pose.tuck ? CX + 14 : CX + 29;
  p.beginPath();
  p.moveTo(shoulder[0], shoulder[1]);
  p.quadraticCurveTo(CX + 18, tipY - 6, tipX, tipY);
  p.quadraticCurveTo(tipX - 2, tipY + 8, tipX - 6, tipY + 12);
  p.quadraticCurveTo(tipX - 10, tipY + 17, tipX - 13, tipY + 10);
  p.quadraticCurveTo(tipX - 17, tipY + 18, shoulder[0] + 1, shoulder[1] + 8);
  p.closePath();
  paint(p, css(t.mid), t.outline, 2);
}

function drawBat(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.8;
  const ry = 13 - pose.crouch * 0.35;
  // Wings first (behind), both sides.
  for (const side of [-1, 1]) {
    p.save();
    p.translate(CX, 0);
    p.scale(side, 1);
    p.translate(-CX, 0);
    wing(p, pose, dy, t);
    p.restore();
  }
  feet(p, pose, dy, t);
  // Ears: short, wide-based and tilted outward, so they read as a bat's and not a rabbit's.
  for (const side of [-1, 1]) {
    const x = (d: number) => CX + side * d;
    polygon(p, [
      [x(3.2), 22 + dy],
      [x(11.5), 10 + dy],
      [x(11.2), 24 + dy],
    ]);
    paint(p, css(t.mid), t.outline, 2);
  }
  arms(p, pose, dy, t);
  // Body: one colour with a deeper outline.
  ellipse(p, CX, 32 + dy, 11.5, ry);
  paint(p, css(t.mid), t.outline, 2.2);
  eyes(p, 27 + dy, 4.6, 3.9, 4.6);
}

// ---------------------------------------------------------------------------------------------
// Cat
// ---------------------------------------------------------------------------------------------

function drawCat(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.8;
  // Tail: a curl on the right that swishes with the pose.
  const swish = pose.flap * 4;
  limb(p, [CX + 8, 44 + dy], [CX + 20, 46 + dy], [CX + 17 + swish, 28 + dy], 4.4, t);
  feet(p, pose, dy, t);
  // Body under the head.
  ellipse(p, CX, 41 + dy, 10, 8 - pose.crouch * 0.3);
  paint(p, css(t.mid), t.outline, 2.2);
  arms(p, pose, dy, t);
  // Ears, then the round head.
  for (const side of [-1, 1]) {
    const x = (d: number) => CX + side * d;
    polygon(p, [
      [x(10), 24 + dy],
      [x(9.5), 8 + dy],
      [x(2.5), 16 + dy],
    ]);
    paint(p, css(t.mid), t.outline, 2);
  }
  ellipse(p, CX, 26 + dy, 12, 10.5);
  paint(p, css(t.mid), t.outline, 2.2);
  eyes(p, 26 + dy, 4.8, 3.3, 4.2);
}

// ---------------------------------------------------------------------------------------------
// Ant
// ---------------------------------------------------------------------------------------------

/** Three body segments, bent antennae and three legs a side that scuttle with the pose. */
function drawAnt(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.8;
  const s = step(pose);
  // Legs behind the body: three a side in two tripods (front and back on one side with the middle on
  // the other), one tripod lifted and swinging while the other pushes.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = 36 + i * 4 + dy;
      const k = (i === 1 ? -s : s) * side;
      const lift = Math.max(0, k) * 3;
      limb(
        p,
        [CX + side * 5, y],
        [CX + side * 13, y - 3 - lift],
        [CX + side * (17 - lift * 0.5), y + 6 + k * 2.5 - lift],
        3,
        t,
      );
    }
  }
  // Abdomen, thorax, head.
  ellipse(p, CX, 44 + dy, 9, 7 - pose.crouch * 0.3);
  paint(p, css(t.mid), t.outline, 2.2);
  ellipse(p, CX, 35 + dy, 5.5, 4.5);
  paint(p, css(t.mid), t.outline, 2);
  arms(p, pose, dy, t);
  ellipse(p, CX, 25 + dy, 10, 8.5);
  paint(p, css(t.mid), t.outline, 2.2);
  // Antennae, bent, waving with the pose.
  const wave = pose.flap * 2;
  for (const side of [-1, 1])
    limb(
      p,
      [CX + side * 4, 18 + dy],
      [CX + side * 6, 8 + dy],
      [CX + side * (13 + wave), 9 + dy],
      1.8,
      t,
    );
  eyes(p, 25 + dy, 4.4, 3.2, 3.8);
}

// ---------------------------------------------------------------------------------------------
// Owl
// ---------------------------------------------------------------------------------------------

/** A round owl with ear tufts, a beak, big ringed eyes and short wings that flap with the pose. */
function drawOwl(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.8;
  // Wings at the sides, raised with the flap (half as far while it walks: an owl glides).
  const k = (pose.flap * (pose.phase === undefined ? 1 : 0.6) + 1) / 2;
  for (const side of [-1, 1]) {
    p.beginPath();
    p.moveTo(CX + side * 10, 28 + dy);
    p.quadraticCurveTo(
      CX + side * (22 + 4 * k),
      30 - 8 * k + dy,
      CX + side * (18 + 3 * k),
      44 + dy,
    );
    p.quadraticCurveTo(CX + side * 13, 42 + dy, CX + side * 10, 40 + dy);
    p.closePath();
    paint(p, css(t.mid), t.outline, 2);
  }
  feet(p, pose, dy, t);
  // Body with a paler belly, ear tufts on top.
  ellipse(p, CX, 34 + dy, 12.5, 14 - pose.crouch * 0.35);
  paint(p, css(t.mid), t.outline, 2.2);
  ellipse(p, CX, 38 + dy, 7.5, 8);
  paint(p, css(t.light), null);
  for (const side of [-1, 1]) {
    const x = (d: number) => CX + side * d;
    polygon(p, [
      [x(4), 22 + dy],
      [x(11), 14 + dy],
      [x(10.5), 24 + dy],
    ]);
    paint(p, css(t.mid), t.outline, 2);
  }
  arms(p, pose, dy, t);
  // Eye rings, then the eyes and a small beak between them.
  for (const side of [-1, 1]) {
    ellipse(p, CX + side * 5, 27 + dy, 5.4, 5.4);
    paint(p, css(t.light), t.outline, 1.4);
  }
  eyes(p, 27 + dy, 5, 3.6, 3.8);
  polygon(p, [
    [CX - 2, 31 + dy],
    [CX + 2, 31 + dy],
    [CX, 35 + dy],
  ]);
  paint(p, css(BEAK), t.outline, 1.2);
}

// ---------------------------------------------------------------------------------------------
// Frog
// ---------------------------------------------------------------------------------------------

/** A squat frog: a wide body, eyes on top, a wide smile and bent hind legs that spring with the pose. */
function drawFrog(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.8;
  // Hind legs spring out through the first half of a stride (the jump) and tuck in through the second
  // (the landing); the throat puffs with `flap`.
  const hop = step(pose) * 3.5;
  // Hind legs folded at the sides.
  for (const side of [-1, 1]) {
    ellipse(p, CX + side * 13, 44 + dy - hop, 6, 4.5);
    paint(p, css(t.mid), t.outline, 2);
    ellipse(p, CX + side * 16, 49 + dy, 4.5, 2.4);
    paint(p, css(t.mid), t.outline, 1.6);
  }
  // Body and head as one wide shape, a paler throat.
  ellipse(p, CX, 37 + dy, 14, 11 - pose.crouch * 0.3);
  paint(p, css(t.mid), t.outline, 2.2);
  ellipse(p, CX, 41 + dy, 8 + pose.flap, 5 + pose.flap * 0.6);
  paint(p, css(t.light), null);
  arms(p, pose, dy, t);
  // Eyes bulging on top, and a smile.
  for (const side of [-1, 1]) {
    ellipse(p, CX + side * 7, 24 + dy, 5.4, 5);
    paint(p, css(t.mid), t.outline, 2);
  }
  eyes(p, 23.5 + dy, 7, 3.4, 3.6);
  p.beginPath();
  p.moveTo(CX - 7, 34 + dy);
  p.quadraticCurveTo(CX, 38 + dy, CX + 7, 34 + dy);
  p.strokeStyle = css(t.outline);
  p.lineWidth = 1.6;
  p.stroke();
}

// ---------------------------------------------------------------------------------------------
// Spider
// ---------------------------------------------------------------------------------------------

/** A round spider: eight bent legs that scuttle with the pose, a body and a head with two big eyes. */
function drawSpider(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.8;
  const s = step(pose) * 3;
  // Alternate legs (one side's even ones with the other side's odd ones) lift together.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = 30 + i * 4 + dy;
      const lift = (i % 2 === 0 ? s : -s) * side + pose.flap * (i === 0 ? 2 : 0);
      limb(
        p,
        [CX + side * 6, y],
        [CX + side * (16 + i), y - 9 + lift],
        [CX + side * (23 - i), y + 8 - i + lift],
        2.6,
        t,
      );
    }
  }
  ellipse(p, CX, 40 + dy, 10, 9 - pose.crouch * 0.3);
  paint(p, css(t.mid), t.outline, 2.2);
  ellipse(p, CX, 42 + dy, 4, 3.5);
  paint(p, css(t.light), null);
  arms(p, pose, dy, t);
  ellipse(p, CX, 28 + dy, 9, 7.5);
  paint(p, css(t.mid), t.outline, 2.2);
  eyes(p, 27 + dy, 4, 3.2, 3.6);
}

/**
 * Draws `frame` of `species` in the cube colour `colorHex` into `p`, inside (0, 0, FRAME_W, FRAME_H).
 * The painter's state is saved and restored, so frames can be drawn one after another.
 */
export function drawFrame(p: Painter, frame: FrameName, colorHex: string, species: Species): void {
  const pal = palette(colorHex);
  const tones: Tones = { outline: pal.outline, mid: pal.mid, light: pal.light, dark: pal.dark };
  p.save();
  p.lineJoin = "round";
  p.lineCap = "round";
  p.globalAlpha = 1;
  const pose = POSES[frame];
  const draw = {
    bat: drawBat,
    cat: drawCat,
    ant: drawAnt,
    owl: drawOwl,
    frog: drawFrog,
    spider: drawSpider,
  };
  draw[species](p, pose, tones);
  p.restore();
}
