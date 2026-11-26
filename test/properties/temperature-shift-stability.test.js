// @ts-check

/**
 * Propriété : un shift T-STD confirmé au jour D reste confirmé
 * quand on ajoute des jours après D (sans température).
 *
 * Stabilité : réorganiser les jours du cycle ne change pas les jours fertiles
 * par numéro de jour du cycle. Un suffixe sans température ne les change pas non plus.
 *
 * SPEC.md - La règle standard (confirmée le 3ᵉ jour).
 * Issue #9 : aujourd'hui le J+1 sans température annule le shift (rouge attendu).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { addDays, evaluate, inputFromFixture } from '../../src/index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../golden/fixtures');

describe('stabilité du shift T-STD après jours ajoutés', () => {
  test('reste confirmé quand on append des jours sans température après D (#9)', () => {
    // SPEC.md - La règle standard ; issue #9
    const base = inputFromFixture({
      secondarySymptom: 'mucus',
      days: tStdDays(),
    });
    const before = evaluate(base);
    assert.equal(before.evaluable, true);
    assert.equal(before.temperatureShift?.detected, true);
    assert.equal(before.temperatureShift?.ruleId, 'T-STD');

    const completeDay = before.temperatureShift.evaluationCompleteDay;
    const lastDate = base.cycle[base.cycle.length - 1].date;
    const extended = {
      ...base,
      cycle: [
        ...base.cycle,
        { date: addDays(lastDate, 1) },
        { date: addDays(lastDate, 2) },
        { date: addDays(lastDate, 3) },
      ],
    };
    const after = evaluate(extended);

    assert.equal(
      after.evaluable,
      true,
      `shift T-STD au J${completeDay} ne doit pas devenir inévaluable (#9)`,
    );
    assert.deepEqual(
      after.temperatureShift,
      before.temperatureShift,
      'temperatureShift doit rester identique après jours sans température (#9)',
    );
  });

  test('réorganiser les jours ne change pas les jours fertiles par numéro de jour', () => {
    // SPEC.md - le verdict suit le numéro de jour, pas l'ordre de saisie
    const fixtures = evaluateFixtures();
    for (const fixture of fixtures) {
      const length = cycleLength(fixture.days);
      const before = fertileDayNumbers(evaluate(inputFromFixture(fixture)), length);
      fc.assert(fc.property(permutationArb(fixture.days.length), (order) => {
        const days = order.map((index) => fixture.days[index]);
        const after = fertileDayNumbers(
          evaluate(inputFromFixture({ ...fixture, days })),
          length,
        );
        assert.deepEqual(after, before, fixture.id);
      }), { numRuns: 15 });
    }
  });

  test('un suffixe sans température ne change pas la fertilité des jours déjà numérotés', () => {
    // SPEC.md - La règle standard : des jours après la confirmation
    const bases = ['T-STD', 'M-PEAK', 'P-5DAY', 'P-STOP', 'X-LATER', 'X-BLOCK']
      .map((id) => evaluateFixtures().find((fixture) => fixture.id === id));
    fc.assert(fc.property(
      fc.integer({ min: 0, max: bases.length - 1 }),
      fc.array(fc.constantFrom(0, 1), { minLength: 0, maxLength: 5 }),
      (index, suffix) => {
        const fixture = bases[index];
        const length = cycleLength(fixture.days);
        const before = evaluate(inputFromFixture(fixture));
        const days = [...fixture.days, ...suffixDays(fixture.days, suffix)];
        const after = evaluate(inputFromFixture({ ...fixture, days }));
        assert.deepEqual(
          fertileDayNumbers(after, length),
          fertileDayNumbers(before, length),
          fixture.id,
        );
        assert.deepEqual(after.temperatureShift, before.temperatureShift, fixture.id);
      },
    ), { numRuns: 40 });
  });
});

/**
 * Cycle minimal produisant T-STD (miroir fixture T-STD).
 * @returns {object[]}
 */
/** @returns {object[]} */
function evaluateFixtures() {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')))
    .filter((fixture) => fixture.kind === 'evaluate');
}

/**
 * @param {number} count
 * @returns {import('fast-check').Arbitrary<number[]>}
 */
function permutationArb(count) {
  return fc.array(fc.integer({ min: 0, max: 0x7fffffff }), { minLength: count, maxLength: count })
    .map((keys) => keys
      .map((key, index) => ({ key, index }))
      .sort((left, right) => left.key - right.key || left.index - right.index)
      .map((row) => row.index));
}

/**
 * @param {object} output
 * @param {number} length
 * @returns {number[]}
 */
function fertileDayNumbers(output, length) {
  /** @type {number[]} */
  const fertile = [];
  for (let day = 1; day <= length; day += 1) {
    if (dayIsFertile(output, day)) fertile.push(day);
  }
  return fertile;
}

/**
 * @param {object} output
 * @param {number} day
 */
function dayIsFertile(output, day) {
  if (!output.evaluable) return true;
  const pre = output.phases?.preOvulatory;
  if (pre && day >= pre.startDay && day <= pre.endDay) return false;
  const post = output.phases?.postOvulatory;
  if (post && day >= post.startDay) return false;
  return true;
}

/**
 * @param {object[]} days
 */
function cycleLength(days) {
  let max = 0;
  for (const row of days) if (row.day > max) max = row.day;
  return max;
}

/**
 * @param {object[]} days
 * @param {number[]} qualities
 */
function suffixDays(days, qualities) {
  const start = cycleLength(days);
  return qualities.map((quality, index) => ({ day: start + 1 + index, mucus: quality }));
}

function tStdDays() {
  return [
    { day: 1, bleeding: 2, temperature: 36.4 },
    { day: 2, temperature: 36.4 },
    { day: 3, temperature: 36.45 },
    { day: 4, temperature: 36.5 },
    { day: 5, temperature: 36.45 },
    { day: 6, temperature: 36.4 },
    { day: 7, temperature: 36.55 },
    { day: 8, temperature: 36.55 },
    { day: 9, temperature: 36.7 },
  ];
}
