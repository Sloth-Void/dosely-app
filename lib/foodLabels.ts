import type { FoodPreference } from '../db/types';

export const FOOD_LABELS: Record<FoodPreference, string> = {
  none: '',
  with_food: 'Take on a full stomach',
  empty_stomach: 'Take on an empty stomach',
};
