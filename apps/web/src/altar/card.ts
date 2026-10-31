import { FRAME_W, drawFrame, type Species } from "@hexhue/game/familiar";
import type { GrimoireEntry } from "@hexhue/learn";
import { iconSvg } from "./icons";
import { usedTools } from "./logic";

/**
 * The ritual card (M17.4): a portrait image of a rehearsed ritual to keep or share: its title, the
 * day it was rehearsed, the familiar who helped, the tools it used and its steps in short. Drawn on
 * a canvas, so it needs no server.
 */
export const CARD_W = 1080;
export const CARD_H = 1350;

export const cardFileName = (entry: GrimoireEntry) => `hex-and-hue-${entry.lesson.id}.png`;

/** Words into lines no wider than `width` at the context's current font. */
export function wrapText(measure: (s: string) => number, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A step's prompt cut to its first sentence, for the card's short list. */
export function shortStep(prompt: string): string {
  const first = prompt.split(/(?<=[.:?!])\s/)[0] ?? prompt;
  return first.replace(/[:.]$/, "");
}

function iconImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export interface CardOptions {
  day: string;
  /** The site's host, for the card's footer. */
  site: string;
  species: Species;
  familiarColor: string;
}

export async function drawRitualCard(
  entry: GrimoireEntry,
  opts: CardOptions,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  const sky = g.createLinearGradient(0, 0, 0, CARD_H);
  sky.addColorStop(0, "#2a1650");
  sky.addColorStop(1, "#140b2e");
  g.fillStyle = sky;
  g.fillRect(0, 0, CARD_W, CARD_H);
  g.strokeStyle = "#f6d97a";
  g.lineWidth = 6;
  g.strokeRect(36, 36, CARD_W - 72, CARD_H - 72);

  g.fillStyle = "#f6d97a";
  g.font = `600 34px ${font}`;
  g.fillText("HEX & HUE · THE GRIMOIRE", 90, 130);

  g.fillStyle = "#f5efff";
  g.font = `700 72px ${font}`;
  let y = 230;
  for (const line of wrapText((s) => g.measureText(s).width, entry.lesson.title, CARD_W - 400)) {
    g.fillText(line, 90, y);
    y += 84;
  }
  g.fillStyle = "#c9b8ff";
  g.font = `400 36px ${font}`;
  g.fillText(`Rehearsed ${opts.day}`, 90, y);

  // The familiar, top right, three times its size.
  g.save();
  g.translate(CARD_W - 90 - FRAME_W * 3, 140);
  g.scale(3, 3);
  drawFrame(g, "idle0", opts.familiarColor, opts.species);
  g.restore();

  y += 80;
  g.font = `400 38px ${font}`;
  entry.lesson.steps.forEach((s, i) => {
    if (y > CARD_H - 280) return;
    g.fillStyle = "#f6d97a";
    g.fillText(`${i + 1}`, 90, y);
    g.fillStyle = "#f5efff";
    for (const line of wrapText((t) => g.measureText(t).width, shortStep(s.prompt), CARD_W - 260)) {
      if (y > CARD_H - 280) break;
      g.fillText(line, 150, y);
      y += 50;
    }
    y += 14;
  });

  g.fillStyle = "#c9b8ff";
  g.font = `400 30px ${font}`;
  g.fillText(`Learn by doing, free and private: ${opts.site}/grimoire`, 90, CARD_H - 90);

  // The tools it used along the bottom (best effort: the card is whole without them).
  const tools = usedTools(entry).slice(0, 7);
  const images = await Promise.allSettled(
    tools.map((t) => iconImage(iconSvg(t.icon, 96, t.color, true))),
  );
  images.forEach((r, i) => {
    if (r.status === "fulfilled") g.drawImage(r.value, 90 + i * 120, CARD_H - 230, 96, 96);
  });
  return canvas;
}
