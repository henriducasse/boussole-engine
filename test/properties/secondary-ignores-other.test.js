// @ts-check

/**
 * Propriété : le moteur ne lit que le signe secondaire choisi pour le cycle.
 *
 * SPEC.md - Variante col utérin : « même mécanisme », le col remplace
 * la glaire. Un cycle en `cervix` ignore donc toute glaire notée, un cycle en `mucus`
 * ignore tout col noté (#136 : choix « col » dans Réglages).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { evaluate } from '../../src/index.js';
import { engineInputArb } from './arbiters.js';

/**
 * @param {import('../../src/index.js').CycleDay[]} cycle
 * @param {'mucus' | 'cervix'} field
 */
function withoutField(cycle, field) {
  return cycle.map((row) => {
    const copy = { ...row };
    delete copy[field];
    return copy;
  });
}

/**
 * @param {import('../../src/index.js').EngineInput} input
 * @param {'mucus' | 'cervix'} field
 */
function stripped(input, field) {
  return {
    ...input,
    cycle: withoutField(input.cycle, field),
    previousCycles: input.previousCycles?.map((cycle) => withoutField(cycle, field)),
  };
}

describe('seul le signe secondaire choisi compte', () => {
  it('cycle en col : retirer toute la glaire ne change pas le verdict', () => {
    fc.assert(fc.property(engineInputArb, (generated) => {
      const input = { ...generated, secondarySymptom: /** @type {const} */ ('cervix') };
      assert.deepEqual(evaluate(stripped(input, 'mucus')), evaluate(input));
    }));
  });

  it('cycle en glaire : retirer tout le col ne change pas le verdict', () => {
    fc.assert(fc.property(engineInputArb, (generated) => {
      const input = { ...generated, secondarySymptom: /** @type {const} */ ('mucus') };
      assert.deepEqual(evaluate(stripped(input, 'cervix')), evaluate(input));
    }));
  });
});
