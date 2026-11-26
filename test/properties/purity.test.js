// @ts-check

/**
 * Propriété : même entrée deux fois ⇒ même sortie, entrée non mutée.
 *
 * docs/contrat-moteur.md §9 - pureté.
 */

import assert from 'node:assert/strict';
import fc from 'fast-check';
import { describe, test } from 'node:test';
import { InputError, evaluate } from '../../src/index.js';
import { engineInputArb } from './arbiters.js';

describe('pureté', () => {
  test('deux évaluations de la même entrée sont identiques et n’altèrent pas l’entrée', () => {
    // docs/contrat-moteur.md §9 - même entrée ⇒ même sortie
    fc.assert(
      fc.property(engineInputArb, (input) => {
        const before = JSON.stringify(input);
        const first = capture(input);
        assert.equal(JSON.stringify(input), before);
        const second = capture(input);
        assert.deepEqual(second, first);
        assert.equal(JSON.stringify(input), before);
      }),
      { numRuns: 60 },
    );
  });
});

/**
 * @param {object} input
 */
function capture(input) {
  try {
    return { threw: false, output: evaluate(input) };
  } catch (error) {
    if (error instanceof InputError) return { threw: true, code: error.code };
    throw error;
  }
}
