// @ts-check

import { assertConfirmationWindow, presentMucusQuality } from './gaps.js';
import { describeSecondary } from './progress.js';

/**
 * @ruleRef M-PEAK
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} [searchFrom]
 * @param {number} [lastDay]
 * @returns {{ peakDay: number, peakQuality: number } | null}
 */
export function findPeak(cycle, searchFrom = 1, lastDay = cycle.length) {
  let best = 0;
  /** @type {number | null} */
  let peakDay = null;
  const end = Math.min(lastDay, cycle.length);
  for (let i = searchFrom - 1; i < end; i += 1) {
    const quality = presentMucusQuality(cycle[i]);
    if (quality != null && (quality > best || (quality === best && best >= 2))) {
      best = quality;
      peakDay = i + 1;
    }
    // SPEC.md - trois jours inférieurs, puis surveillance jusqu'à la fin d'évaluation (M-EXT).
    if (peakDay != null && peakConfirmed(cycle, peakDay, best, i + 1)) return { peakDay, peakQuality: best };
  }
  if (best < 2 || peakDay == null) return null;
  return { peakDay, peakQuality: best };
}

/**
 * Le pic est fixé dès que trois jours strictement inférieurs le suivent.
 * Les jours d'après restent visibles pour `extendSurveillance`.
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} peakDay
 * @param {number} best
 * @param {number} day
 */
function peakConfirmed(cycle, peakDay, best, day) {
  if (best < 2 || day < peakDay + 3) return false;
  return confirmThreeLower(cycle, peakDay, best, presentMucusQuality).status === 'ok';
}

/**
 * @ruleRef M-EXT
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} peakDay
 * @param {number} peakQuality
 * @param {number | null} tempCompleteDay
 * @returns {{ ok: true } | { ok: false, day: number }}
 */
export function extendSurveillance(cycle, peakDay, peakQuality, tempCompleteDay) {
  const until = tempCompleteDay ?? cycle.length;
  for (let day = peakDay + 4; day <= until && day <= cycle.length; day += 1) {
    const quality = presentMucusQuality(cycle[day - 1]);
    if (quality != null && quality >= peakQuality) {
      return { ok: false, day };
    }
  }
  return { ok: true };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number | null} [tempCompleteDay]
 */
export function evaluateMucusShift(cycle, tempCompleteDay = null) {
  /** @type {{ ruleId: string, day?: number, detail?: string }[]} */
  const trace = [];
  /** @param {{ peakDay: number, peakQuality: number } | null} peak */
  const tell = (peak) => describeSecondary(cycle, 'mucus', peak, tempCompleteDay, presentMucusQuality);
  let searchFrom = 1;
  while (searchFrom <= cycle.length) {
    const peak = findPeak(cycle, searchFrom, tempCompleteDay ?? cycle.length);
    if (!peak) return { evaluable: true, detected: false, trace, progress: tell(null) };
    const conf = confirmThreeLower(cycle, peak.peakDay, peak.peakQuality, presentMucusQuality);
    if (conf.status === 'gap' && conf.day != null) return { ...mucusGap(cycle, conf.day, trace), progress: tell(peak) };
    if (conf.status !== 'ok') return { evaluable: true, detected: false, trace, progress: tell(peak) };
    const watch = extendSurveillance(cycle, peak.peakDay, peak.peakQuality, tempCompleteDay);
    if (!watch.ok) {
      trace.push({ ruleId: 'M-EXT', day: watch.day, detail: 'pic invalidé' });
      searchFrom = watch.day;
      continue;
    }
    trace.push({ ruleId: 'M-PEAK', day: peak.peakDay });
    const detected = detectedSecondary(cycle, 'mucus', 'M-PEAK', peak.peakDay, peak.peakDay + 3, trace);
    return { ...detected, progress: tell(peak) };
  }
  return { evaluable: true, detected: false, trace, progress: tell(null) };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} peakDay
 * @param {number} peakQuality
 * @param {(day: import('./index.js').CycleDay) => number | null} qualityFn
 */
export function confirmThreeLower(cycle, peakDay, peakQuality, qualityFn) {
  const window = assertConfirmationWindow(cycle, peakDay + 1, peakDay + 3, qualityFn);
  if (!window.ok && window.incomplete) return { status: 'incomplete', day: window.day };
  if (!window.ok) return { status: 'gap', day: window.day };
  for (let day = peakDay + 1; day <= peakDay + 3; day += 1) {
    const quality = qualityFn(cycle[day - 1]);
    if (quality != null && quality >= peakQuality) return { status: 'not-yet', day };
  }
  return { status: 'ok' };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {'mucus' | 'cervix'} kind
 * @param {string} ruleId
 * @param {number} peakDay
 * @param {number} completeDay
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
export function detectedSecondary(cycle, kind, ruleId, peakDay, completeDay, trace) {
  return {
    evaluable: true,
    detected: true,
    kind,
    ruleId,
    peakDay,
    peakDate: cycle[peakDay - 1].date,
    evaluationCompleteDay: completeDay,
    evaluationCompleteDate: cycle[completeDay - 1].date,
    trace,
  };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} day
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
function mucusGap(cycle, day, trace) {
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
        message: 'Jour manquant dans la fenêtre de confirmation de glaire.',
      },
    ],
  };
}
