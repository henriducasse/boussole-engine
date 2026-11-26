// @ts-check

/**
 * Fixtures golden du relevé `progress` : une par id du catalogue
 * (situations-analyse-2026-09-25.md). docs/contrat-moteur.md §2 bis.
 *
 * Comparaison stricte des tableaux (même longueur, même ordre) ; objets
 * comparés sur les clés attendues ; `null` attendu ⇒ `null` reçu.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluate, inputFromFixture } from '../../src/index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'progress');
const STARTS = ['2024-01-15', '2024-02-20', '2023-12-20'];

describe('fixtures golden progress', () => {
  const files = readdirSync(fixturesDir).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    it(`${fixture.id} - ${fixture.situation}`, () => {
      for (const startDate of STARTS) {
        const output = evaluate(inputFromFixture(fixture, startDate));
        matchShape(output, fixture.expect, 'output');
      }
    });
  }
});

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} path
 */
function matchShape(actual, expected, path) {
  if (expected === null) {
    assert.equal(actual, null, `${path} : attendu null`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} : attendu un tableau, reçu ${JSON.stringify(actual)}`);
    const expectsReasons = path.endsWith('.reasons');
    if (!expectsReasons) assert.equal(actual.length, expected.length, `${path} : longueur`);
    expected.forEach((item, index) => matchShape(actual[index], item, `${path}[${index}]`));
    return;
  }
  if (typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `${path} : attendu un objet, reçu ${JSON.stringify(actual)}`);
    for (const [key, value] of Object.entries(expected)) {
      matchShape(/** @type {Record<string, unknown>} */ (actual)[key], value, `${path}.${key}`);
    }
    return;
  }
  assert.equal(actual, expected, path);
}
