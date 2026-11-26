// @ts-check

/**
 * Propriété : le même cycle décalé sur d’autres dates de départ
 * produit le même verdict (écarts en jours).
 *
 * docs/contrat-moteur.md §9 - invariance calendaire.
 */

import assert from 'node:assert/strict';
import fc from 'fast-check';
import { describe, test } from 'node:test';
import { addDays, diffDays, inputFromFixture } from '../../src/index.js';
import { engineInputArb } from './arbiters.js';
import { datesToOffsets, runEvaluate, shiftInput } from './support.js';

const BOUNDARIES = ['2023-02-28', '2023-12-31', '2024-02-28', '2024-12-31'];

describe('invariance calendaire', () => {
  test('366 dates, dont 28 fév → 1er mars et 31 déc → 1er jan', () => {
    // docs/contrat-moteur.md §9 - verdict invariant sur 366 dates de départ
    assert.equal(addDays('2023-02-28', 1), '2023-03-01');
    assert.equal(addDays('2023-12-31', 1), '2024-01-01');
    const anchor = anchorInput();
    const origin = anchor.cycle[0].date;
    const reference = canonical(anchor, origin);
    let sawFeb = false;
    let sawDec = false;
    for (let delta = 0; delta < 366; delta += 1) {
      const start = addDays(origin, delta);
      const shifted = shiftInput(anchor, delta);
      assert.equal(shifted.cycle[0].date, start);
      assert.deepEqual(canonical(shifted, start), reference);
      if (start === '2023-02-28') {
        sawFeb = true;
        assert.equal(shifted.cycle[1].date, '2023-03-01');
      }
      if (start === '2023-12-31') {
        sawDec = true;
        assert.equal(shifted.cycle[1].date, '2024-01-01');
      }
    }
    assert.equal(sawFeb, true);
    assert.equal(sawDec, true);
  });

  test('même verdict pour des cycles aléatoires décalés, y compris les bornes', () => {
    // docs/contrat-moteur.md §9
    fc.assert(
      fc.property(
        engineInputArb,
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 4, maxLength: 6 }),
        (input, offsets) => {
          const origin = input.cycle[0].date;
          const starts = [...BOUNDARIES, ...offsets.map((offset) => addDays('2021-01-01', offset))];
          const reference = canonical(input, origin);
          for (const start of starts) {
            const shifted = shiftInput(input, diffDays(origin, start));
            assert.equal(shifted.cycle[0].date, start);
            assert.deepEqual(canonical(shifted, start), reference);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

/**
 * @param {object} input
 * @param {string} start
 */
function canonical(input, start) {
  const result = runEvaluate(input);
  if (result.threw) return { threw: true, code: result.code };
  return { threw: false, output: datesToOffsets(result.output, start) };
}

function anchorInput() {
  return inputFromFixture(
    {
      secondarySymptom: 'mucus',
      previousCycles: [
        [
          { day: 1, bleeding: 2, temperature: 36.4 },
          { day: 2, temperature: 36.4 },
          { day: 3, temperature: 36.4 },
          { day: 4, temperature: 36.4 },
          { day: 5, temperature: 36.4 },
          { day: 6, temperature: 36.4 },
          { day: 7, temperature: 36.55 },
          { day: 8, temperature: 36.55 },
          { day: 9, temperature: 36.7 },
        ],
      ],
      days: [
        { day: 1, bleeding: 2, temperature: 36.4, mucus: 1 },
        { day: 2, temperature: 36.4, mucus: 2 },
        { day: 3, temperature: 36.45, mucus: 3 },
        { day: 4, temperature: 36.5, mucus: 2 },
        { day: 5, temperature: 36.45, mucus: 1 },
        { day: 6, temperature: 36.4, mucus: 1 },
        { day: 7, temperature: 36.55, mucus: 1 },
        { day: 8, temperature: 36.55, mucus: 1 },
        { day: 9, temperature: 36.7, mucus: 1 },
      ],
    },
    '2023-01-01',
  );
}
