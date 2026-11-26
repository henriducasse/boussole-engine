// @ts-check

/**
 * D-OUTLIER : le pic isolé n'est signalé qu'en phase basse (issue #11).
 * SPEC.md - Perturbation : « Seulement vers le haut, en phase basse ».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluate, inputFromFixture } from '../../src/index.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../golden/fixtures');
const START = '2024-01-15';

/** @param {string} name */
function load(name) {
  return JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'));
}

/** @param {object} output @param {string} code */
function days(output, code) {
  return /** @type {any} */ (output).warnings.filter((w) => w.code === code).map((w) => w.day);
}

describe('D-OUTLIER en phase basse seulement', () => {
  test('pic isolé après la hausse confirmée : aucun signalement', () => {
    // SPEC.md - Perturbation : seulement en phase basse
    const out = evaluate(inputFromFixture(load('D-OUTLIER-HAUTE'), START));
    assert.equal(/** @type {any} */ (out).temperatureShift.detected, true);
    assert.deepEqual(days(out, 'possible_outlier_temperature'), []);
  });

  test('pic isolé en phase basse : toujours signalé', () => {
    // SPEC.md - Perturbation (fixture D-OUTLIER, jour 3)
    const out = evaluate(inputFromFixture(load('D-OUTLIER'), START));
    assert.deepEqual(days(out, 'possible_outlier_temperature'), [3]);
  });

  test('pic isolé tant que la hausse n’est pas confirmée : signalé', () => {
    // SPEC.md - Perturbation : hausse non confirmée = encore en phase basse
    const fixture = load('D-OUTLIER-HAUTE');
    fixture.days[8].temperature = 36.5;
    fixture.days[9].temperature = 36.5;
    const out = evaluate(inputFromFixture(fixture, START));
    assert.equal(/** @type {any} */ (out).temperatureShift.detected, false);
    assert.deepEqual(days(out, 'possible_outlier_temperature'), [11]);
  });
});
