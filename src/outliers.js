// @ts-check

import { presentTemperatureTw } from './temperature.js';

const ISOLATED_DELTA_TW = 4;

/**
 * @ruleRef D-OUTLIER
 * SPEC.md - Perturbation : seulement vers le haut, en phase basse.
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} [lastLowDay] dernier jour de la phase basse (veille du 1er point haut confirmé)
 * @returns {{ code: string, day: number, date: string, message: string }[]}
 */
export function flagTemperature(cycle, lastLowDay = cycle.length) {
  const warnings = [];
  for (let i = 0; i < Math.min(cycle.length, lastLowDay); i += 1) {
    const tw = presentTemperatureTw(cycle[i]);
    if (tw == null) continue;
    const prev = nearestTemp(cycle, i, -1);
    const next = nearestTemp(cycle, i, 1);
    if (prev == null || next == null) continue;
    if (tw >= prev + ISOLATED_DELTA_TW && tw >= next + ISOLATED_DELTA_TW) {
      warnings.push({
        code: 'possible_outlier_temperature',
        day: i + 1,
        date: cycle[i].date,
        message: 'Pic de température isolé - perturbation possible ?',
      });
    }
  }
  return warnings;
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} index
 * @param {number} step
 * @returns {number | null}
 */
function nearestTemp(cycle, index, step) {
  for (let i = index + step; i >= 0 && i < cycle.length; i += step) {
    const tw = presentTemperatureTw(cycle[i]);
    if (tw != null) return tw;
  }
  return null;
}
