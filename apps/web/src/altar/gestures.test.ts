import { describe, expect, it } from "vitest";
import { pressBreath, releaseBreath, startBreaths } from "./breath";
import { circleDirection, isTap, strokeDirection, sweptDegrees, type Point } from "./gestures";

const centre = { x: 100, y: 100 };
/** Points round the centre from `fromDeg` to `toDeg` (screen angles: 0 = east, 90 = south). */
function arc(fromDeg: number, toDeg: number, r = 60): Point[] {
  const out: Point[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    out.push({ x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) });
  }
  return out;
}

describe("circle gestures", () => {
  it("reads a clockwise loop as sunwise and an anticlockwise one as widdershins", () => {
    // North (-90°) → east (0°) → south → west → back: clockwise on screen.
    expect(circleDirection(arc(-90, 270), centre)).toBe("sunwise");
    expect(circleDirection(arc(-90, -450), centre)).toBe("widdershins");
  });

  it("forgives a circle that stops a little short, but not a half circle", () => {
    expect(circleDirection(arc(-90, 230), centre)).toBe("sunwise");
    expect(circleDirection(arc(-90, 90), centre)).toBeNull();
    expect(sweptDegrees(arc(0, 90), centre)).toBeCloseTo(90);
  });

  it("ignores points too close to the centre", () => {
    const wobble = [centre, { x: 101, y: 99 }, { x: 99, y: 101 }];
    expect(circleDirection(wobble, centre)).toBeNull();
  });
});

describe("strokes and taps", () => {
  it("finds the direction of a straight stroke", () => {
    expect(
      strokeDirection([
        { x: 0, y: 100 },
        { x: 5, y: 40 },
      ]),
    ).toBe("up");
    expect(
      strokeDirection([
        { x: 0, y: 0 },
        { x: -3, y: 50 },
      ]),
    ).toBe("down");
    expect(
      strokeDirection([
        { x: 50, y: 0 },
        { x: 0, y: 4 },
      ]),
    ).toBe("left");
    expect(
      strokeDirection([
        { x: 0, y: 0 },
        { x: 50, y: 4 },
      ]),
    ).toBe("right");
  });

  it("refuses short and diagonal strokes", () => {
    expect(
      strokeDirection([
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBeNull();
    expect(
      strokeDirection([
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ]),
    ).toBeNull();
    expect(strokeDirection([])).toBeNull();
  });

  it("tells a tap from a drag", () => {
    expect(
      isTap([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBe(true);
    expect(
      isTap([
        { x: 0, y: 0 },
        { x: 30, y: 0 },
      ]),
    ).toBe(false);
  });
});

describe("breathing", () => {
  it("counts holds long enough, and only those", () => {
    let s = pressBreath(startBreaths(), 0);
    s = pressBreath(s, 500); // a second press while held changes nothing
    let out = releaseBreath(s, 2000);
    expect(out).toEqual({ state: { count: 1, since: null }, counted: true });
    out = releaseBreath(pressBreath(out.state, 3000), 3400);
    expect(out).toEqual({ state: { count: 1, since: null }, counted: false });
    expect(releaseBreath(out.state, 5000).counted).toBe(false);
  });
});
