import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Consecutive days (most recent first, including today if already fully
 * logged) where every dose due that day was taken, for one profile. Breaks
 * on the first day with a skip or an unlogged dose; days with zero doses due
 * are ignored rather than counted as a pass or a break.
 */
export async function getCurrentStreak(db: SQLiteDatabase, profileId: number): Promise<number> {
  const rows = await db.getAllAsync<{ day: string; total: number; taken: number }>(
    `SELECT date(doses.due_at) as day,
            COUNT(*) as total,
            SUM(CASE WHEN doses.status = 'taken' THEN 1 ELSE 0 END) as taken
     FROM doses
     JOIN schedules ON schedules.id = doses.schedule_id
     JOIN medications ON medications.id = schedules.medication_id
     WHERE medications.profile_id = ? AND doses.due_at <= datetime('now')
     GROUP BY day
     ORDER BY day DESC`,
    profileId
  );

  let streak = 0;
  for (const row of rows) {
    if (row.total > 0 && row.taken === row.total) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
