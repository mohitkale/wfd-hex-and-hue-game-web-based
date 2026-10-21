/**
 * Builds every level in content/worlds.ts into packages/game/src/levels/generated/<world>.json.
 * Output is deterministic; levels whose inputs are unchanged are reused unless --force is given.
 *
 *   npm run levels            # rebuild changed levels
 *   npm run levels -- --force # rebuild everything
 *   npm run levels -- moonlit-03
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateLevel, parseAsciiArt } from "@hexhue/core";
import { worlds } from "../../content/worlds";
import { OUTPUT_DIR, sourceHash, type BuiltLevel, type BuiltWorld } from "./format";

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const TARGET_MISS_WARNING = 0.1;

mkdirSync(fileURLToPath(OUTPUT_DIR), { recursive: true });

for (const world of worlds) {
  const file = new URL(`${world.id}.json`, OUTPUT_DIR);
  const previous: BuiltWorld | null = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as BuiltWorld)
    : null;
  const levels: BuiltLevel[] = [];

  for (const config of world.levels) {
    const source = sourceHash(world, config);
    const cached = previous?.levels.find((l) => l.level.id === config.id);
    const wanted = only.length === 0 || only.includes(config.id);
    if (cached && cached.source === source && !force && !(only.length > 0 && wanted)) {
      levels.push({ ...cached, lore: config.lore, level: { ...cached.level, name: config.name } });
      continue;
    }
    const started = performance.now();
    const g = generateLevel(parseAsciiArt(config.art), config, config.generate);
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
