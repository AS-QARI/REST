type RecordSession = {
  id: string;
  completedAt: string;
  exercises: {
    exerciseId: string;
    sets: { type: string; weightKg: number; reps: number }[];
  }[];
};

// Compare each session with the entire history before it, never the visible
// date range. Sessions at the same timestamp share the same prior baseline.
// Deriving this from logs also keeps backdated edits and deletions accurate.
export function buildSessionRecords(sessions: readonly RecordSession[]) {
  const records = new Map<string, Set<string>>();
  const bestWeights = new Map<string, number>();
  const chronological = [...sessions].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));

  for (let start = 0; start < chronological.length;) {
    let end = start + 1;
    while (end < chronological.length && Date.parse(chronological[end].completedAt) === Date.parse(chronological[start].completedAt)) end += 1;
    const batchWeights = new Map<string, number>();
    for (const session of chronological.slice(start, end)) {
      const exerciseRecords = new Set<string>();
      for (const exercise of session.exercises) {
        const weight = exercise.sets.reduce((best, set) =>
          set.type === "working" && set.reps > 0 && Number.isFinite(set.weightKg)
            ? Math.max(best, set.weightKg) : best, 0);
        if (weight > (bestWeights.get(exercise.exerciseId) ?? 0)) exerciseRecords.add(exercise.exerciseId);
        batchWeights.set(exercise.exerciseId, Math.max(batchWeights.get(exercise.exerciseId) ?? 0, weight));
      }
      if (exerciseRecords.size) records.set(session.id, exerciseRecords);
    }
    for (const [id, weight] of batchWeights) bestWeights.set(id, Math.max(bestWeights.get(id) ?? 0, weight));
    start = end;
  }
  return records;
}
