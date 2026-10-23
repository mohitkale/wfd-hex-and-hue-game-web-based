import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { theme } from "../theme";
import { Button } from "../view/Button";
import { fadeIn } from "../view/transition";
import { ART_PIECE_IDS, artLevelForPiece } from "./artLevels";
import { computeCollectLayout } from "./collectLayout";
import { fitCell, paintPicture, paintSilhouette } from "./pictureView";
import { browserStore, isUnlocked, loadSpellbook } from "./v2Spellbook";

/**
 * The v2 Spellbook (M11.5; the full gallery is M13.2): every picture of the art library, finished
 * and with its lore once you have completed it, a silhouette until then. Tap a collected card to
 * read its page. Review build only (`?engine=v2`); the shipped game's Spellbook is untouched.
 */
export class CollectSpellbookScene extends Phaser.Scene {
  private open: string | null = null;

  constructor() {
    super("collect-spellbook");
  }

  create(): void {
    this.open = null;
    this.cameras.main.setBackgroundColor(theme.night);
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
    fadeIn(this);
  }

  private layout(): void {
    this.children.removeAll(true);
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as
      { top: number; right: number; bottom: number; left: number } | undefined) ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const { width, height } = this.scale.gameSize;
    // Reuse the board's frame (max width, safe area) so the book sits where the game does.
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
    const book = loadSpellbook(browserStore());
    const cx = frame.x + frame.w / 2;
    this.add
      .text(cx, frame.y + 18 * dpr, "Spellbook", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(26 * dpr)}px`,
        color: "#f6d97a",
      })
      .setOrigin(0.5, 0);
    const found = ART_PIECE_IDS.filter((id) => isUnlocked(book, id)).length;
    this.add
      .text(cx, frame.y + 54 * dpr, `${found} of ${ART_PIECE_IDS.length} collected`, {
        fontFamily: theme.font,
        fontSize: `${Math.round(14 * dpr)}px`,
        color: theme.textDim,
      })
      .setOrigin(0.5, 0);

    const cols = 2;
    const gap = 12 * dpr;
    const cardW = Math.floor((frame.w - 2 * 16 * dpr - (cols - 1) * gap) / cols);
    const cardH = Math.round(cardW * 1.1);
    const top = frame.y + 90 * dpr;
    ART_PIECE_IDS.forEach((id, n) => {
      const level = artLevelForPiece(id);
      if (!level) return;
      const col = n % cols;
      const row = Math.floor(n / cols);
      const x = frame.x + 16 * dpr + col * (cardW + gap);
      const y = top + row * (cardH + gap);
      const got = isUnlocked(book, id);
      const g = this.add.graphics();
      g.fillStyle(theme.panel, 1);
      g.fillRoundedRect(x, y, cardW, cardH, 12 * dpr);
      g.lineStyle(Math.max(1, dpr), got ? theme.glow : theme.dusk, got ? 0.9 : 0.6);
      g.strokeRoundedRect(x, y, cardW, cardH, 12 * dpr);
      const cell = fitCell(level, cardW - 20 * dpr, cardH - 46 * dpr);
      const px = x + (cardW - level.width * cell) / 2;
      const py = y + 10 * dpr;
      const pic = this.add.graphics();
      if (got) paintPicture(pic, level, px, py, cell);
      else paintSilhouette(pic, level, px, py, cell);
      this.add
        .text(x + cardW / 2, y + cardH - 12 * dpr, got ? level.subject!.name : "?", {
          fontFamily: theme.font,
          fontStyle: got ? "bold" : "normal",
          fontSize: `${Math.round(13 * dpr)}px`,
          color: got ? theme.text : theme.textDim,
          align: "center",
          wordWrap: { width: cardW - 12 * dpr },
        })
        .setOrigin(0.5, 1);
      if (got) {
        this.add
          .zone(x + cardW / 2, y + cardH / 2, cardW, cardH)
          .setInteractive({ useHandCursor: true })
          .on("pointerdown", () => this.showPage(id));
      }
    });

    const bw = Math.min(frame.w * 0.6, 220 * dpr);
    this.add.existing(
      new Button(this, cx, frame.y + frame.h - 40 * dpr, bw, "Back to the board", {
        dpr,
        primary: true,
        onPress: () => this.scene.start("collect"),
      }),
    );
    if (this.open) this.showPage(this.open);
  }

  private showPage(id: string): void {
    const level = artLevelForPiece(id);
    if (!level?.subject) return;
    this.open = id;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const { width, height } = this.scale.gameSize;
    const book = loadSpellbook(browserStore());
    const wins = book.entries[id]?.wins ?? 0;
    const parts: Phaser.GameObjects.GameObject[] = [];
    parts.push(
      this.add.rectangle(width / 2, height / 2, width, height, 0x140b2e, 0.96).setDepth(10),
    );
    const cell = fitCell(level, Math.min(width, 480 * dpr) * 0.84, height * 0.42);
    const g = this.add.graphics().setDepth(11);
    const x0 = Math.round((width - level.width * cell) / 2);
    const y0 = Math.round(height * 0.08);
    paintPicture(g, level, x0, y0, cell);
    parts.push(g);
    const add = (y: number, s: string, size: number, color: string, bold = false) =>
      this.add
        .text(width / 2, y, s, {
          fontFamily: theme.font,
          fontStyle: bold ? "bold" : "normal",
          fontSize: `${Math.round(size * dpr)}px`,
          color,
          align: "center",
          wordWrap: { width: Math.min(width, 480 * dpr) * 0.86 },
        })
        .setOrigin(0.5, 0)
        .setDepth(11);
    const base = y0 + level.height * cell + 16 * dpr;
    const name = add(base, level.subject.name, 25, "#f6d97a", true);
    const lore = add(name.y + name.height + 10 * dpr, level.subject.lore, 15, theme.text);
    parts.push(
      name,
      lore,
      add(
        lore.y + lore.height + 12 * dpr,
        `Completed ${wins} ${wins === 1 ? "time" : "times"}`,
        13,
        theme.textDim,
      ),
    );
    const close = () => {
      this.open = null;
      for (const p of parts) p.destroy();
    };
    const zone = this.add
      .zone(width / 2, height / 2, width, height)
      .setDepth(12)
      .setInteractive();
    zone.on("pointerdown", close);
    parts.push(zone);
    if (isReducedMotion(this)) return;
  }
}
