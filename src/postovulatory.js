// @ts-check

import { hasApplicableSign, isFertileSign } from './preovulatory.js';

/**
 * @ruleRef X-POST
 * docs/contrat-moteur.md §2 ter - règle propre à Boussole (issue #86), pas une règle de la méthode :
 * après la validation, la glaire (ou le col) reste lue jusqu'à la fin du cycle.
 * Elle ne peut que retirer des jours infertiles.
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} startDay jour de validation de la phase post-ovulatoire
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @returns {{ stopDay: number | null, uncertainDays: number[] }}
 */
export function surveillePostOvulatory(cycle, startDay, secondarySymptom) {
  /** @type {number[]} */
  const uncertainDays = [];
  for (let day = startDay + 1; day <= cycle.length; day += 1) {
    const row = cycle[day - 1];
    if (isFertileSign(row, secondarySymptom)) return { stopDay: day, uncertainDays };
    if (!hasApplicableSign(row, secondarySymptom)) uncertainDays.push(day);
  }
  return { stopDay: null, uncertainDays };
}

/**
 * @ruleRef X-POST
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {{ startDay: number, startDate: string, time: string, stopDay?: number, stopDate?: string, stopRuleId?: string, uncertainDays?: number[] }} post
 * @param {{ stopDay: number | null, uncertainDays: number[] }} watch
 * @returns {{
 *   post: { startDay: number, startDate: string, time: string, stopDay?: number, stopDate?: string, stopRuleId?: string, uncertainDays?: number[] },
 *   warnings: object[],
 *   trace: { ruleId: string, day?: number, detail?: string }[],
 * }}
 */
export function applyPostSurveillance(cycle, post, watch) {
  const warnings = watch.uncertainDays.map((day) => ({
    code: 'post_ovulatory_day_unknown',
    day,
    date: cycle[day - 1].date,
    message: 'Jour sans signe après la validation : infertilité non établie.',
  }));
  const trace = [];
  const extended = { ...post };
  if (watch.uncertainDays.length > 0) extended.uncertainDays = watch.uncertainDays;
  if (watch.stopDay != null) {
    extended.stopDay = watch.stopDay;
    extended.stopDate = cycle[watch.stopDay - 1].date;
    extended.stopRuleId = 'X-POST';
    trace.push({ ruleId: 'X-POST', day: watch.stopDay, detail: 'signe fertile après la validation' });
    warnings.push({
      code: 'post_ovulatory_stopped_by_fertile_sign',
      day: watch.stopDay,
      date: extended.stopDate,
      message: 'Signe fertile après la validation : la phase infertile s’arrête.',
    });
  }
  return { post: extended, warnings, trace };
}
