import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/exercise-performance.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { exercisePerformanceTone } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const sets = (...pairs) => pairs.map(([weightKg, reps, type = "working"]) => ({ weightKg, reps, type }));

test("first time or no earlier session at this weight has no color", () => {
  assert.equal(exercisePerformanceTone(sets([40, 8]), []), null);
  assert.equal(exercisePerformanceTone(sets([35, 8]), [sets([40, 8])]), null);
});

test("new top weight is violet even with fewer reps", () => {
  assert.equal(exercisePerformanceTone(sets([45, 3]), [sets([40, 10], [40, 10])]), "record");
  assert.equal(exercisePerformanceTone(sets([40, 8]), [sets([40, 8])]), null, "tie is not a record");
});

test("same weight is compared with the latest earlier session at that weight", () => {
  const previous = [sets([30, 12]), sets([40, 8], [40, 7]), sets([40, 5], [40, 5])];
  assert.equal(exercisePerformanceTone(sets([40, 8], [40, 7]), previous), null, "equal to last time");
  assert.equal(exercisePerformanceTone(sets([40, 9], [40, 7]), previous), "progress");
  assert.equal(exercisePerformanceTone(sets([40, 7], [40, 6]), previous), "dip", "every set lower");
  assert.equal(exercisePerformanceTone(sets([40, 7], [40, 8]), previous), null, "mixed with no net gain");
});

test("warm-ups are ignored on both sides", () => {
  assert.equal(exercisePerformanceTone(sets([60, 2, "warmup"], [40, 9]), [sets([40, 8])]), "progress");
  assert.equal(exercisePerformanceTone(sets([60, 2, "warmup"]), [sets([40, 8])]), null);
});
