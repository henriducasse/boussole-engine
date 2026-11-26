// @ts-check

/**
 * Propriétés : le relevé `progress` colle à la décision.
 *
 * docs/contrat-moteur.md §2 bis et §9.
 */

import assert from 'node:assert/strict';
import fc from 'fast-check';
import { describe, test } from 'node:test';
import { addDays } from '../../src/index.js';
import { engineInputArb, realisticInputArb } from './arbiters.js';
import { runEvaluate } from './support.js';

const ARBITERS = [
  ['aléatoires', engineInputArb, 300],
  ['vraisemblables', realisticInputArb, 1500],
];

describe('progress colle à la décision', () => {
  for (const [label, arb, numRuns] of ARBITERS) {
    test(`température (${label})`, () => {
      // docs/contrat-moteur.md §9 - confirmed ⇔ hausse, stopped/refused ⇔ raison
      fc.assert(fc.property(/** @type {any} */ (arb), (input) => checkTemperature(input)), { numRuns: /** @type {number} */ (numRuns) });
    });
    test(`glaire ou col (${label})`, () => {
      // docs/contrat-moteur.md §9 - secondaire confirmed ⇔ secondaryShift.detected
      fc.assert(fc.property(/** @type {any} */ (arb), (input) => checkSecondary(input)), { numRuns: /** @type {number} */ (numRuns) });
    });
    test(`forme des repères (${label})`, () => {
      // docs/contrat-moteur.md §2 bis - 4 repères consécutifs, dates du calendrier
      fc.assert(fc.property(/** @type {any} */ (arb), (input) => checkShape(input)), { numRuns: /** @type {number} */ (numRuns) });
    });
  }
});

/**
 * @param {any} input
 */
function outputOf(input) {
  const result = runEvaluate(input);
  fc.pre(!result.threw);
  return /** @type {any} */ (result).output;
}

/**
 * @param {any} input
 */
function checkTemperature(input) {
  const output = outputOf(input);
  const temp = output.progress.temperature;
  const shift = output.temperatureShift;
  const reason = output.reasons[0];
  assert.equal(temp.state === 'confirmed', shift.detected === true);
  if (shift.detected) {
    assert.equal(temp.count.outcome, 'confirmed');
    assert.equal(temp.count.firstHighDay, shift.firstHighDay);
    assert.equal(temp.count.rule, shift.ruleId);
    assert.equal(temp.count.ltl, shift.ltl);
    assert.equal(temp.count.endDay, shift.evaluationCompleteDay);
  }
  if (temp.state === 'stopped') {
    assert.equal(reason.code, 'gap_in_confirmation_window');
    assert.equal(reason.day, temp.count.endDay);
    assert.equal(temp.count.outcome, 'stopped');
  }
  assert.equal(temp.state === 'refused', reason?.code === 'insufficient_low_readings');
  if (temp.state === 'refused') {
    assert.equal(temp.baseline.forDay, reason.day);
    assert.equal(temp.baseline.state, 'spread');
  }
  assert.equal(output.progress.secondary === null, temp.state === 'stopped' || temp.state === 'refused');
  if (temperatureTraceVisible(output)) checkCandidatesAgainstTrace(output.trace, temp);
}

/**
 * La trace de température n'est rendue que si le cycle est évaluable ou si
 * c'est la température qui refuse (evaluate.js).
 * @param {any} output
 */
function temperatureTraceVisible(output) {
  const state = output.progress.temperature.state;
  return output.evaluable || state === 'stopped' || state === 'refused';
}

/**
 * Chaque décompte du relevé est un T-LTL de la trace, dans l'ordre, avec la
 * même ligne. Les T-LTL après un décompte ouvert sont des candidats en attente.
 * @param {{ ruleId: string, day?: number, detail?: string }[]} trace
 * @param {any} temp
 */
function checkCandidatesAgainstTrace(trace, temp) {
  const counts = [...temp.history, ...(temp.count ? [temp.count] : [])];
  const lastDay = temp.count?.firstHighDay ?? Infinity;
  const traced = trace.filter((row) => row.ruleId === 'T-LTL' && /** @type {number} */ (row.day) <= lastDay);
  assert.deepEqual(
    traced.map((row) => [row.day, row.detail]),
    counts.map((count) => [count.firstHighDay, `LTL=${count.ltl}`]),
  );
  for (const count of temp.history) assert.equal(count.outcome, 'rejected');
  if (temp.state === 'collecting') assert.equal(temp.count, null);
  if (temp.state === 'counting') {
    assert.equal(temp.count.outcome, 'open');
    assert.notEqual(temp.count.next, null);
  }
}

/**
 * @param {any} input
 */
function checkSecondary(input) {
  const output = outputOf(input);
  const secondary = output.progress.secondary;
  if (secondary === null) return;
  assert.equal(secondary.kind, input.secondarySymptom);
  const ungrounded = output.reasons.some((/** @type {any} */ r) => r.code === 'ungrounded_preovulatory');
  if (!ungrounded) {
    assert.equal(secondary.state === 'confirmed', output.secondaryShift.detected === true);
  }
  if (output.secondaryShift.detected) assert.equal(secondary.peakDay, output.secondaryShift.peakDay);
  const shift = output.temperatureShift;
  assert.equal(secondary.peakSearchClosed, shift.detected === true);
  if (shift.detected) assert.equal(secondary.peakSearchUntil, shift.evaluationCompleteDay);
  if (secondary.state === 'stopped') {
    const missing = secondary.marks.find((/** @type {any} */ mark) => mark.state === 'missing');
    assert.equal(output.reasons[0].code, 'gap_in_confirmation_window');
    assert.equal(output.reasons[0].day, missing.day);
  }
  if (secondary.state === 'noPeak') assert.deepEqual(secondary.marks, []);
  else assert.equal(secondary.marks.length, 3);
}

/**
 * @param {any} input
 */
function checkShape(input) {
  const output = outputOf(input);
  const start = input.cycle[0].date;
  const temp = output.progress.temperature;
  const counts = [...temp.history, ...(temp.count ? [temp.count] : [])];
  let previous = 0;
  for (const count of counts) {
    assert.ok(count.firstHighDay > previous, 'décomptes dans l’ordre');
    previous = count.firstHighDay;
    assert.equal(count.firstHighDate, addDays(start, count.firstHighDay - 1));
    assert.equal(count.ltlReadings.length, 6);
    assert.deepEqual(count.marks.map((/** @type {any} */ m) => m.day), [0, 1, 2, 3].map((i) => count.firstHighDay + i));
    for (const mark of count.marks) assert.equal(mark.date, addDays(start, mark.day - 1));
    assert.equal(count.marks[0].state, 'above');
  }
  for (const mark of output.progress.secondary?.marks ?? []) {
    assert.equal(mark.date, addDays(start, mark.day - 1));
  }
}
