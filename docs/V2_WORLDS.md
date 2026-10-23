# The three v2 worlds (M13.1, structure)

What each world is, how the sixty levels are laid out on the difficulty curve, and how much of it
exists. The data is `content/worldsV2.ts` (the plan) and
`packages/game/src/collect/worldIdentity.ts` (identity and atmosphere); tests check this page against them.

> **Status: structure only.** The worlds are defined and the game gives each its own atmosphere, but
> **only 4 of the 60 levels exist** (and none is shipped to players). The rest are planned slots. The
> reason is in [V2_GENERATOR.md](V2_GENERATOR.md) and [V2_CURVE.md](V2_CURVE.md): the generator cannot
> make decisions out of a single-layer picture, so filling the worlds needs layered pictures or
> hand-designed levels. M13.1 is therefore **not ticked** in the roadmap.

## Levels and difficulty

Levels are numbered globally, as the curve numbers them, twenty to a world, so difficulty keeps
rising from world to world.

| World              | Levels | Placed  | Stages it spans                                                          |
| ------------------ | ------ | ------- | ------------------------------------------------------------------------ |
| Moonlit Beginnings | 1–20   | 4 of 20 | learn collection; blocked colours and slots; the start of partial groups |
| Crystal Garden     | 21–40  | 0 of 20 | partial groups and dependencies; ordering decisions                      |
| Zodiac Realm       | 41–60  | 0 of 20 | ordering decisions; advanced combinations                                |

(Tiers follow `tierForLevel`: tutorial 1–5, easy 6–15, medium 16–30, hard 31+.)

## Identity beyond colour

A world is recognisable by what its pictures show, how its lights move and how its lore speaks, not
by a tint:

|                          | Moonlit Beginnings                                    | Crystal Garden                                                       | Zodiac Realm                                          |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Tagline                  | Moon phases and gentle rituals by candlelight         | Minerals and magical growing things                                  | Constellations, planets and the twelve signs          |
| Subjects (art themes)    | moon, ritual                                          | crystal, familiar                                                    | astrology                                             |
| Leans on colour families | Gold, Moonstone, Amethyst, Ember                      | Teal, Moss, Rose, Amethyst                                           | Sapphire, Gold, Moonstone, Night                      |
| Lights behind the board  | **rise** slowly like candle sparks (14, gentle sway)  | **twinkle** in place like sparkling facets (22, small, bright, fast) | **orbit** slowly like wheeling stars (30, tiny, slow) |
| Backdrop                 | night violet                                          | deep green-blue                                                      | deep indigo                                           |
| Lore voice               | quiet and domestic: a hearth, a candle, a first spell | folklore of stones and green things, never a health claim            | old sky-lore: what each sign was said to watch over   |

In the game a level with a known picture takes its world from the picture's theme
(`atmosphereForTheme`): the lights behind the board and the backdrop change. Moonlit reproduces the
previous ambient look (count, size, tints, brightness and motion are tested against it), so existing
levels are unchanged; reduced motion holds every light still.
Checked in the browser pane: the amethyst cluster (Crystal) opens with 22 lights and the green-blue
backdrop, Libra (Zodiac) with 30 lights and the indigo one; the look is not yet tuned by eye on a
phone. Tests check that no art theme belongs to two worlds, that every theme except `other` is claimed, and
that the three atmospheres differ in **motion, count and speed** (not only tint).

## What exists, and what each slot is for

Placed (these pass the quality gate with their recorded deviations; see [V2_LEVEL_GATE.md](V2_LEVEL_GATE.md)):
level 1 crescent moon, 2 triple moon, 3 witch's cauldron, 16 the hand-designed Moonlit Hat (all
Moonlit). The amethyst cluster (Crystal), Libra (Zodiac) and the black cat (Crystal, `familiar`) belong
to worlds by theme but cannot be placed on the curve.

Every other slot has a plan (its world's subjects plus the skill its stage teaches), listed by
`slots()`. For example level 21 is "a crystal or familiar picture · partial groups and dependencies: a
group may be too big for what is open", and level 55 is "an astrology picture · advanced combinations".

## Known gaps in this structure

- **No gate of its own for the plan.** `worldsV2.ts` is checked by tests only; the four placed levels are
  gated through the pool (`levels:check`), and nothing is shipped, so "all shipped levels pass the
  gate" is true only vacuously.
- **Dependency direction.** `content/worldsV2.ts` imports the identity data from `packages/game` (pure,
  no imports). A tidier home for the non-rendering identity (themes, families, voice) is `content/`,
  with the game keeping only the atmosphere; deferred.
- **Look not tuned.** The three atmospheres differ in motion, count, size and speed, but have not been
  tuned by eye on a phone; the orbit speed (a few pixels a second) is a first guess.
- **M13.2 and M13.3 stay blocked** until the worlds are filled (they need M13.1).

## What is missing

- **Fifty-six levels**, and the pictures for them. The approved art direction (G2) covers the style;
  the pictures themselves are not drawn. To pass the gate at stage 2 and later each needs real
  decisions: a **layered** subject (a figure over a backdrop, an object inside a frame) or a
  hand-designed level like the slice, not a generated one.
- **A world map.** The v2 build has no map screen; the atmosphere is the only world identity players
  see so far, and only on a level whose picture is known. The v1 world map is untouched.
- Spellbook sections, world-specific completion moments and seals are M13.2 and M13.3.
