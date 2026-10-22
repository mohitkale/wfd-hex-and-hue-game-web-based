import * as art from "../art/moonlit";
import { worldLevels, type WorldCurve } from "../curve";
import type { WorldConfig } from "../types";

/** For open artworks (lots of exposed color) that need more reordering to reach their target. */
const open = { shuffle: 0.85, attempts: 16, refine: 80 };

const curve: WorldCurve = {
  world: 1,
  from: 0.08,
  to: 0.42,
  minSlots: 4,
  chunk: { min: 4, max: 10 },
};

/** World 1: moon magic. Gentle start, introduces slots and buried wisps. */
export const moonlit: WorldConfig = {
  id: "moonlit",
  name: "Moonlit Beginnings",
  levels: worldLevels("moonlit", curve, [
    [
      "First Crescent",
      "The waxing crescent: a time to set intentions and begin anew.",
      art.crescent,
    ],
    [
      "Wishing Star",
      "Stars were once read as messages; make your wish while it shines.",
      art.wishingStar,
    ],
    [
      "Candle Jar",
      "A candle carries an intention into the night long after the spell is spoken.",
      art.candleJar,
    ],
    [
      "Starry Night",
      "Count the stars and you count your blessings; there are always more than you think.",
      art.starryNight,
    ],
    [
      "Witch's Lantern",
      "A lantern in the window guides travellers and spirits safely home.",
      art.lantern,
    ],
    [
      "Full Moon Rising",
      "The full moon is a time to release what no longer serves you.",
      art.fullMoonRising,
    ],
    [
      "Phases of the Moon",
      "Crescent, half, full: each phase invites its own kind of magic.",
      art.moonPhases,
      { columns: 4 },
    ],
    [
      "Crescent and Star",
      "Moon and star together: guidance by night and hope until morning.",
      art.crescentAndStar,
      open,
    ],
    ["Shooting Star", "A falling star is the sky's way of saying: now, ask.", art.shootingStar],
    [
      "Moonflower",
      "Moonflowers open only after dusk, saving their beauty for the night.",
      art.moonflower,
    ],
    ["Witch's Hat", "Every hat has its stories; this one has seen many moons.", art.witchsHat],
    [
      "Bubbling Cauldron",
      "Stir clockwise to call things in, widdershins to send them away.",
      art.bubblingCauldron,
      open,
    ],
    ["Eclipse", "When moon meets sun, old patterns can be broken.", art.eclipse],
    [
      "The Triple Moon",
      "Maiden, Mother and Crone: waxing, full and waning, the circle of every season.",
      art.tripleMoon,
      { columns: 4 },
    ],
    [
      "Moonlit Lake",
      "Still water holds the moon twice; scrying begins with a quiet surface.",
      art.moonlitLake,
      open,
    ],
    [
      "Luna Moth",
      "The luna moth lives only by moonlight, a reminder that brief things are bright.",
      art.lunaMoth,
    ],
    [
      "Lantern Festival",
      "Many small lights make one great glow.",
      art.lanternFestival,
      { columns: 4 },
    ],
    [
      "Bat Across the Moon",
      "Bats are keepers of intuition, finding their way where eyes cannot.",
      art.batAcrossTheMoon,
    ],
    [
      "The Moon Gate",
      "Step through the round gate and leave the ordinary world behind.",
      art.moonGate,
    ],
    ["Blood Moon", "A blood moon marks endings that make room for beginnings.", art.bloodMoon],
  ]),
};
