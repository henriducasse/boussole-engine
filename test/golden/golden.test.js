// @ts-check

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { detectCycleStarts, evaluate, inputFromFixture, materializeDays, roundToFiveHundredths } from '../../src/index.js';
import { minusEight } from '../../src/preovulatory.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const STARTS = ['2024-01-15', '2024-02-20', '2023-12-20'];

describe('fixtures golden', () => {
  const files = readdirSync(fixturesDir).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    it(`${fixture.id} - ${fixture.doc}`, () => {
      if (fixture.kind === 'round') {
        for (const testCase of fixture.cases) {
          assert.equal(roundToFiveHundredths(testCase.celsius), testCase.expect);
        }
        return;
      }
      if (fixture.kind === 'cycle-starts') {
        const days = materializeDays(fixture.days, '2024-01-15');
        const starts = detectCycleStarts(days).map((row) => row.day);
        assert.deepEqual(starts, fixture.expect.starts);
        return;
      }
      for (const startDate of STARTS) {
        const output = evaluate(inputFromFixture(fixture, startDate));
        matchSubset(output, fixture.expect);
      }
    });
  }
});

describe('P-M8-ZERO garde-fou', () => {
  it('ne traite pas firstHighDay - 8 === 0 comme falsy', () => {
    // SPEC.md - P-M8-ZERO
    assert.equal(minusEight([8]), 0);
    assert.equal(minusEight([8]) || 5, 5);
    assert.notEqual(minusEight([8]), 5);
  });
});

describe('P-M8 allongement à 12 cycles exploitables', () => {
  it('allonge au-delà de 5 jours seulement avec ≥ 12 hausses', () => {
    // SPEC.md - Règle « moins 8 »
    const previous = Array.from({ length: 12 }, () =>
      inputFromFixture({
        days: shiftDays(16),
        secondarySymptom: 'mucus',
      }).cycle,
    );
    const current = inputFromFixture({
      days: [
        { day: 1, bleeding: 2, mucus: 1 },
        { day: 2, mucus: 1 },
        // SPEC.md - l'absence de signal ne démontre pas l'infertilité (#74) :
        // J3 à J7 sont relevés (glaire 1) pour que la fenêtre de 8 jours reste accordée.
        { day: 3, mucus: 1 },
        { day: 4, mucus: 1 },
        { day: 5, mucus: 1 },
        { day: 6, mucus: 1 },
        { day: 7, mucus: 1 },
        { day: 8, mucus: 1 },
      ],
      secondarySymptom: 'mucus',
    });
    const output = evaluate({
      cycle: current.cycle,
      previousCycles: previous,
      secondarySymptom: 'mucus',
    });
    assert.equal(output.phases.preOvulatory?.endDay, 8);
    assert.equal(output.phases.preOvulatory?.ruleId, 'P-M8');
  });
});

/**
 * @param {unknown} actual
 * @param {unknown} expected
 */
function matchSubset(actual, expected) {
  if (expected === null) {
    assert.equal(actual, undefined);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), 'expected array');
    for (const item of expected) {
      const found = actual.some((row) => {
        try {
          matchSubset(row, item);
          return true;
        } catch {
          return false;
        }
      });
      assert.ok(found, `missing ${JSON.stringify(item)} in ${JSON.stringify(actual)}`);
    }
    return;
  }
  if (typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `expected object, got ${String(actual)}`);
    for (const [key, value] of Object.entries(expected)) {
      matchSubset(/** @type {object} */ (actual)[key], value);
    }
    return;
  }
  assert.equal(actual, expected);
}

/**
 * @param {number} firstHighDay
 */
function shiftDays(firstHighDay) {
  const days = [];
  for (let day = 1; day <= firstHighDay + 2; day += 1) {
    /** @type {object} */
    const row = { day };
    if (day === 1) row.bleeding = 2;
    if (day < firstHighDay) row.temperature = 36.4;
    else if (day === firstHighDay || day === firstHighDay + 1) row.temperature = 36.55;
    else row.temperature = 36.7;
    days.push(row);
  }
  return days;
}
