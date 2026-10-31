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
 * Every species is drawn from above, head at the top of the frame (M15.13 owner feedback: each with
 * its own anatomy, never looking out at the player while it walks); the renderer turns it to face
 * the way it goes. Legs, wings and tails follow the stride (`Pose.phase`). Each is a single colour,
 * the cube's, in a mid, light and dark tone with a deeper outline; only the eyes (white with a dark
 * pupil) and the delivery sparkles contrast.
 */

/** Lowest point (texture px, standing) of each species' eyes, at the front of the head: the colour-blind badge sits below it. */
export const FACE_BOTTOM_PX = { bat: 18, cat: 14, ant: 16, owl: 15, frog: 21, spider: 19 } as const;

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
/** A cat's nose. */
const PINK: Rgb = [242, 140, 170];

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

/**
 * The front legs, mandibles or claws reaching forward from the head (top of the frame): held up
 * round the carried cube (`v`), thrown wide on delivery (`toss`) or grabbing beside the head while
 * it picks a cube up (`reach`).
 */
function forelimbs(p: Painter, pose: Pose, headY: number, t: Tones, width = 2.4): void {
  const spec: Record<string, [[number, number], [number, number], [number, number]]> = {
    v: [
      [4, 0],
      [7, -6],
      [3, -9],
    ],
    toss: [
      [4, 0],
      [10, -4],
      [12, -9],
    ],
    reach: [
      [4, 1],
      [9, 2],
      [7, -2],
    ],
  };
  const s = spec[pose.limbs];
  if (!s) return;
  for (const side of [-1, 1]) {
    const pt = ([dx, dy]: [number, number]): [number, number] => [CX + side * dx, headY + dy];
    limb(p, pt(s[0]), pt(s[1]), pt(s[2]), width, t);
    if (pose.sparkle) sparkle(p, CX + side * 15, Math.max(5, headY - 8), 4.5);
  }
}

/** Eyes at the front of the head, seen from above: white with a dark pupil and a glint. */
function eyes(p: Painter, y: number, dx: number, rx: number, ry: number): void {
  for (const s of [-1, 1]) {
    ellipse(p, CX + s * dx, y, rx, ry);
    paint(p, css(FIXED.eyeWhite), null);
    ellipse(p, CX + s * dx, y - ry * 0.25, rx * 0.6, ry * 0.6);
    paint(p, css(FIXED.pupil), null);
    ellipse(p, CX + s * dx - rx * 0.2, y - ry * 0.45, rx * 0.22, rx * 0.22);
    paint(p, "#ffffff", null);
  }
}

/** A thin jointed leg: base to knee to foot, outlined. */
function jointed(p: Painter, pts: readonly [number, number][], width: number, t: Tones): void {
  p.lineCap = "round";
  p.lineJoin = "round";
  for (const [w, c] of [
    [width + 2.4, t.outline],
    [width, t.dark],
  ] as const) {
    p.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    p.strokeStyle = css(c);
    p.lineWidth = w;
    p.stroke();
  }
}

/** A short dark stroke (stripes, markings). */
function mark(
  p: Painter,
  from: [number, number],
  ctrl: [number, number],
  to: [number, number],
  c: Rgb,
  w = 1.6,
): void {
  p.lineCap = "round";
  p.beginPath();
  p.moveTo(from[0], from[1]);
  p.quadraticCurveTo(ctrl[0], ctrl[1], to[0], to[1]);
  p.strokeStyle = css(c);
  p.lineWidth = w;
  p.stroke();
}

// Every species is seen from above, head at the top of the frame (the way it walks once the renderer
// turns it to its heading), so it never looks out of the screen at the player while it walks.

// ---------------------------------------------------------------------------------------------
// Bat
// ---------------------------------------------------------------------------------------------

