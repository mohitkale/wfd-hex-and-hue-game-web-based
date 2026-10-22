import * as art from "../art/zodiac";
import { worldLevels, type WorldCurve } from "../curve";
import type { WorldConfig } from "../types";

/** For open artworks (lots of exposed color) that need more reordering to reach their target. */
const open = { shuffle: 0.85, attempts: 16, refine: 80 };

const curve: WorldCurve = {
  world: 3,
  from: 0.22,
  to: 0.58,
  minSlots: 3,
  chunk: { min: 6, max: 14 },
};

/**
 * World 3: the zodiac. The twelve signs in calendar order (each on a medallion colored by its
 * element), with constellations and sky lore between them, ending on the full wheel.
 */
export const zodiac: WorldConfig = {
  id: "zodiac",
  name: "Zodiac Realm",
  levels: worldLevels("zodiac", curve, [
    [
      "The North Star",
      "Polaris holds still while the sky turns around it: a fixed point to find your way.",
      art.northStar,
    ],
    [
      "The Big Dipper",
      "Seven bright stars of the Great Bear point the way to the North Star.",
      art.bigDipper,
    ],
    ["The Comet", "Comets were once read as omens; now we simply make a wish.", art.comet],
    [
      "Aries",
      "Aries the Ram opens the zodiac with fire: bold beginnings and brave first steps.",
      art.aries,
      open,
    ],
    [
      "Taurus",
      "Taurus the Bull is earth made patient: steady, sensual and slow to be moved.",
      art.taurus,
      open,
    ],
    [
      "Gemini",
      "Gemini the Twins is air in conversation: curious, quick and always of two minds.",
      art.gemini,
      open,
    ],
    [
      "Cancer",
      "Cancer the Crab carries home within its shell: water, memory and tender care.",
      art.cancer,
      open,
    ],
    // A breather between Cancer and Leo: sparse, but it needs three slots to solve.
    [
      "Orion",
      "Orion the Hunter strides across winter skies, his three-star belt easy to find.",
      art.orion,
      open,
    ],
    [
      "Leo",
      "Leo the Lion is fire with a big heart: warm, generous and born to shine.",
      art.leo,
      open,
    ],
    [
      "Virgo",
      "Virgo the Maiden tends the harvest: earth, care and an eye for every detail.",
      art.virgo,
      open,
    ],
    [
      "Libra",
      "Libra the Scales seeks balance in all things: air, harmony and fairness.",
      art.libra,
      open,
    ],
    [
      "Sun and Moon",
      "At dawn and dusk the Sun and Moon share the sky, light and shadow in balance.",
      art.sunAndMoon,
    ],
    [
      "Scorpio",
      "Scorpio the Scorpion runs deep: water, intensity and transformation.",
      art.scorpio,
      open,
    ],
    [
      "Sagittarius",
      "Sagittarius the Archer aims past the horizon: fire, freedom and far journeys.",
      art.sagittarius,
      open,
    ],
    [
      "Capricorn",
      "Capricorn the Sea-Goat climbs patiently: earth, ambition and quiet strength.",
      art.capricorn,
      open,
    ],
    [
      "Saturn",
      "Ringed Saturn is astrology's great teacher: time, structure and hard-won wisdom.",
      art.saturn,
    ],
    [
      "Aquarius",
      "Aquarius the Water Bearer pours out new ideas for everyone: air, vision and community.",
      art.aquarius,
      open,
    ],
    [
      "Pisces",
      "Pisces the Fish swims between worlds: water, dreams and compassion.",
      art.pisces,
      open,
    ],
    [
      "The Astrolabe",
      "Astrolabes mapped the heavens by hand, centuries before the telescope.",
      art.astrolabe,
    ],
    [
      "Wheel of the Zodiac",
      "Twelve signs, four elements, one great wheel turning through the year.",
      art.zodiacWheel,
    ],
  ]),
};
