import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { theme } from "./theme";

/** Mounts the game into `parent`, filling it and tracking its size. */
export function mountGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: theme.night,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    input: { activePointers: 2 },
    disableContextMenu: true,
    scene: [BootScene],
  });
}