/** A bat from above: wings spread to the sides, foreshortened at the top and bottom of a beat. */
function drawBat(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.6;
  const span = pose.tuck ? 9 : 26 * (1 - 0.42 * Math.abs(pose.flap));
  const tipY = 20 - pose.flap * 3 + dy;
  for (const side of [-1, 1]) {
    const x = (d: number) => CX + side * d;
    p.beginPath();
    p.moveTo(x(3.5), 22 + dy);
    p.quadraticCurveTo(x(4 + span * 0.5), tipY - 6, x(4 + span), tipY);
    p.quadraticCurveTo(x(span * 0.85), tipY + 6, x(3 + span * 0.7), tipY + 10);
    p.quadraticCurveTo(x(span * 0.55), tipY + 7, x(2 + span * 0.42), tipY + 13);
    p.quadraticCurveTo(x(span * 0.3), tipY + 9, x(3.5), 34 + dy);
    p.closePath();
    paint(p, css(t.mid), t.outline, 2);
    // Finger bones through the membrane.
    for (const [ex, ey] of [
      [4 + span, tipY],
      [3 + span * 0.7, tipY + 10],
      [2 + span * 0.42, tipY + 13],
    ] as const)
      mark(p, [x(4), 24 + dy], [x(4 + (ex - 4) * 0.5), tipY + 2], [x(ex - 1), ey], t.dark, 1.2);
  }
  // Little feet trailing behind.
  const sw = step(pose);
  for (const s of [-1, 1]) {
    ellipse(p, CX + s * 2, 37 + dy + s * sw * 1.5, 1.4, 1.8);
    paint(p, css(t.dark), null);
  }
  ellipse(p, CX, 28 + dy, 4.6, 8);
  paint(p, css(t.mid), t.outline, 2);
  // Head with two pointed ears facing forward.
  for (const s of [-1, 1]) {
    polygon(p, [
      [CX + s * 1.5, 16 + dy],
      [CX + s * 4.5, 9 + dy],
      [CX + s * 4.8, 17 + dy],
    ]);
    paint(p, css(t.mid), t.outline, 1.6);
  }
  ellipse(p, CX, 18 + dy, 4.6, 4.2);
  paint(p, css(t.mid), t.outline, 1.8);
  eyes(p, 16 + dy, 2.2, 1.3, 1.5);
  forelimbs(p, pose, 18 + dy, t, 2);
}

// ---------------------------------------------------------------------------------------------
// Cat
// ---------------------------------------------------------------------------------------------

/** A cat from above: four paws stepping in diagonal pairs, a swishing tail, ears forward. */
function drawCat(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.6;
  const s = step(pose);
  const swish = pose.flap * 7;
  limb(p, [CX, 40 + dy], [CX + swish, 47], [CX + swish * 1.4, 52], 3.2, t);
  // Paws: front left with back right, then the other pair.
  for (const side of [-1, 1]) {
    const k = s * side * 3;
    for (const [py, sign] of [
      [22, 1],
      [39, -1],
    ] as const) {
      ellipse(p, CX + side * 7, py + dy - k * sign, 2.6, 3);
      paint(p, css(t.light), t.outline, 1.4);
    }
  }
  ellipse(p, CX, 31 + dy, 7.5, 11);
  paint(p, css(t.mid), t.outline, 2.2);
  // Tabby stripes across the back.
  for (const y of [28, 32, 36])
    mark(p, [CX - 5, y + dy], [CX, y - 2 + dy], [CX + 5, y + dy], t.dark, 1.4);
  for (const side of [-1, 1]) {
    polygon(p, [
      [CX + side * 2.5, 11 + dy],
      [CX + side * 6.5, 4 + dy],
      [CX + side * 7, 13 + dy],
    ]);
    paint(p, css(t.mid), t.outline, 1.6);
  }
  ellipse(p, CX, 15 + dy, 7, 6);
  paint(p, css(t.mid), t.outline, 2);
  eyes(p, 12 + dy, 3, 1.5, 1.8);
  ellipse(p, CX, 9.6 + dy, 1, 0.8);
  paint(p, css(PINK), null);
  forelimbs(p, pose, 15 + dy, t);
}

// ---------------------------------------------------------------------------------------------
// Ant
// ---------------------------------------------------------------------------------------------

