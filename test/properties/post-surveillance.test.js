// @ts-check

/**
 * X-POST : surveillance post-ovulatoire (issue #86, règle propre à Boussole).
 * docs/contrat-moteur.md §2 ter et §9.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { evaluate, inputFromFixture } from '../../src/index.js';
import { engineInputArb, realisticInputArb } from './arbiters.js';
import { countInfertileDays } from './support.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../golden/fixtures');
const START = '2024-01-15';

/** @param {string} name */
function run(name) {
  const fixture = JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'));
  return /** @type {any} */ (evaluate(inputFromFixture(fixture, START)));
}

/** @param {any} out @param {string} code */
function warned(out, code) {
  return out.warnings.filter((/** @type {any} */ w) => w.code === code).map((/** @type {any} */ w) => w.day);
}

describe('X-POST : exemples', () => {
  test('jours suivants saisis et non fertiles : rien ne change', () => {
    // docs/contrat-moteur.md §2 ter, point 4
    const post = run('X-POST-OK').phases.postOvulatory;
    assert.equal(post.stopDay, undefined);
    assert.equal(post.uncertainDays, undefined);
  });

  test('glaire fertile après la validation : la phase infertile s’arrête, définitivement', () => {
    // docs/contrat-moteur.md §2 ter, point 1 (seuil ≥ 2 comme P-STOP)
    const out = run('X-POST');
    assert.equal(out.phases.postOvulatory.stopDay, 11);
    assert.equal(out.phases.postOvulatory.stopRuleId, 'X-POST');
    assert.deepEqual(warned(out, 'post_ovulatory_stopped_by_fertile_sign'), [11]);
    assert.equal(out.phases.postOvulatory.uncertainDays, undefined, 'le jour 12 n’est pas lu');
    assert.equal(countInfertileDays(out, 12), 2, 'jours 9 et 10 seulement');
  });

  test('jour sans glaire après la validation : incertain, le suivant reste infertile', () => {
    // docs/contrat-moteur.md §2 ter, point 2
    const out = run('X-POST-GAP');
    assert.deepEqual(out.phases.postOvulatory.uncertainDays, [10]);
    assert.deepEqual(warned(out, 'post_ovulatory_day_unknown'), [10]);
    assert.equal(countInfertileDays(out, 11), 2, 'jours 9 et 11, pas le 10');
  });

  test('trou de deux jours : incertains, puis un jour noté non fertile redevient infertile sans rattrapage', () => {
    // docs/contrat-moteur.md §2 ter, point 2 : J18/J19 sans glaire, J20 glaire 1
    const fixture = JSON.parse(readFileSync(join(fixtures, 'X-LATER.json'), 'utf8'));
    fixture.days.push({ day: 10, temperature: 36.7 }, { day: 11, temperature: 36.7 }, { day: 12, mucus: 1 });
    const out = /** @type {any} */ (evaluate(inputFromFixture(fixture, START)));
    assert.deepEqual(out.phases.postOvulatory.uncertainDays, [10, 11]);
    assert.equal(out.phases.postOvulatory.stopDay, undefined);
    assert.equal(countInfertileDays(out, 12), 2, 'jours 9 et 12 infertiles, 10 et 11 incertains');
  });

  test('variante col : col ouvert ou souple après la validation arrête la phase', () => {
    // docs/contrat-moteur.md §2 ter, point 1 (C-EXT par symétrie)
    const out = run('X-POST-CERVIX');
    assert.equal(out.phases.postOvulatory.stopDay, 10);
    assert.deepEqual(warned(out, 'post_ovulatory_stopped_by_fertile_sign'), [10]);
  });

  test('la validation elle-même (startDay) n’est pas relue', () => {
    // docs/contrat-moteur.md §2 ter : d > startDay. X-LATER a une glaire 1 au jour 9.
    const fixture = JSON.parse(readFileSync(join(fixtures, 'X-LATER.json'), 'utf8'));
    fixture.days[8].mucus = 2;
    const out = /** @type {any} */ (evaluate(inputFromFixture(fixture, START)));
    assert.equal(out.phases.postOvulatory.startDay, 9);
    assert.equal(out.phases.postOvulatory.stopDay, undefined);
  });
});

describe('X-POST : propriétés', () => {
  test('ne fait que retirer des jours infertiles et reste cohérente', () => {
    // docs/contrat-moteur.md §9 - surveillance post-ovulatoire
    fc.assert(
      fc.property(fc.oneof(engineInputArb, realisticInputArb), (input) => {
        const out = /** @type {any} */ (evaluate(structuredClone(input)));
        const post = out.phases?.postOvulatory;
        if (!out.evaluable || !post) return;
        const length = input.cycle.length;
        for (const day of post.uncertainDays ?? []) {
          assert.ok(day > post.startDay && day <= length, `jour incertain ${day} hors plage`);
          if (post.stopDay != null) assert.ok(day < post.stopDay, 'aucun jour incertain après stopDay');
        }
        if (post.stopDay != null) assert.ok(post.stopDay > post.startDay && post.stopDay <= length);
        const full = Math.max(0, length - post.startDay + 1);
        const fromPre = out.phases.preOvulatory?.endDay ?? 0;
        assert.ok(countInfertileDays(out, length) <= fromPre + full);
      }),
      { numRuns: 400 },
    );
  });
});
