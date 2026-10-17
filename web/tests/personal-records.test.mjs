import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/personal-records.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildSessionRecords } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function session(id, day, weightKg, exerciseId = "squat", type = "working", reps = 8) {
  return { id, completedAt: `2026-10-${day}T12:00:00Z`, exercises: [{ exerciseId, sets: [{ weightKg, type, reps }] }] };
}

test("historical breakthroughs survive newer records; ties and regressions have no flame", () => {
  const logs = [session("latest", "18", 70), session("tie", "17", 60), session("lower", "16", 45), session("pr", "15", 60), session("first", "01", 50)];
  const records = buildSessionRecords(logs);
  assert.deepEqual([...records.keys()], ["first", "pr", "latest"]);
  assert.deepEqual([...records.get("pr")], ["squat"]);
  assert.equal(logs[0].id, "latest", "does not reorder stored history");
});

test("uses the full history even when older than the visible four sessions", () => {
  const logs = [session("old", "01", 100), ...[14, 15, 16, 17, 18].map((day) => session(String(day), String(day), 60))];
  assert.deepEqual([...buildSessionRecords(logs).keys()], ["old"]);
});

test("only valid working weights count, with independent baselines per exercise", () => {
  const logs = [session("warmup", "01", 200, "squat", "warmup"), session("zero", "02", 0), session("invalid", "03", 150, "squat", "working", 0), session("first", "04", 50), session("bench", "05", 20, "bench"), session("infinite", "06", Infinity)];
  assert.deepEqual([...buildSessionRecords(logs).keys()], ["first", "bench"]);
});

test("editing, deleting and backdating logs recomputes which sessions broke records", () => {
  const first = session("first", "01", 100);
  const later = session("later", "18", 80);
  assert.equal(buildSessionRecords([later, first]).has("later"), false);
  assert.equal(buildSessionRecords([later, session("first", "01", 70)]).has("later"), true);
  assert.equal(buildSessionRecords([later]).has("later"), true);
});

test("multiple sessions on one day are compared chronologically; equal timestamps share a baseline", () => {
  const first = session("first", "18", 50);
  const later = { ...session("later", "18", 60), completedAt: "2026-10-18T15:00:00Z" };
  const tie = { ...session("tie", "18", 60), completedAt: "2026-10-18T18:00:00Z" };
  assert.deepEqual([...buildSessionRecords([tie, later, first]).keys()], ["first", "later"]);
  assert.deepEqual([...buildSessionRecords([session("a", "18", 50), session("b", "18", 60)]).keys()], ["a", "b"]);
});

test("one session can break records in several exercises and uses its heaviest working set", () => {
  const previous = session("previous", "01", 50);
  const current = session("current", "18", 40);
  current.exercises[0].sets.push({ weightKg: 55, reps: 5, type: "working" });
  current.exercises.push(session("unused", "18", 20, "bench").exercises[0]);
  assert.deepEqual([...buildSessionRecords([current, previous]).get("current")], ["squat", "bench"]);
  assert.equal(buildSessionRecords([]).size, 0);
});
