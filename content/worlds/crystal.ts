import * as art from "../art/crystal";
import { worldLevels, type WorldCurve } from "../curve";
import type { WorldConfig } from "../types";

/** For open artworks (lots of exposed color) that need more reordering to reach their target. */
const open = { shuffle: 0.85, attempts: 16, refine: 80 };

const curve: WorldCurve = {
  world: 2,
  from: 0.15,
  to: 0.5,
  minSlots: 4,
  chunk: { min: 5, max: 12 },
};

/**
 * World 2: crystals and garden energy. More colors per board and layered gems (geodes, clusters)
 * that bury colors under others. Lore speaks of tradition and folklore, never health claims.
 */
export const crystal: WorldConfig = {
  id: "crystal",
  name: "Crystal Garden",
  levels: worldLevels("crystal", curve, [
    [
      "Amethyst Point",
      "Amethyst has long been kept by the bed for calm sleep and clear dreams.",
      art.amethystPoint,
    ],
    [
      "Rose Quartz Heart",
      "Rose quartz is the stone of gentle love, beginning with love for yourself.",
      art.roseQuartzHeart,
    ],
    [
      "Citrine Sun",
      "Citrine carries the warmth of the sun into the darkest season.",
      art.citrineSun,
    ],
    ["Pendulum", "Hold the pendulum still, ask your question, and let it swing.", art.pendulum],
    [
      "Garden Path",
      "Every path through the garden begins with a single stepping stone.",
      art.gardenPath,
      open,
    ],
    [
      "Clear Quartz Tower",
      "Clear quartz is said to amplify whatever intention you place within it.",
      art.quartzTower,
      open,
    ],
    [
      "Emerald Leaf",
      "Green for growth: what you tend with patience will flourish.",
      art.emeraldLeaf,
      open,
    ],
    [
      "Chakra Stones",
      "Seven colors from root to crown, a stone for each in rainbow order.",
      art.chakraStones,
      open,
    ],
    [
      "Crystal Cluster",
      "A cluster grows together; every point shares one root.",
      art.crystalCluster,
    ],
    ["Geode", "A plain stone can hold a cave of stars; never judge by the outer shell.", art.geode],
    [
      "Sapphire Drop",
      "Sapphire blue has long stood for wisdom and true words.",
      art.sapphireDrop,
      open,
    ],
    [
      "Crystal Grid",
      "Stones laid out with intention make a grid; the pattern holds the purpose.",
      art.crystalGrid,
    ],
    [
      "Moonstone",
      "Moonstone glows as if lit from within, like the moon on still water.",
      art.moonstone,
    ],
    [
      "Crystal Ball",
      "Scrying asks for stillness; answers rise when the mind is quiet.",
      art.crystalBall,
    ],
    [
      "Selenite Wand",
      "Selenite, named for the moon, is swept through a room to clear it with light.",
      art.selenite,
      open,
    ],
    [
      "Fairy Ring",
      "Folklore says a ring of mushrooms marks where the fae danced; step around, never through.",
      art.fairyRing,
    ],
    [
      "Crystal Lotus",
      "The lotus rises from the mud to bloom, clean and open to the sky.",
      art.crystalLotus,
    ],
    [
      "Obsidian Mirror",
      "Black mirrors were used for scrying long before glass was silvered.",
      art.obsidianMirror,
    ],
    [
      "Crystal Cave",
      "Deep in the earth, crystals grow slowly in the dark for thousands of years.",
      art.crystalCave,
    ],
    [
      "Heart of the Garden",
      "At the garden's heart lies a stone holding every color you have gathered.",
      art.heartOfTheGarden,
    ],
  ]),
};
