// @ts-check

import { presentBleeding } from './gaps.js';

/**
 * @ruleRef S-START
 * @param {import('./index.js').CycleDay[]} days
 * @returns {{ day: number, date: string }[]}
 */
export function detectCycleStarts(days) {
  const starts = [];
  for (let i = 0; i < days.length; i += 1) {
    const value = presentBleeding(days[i]);
    if (value == null || value < 1) continue;
    const prev1 = i > 0 ? presentBleeding(days[i - 1]) : null;
    const prev2 = i > 1 ? presentBleeding(days[i - 2]) : null;
    if (prev1 != null || prev2 != null) continue;
    starts.push({ day: i + 1, date: days[i].date });
  }
  return starts;
}