/** An ant from above: head, thorax and a striped abdomen in a line, six legs walking in tripods. */
function drawAnt(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.6;
  const s = step(pose);
  // Legs: front and back on one side move with the middle one on the other (a tripod).
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ay = 23 + i * 3 + dy;
      const k = (i === 1 ? -s : s) * side;
      jointed(
        p,
        [
          [CX + side * 2.5, ay],
          [CX + side * 9, ay + [-5, -1, 3][i]! + k * 2],
          [CX + side * 14, ay + [-11, 1, 11][i]! + k * 4],
        ],
        1.6,
        t,
      );
    }
  }
  // Abdomen with stripes, the waist, the thorax.
  ellipse(p, CX, 41 + dy, 6.5, 9);
  paint(p, css(t.mid), t.outline, 2);
  for (const y of [38, 42, 46])
    mark(p, [CX - 5, y + dy], [CX, y + 2 + dy], [CX + 5, y + dy], t.dark, 1.3);
  ellipse(p, CX - 2, 37 + dy, 1.8, 3);
  paint(p, css(t.light), null);
  ellipse(p, CX, 31.5 + dy, 1.8, 1.8);
  paint(p, css(t.mid), t.outline, 1.4);
  ellipse(p, CX, 25 + dy, 3.4, 5.2);
  paint(p, css(t.mid), t.outline, 1.8);
  // Antennae, bent at the elbow, waving.
  const wave = pose.flap * 2;
  for (const side of [-1, 1])
    jointed(
      p,
      [
        [CX + side * 2, 12 + dy],
        [CX + side * 4, 6 + dy],
        [CX + side * (9 + wave), 3 + dy],
      ],
      1.2,
      t,
    );
  ellipse(p, CX, 16 + dy, 5, 5);
  paint(p, css(t.mid), t.outline, 2);
  // Mandibles.
  for (const side of [-1, 1])
    mark(
      p,
      [CX + side * 2, 11.5 + dy],
      [CX + side * 2.5, 9.5 + dy],
      [CX + side * 0.8, 9 + dy],
      t.outline,
      1.4,
    );
  eyes(p, 14 + dy, 3.6, 1.4, 1.6);
  forelimbs(p, pose, 15 + dy, t, 1.8);
}

// ---------------------------------------------------------------------------------------------
// Owl
// ---------------------------------------------------------------------------------------------

/** An owl from above: a round body, wings at its sides opening as it hops, a fanned tail. */
function drawOwl(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.6;
  const k = (pose.flap * (pose.phase === undefined ? 1 : 0.7) + 1) / 2;
  const sway = step(pose) * 1.5;
  polygon(p, [
    [CX - 5, 40 + dy],
    [CX + 5, 40 + dy],
    [CX + 7 + sway, 51],
    [CX + sway, 49],
    [CX - 7 + sway, 51],
  ]);
  paint(p, css(t.dark), t.outline, 1.6);
  for (const side of [-1, 1]) {
    p.beginPath();
    p.moveTo(CX + side * 6, 20 + dy);
    p.quadraticCurveTo(CX + side * (13 + 9 * k), 24 + dy, CX + side * (12 + 7 * k), 36 + dy);
    p.quadraticCurveTo(CX + side * 9, 44 + dy, CX + side * 5, 40 + dy);
    p.closePath();
    paint(p, css(t.dark), t.outline, 1.8);
    for (const f of [0.35, 0.65])
      mark(
        p,
        [CX + side * 7, 24 + dy + f * 14],
        [CX + side * (9 + 4 * k), 26 + dy + f * 14],
        [CX + side * (10 + 5 * k), 28 + dy + f * 12],
        t.mid,
        1.2,
      );
  }
  ellipse(p, CX, 30 + dy, 8.5, 11);
  paint(p, css(t.mid), t.outline, 2);
  for (const y of [28, 33, 38])
    for (const x of [-3, 0, 3])
      mark(p, [CX + x - 1.2, y + dy], [CX + x, y + 1.4 + dy], [CX + x + 1.2, y + dy], t.light, 1.1);
  for (const side of [-1, 1]) {
    polygon(p, [
      [CX + side * 2.5, 12 + dy],
      [CX + side * 6.5, 6 + dy],
      [CX + side * 7, 14 + dy],
    ]);
    paint(p, css(t.mid), t.outline, 1.6);
  }
  ellipse(p, CX, 16 + dy, 7.5, 6.5);
  paint(p, css(t.mid), t.outline, 2);
  for (const side of [-1, 1]) {
    ellipse(p, CX + side * 3.2, 13 + dy, 2.8, 2.6);
    paint(p, css(t.light), null);
  }
  eyes(p, 13 + dy, 3.2, 1.6, 1.7);
  polygon(p, [
    [CX - 1.2, 10.5 + dy],
    [CX + 1.2, 10.5 + dy],
    [CX, 8 + dy],
  ]);
  paint(p, css(BEAK), t.outline, 0.8);
  forelimbs(p, pose, 16 + dy, t, 2);
}

