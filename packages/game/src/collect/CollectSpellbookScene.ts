import Phaser from "phaser";
import { theme } from "../theme";
import { Button } from "../view/Button";
import { DragScroll } from "../view/DragScroll";
import { fadeIn } from "../view/transition";
import { artLevelForPiece } from "./artLevels";
import { computeCollectLayout } from "./collectLayout";
import { buildGallery, pageFor } from "./gallery";
import { fitCell, paintPicture, paintSilhouette } from "./pictureView";
import { browserStore, loadSpellbook } from "./v2Spellbook";

/**
 * The v2 Spellbook as a collectible gallery (M11.5, M13.2): the art library grouped by world, each
 * picture finished with its name once you have completed it and a silhouette until then. Tap a
 * collected card to read its page (lore, completions, first date) and play it again. Review build
 * only (`?engine=v2`); the shipped game's Spellbook is untouched.
 */
export class CollectSpellbookScene extends Phaser.Scene {
  private open: string | null = null;
  private scroller!: DragScroll;

  constructor() {
    super("collect-spellbook");
  }

  create(): void {
    this.open = null;
    this.cameras.main.setBackgroundColor(theme.night);
    this.cameras.main.setScroll(0, 0);
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    this.scroller = new DragScroll(this, dpr);
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
    const gallery = buildGallery(loadSpellbook(browserStore()));
    const cx = frame.x + frame.w / 2;
    const headerH = frame.y + 80 * dpr;
    const footerH = 84 * dpr;

    // Scrolling content: sections of two-column cards under the sticky header.
    const cols = 2;
    const gap = 12 * dpr;
    const side = 16 * dpr;
    const cardW = Math.floor((frame.w - 2 * side - (cols - 1) * gap) / cols);
    const cardH = Math.round(cardW * 1.1);
    let y = headerH + 8 * dpr;
    for (const section of gallery.sections) {
      this.add.text(frame.x + side, y, section.name, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(18 * dpr)}px`,
        color: "#f6d97a",
      });
      this.add
        .text(
          frame.x + frame.w - side,
          y + 2 * dpr,
          `${section.collected} of ${section.cards.length}`,
          {
            fontFamily: theme.font,
            fontSize: `${Math.round(13 * dpr)}px`,
            color: theme.textDim,
          },
        )
        .setOrigin(1, 0);
      y += 26 * dpr;
      if (section.tagline) {
        const tag = this.add.text(frame.x + side, y, section.tagline, {
          fontFamily: theme.font,
          fontSize: `${Math.round(13 * dpr)}px`,
          color: theme.textDim,
          wordWrap: { width: frame.w - 2 * side },
        });
        y += tag.height + 10 * dpr;
      }
      section.cards.forEach((card, n) => {
        const level = artLevelForPiece(card.pieceId);
        if (!level) return;
        const x = frame.x + side + (n % cols) * (cardW + gap);
        const cy = y + Math.floor(n / cols) * (cardH + gap);
        const got = card.collected;
        const g = this.add.graphics();
        g.fillStyle(theme.panel, 1);
        g.fillRoundedRect(x, cy, cardW, cardH, 12 * dpr);
        g.lineStyle(Math.max(1, dpr), got ? theme.glow : theme.dusk, got ? 0.9 : 0.6);
        g.strokeRoundedRect(x, cy, cardW, cardH, 12 * dpr);
        const cell = fitCell(level, cardW - 20 * dpr, cardH - 46 * dpr);
        const px = x + (cardW - level.width * cell) / 2;
        const py = cy + 10 * dpr;
        const pic = this.add.graphics();
        if (got) paintPicture(pic, level, px, py, cell);
        else paintSilhouette(pic, level, px, py, cell);
        this.add
          .text(x + cardW / 2, cy + cardH - 12 * dpr, card.name ?? "?", {
            fontFamily: theme.font,
            fontStyle: got ? "bold" : "normal",
            fontSize: `${Math.round(13 * dpr)}px`,
            color: got ? theme.text : theme.textDim,
            align: "center",
            wordWrap: { width: cardW - 12 * dpr },
          })
          .setOrigin(0.5, 1);
        if (got) {
          // A drag that scrolls the book is not a tap on a card.
          this.add
            .zone(x + cardW / 2, cy + cardH / 2, cardW, cardH)
            .setInteractive({ useHandCursor: true })
            .on("pointerup", () => {
              if (!this.scroller.dragging && this.scroller.enabled) this.showPage(card.pieceId);
            });
        }
      });
      y += Math.ceil(section.cards.length / cols) * (cardH + gap) + 12 * dpr;
    }
    this.scroller.setMax(y + footerH - height);

    // Sticky header and footer; interactive so taps do not reach cards scrolled beneath them.
    const bar = (top: number, h: number): void => {
      this.add
        .rectangle(width / 2, top + h / 2, width, h, theme.night, 1)
        .setScrollFactor(0)
        .setDepth(5)
        .setInteractive();
    };
    bar(0, headerH);
    bar(height - footerH, footerH);
    this.add
      .text(cx, frame.y + 14 * dpr, "Spellbook", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(26 * dpr)}px`,
        color: "#f6d97a",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(6);
    this.add
      .text(cx, frame.y + 50 * dpr, `${gallery.collected} of ${gallery.total} collected`, {
        fontFamily: theme.font,
        fontSize: `${Math.round(14 * dpr)}px`,
        color: theme.textDim,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(6);
    const bw = Math.min(frame.w * 0.6, 220 * dpr);
    const back = new Button(this, cx, height - footerH / 2, bw, "Back to the board", {
      dpr,
      primary: true,
      onPress: () => this.scene.start("collect"),
    });
    this.add.existing(back);
    back.setScrollFactor(0).setDepth(6);
    if (this.open) this.showPage(this.open);
  }

  /** A collected picture's page: finished art, name, lore, and a way to play it again. */
  private showPage(id: string): void {
    const level = artLevelForPiece(id);
    const page = pageFor(loadSpellbook(browserStore()), id);
    if (!level || !page) return;
    this.open = id;
    this.scroller.enabled = false;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const { width, height } = this.scale.gameSize;
    const insets = (this.registry.get("insets") as { top: number; bottom: number } | undefined) ?? {
      top: 0,
      bottom: 0,
    };
    const parts: Phaser.GameObjects.GameObject[] = [];
    const fixed = <
      T extends Phaser.GameObjects.GameObject & {
        setScrollFactor(n: number): T;
        setDepth(n: number): T;
      },
    >(
      o: T,
    ): T => {
      parts.push(o);
      return o.setScrollFactor(0).setDepth(11);
    };
    fixed(
      this.add.rectangle(width / 2, height / 2, width, height, 0x140b2e, 0.97),
    ).setInteractive();
    const cell = fitCell(level, Math.min(width, 480 * dpr) * 0.84, height * 0.36);
    const g = fixed(this.add.graphics());
    const x0 = Math.round((width - level.width * cell) / 2);
    const y0 = Math.round(insets.top + height * 0.05);
    paintPicture(g, level, x0, y0, cell);
    const text = (y: number, s: string, size: number, color: string, bold = false) =>
      fixed(
        this.add
          .text(width / 2, y, s, {
            fontFamily: theme.font,
            fontStyle: bold ? "bold" : "normal",
            fontSize: `${Math.round(size * dpr)}px`,
            color,
            align: "center",
            wordWrap: { width: Math.min(width, 480 * dpr) * 0.86 },
          })
          .setOrigin(0.5, 0),
      );
    const name = text(y0 + level.height * cell + 14 * dpr, page.name, 25, "#f6d97a", true);
    const world = text(name.y + name.height + 4 * dpr, page.worldName, 13, theme.textDim);
    const lore = text(world.y + world.height + 10 * dpr, page.lore, 15, theme.text);
    const when = page.firstOn ? ` · first on ${page.firstOn}` : "";
    text(lore.y + lore.height + 12 * dpr, `${page.completions}${when}`, 13, theme.textDim);

    const close = () => {
      this.open = null;
      this.scroller.enabled = true;
      for (const p of parts) p.destroy();
    };
    const bw = Math.min(width * 0.6, 220 * dpr);
    const by = height - insets.bottom - 36 * dpr;
    const buttons = [
      new Button(this, width / 2, by - 56 * dpr, bw, "Play it again", {
        dpr,
        primary: true,
        onPress: () => {
          this.registry.set("v2.level", page.levelId);
          this.scene.start("collect");
        },
      }),
      new Button(this, width / 2, by, bw, "Close", { dpr, onPress: close }),
    ];
    for (const b of buttons) {
      this.add.existing(b);
      b.setScrollFactor(0).setDepth(12);
      parts.push(b);
    }
  }
}
