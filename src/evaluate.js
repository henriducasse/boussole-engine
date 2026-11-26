// @ts-check

import { addDays } from './calendar.js';
import { bothRequired, latestWins } from './combine.js';
import { evaluateCervixShift } from './cervix.js';
import { evaluateMucusShift } from './mucus.js';
import { flagTemperature } from './outliers.js';
import { applyPostSurveillance, surveillePostOvulatory } from './postovulatory.js';
import { evaluatePreovulatory, traceDayForPreovulatory } from './preovulatory.js';
import { detectTemperatureShift } from './temperature.js';
import { validateInput } from './validate.js';

/**
 * @typedef {import('./index.js').CycleDay} CycleDay
 * @typedef {{ ruleId: string, day?: number, detail?: string }} TraceRow
 * @typedef {{
 *   evaluable?: boolean,
 *   detected?: boolean,
 *   evaluationCompleteDay?: number,
 *   evaluationCompleteDate?: string,
 *   trace?: TraceRow[],
 *   reasons?: { code?: string, day?: number, date?: string, message?: string }[],
 *   progress?: object,
 *   ruleId?: string,
 *   ltl?: number,
 *   firstHighDay?: number,
 *   firstHighDate?: string,
 *   peakDay?: number,
 *   peakDate?: string,
 * }} ShiftLike
 * @typedef {{
 *   periOvulatory: { startDay: number, startDate: string, endDay?: number, endDate?: string },
 *   preOvulatory?: { startDay: number, endDay: number, startDate: string, endDate: string, ruleId?: string | null },
 *   postOvulatory?: { startDay: number, startDate: string, time: string, stopDay?: number, stopDate?: string, stopRuleId?: string, uncertainDays?: number[] },
 * }} Phases
 */

/**
 * @param {import('./index.js').EngineInput} input
 * @returns {import('./index.js').EngineOutput}
 */
export function evaluate(input) {
  validateInput(input);
  const { cycle, secondarySymptom } = input;
  const options = input.options ?? {};
  const previousShifts = (input.previousCycles ?? []).map((previous) =>
    /** @type {ShiftLike} */ (detectTemperatureShift(previous, options)),
  );
  const temperature = /** @type {ShiftLike} */ (detectTemperatureShift(cycle, options));
  const warnings = flagTemperature(cycle, temperature.detected ? (temperature.firstHighDay ?? cycle.length) - 1 : cycle.length);
  if (cycle.length > 99) warnings.push(cycleTooLong(cycle));
  if (temperature.evaluable === false) {
    return unevaluableOutput(cycle, temperature, warnings, previousShifts, secondarySymptom);
  }

  const completeDay = temperature.evaluationCompleteDay;
  const tempComplete = temperature.detected === true && completeDay != null ? completeDay : null;
  const secondary =
    secondarySymptom === 'cervix'
      ? evaluateCervixShift(cycle, tempComplete)
      : evaluateMucusShift(cycle, tempComplete);
  if (secondary.evaluable === false) {
    return unevaluableOutput(cycle, secondary, warnings, previousShifts, secondarySymptom, temperature);
  }

  return evaluableOutput(cycle, temperature, secondary, previousShifts, secondarySymptom, warnings);
}

/**
 * @param {CycleDay[]} cycle
 * @param {ShiftLike} temperature
 * @param {ShiftLike} secondary
 * @param {ShiftLike[]} previousShifts
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @param {object[]} warnings
 */
function evaluableOutput(cycle, temperature, secondary, previousShifts, secondarySymptom, warnings) {
  let pre = evaluatePreovulatory(previousShifts, cycle, secondarySymptom);
  let post = bothRequired(temperature.detected === true, secondary.detected === true)
    ? postFromLatest(cycle, temperature, secondary)
    : null;
  if (pre.ungrounded) {
    if (!post) return refuseUngroundedWindow(cycle, pre, warnings, temperature, secondary, secondarySymptom);
    pre = /** @type {typeof pre} */ (
      /** @type {unknown} */ ({ endDay: 0, ruleId: null, warning: null, ungrounded: false })
    );
  }
  if (pre.warning) warnings.push(pre.warning);
  const trace = [...(temperature.trace ?? []), ...(secondary.trace ?? [])];
  if (post) {
    const watched = applyPostSurveillance(
      cycle,
      post,
      surveillePostOvulatory(cycle, post.startDay, secondarySymptom),
    );
    post = watched.post;
    warnings.push(...watched.warnings);
    trace.push(...watched.trace);
  }
  if (pre.ruleId) trace.push({ ruleId: pre.ruleId, day: traceDayForPreovulatory(pre) });
  if (post) trace.push({ ruleId: 'X-LATER', day: post.startDay });
  else if (temperature.detected !== secondary.detected) trace.push({ ruleId: 'X-BLOCK' });
  return {
    evaluable: true,
    reasons: [],
    phases: buildPhases(cycle, pre, post, true),
    temperatureShift: publicTemp(temperature),
    secondaryShift: publicSecondary(secondary, secondarySymptom),
    warnings,
    trace,
    progress: { temperature: temperature.progress, secondary: secondary.progress },
  };
}

