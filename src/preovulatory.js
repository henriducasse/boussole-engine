// @ts-check

import { isFertileCervix } from './cervix.js';
import { presentCervix, presentMucusQuality } from './gaps.js';

/**
 * @ruleRef P-NONE
 * @param {{ detected?: boolean } | null | undefined} previousShift
 * @returns {boolean}
 */
export function requirePreviousShift(previousShift) {
  return previousShift != null && previousShift.detected === true;
}

/**
 * @ruleRef P-5DAY
 * @returns {number}
 */
export function defaultFiveDays() {
  return 5;
}

/**
 * @ruleRef P-M8
 * @ruleRef P-M8-ZERO
 * @param {number[]} firstHighDays
 * @returns {number} earliest first high minus 8 - 0 is a legitimate result
 */
export function minusEight(firstHighDays) {
  let earliest = firstHighDays[0];
  for (const day of firstHighDays) {
    if (day < earliest) earliest = day;
  }
  return earliest - 8;
}

/**
 * @param {number[]} firstHighDays
 * @param {number} usableCount
 */
export function resolveMinusEightWindow(firstHighDays, usableCount) {
  const minus8 = minusEight(firstHighDays);
  if (minus8 < 5) {
    const endDay = minus8 < 0 ? 0 : minus8;
    return { endDay, ruleId: minus8 === 0 ? 'P-M8-ZERO' : 'P-M8' };
  }
  if (minus8 > 5 && usableCount >= 12) {
    return { endDay: minus8, ruleId: 'P-M8' };
  }
  return { endDay: defaultFiveDays(), ruleId: 'P-5DAY' };
}

/**
 * @ruleRef P-STOP
 * Jour de trace = jour du signe fertile, pas le dernier jour de fenêtre.
 * @param {{ ruleId?: string, endDay: number, warning?: { day?: number } | null }} pre
 * @returns {number}
 */
export function traceDayForPreovulatory(pre) {
  if (pre.ruleId === 'P-STOP' && pre.warning?.day != null) return pre.warning.day;
  return pre.endDay;
}

/**
 * @ruleRef P-STOP
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} endDay
 * @param {'mucus' | 'cervix'} secondarySymptom
 */
export function stopOnFertileSign(cycle, endDay, secondarySymptom) {
  if (endDay <= 0) return { endDay: 0, stoppedAt: null };
  const last = Math.min(endDay, cycle.length);
  for (let day = 1; day <= last; day += 1) {
    if (!isFertileSign(cycle[day - 1], secondarySymptom)) continue;
    return { endDay: day - 1, stoppedAt: day };
  }
  return { endDay, stoppedAt: null };
}

/**
 * @ruleRef P-5DAY
 * SPEC.md - l'absence de signal ne démontre pas l'infertilité.
 * @param {import('./index.js').CycleDay} row
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @returns {boolean}
 */
export function hasApplicableSign(row, secondarySymptom) {
  if (secondarySymptom === 'mucus') return presentMucusQuality(row) != null;
  return presentCervix(row) != null;
}

/**
 * @ruleRef P-5DAY
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} endDay
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @returns {boolean}
 */
export function refusesUngroundedWindow(cycle, endDay, secondarySymptom) {
  return endDay > 0 && !hasApplicableSign(cycle[0], secondarySymptom);
}

/**
 * @ruleRef P-5DAY
 * SPEC.md - ce n'est pas à l'absence de signal de démontrer
 * l'infertilité : la fenêtre s'arrête avant le premier jour observé sans signe
 * secondaire (contrat §9, issue #74). Les jours pas encore écoulés ne sont pas
 * des trous.
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} endDay
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @returns {number} dernier jour de la fenêtre, avant tout trou
 */
export function endBeforeGap(cycle, endDay, secondarySymptom) {
  const last = Math.min(endDay, cycle.length);
  for (let day = 1; day <= last; day += 1) {
    if (!hasApplicableSign(cycle[day - 1], secondarySymptom)) return day - 1;
  }
  return endDay;
}

/**
 * @ruleRef P-STOP
 * @param {import('./index.js').CycleDay} row
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @returns {boolean}
 */
export function isFertileSign(row, secondarySymptom) {
  if (secondarySymptom === 'mucus') {
    const quality = presentMucusQuality(row);
    return quality != null && quality >= 2;
  }
  const cervix = presentCervix(row);
  return cervix != null && isFertileCervix(cervix);
}

/**
 * @ruleRef P-M8-GAP
 * docs/contrat-moteur.md §9 (issue #130) - un ancien cycle que le moteur refuse
 * de lire (trou) ne doit jamais allonger la fenêtre : il la plafonne à son premier
 * candidat, le premier jour au-dessus de la ligne même non confirmé. Sans
 * candidat connu (aucune température), le cycle reste ignoré.
 * @param {{
 *   evaluable?: boolean,
 *   trace?: { ruleId?: string, day?: number }[],
 *   reasons?: { ruleId?: string, day?: number }[],
 * }} shift
 * @returns {number | null}
 */
export function unreadableCandidateDay(shift) {
  if (shift.evaluable !== false) return null;
  const candidate = (shift.trace ?? []).find((row) => row.ruleId === 'T-LTL' && row.day != null);
  if (candidate) return /** @type {number} */ (candidate.day);
  // Sans ligne de base, le jour du trou borne par le bas le 1er point haut.
  const gap = (shift.reasons ?? []).find((reason) => reason.ruleId === 'D-GAP-LTL' && reason.day != null);
  return gap ? /** @type {number} */ (gap.day) : null;
}

/**
 * @typedef {{
 *   detected?: boolean,
 *   firstHighDay?: number,
 *   evaluable?: boolean,
 *   trace?: { ruleId?: string, day?: number }[],
 *   reasons?: { ruleId?: string, day?: number }[],
 * }} PreviousShift
 */

/**
 * @param {PreviousShift[]} previousShifts
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {'mucus' | 'cervix'} secondarySymptom
 */
export function evaluatePreovulatory(previousShifts, cycle, secondarySymptom) {
  const mostRecent = previousShifts[0];
  if (!requirePreviousShift(mostRecent)) {
    return { endDay: 0, ruleId: 'P-NONE', warning: null };
  }
  const usable = previousShifts.filter((shift) => shift.detected === true && shift.firstHighDay != null);
  const caps = previousShifts.map(unreadableCandidateDay).filter((day) => day != null);
  const firstHighDays = [
    ...usable.map((shift) => /** @type {number} */ (shift.firstHighDay)),
    ...(/** @type {number[]} */ (caps)),
  ];
  const window = resolveMinusEightWindow(firstHighDays, usable.length);
  const stopped = stopOnFertileSign(cycle, window.endDay, secondarySymptom);
  if (refusesUngroundedWindow(cycle, stopped.endDay, secondarySymptom)) {
    return { endDay: 0, ruleId: window.ruleId, warning: null, ungrounded: true };
  }
  const grounded = endBeforeGap(cycle, stopped.endDay, secondarySymptom);
  if (grounded < stopped.endDay) {
    return { endDay: grounded, ruleId: window.ruleId, warning: null };
  }
  if (stopped.stoppedAt != null) {
    return {
      endDay: stopped.endDay,
      ruleId: 'P-STOP',
      warning: {
        code: 'preovu_stopped_by_fertile_sign',
        day: stopped.stoppedAt,
        date: cycle[stopped.stoppedAt - 1]?.date ?? '',
        message: 'Fenêtre pré-ovulatoire interrompue par un signe fertile.',
      },
    };
  }
  return { endDay: window.endDay, ruleId: window.ruleId, warning: null };
}
