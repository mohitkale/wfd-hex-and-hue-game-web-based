/**
 * Builds every level in content/worlds.ts into packages/game/src/levels/generated/<world>.json.
 * Output is deterministic. A level is regenerated when its source hash (config + engine sources)
 * changed; name and lore are refreshed without regenerating.
 *
 *   npm run levels                 # regenerate stale levels
 *   npm run levels -- --force      # regenerate everything
 *   npm run levels -- moonlit-03   # also force-regenerate the named level(s)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateLevel, parseAsciiArt } from "@hexhue/core";
import { worlds } from "../../content/worlds";
import { OUTPUT_DIR, sourceHash, type BuiltLevel, type BuiltWorld } from "./format";

const args = process.argv.slice(2);
const force = args.includes("--force");
const named = new Set(args.filter((a) => !a.startsWith("--")));
const TARGET_MISS_WARNING = 0.1;

const allIds = worlds.flatMap((w) => w.levels.map((l) => l.id));
const unknown = [...named].filter((id) => !allIds.includes(id));
if (unknown.length > 0) {
  console.error(`Unknown level id(s): ${unknown.join(", ")}`);
  process.exit(1);
}
const worldIds = worlds.map((w) => w.id);
if (new Set(worldIds).size !== worldIds.length) {
  console.error(`Duplicate world ids in content/worlds.ts: ${worldIds.join(", ")}`);
  process.exit(1);
}

mkdirSync(fileURLToPath(OUTPUT_DIR), { recursive: true });

function readPrevious(file: URL): BuiltWorld | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BuiltWorld;
  } catch {
    console.warn(`Ignoring unreadable ${fileURLToPath(file)}; rebuilding it.`);
    return null;
  }
}

for (const world of worlds) {
  const file = new URL(`${world.id}.json`, OUTPUT_DIR);
  const previous = readPrevious(file);
  const levels: BuiltLevel[] = [];

  for (const config of world.levels) {
    const source = sourceHash(world, config);
    const cached = previous?.levels.find((l) => l.level.id === config.id);
    if (cached && cached.source === source && !force && !named.has(config.id)) {
      levels.push({ ...cached, lore: config.lore, level: { ...cached.level, name: config.name } });
      continue;
    }
    const started = performance.now();
    const g = generateLevel(
      parseAsciiArt(config.art),
      { id: config.id, name: config.name },
      config.generate,
    );
    const ms = Math.round(performance.now() - started);
    levels.push({
      level: g.level,
      lore: config.lore,
      solution: g.solution,
      difficulty: g.report.difficulty,
      minSlots: g.report.minSlots,
      lossRate: g.report.lossRate,
      source,
    });
    const miss =
      g.targetMiss !== undefined && g.targetMiss > TARGET_MISS_WARNING
        ? `  ⚠ target ${config.generate.targetDifficulty} missed by ${g.targetMiss.toFixed(2)}`
        : "";
    console.log(
      `${config.id.padEnd(14)} ${g.level.width}×${g.level.height} wisps=${g.report.wisps} ` +
        `difficulty=${g.report.difficulty} minSlots=${g.report.minSlots} ${ms}ms${miss}`,
    );
  }

  const built: BuiltWorld = { id: world.id, name: world.name, levels };
  writeFileSync(file, JSON.stringify(built) + "\n");
  console.log(`→ ${world.id}.json (${levels.length} levels)`);
}
