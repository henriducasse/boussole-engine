// @ts-check

/**
 * P-STOP - quels que soient les relevés, dès que la glaire est ≥ 2 ou le col
 * est ouvert ou mou, la fenêtre pré-ovulatoire s'interrompt ce jour-là.
 * La trace P-STOP apparaît, et le day de la trace est le jour du signe.
 *
 * SPEC.md - Arrêt immédiat sur signe fertile.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { evaluate, inputFromFixture } from '../../src/index.js';

const WINDOW_DAYS = 5;

describe('P-STOP', () => {
  it('signe au jour 1 : la trace porte le jour du signe', () => {
    // SPEC.md - Arrêt immédiat : trace P-STOP.day = jour du signe
    // Verrou #37, traceDayForPreovulatory : warning.day (stoppedAt), jour du signe.
    // Repro #12 : firstHighDay 9 → fenêtre d’un jour, coupée à J1 (endDay 0).
    for (const symptom of /** @type {const} */ (['mucus', 'cervix'])) {
      assertSignDay(symptom, 1, previousFirstHigh(9));
      assertSignDay(symptom, 1, previousFiveDayWindow());
    }
    assertSignDay('mucus', 3, previousFiveDayWindow());
  });

  it('interrompt la fenêtre le jour du signe et trace ce jour', () => {
    // SPEC.md - Arrêt immédiat : trace P-STOP.day = jour du signe
    fc.assert(fc.property(symptomArb(), readingsArb(), (symptom, readings) => {
      const days = specsFrom(readings);
      const output = evaluate(inputFromFixture({
        secondarySymptom: symptom,
        previousCycles: [previousFiveDayWindow()],
        days,
      }));
      const sign = firstSignDay(readings, symptom);
      if (!output.evaluable) {
        // SPEC.md - Dans le doute, on suppose la fertilité.
        assert.equal(output.phases.preOvulatory, undefined);
        return;
      }
      const traces = output.trace.filter((row) => row.ruleId === 'P-STOP');
      // SPEC.md - l'absence de signal ne démontre pas l'infertilité :
      // la fenêtre s'arrête avant le premier jour sans relevé applicable (contrat §9, #74).
      const gap = firstGapDay(readings, symptom);
      if (gap != null && (sign == null || gap < sign)) {
        assert.equal(traces.length, 0);
        assert.equal(output.phases.preOvulatory?.endDay, gap === 1 ? undefined : gap - 1);
        return;
      }
      if (sign != null && sign <= WINDOW_DAYS) {
        assertStopped(output, traces, sign);
      } else {
        assert.equal(traces.length, 0);
        assert.equal(output.phases.preOvulatory?.ruleId, 'P-5DAY');
        assert.equal(output.phases.preOvulatory?.endDay, WINDOW_DAYS);
      }
    }), { numRuns: 80 });
  });
});

/**
 * @param {'mucus' | 'cervix'} symptom
 * @param {number} signDay
 * @param {object[]} previous
 */
function assertSignDay(symptom, signDay, previous) {
  const output = evaluate(inputFromFixture({
    secondarySymptom: symptom,
    previousCycles: [previous],
    days: daysUntilSign(symptom, signDay),
  }));
  const traces = output.trace.filter((row) => row.ruleId === 'P-STOP');
  assertStopped(output, traces, signDay);
}

/**
 * @param {'mucus' | 'cervix'} symptom
 * @param {number} signDay
 * @returns {object[]}
 */
function daysUntilSign(symptom, signDay) {
  /** @type {object[]} */
  const days = [];
  for (let day = 1; day <= signDay; day += 1) {
    /** @type {object} */
    const row = { day };
    if (day === 1) row.bleeding = 2;
    if (symptom === 'mucus') row.mucus = day === signDay ? 2 : 1;
    else row.cervix = day === signDay
      ? { opening: 1, firmness: 0 }
      : { opening: 0, firmness: 0 };
    days.push(row);
  }
  return days;
}

/**
 * 1er point haut au jour donné : moins 8. Jour 9 → fenêtre d’un jour.
 * @param {number} firstHigh
 * @returns {object[]}
 */
