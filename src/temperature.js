// @ts-check

import { assertLtlWindow } from './gaps.js';
import { describeBaseline, recordCandidate, refusedProgress, startStory, temperatureProgress } from './progress.js';
import { MIN_HIGH_DELTA_TW, celsiusOut, presentTemperatureTw, toTwentieths } from './twentieths.js';

export { celsiusOut, presentTemperatureTw, toTwentieths };

/**
 * @ruleRef T-ROUND
 * @param {number} celsius
 * @returns {number}
 */
export function roundToFiveHundredths(celsius) {
  return celsiusOut(toTwentieths(celsius));
}

/**
 * @ruleRef T-LTL
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} candidateDay
 * @param {number} [windowMax]
 */
export function computeLtl(cycle, candidateDay, windowMax = 9) {
  const readings = [];
  for (let day = candidateDay - 1; day >= 1; day -= 1) {
    const tw = presentTemperatureTw(cycle[day - 1]);
    if (tw == null) continue;
    readings.push({ day, tw });
    if (readings.length === 6) break;
  }
  if (readings.length < 6) return { kind: 'need-more', readings };
  const oldestDay = readings[5].day;
  if (!assertLtlWindow(oldestDay, candidateDay, windowMax)) {
    return { kind: 'gap', oldestDay, readings };
  }
  let ltlTw = readings[0].tw;
  for (const reading of readings) {
    if (reading.tw > ltlTw) ltlTw = reading.tw;
  }
  return { kind: 'ok', ltlTw, readings };
}

/**
 * @ruleRef T-STD
 * @param {number[]} highsTw
 * @param {number} ltlTw
 * @returns {boolean}
 */
export function evaluateStandardShift(highsTw, ltlTw) {
  return (
    highsTw.length >= 3 &&
    highsTw[0] > ltlTw &&
    highsTw[1] > ltlTw &&
    highsTw[2] > ltlTw &&
    highsTw[2] >= ltlTw + MIN_HIGH_DELTA_TW
  );
}

/**
 * @ruleRef T-EX1
 * @param {number[]} highsTw
 * @param {number} ltlTw
 * @returns {boolean}
 */
export function evaluateException1(highsTw, ltlTw) {
  return (
    highsTw.length >= 4 &&
    highsTw[0] > ltlTw &&
    highsTw[1] > ltlTw &&
    highsTw[2] > ltlTw &&
    highsTw[2] < ltlTw + MIN_HIGH_DELTA_TW &&
    highsTw[3] > ltlTw
  );
}

/**
 * @ruleRef T-EX2
 * @param {number[]} highsTw
 * @param {number} ltlTw
 * @returns {boolean}
 */
