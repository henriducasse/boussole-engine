// @ts-check

/**
 * Propriété : excluded:true ≡ champ absent pour le calcul.
 *
 * docs/contrat-moteur.md §1 et §9.
 */

import assert from 'node:assert/strict';
import fc from 'fast-check';
import { describe, test } from 'node:test';
import { engineInputArb } from './arbiters.js';
import { runEvaluate } from './support.js';

const FIELDS = ['temperature', 'mucus', 'cervix', 'bleeding'];

describe('excluded ≡ absent', () => {
  test('exclure une observation donne le même verdict que la supprimer', () => {
    // docs/contrat-moteur.md §1 - excluded:true ≡ champ absent
    fc.assert(
      fc.property(
        engineInputArb,
        fc.integer({ min: 0, max: 23 }),
        fc.constantFrom(...FIELDS),
        (input, index, field) => {
          const dayIndex = index % input.cycle.length;
          fc.pre(input.cycle[dayIndex][field] != null);
          const absent = structuredClone(input);
          delete absent.cycle[dayIndex][field];
          const excluded = structuredClone(input);
          excluded.cycle[dayIndex][field] = {
            ...excluded.cycle[dayIndex][field],
            excluded: true,
          };
          assert.deepEqual(runEvaluate(absent), runEvaluate(excluded));
        },
      ),
      { numRuns: 80 },
    );
  });
});
