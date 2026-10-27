import {
  FAMILIAR_H,
  FAMILIAR_W,
  FIXED,
  SS,
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
 * Both species face the player and are left-right symmetric (the cat's tail aside), so a familiar
 * reads the same whichever way it flies or trots. Each is a single colour, the cube's: body, ears,
 * wings, limbs and tail all share it (with a deeper outline); only the eyes (white with a dark pupil)
 * and the delivery sparkles contrast.
 */

/** Lowest point (texture px, standing) of each species' eyes (the only face): the colour-blind badge sits below it. */
export const FACE_BOTTOM_PX = { bat: 32, cat: 31 } as const;

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

/** What one frame shows: the wings or tail, the limbs, how crouched, and sparkles. */
interface Pose {
  /** Wings (bat) or tail swish (cat): 1 up, 0 level, -1 down. */
  flap: number;
  /** Wings tucked behind the body (picking up). */
  tuck?: boolean;
  limbs: "none" | "apart" | "together" | "v" | "toss" | "reach";
  /** Pixels the body sinks (crouching). */
  crouch: number;
  sparkle?: boolean;
  /** Which beat of a walk or idle: nudges the body a little. */
  bob: number;
}

export const POSES: Record<FrameName, Pose> = {
  idle0: { flap: 1, limbs: "none", crouch: 0, bob: 0 },
  idle1: { flap: -1, limbs: "none", crouch: 0, bob: 1 },
  walk0: { flap: 0, limbs: "apart", crouch: 0, bob: -1 },
  walk1: { flap: -0.6, limbs: "together", crouch: 0, bob: 1 },
  carry0: { flap: 0, limbs: "v", crouch: 0, bob: -1 },
  carry1: { flap: -1, limbs: "v", crouch: 0, bob: 1 },
  pickup: { flap: 0, tuck: true, limbs: "reach", crouch: 5, bob: 0 },
  deliver: { flap: 1, limbs: "toss", crouch: 0, bob: 0, sparkle: true },
};

const css = (c: Rgb, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const CX = FRAME_W / 2;
const TAU = Math.PI * 2;

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

/** Feet: two small ovals; apart or together for the walk. */
function feet(p: Painter, pose: Pose, dy: number, t: Tones): void {
  if (
    pose.limbs === "v" ||
    pose.limbs === "toss" ||
    pose.limbs === "reach" ||
    pose.limbs === "none"
  ) {
    const spread = pose.limbs === "reach" ? 9 : 5;
    for (const s of [-1, 1]) {
      ellipse(p, CX + s * spread, 48 + dy, 4.2, 2.8);
      paint(p, css(t.mid), t.outline, 1.6);
    }
    return;
  }
  const spread = pose.limbs === "apart" ? 11 : 4;
  for (const s of [-1, 1]) {
    ellipse(p, CX + s * spread, 48 + dy, 4.2, 2.8);
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
  if (species === "cat") drawCat(p, pose, tones);
  else drawBat(p, pose, tones);
  p.restore();
}