/**
 * @ruleRef P-5DAY
 * docs/contrat-moteur.md §9 - moins de données ⇒ jamais plus de jours infertiles.
 * @param {CycleDay[]} cycle
 * @param {{ ruleId: string }} pre
 * @param {object[]} warnings
 * @param {ShiftLike} temperature
 * @param {ShiftLike} secondary
 * @param {'mucus' | 'cervix'} secondarySymptom
 */
function refuseUngroundedWindow(cycle, pre, warnings, temperature, secondary, secondarySymptom) {
  const day = 1;
  return {
    evaluable: false,
    reasons: [
      {
        code: 'ungrounded_preovulatory',
        ruleId: pre.ruleId,
        day,
        date: cycle[0].date,
        message: 'Pas de signe secondaire applicable : la fenêtre pré-ovulatoire n’est pas accordée.',
      },
    ],
    phases: buildPhases(cycle, { endDay: 0 }, null, false),
    temperatureShift: publicTemp(temperature),
    secondaryShift: { kind: secondarySymptom, detected: false },
    warnings,
    trace: [{ ruleId: pre.ruleId, day }],
    progress: { temperature: temperature.progress, secondary: secondary.progress },
  };
}

/**
 * @param {CycleDay[]} cycle
 * @param {ShiftLike} failure
 * @param {object[]} warnings
 * @param {ShiftLike[]} previousShifts
 * @param {'mucus' | 'cervix'} secondarySymptom
 * @param {ShiftLike} [temperature]
 */
function unevaluableOutput(cycle, failure, warnings, previousShifts, secondarySymptom, temperature) {
  void previousShifts;
  void secondarySymptom;
  return {
    evaluable: false,
    reasons: failure.reasons ?? [],
    phases: buildPhases(cycle, { endDay: 0 }, null, false),
    temperatureShift: publicTemp(temperature ?? failure),
    secondaryShift: { kind: secondarySymptom, detected: false },
    warnings,
    trace: failure.trace ?? [],
    progress: {
      temperature: (temperature ?? failure).progress,
      secondary: temperature ? failure.progress : null,
    },
  };
}

/**
 * @param {CycleDay[]} cycle
 * @param {{ endDay: number, ruleId?: string | null }} pre
 * @param {{ startDay: number, startDate: string, time: string } | null} post
 * @param {boolean} evaluable
 */
function buildPhases(cycle, pre, post, evaluable) {
  const periStart = evaluable && pre.endDay > 0 ? pre.endDay + 1 : 1;
  /** @type {Phases['periOvulatory']} */
  const periOvulatory = {
    startDay: periStart,
    startDate: dateOfDay(cycle, periStart),
  };
  if (post) {
    periOvulatory.endDay = post.startDay;
    periOvulatory.endDate = post.startDate;
  }
  /** @type {Phases} */
  const phases = { periOvulatory };
  if (evaluable && pre.endDay > 0) {
    phases.preOvulatory = {
      startDay: 1,
      endDay: pre.endDay,
      startDate: cycle[0].date,
      endDate: dateOfDay(cycle, pre.endDay),
      ruleId: pre.ruleId,
    };
  }
  if (evaluable && post) phases.postOvulatory = post;
  return phases;
}

/**
 * @param {CycleDay[]} cycle
 * @param {number} day
 */
function dateOfDay(cycle, day) {
  if (day >= 1 && day <= cycle.length) return cycle[day - 1].date;
  return addDays(cycle[0].date, day - 1);
}

/**
 * @param {CycleDay[]} cycle
 * @param {ShiftLike} temperature
 * @param {ShiftLike} secondary
 * @returns {{ startDay: number, startDate: string, time: string, stopDay?: number, stopDate?: string, stopRuleId?: string, uncertainDays?: number[] }}
 */
function postFromLatest(cycle, temperature, secondary) {
  const tempDay = temperature.evaluationCompleteDay;
  const secondDay = secondary.evaluationCompleteDay;
  const startDay = tempDay != null && secondDay != null ? latestWins(tempDay, secondDay) : (tempDay ?? secondDay ?? 1);
  return {
    startDay,
    startDate: cycle[startDay - 1].date,
    time: '18:00',
  };
}

/**
 * @param {ShiftLike} temperature
 */
function publicTemp(temperature) {
  if (!temperature?.detected) return { detected: false };
  return {
    detected: true,
    ruleId: temperature.ruleId,
    ltl: temperature.ltl,
    firstHighDay: temperature.firstHighDay,
    firstHighDate: temperature.firstHighDate,
    evaluationCompleteDay: temperature.evaluationCompleteDay,
    evaluationCompleteDate: temperature.evaluationCompleteDate,
  };
}

/**
 * @param {ShiftLike} secondary
 * @param {'mucus' | 'cervix'} kind
 */
function publicSecondary(secondary, kind) {
  if (!secondary?.detected) return { kind, detected: false };
  return {
    kind,
    detected: true,
    ruleId: secondary.ruleId,
    peakDay: secondary.peakDay,
    peakDate: secondary.peakDate,
    evaluationCompleteDay: secondary.evaluationCompleteDay,
    evaluationCompleteDate: secondary.evaluationCompleteDate,
  };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 */
function cycleTooLong(cycle) {
  return {
    code: 'cycle_too_long',
    day: cycle.length,
    date: cycle[cycle.length - 1].date,
    message: 'Cycle de plus de 99 jours.',
  };
}
