import type { ScheduleRow } from '../db/types';

export const GENERATION_WINDOW_DAYS = 7;

/**
 * Pure function: given a schedule, returns every future dose datetime within
 * the window. No DB or notification calls here so this stays easy to test.
 */
export function nextOccurrences(
  schedule: ScheduleRow,
  windowDays: number = GENERATION_WINDOW_DAYS,
  from: Date = new Date()
): Date[] {
  const times = JSON.parse(schedule.times) as string[];
  const activeDays = schedule.days_of_week
    ? (JSON.parse(schedule.days_of_week) as number[])
    : null;

  const occurrences: Date[] = [];

  for (let dayOffset = 0; dayOffset < windowDays; dayOffset++) {
    const date = new Date(from);
    date.setDate(date.getDate() + dayOffset);
    if (activeDays && !activeDays.includes(date.getDay())) continue;

    for (const time of times) {
      const [hours, minutes] = time.split(':').map(Number);
      const occurrence = new Date(date);
      occurrence.setHours(hours, minutes, 0, 0);
      if (occurrence.getTime() > from.getTime()) {
        occurrences.push(occurrence);
      }
    }
  }

  return occurrences.sort((a, b) => a.getTime() - b.getTime());
}
