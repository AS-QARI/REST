type PerformanceSet = { type: string; weightKg: number; reps: number };

export type PerformanceTone = "record" | "progress" | "dip";

// Grades one exercise on one day against its own history.
// `previous` holds the earlier sessions' sets for the same exercise, newest first.
//
// - record:   the top working weight beats every weight lifted before.
// - progress: same top weight as the latest earlier session that used it, more reps.
// - dip:      same top weight, and every compared set came in with fewer reps.
// - null:     first time, no earlier session at this weight, or a matching day.
//
// "Usual" is the most recent earlier session at the same weight, compared set by
// set (set 1 with set 1, …). Progressive overload is judged against last time, and
// an average would keep flagging a day as better after it has become the new norm.
export function exercisePerformanceTone(
  today: readonly PerformanceSet[],
  previous: readonly (readonly PerformanceSet[])[],
): PerformanceTone | null {
  const working = (sets: readonly PerformanceSet[]) =>
    sets.filter((set) => set.type === "working" && set.reps > 0 && Number.isFinite(set.weightKg));

  const todayWorking = working(today);
  if (!todayWorking.length) return null;
  const topWeight = Math.max(...todayWorking.map((set) => set.weightKg));

  let previousBest = -Infinity;
  let baseline: number[] | null = null;
  for (const sets of previous) {
    const prior = working(sets);
    for (const set of prior) previousBest = Math.max(previousBest, set.weightKg);
    if (!baseline) {
      const atWeight = prior.filter((set) => set.weightKg === topWeight).map((set) => set.reps);
      if (atWeight.length) baseline = atWeight;
    }
  }

  if (previousBest === -Infinity) return null;
  if (topWeight > previousBest) return "record";
  if (!baseline) return null;

  const todayReps = todayWorking.filter((set) => set.weightKg === topWeight).map((set) => set.reps);
  const pairs = Math.min(todayReps.length, baseline.length);
  let todayTotal = 0;
  let baselineTotal = 0;
  let lower = 0;
  for (let index = 0; index < pairs; index += 1) {
    todayTotal += todayReps[index];
    baselineTotal += baseline[index];
    if (todayReps[index] < baseline[index]) lower += 1;
  }
  if (lower === pairs) return "dip";
  if (todayTotal > baselineTotal) return "progress";
  return null;
}