function previousFirstHigh(firstHigh) {
  /** @type {object[]} */
  const days = [];
  const last = firstHigh + 2;
  for (let day = 1; day <= last; day += 1) {
    /** @type {object} */
    const row = { day, temperature: 36.4 };
    if (day === 1) row.bleeding = 2;
    if (day === firstHigh || day === firstHigh + 1) row.temperature = 36.55;
    if (day === last) row.temperature = 36.7;
    days.push(row);
  }
  return days;
}

/**
 * @param {object} output
 * @param {object[]} traces
 * @param {number} sign
 */
function assertStopped(output, traces, sign) {
  assert.equal(traces.length, 1);
  assert.equal(traces[0].day, sign);
  const warning = output.warnings.find((row) => row.code === 'preovu_stopped_by_fertile_sign');
  assert.equal(warning?.day, sign);
  if (sign === 1) {
    assert.equal(output.phases.preOvulatory, undefined);
    return;
  }
  assert.equal(output.phases.preOvulatory.endDay, sign - 1);
  assert.equal(output.phases.preOvulatory.ruleId, 'P-STOP');
}

/** @returns {import('fast-check').Arbitrary<'mucus' | 'cervix'>} */
function symptomArb() {
  return fc.constantFrom('mucus', 'cervix');
}

/** @returns {import('fast-check').Arbitrary<object[]>} */
function readingsArb() {
  return fc.array(fc.record({
    mucus: fc.integer({ min: -1, max: 4 }),
    mucusExcluded: fc.boolean(),
    opening: fc.integer({ min: -1, max: 2 }),
    firmness: fc.constantFrom(0, 1),
    cervixExcluded: fc.boolean(),
  }), { minLength: 1, maxLength: 10 });
}

/**
 * Cycle précédent : 1er point haut au jour 13 → fenêtre de 5 jours (P-5DAY).
 * @returns {object[]}
 */
function previousFiveDayWindow() {
  /** @type {object[]} */
  const days = [];
  for (let day = 1; day <= 15; day += 1) {
    /** @type {object} */
    const row = { day, temperature: 36.4 };
    if (day === 1) row.bleeding = 2;
    if (day === 13 || day === 14) row.temperature = 36.55;
    if (day === 15) row.temperature = 36.7;
    days.push(row);
  }
  return days;
}

/**
 * @param {object[]} readings
 * @returns {object[]}
 */
function specsFrom(readings) {
  return readings.map((reading, index) => {
    /** @type {object} */
    const spec = { day: index + 1 };
    if (index === 0) spec.bleeding = 2;
    if (reading.mucus >= 0) {
      spec.mucus = reading.mucusExcluded
        ? { quality: reading.mucus, excluded: true }
        : reading.mucus;
    }
    if (reading.opening >= 0) {
      spec.cervix = {
        opening: reading.opening,
        firmness: reading.firmness,
        excluded: reading.cervixExcluded,
      };
    }
    return spec;
  });
}

/**
 * @param {object[]} readings
 * @param {'mucus' | 'cervix'} symptom
 * @returns {number | null}
 */
function firstSignDay(readings, symptom) {
  for (let index = 0; index < readings.length; index += 1) {
    if (isSign(readings[index], symptom)) return index + 1;
  }
  return null;
}

/**
 * @param {object} reading
 * @param {'mucus' | 'cervix'} symptom
 */
function isSign(reading, symptom) {
  if (symptom === 'mucus') return reading.mucus >= 2 && reading.mucusExcluded !== true;
  return reading.opening >= 1
    ? reading.cervixExcluded !== true
    : reading.opening === 0 && reading.firmness === 1 && reading.cervixExcluded !== true;
}

/**
 * Premier jour de la fenêtre de 5 jours sans relevé applicable (absent ou entre parenthèses).
 * @param {object[]} readings
 * @param {'mucus' | 'cervix'} symptom
 * @returns {number | null}
 */
function firstGapDay(readings, symptom) {
  for (let index = 0; index < Math.min(readings.length, WINDOW_DAYS); index += 1) {
    const reading = readings[index];
    const present = symptom === 'mucus'
      ? reading.mucus >= 0 && reading.mucusExcluded !== true
      : reading.opening >= 0 && reading.cervixExcluded !== true;
    if (!present) return index + 1;
  }
  return null;
}