// ---------------------------------------------------------------------------------------------
// Frog
// ---------------------------------------------------------------------------------------------

/** A frog from above: eyes bulging at the front, short front legs, long hind legs that push it on. */
function drawFrog(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.6;
  const push = Math.max(0, step(pose));
  for (const side of [-1, 1]) {
    // Hind leg: thigh folded at the side, the foot kicking back during the push.
    const footY = 44 + push * 7;
    jointed(
      p,
      [
        [CX + side * 6, 37 + dy],
        [CX + side * 13, 36 + dy - push * 3],
        [CX + side * (10 + push * 2), footY],
      ],
      3.2,
      t,
    );
    ellipse(p, CX + side * (11 + push * 2), footY + 1.5, 3.4, 2);
    paint(p, css(t.light), t.outline, 1.2);
    const reach = step(pose) * side * 1.5;
    jointed(
      p,
      [
        [CX + side * 6, 24 + dy],
        [CX + side * 11, 23 + dy - reach],
        [CX + side * 12, 18 + dy - reach],
      ],
      2.2,
      t,
    );
  }
  // The body swells and settles with its breath.
  ellipse(p, CX, 30 + dy, 9.5 + pose.flap * 0.4, 11);
  paint(p, css(t.mid), t.outline, 2.2);
  for (const [x, y, r] of [
    [-3, 30, 1.8],
    [3.5, 34, 1.5],
    [0.5, 38, 1.3],
    [-4, 36, 1.1],
  ] as const) {
    ellipse(p, CX + x, y + dy, r, r);
    paint(p, css(t.dark), null);
  }
  for (const side of [-1, 1]) {
    ellipse(p, CX + side * 5, 20 + dy, 3.6, 3.4);
    paint(p, css(t.mid), t.outline, 1.6);
  }
  eyes(p, 19.5 + dy, 5, 1.8, 1.9);
  mark(p, [CX - 5, 17 + dy], [CX, 15 + dy], [CX + 5, 17 + dy], t.outline, 1.2);
  forelimbs(p, pose, 20 + dy, t);
}

// ---------------------------------------------------------------------------------------------
// Spider
// ---------------------------------------------------------------------------------------------

/** A spider from above: eight thin jointed legs, high knees, in alternating sets, a marked abdomen. */
function drawSpider(p: Painter, pose: Pose, t: Tones): void {
  const dy = pose.crouch + pose.bob * 0.6;
  const s = step(pose);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const ay = 19 + i * 2.4 + dy;
      const k = (i % 2 === 0 ? s : -s) * side;
      jointed(
        p,
        [
          [CX + side * 3.5, ay],
          [CX + side * (11 + i * 0.6), ay - 8 + i * 4 + k * 2],
          [CX + side * (19 - i * 0.8), ay - 12 + i * 9 + k * 4],
        ],
        1.4,
        t,
      );
    }
  }
  // The abdomen sways a little as the leg sets change.
  const ax = CX + pose.flap * 0.8;
  ellipse(p, ax, 37 + dy, 8, 9.5);
  paint(p, css(t.mid), t.outline, 2);
  // An hourglass mark on the abdomen.
  polygon(p, [
    [ax - 2.5, 33 + dy],
    [ax + 2.5, 33 + dy],
    [ax, 37 + dy],
    [ax + 2.5, 41 + dy],
    [ax - 2.5, 41 + dy],
    [ax, 37 + dy],
  ]);
  paint(p, css(t.light), null);
  ellipse(p, CX, 22 + dy, 5.5, 6);
  paint(p, css(t.mid), t.outline, 2);
  eyes(p, 18 + dy, 2, 1.3, 1.4);
  for (const side of [-1, 1]) {
    ellipse(p, CX + side * 4, 19.5 + dy, 0.7, 0.7);
    paint(p, css(FIXED.pupil), null);
  }
  forelimbs(p, pose, 18 + dy, t, 1.6);
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