export function evaluateException2(highsTw, ltlTw) {
  if (highsTw.length < 4 || !(highsTw[0] > ltlTw)) return false;
  const drop2 = highsTw[1] <= ltlTw;
  const drop3 = highsTw[2] <= ltlTw;
  if (Number(drop2) + Number(drop3) !== 1) return false;
  return highsTw[3] >= ltlTw + MIN_HIGH_DELTA_TW;
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {{ ltlWindowMaxDays?: number }} [options]
 */
export function detectTemperatureShift(cycle, options = {}) {
  const windowMax = options.ltlWindowMaxDays ?? 9;
  /** @type {{ ruleId: string, day?: number, detail?: string }[]} */
  const trace = [];
  // Relevé (docs/contrat-moteur.md §2 bis) : écrit par la boucle, jamais relu.
  const story = startStory();
  for (let i = 0; i < cycle.length; i += 1) {
    const day = i + 1;
    const tw = presentTemperatureTw(cycle[i]);
    if (tw == null) continue;
    const ltl = computeLtl(cycle, day, windowMax);
    if (ltl.kind === 'gap') {
      const progress = refusedProgress(story, describeBaseline(cycle, day, ltl, windowMax));
      return { ...unevaluableLtl(cycle, day, trace), progress };
    }
    if (ltl.kind !== 'ok' || ltl.ltlTw == null || tw <= ltl.ltlTw) continue;
    const ltlTw = ltl.ltlTw;
    trace.push({ ruleId: 'T-LTL', day, detail: `LTL=${celsiusOut(ltlTw)}` });
    const outcome = considerCandidate(cycle, day, ltlTw, trace);
    recordCandidate(story, cycle, day, ltl, outcome);
    if (outcome.status !== 'reject' && outcome.status !== 'wait') {
      return { ...outcome.result, progress: temperatureProgress(story, null) };
    }
  }
  const lastLtl = computeLtl(cycle, cycle.length, windowMax);
  const baseline = describeBaseline(cycle, cycle.length, lastLtl, windowMax);
  return { evaluable: true, detected: false, trace, progress: temperatureProgress(story, baseline) };
}

/**
 * @ruleRef T-STD
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} firstHighDay
 * @param {number} ltlTw
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
function considerCandidate(cycle, firstHighDay, ltlTw, trace) {
  const required = readTempWindow(cycle, firstHighDay, 3);
  if (required.gapDay != null) {
    return { status: 'gap', result: unevaluableConf(cycle, required.gapDay, trace) };
  }
  if (required.tw.length < 3) return { status: 'wait' };
  if (evaluateStandardShift(required.tw, ltlTw)) {
    return { status: 'shift', result: makeShift(cycle, 'T-STD', firstHighDay, firstHighDay + 2, ltlTw, trace) };
  }
  if (!pendingException(required.tw, ltlTw)) return { status: 'reject', lastMark: 3 };
  return considerException(cycle, firstHighDay, ltlTw, required.tw, trace);
}

/**
 * @ruleRef T-EX1
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} firstHighDay
 * @param {number} ltlTw
 * @param {number[]} firstThreeTw
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
function considerException(cycle, firstHighDay, ltlTw, firstThreeTw, trace) {
  const fourth = readTempWindow(cycle, firstHighDay + 3, 1);
  if (fourth.gapDay != null) {
    return { status: 'gap', result: unevaluableConf(cycle, fourth.gapDay, trace) };
  }
  if (fourth.tw.length < 1) return { status: 'wait' };
  const highsTw = [...firstThreeTw, fourth.tw[0]];
  if (evaluateException1(highsTw, ltlTw)) {
    return { status: 'shift', result: makeShift(cycle, 'T-EX1', firstHighDay, firstHighDay + 3, ltlTw, trace) };
  }
  if (evaluateException2(highsTw, ltlTw)) {
    return { status: 'shift', result: makeShift(cycle, 'T-EX2', firstHighDay, firstHighDay + 3, ltlTw, trace) };
  }
  return { status: 'reject', lastMark: 4 };
}

/**
 * @param {number[]} highsTw
 * @param {number} ltlTw
 */
function pendingException(highsTw, ltlTw) {
  const above2 = highsTw[1] > ltlTw;
  const above3 = highsTw[2] > ltlTw;
  if (above2 && above3 && highsTw[2] < ltlTw + MIN_HIGH_DELTA_TW) return true;
  return Number(!above2) + Number(!above3) === 1;
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} firstHighDay
 * @param {number} count
 */
function readTempWindow(cycle, firstHighDay, count) {
  const tw = [];
  for (let offset = 0; offset < count; offset += 1) {
    const day = firstHighDay + offset;
    if (day > cycle.length) break;
    const value = presentTemperatureTw(cycle[day - 1]);
    if (value == null) return { tw, gapDay: day };
    tw.push(value);
  }
  return { tw, gapDay: null };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {'T-STD' | 'T-EX1' | 'T-EX2'} ruleId
 * @param {number} firstHighDay
 * @param {number} completeDay
 * @param {number} ltlTw
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
function makeShift(cycle, ruleId, firstHighDay, completeDay, ltlTw, trace) {
  trace.push({ ruleId, day: completeDay, detail: `firstHigh=${firstHighDay}` });
  return {
    evaluable: true,
    detected: true,
    ruleId,
    ltl: celsiusOut(ltlTw),
    firstHighDay,
    firstHighDate: cycle[firstHighDay - 1].date,
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
function unevaluableLtl(cycle, day, trace) {
  trace.push({ ruleId: 'D-GAP-LTL', day });
  return {
    evaluable: false,
    detected: false,
    trace,
    reasons: [
      {
        code: 'insufficient_low_readings',
        ruleId: 'D-GAP-LTL',
        day,
        date: cycle[day - 1].date,
        message: 'Moins de 6 relevés valables dans la fenêtre LTL.',
      },
    ],
  };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} day
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 */
function unevaluableConf(cycle, day, trace) {
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
        message: 'Jour manquant dans la fenêtre de confirmation de température.',
      },
    ],
  };
}
