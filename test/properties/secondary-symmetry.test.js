// @ts-check

/**
 * Propriété : col et glaire, même shape, même verdict post-évaluation.
 *
 * SPEC.md - Variante col utérin (même limite que la glaire :
 * aucun signe fertile après la fin de l'évaluation de température).
 * Issue #10 : findPeak col n'est pas borné → rouge attendu tant que non mergé.
 *
 * Symétrie heuristique secondaire (mucus) : la montée thermique confirmée et
 * déplacée avec la glaire implique que la glaire traverse son statut fertile -
 * le pic mucus est présent dans le cycle.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { evaluate, inputFromFixture } from '../../src/index.js';

describe('symétrie col / glaire post-évaluation', () => {
  it('même peakDay detected:true si événement fertile après tempCompleteDay', () => {
    // SPEC.md - Variante col utérin ; issue #10
    const fixture = { days: isomorphicPeakCycle(), secondarySymptom: 'mucus' };
    const mucus = evaluate(inputFromFixture({ ...fixture, secondarySymptom: 'mucus' }));
    const cervix = evaluate(inputFromFixture({ ...fixture, secondarySymptom: 'cervix' }));

    assert.equal(mucus.temperatureShift?.evaluationCompleteDay, 9);
    assert.equal(cervix.temperatureShift?.evaluationCompleteDay, 9);

    assert.equal(mucus.secondaryShift?.detected, true, 'glaire doit détecter le pic');
    assert.equal(mucus.secondaryShift?.peakDay, 6);

    assert.equal(
      cervix.secondaryShift?.detected,
      true,
      'col doit détecter le même pic malgré ré-ouverture après tempComplete (#10)',
    );
    assert.equal(
      cervix.secondaryShift?.peakDay,
      mucus.secondaryShift.peakDay,
      'peakDay col et glaire doivent être identiques (#10)',
    );
  });

  it('montée confirmée et déplacée avec glaire : le pic mucus est présent', () => {
    // SPEC.md - Jour du pic : qualité ≥ 2, puis trois jours inférieurs.
    fc.assert(fc.property(fc.integer({ min: 0, max: 12 }), (shift) => {
      const days = displacedMucusPeak(shift);
      const output = evaluate(inputFromFixture({ secondarySymptom: 'mucus', days }));
      const peakDay = 6 + shift;
      assert.equal(output.evaluable, true);
      assert.equal(output.temperatureShift?.detected, true);
      assert.equal(output.temperatureShift?.firstHighDay, 7 + shift);
      assert.equal(output.secondaryShift?.detected, true);
      assert.equal(output.secondaryShift?.ruleId, 'M-PEAK');
      assert.equal(output.secondaryShift?.peakDay, peakDay);
      const peak = days.find((row) => row.day === peakDay);
      assert.ok(peak && peak.mucus >= 2, 'la glaire traverse le statut fertile');
      const trace = output.trace.find((row) => row.ruleId === 'M-PEAK');
      assert.equal(trace?.day, peakDay);
    }), { numRuns: 13 });
  });
});

/**
 * Même cycle : pic au J6, confirmation J7-J9, signe fertile au J10 (après T-STD J9).
 * Mucus qualité ≥ 2 ↔ col non fermé-et-ferme ; < 2 ↔ fermé-et-ferme.
 * @returns {object[]}
 */
/**
 * Même pic M-PEAK, décalé de `shift` jours bas (36,4 °C, glaire 1) après J1.
 * La montée thermique confirmée se déplace avec la glaire.
 * @param {number} shift
 * @returns {object[]}
 */
function displacedMucusPeak(shift) {
  /** @type {object[]} */
  const tail = [
    { temperature: 36.4, mucus: 1 },
    { temperature: 36.45, mucus: 2 },
    { temperature: 36.5, mucus: 3 },
    { temperature: 36.45, mucus: 4 },
    { temperature: 36.4, mucus: 4 },
    { temperature: 36.55, mucus: 3 },
    { temperature: 36.55, mucus: 2 },
    { temperature: 36.7, mucus: 1 },
  ];
  /** @type {object[]} */
  const days = [{ day: 1, bleeding: 2, temperature: 36.4, mucus: 1 }];
  let day = 2;
  for (let index = 0; index < shift; index += 1) {
    days.push({ day, temperature: 36.4, mucus: 1 });
    day += 1;
  }
  for (const row of tail) {
    days.push({ day, ...row });
    day += 1;
  }
  return days;
}

function isomorphicPeakCycle() {
  return [
    { day: 1, bleeding: 2, temperature: 36.4, mucus: 1, cervix: { opening: 0, firmness: 0 } },
    { day: 2, temperature: 36.4, mucus: 2, cervix: { opening: 1, firmness: 1 } },
    { day: 3, temperature: 36.45, mucus: 2, cervix: { opening: 2, firmness: 1 } },
    { day: 4, temperature: 36.5, mucus: 2, cervix: { opening: 2, firmness: 1 } },
    { day: 5, temperature: 36.45, mucus: 2, cervix: { opening: 1, firmness: 1 } },
    { day: 6, temperature: 36.4, mucus: 2, cervix: { opening: 1, firmness: 0 } },
    { day: 7, temperature: 36.55, mucus: 1, cervix: { opening: 0, firmness: 0 } },
    { day: 8, temperature: 36.55, mucus: 1, cervix: { opening: 0, firmness: 0 } },
    { day: 9, temperature: 36.7, mucus: 1, cervix: { opening: 0, firmness: 0 } },
    { day: 10, temperature: 36.7, mucus: 2, cervix: { opening: 1, firmness: 1 } },
  ];
}
