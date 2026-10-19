/**
 * Display helpers for the food log (pure, so they can be unit-tested).
 */
import { addDays, type IsoDate } from '@/engine/dates';

/** "Today", "Yesterday", "Tomorrow", or a short date such as "Sat, Oct 10". */
export function dayTitle(date: IsoDate, today: IsoDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const fmt = (x: number, digits: number) => x.toLocaleString(undefined, { maximumFractionDigits: digits });

/** "2 × ½ cup", or the total in g/mL for 100 g portions and entries without portion info. */
export function entryAmount(e: {
  amount: number;
  unit: 'g' | 'ml';
  quantity: number | null;
  servingLabel: string | null;
}): string {
  if (e.quantity !== null && e.servingLabel && !/^100\s*(g|ml)$/i.test(e.servingLabel)) {
    return `${fmt(e.quantity, 2)} × ${e.servingLabel}`;
  }
  return `${fmt(e.amount, 1)} ${e.unit === 'ml' ? 'mL' : 'g'}`;
}
