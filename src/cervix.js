// @ts-check

import { presentCervix } from './gaps.js';
import { confirmThreeLower, detectedSecondary } from './mucus.js';
import { describeSecondary } from './progress.js';

/**
 * Convention moteur : opening 0 = fermé, firmness 0 = ferme (pôle infertile).
 * Col fertile (P-STOP) = ouvert (opening ≥ 1) ou mou (firmness === 1).
 * @param {{ opening: number, firmness: number }} cervix
 */
export function isClosedAndFirm(cervix) {
  return cervix.opening === 0 && cervix.firmness === 0;
}

/**
 * @param {{ opening: number, firmness: number }} cervix
 */
export function isFertileCervix(cervix) {
  return cervix.opening > 0 || cervix.firmness === 1;
}

/**
 * @ruleRef C-PEAK
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} [searchFrom]
 * @param {number} [lastDay]
 * @returns {{ peakDay: number, peakQuality: number } | null}
 */
export function findPeak(cycle, searchFrom = 1, lastDay = cycle.length) {
  /** @type {number | null} */
  let peakDay = null;
  const end = Math.min(lastDay, cycle.length);
  for (let i = searchFrom - 1; i < end; i += 1) {
    const cervix = presentCervix(cycle[i]);
    if (cervix != null && !isClosedAndFirm(cervix)) peakDay = i + 1;
    // SPEC.md - trois jours fermés et fermes, puis surveillance jusqu'à la fin d'évaluation (C-EXT).
    if (peakDay != null && i + 1 >= peakDay + 3 && confirmThreeLower(cycle, peakDay, 1, closedFirmQuality).status === 'ok') {
      return { peakDay, peakQuality: 1 };
    }
  }
  if (peakDay == null) return null;
  return { peakDay, peakQuality: 1 };
}

/**
 * @ruleRef C-EXT
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} peakDay
 * @param {number | null} tempCompleteDay
 * @returns {{ ok: true } | { ok: false, day: number }}
 */
export function extendSurveillance(cycle, peakDay, tempCompleteDay) {
  const until = tempCompleteDay ?? cycle.length;
  for (let day = peakDay + 4; day <= until && day <= cycle.length; day += 1) {
    const cervix = presentCervix(cycle[day - 1]);
    if (cervix != null && !isClosedAndFirm(cervix)) return { ok: false, day };
  }
  return { ok: true };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number | null} [tempCompleteDay]
 */
export function evaluateCervixShift(cycle, tempCompleteDay = null) {
  /** @type {{ ruleId: string, day?: number, detail?: string }[]} */
  const trace = [];
  /** @param {{ peakDay: number, peakQuality: number } | null} peak */
  const tell = (peak) => describeSecondary(cycle, 'cervix', peak, tempCompleteDay, closedFirmQuality);
  let searchFrom = 1;
  while (searchFrom <= cycle.length) {
    const peak = findPeak(cycle, searchFrom, tempCompleteDay ?? cycle.length);
    if (!peak) return { evaluable: true, detected: false, trace, progress: tell(null) };
    const conf = confirmThreeLower(cycle, peak.peakDay, 1, closedFirmQuality);
    if (conf.status === 'gap' && conf.day != null) return { ...cervixGap(cycle, conf.day, trace), progress: tell(peak) };
    if (conf.status !== 'ok') return { evaluable: true, detected: false, trace, progress: tell(peak) };
    const watch = extendSurveillance(cycle, peak.peakDay, tempCompleteDay);
    if (!watch.ok) {
      trace.push({ ruleId: 'C-EXT', day: watch.day, detail: 'pic invalidé' });
      searchFrom = watch.day;
      continue;
    }
    trace.push({ ruleId: 'C-PEAK', day: peak.peakDay });
    const detected = detectedSecondary(cycle, 'cervix', 'C-PEAK', peak.peakDay, peak.peakDay + 3, trace);
    return { ...detected, progress: tell(peak) };
  }
  return { evaluable: true, detected: false, trace, progress: tell(null) };
}

/**
 * Maps closed-and-firm to 0 (below peakQuality 1) and open/soft to 1.
 * @param {import('./index.js').CycleDay} day
 * @returns {number | null}
 */
function closedFirmQuality(day) {
  const cervix = presentCervix(day);
  if (cervix == null) return null;
  return isClosedAndFirm(cervix) ? 0 : 1;
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} day
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
function cervixGap(cycle, day, trace) {
  trace.push({ ruleId: 'D-GAP-CONF', day });
  return {
    evaluable: false,
    detected: false,
    trace,
    reasons: [
      {
        code: 'gap_in_confirmation_window',
        ruleId: 'D-GAP-CONF',
        day,
        date: cycle[day - 1].date,
        message: 'Jour manquant dans la fenêtre de confirmation du col.',
      },
    ],
  };
}
