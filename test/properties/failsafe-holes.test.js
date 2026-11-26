// @ts-check

/**
 * Propriété : un trou ne déclare jamais plus de jours infertiles
 * que la série complète, quand les deux séries sont évaluables.
 *
 * docs/contrat-moteur.md §9 - fail-safe, borné aux paires évaluables (issue #74).
 * Un refus (`evaluable: false`) vaut 0 jour (§2, §7) : si le trou fait disparaître
 * la donnée qui provoquait le refus (LTL insuffisante, trou de confirmation), la
 * série trouée redevient évaluable et retrouve sa fenêtre pré-ovulatoire. Ce n'est
 * pas une prolongation par le moteur, c'est la levée d'un refus ; la propriété ne
 * compare donc que deux séries que le moteur accepte de lire toutes les deux.
 */

import assert from 'node:assert/strict';
import fc from 'fast-check';
import { describe, it } from 'node:test';
import { addDays } from '../../src/index.js';
import { engineInputArb, holeMaskArb } from './arbiters.js';
import { infertileDaysOf, punchHoles, runEvaluate } from './support.js';

/**
 * Vrai si le moteur n'a refusé ni l'une ni l'autre série.
 * @param {{ threw: boolean, output?: object }} full
 * @param {{ threw: boolean, output?: object }} holed
 */
function bothEvaluable(full, holed) {
  return !full.threw && !holed.threw && full.output?.evaluable === true && holed.output?.evaluable === true;
}

/**
 * @param {object} input
 * @param {object[]} mask
 * @returns {boolean}
 */
function holeNeverLengthens(input, mask) {
  const gapped = punchHoles(input, mask);
  fc.pre(gapped.removed > 0);
  const full = runEvaluate(input);
  const holed = runEvaluate(gapped.input);
  fc.pre(bothEvaluable(full, holed));
  return infertileDaysOf(holed, gapped.input.cycle.length) <= infertileDaysOf(full, input.cycle.length);
}

describe('trou ⇒ jamais plus de jours infertiles (séries évaluables)', () => {
  it('retirer des observations ne rallonge aucune phase infertile', () => {
    // docs/contrat-moteur.md §9 - Trous ⇒ jamais plus de jours infertiles
    fc.assert(fc.property(engineInputArb, holeMaskArb, holeNeverLengthens), { numRuns: 100 });
  });

  it('graine 129473140 (issue #74) : régression déterministe', () => {
    // docs/contrat-moteur.md §9 - la graine verrouille la propriété, elle ne la remplace pas
    fc.assert(fc.property(engineInputArb, holeMaskArb, holeNeverLengthens), {
      seed: 129473140,
      numRuns: 100,
    });
  });

  it('glaire J4 retirée (contre-exemple de l’issue #74) : le refus n’est pas une prolongation', () => {
    // docs/contrat-moteur.md §2 et §7 - glaire sans confirmation ⇒ refus ⇒ 0 jour
    const { full, holed } = minimalCounterexample();
    assert.equal(full.threw || full.output?.evaluable, false);
    assert.equal(holed.output?.evaluable, true);
    assert.equal(bothEvaluable(full, holed), false);
  });
});

/**
 * Contre-exemple de l'issue #74 : cycle de 8 jours, glaire q0 en J1 et q2 en J4
 * sans les 3 jours de confirmation ⇒ série complète refusée (D-GAP-CONF, 0 jour).
 * Sans la glaire de J4, plus de pic à confirmer : la série est évaluable et
 * P-M8/P-5DAY accorde sa fenêtre.
 */
function minimalCounterexample() {
  /** @type {object[]} */
  const cycle = [];
  for (let day = 1; day <= 8; day += 1) {
    /** @type {object} */
    const row = { date: addDays('2018-01-01', day - 1) };
    if (day === 1) {
      row.bleeding = { value: 2 };
      row.mucus = { quality: 0 };
    }
    if (day === 4) row.mucus = { quality: 2 };
    cycle.push(row);
  }
  /** @type {object[]} */
  const previous = [];
  for (let day = 1; day <= 21; day += 1) {
    /** @type {object} */
    const row = { date: addDays('2017-01-01', day - 1) };
    if (day === 1) row.bleeding = { value: 2 };
    if (day >= 8 && day <= 13) row.temperature = { celsius: 35 };
    if (day === 19 || day === 20) row.temperature = { celsius: 35.05 };
    if (day === 21) row.temperature = { celsius: 35.2 };
    previous.push(row);
  }
  const input = { cycle, previousCycles: [previous], secondarySymptom: 'mucus' };
  const mask = cycle.map(() => ({ temperature: false, mucus: false, cervix: false, bleeding: false }));
  mask[3].mucus = true;
  const gapped = punchHoles(input, mask);
  return { full: runEvaluate(input), holed: runEvaluate(gapped.input) };
}
