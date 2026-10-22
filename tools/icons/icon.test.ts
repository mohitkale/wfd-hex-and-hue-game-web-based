import { describe, expect, it } from "vitest";
import { renderIcon, tileColor } from "./icon";

const pixel = (data: Uint8Array, size: number, x: number, y: number) =>
  Array.from(data.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

describe("app icon", () => {
  it("is opaque, night-sky at the corners, with a golden crescent", () => {
    const size = 192;
    const data = renderIcon(size);
    expect(data.length).toBe(size * size * 4);
    expect(pixel(data, size, 0, 0)).toEqual([0x14, 0x0b, 0x2e, 255]);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    let gold = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] === 0xf6 && data[i + 1] === 0xd9) gold++;
    expect(gold / (size * size)).toBeGreaterThan(0.08);
  });

  it("the moon is a crescent: lit on the left, bitten on the right", () => {
    expect(tileColor(3, 8)).toEqual([0xf6, 0xd9, 0x7a]);
    expect(tileColor(10, 6)).not.toEqual([0xf6, 0xd9, 0x7a]);
  });

  it("maskable icons keep the art inside the central 80% safe zone", () => {
    const size = 512;
    const data = renderIcon(size, true);
    const margin = Math.ceil(size * 0.1);
    for (let y = 0; y < size; y += 3) {
      for (let x = 0; x < size; x += 3) {
        if (x >= margin && x < size - margin && y >= margin && y < size - margin) continue;
        expect(pixel(data, size, x, y)).toEqual([0x14, 0x0b, 0x2e, 255]);
      }
    }
  });
});
