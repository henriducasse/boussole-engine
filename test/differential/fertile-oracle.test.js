// @ts-check

/**
 * Pain cartésien : pour tout jour prêt à analyser d'une fixture standard,
 * l'oracle fertile et le moteur donnent le même état.
 * Les fixtures golden evaluate passent aussi par l'oracle.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, inputFromFixture } from '../../src/index.js';
import { referenceFertileCalendar } from './fertile-oracle.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../golden/fixtures');
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../../src');

describe('oracle fertile', () => {
  const fixtures = readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')));
  const standard = fixtures.filter((fixture) => fixture.kind === 'evaluate');

  it('pain cartésien : oracle == moteur pour chaque jour prêt à analyser', () => {
    for (const fixture of standard) {
      const oracle = referenceFertileCalendar(fixture);
      const output = evaluate(inputFromFixture(fixture));
      for (const day of oracle.days) {
        if (!day.ready) continue;
        assert.equal(
          engineFertile(output, day.day),
          day.fertile,
          `${fixture.id} J${day.day}`,
        );
      }
      if (oracle.signDay != null) {
        const trace = output.trace.find((row) => row.ruleId === 'P-STOP');
        assert.equal(trace?.day, oracle.signDay, `${fixture.id} trace P-STOP`);
      }
    }
  });

  it('les fixtures golden evaluate passent via l’oracle', () => {
    for (const fixture of standard) {
      const oracle = referenceFertileCalendar(fixture);
      matchSubset(oracleView(oracle), fixture.expect);
    }
  });

  it('src n’importe pas l’oracle', () => {
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.js')) continue;
      const text = readFileSync(join(srcDir, name), 'utf8');
      assert.equal(text.includes('fertile-oracle'), false, name);
      assert.equal(text.includes('differential/oracle'), false, name);
    }
  });
});

/**
 * @param {object} output
 * @param {number} day
 */
function engineFertile(output, day) {
  if (!output.evaluable) return true;
  const pre = output.phases?.preOvulatory;
  if (pre && day >= pre.startDay && day <= pre.endDay) return false;
  const post = output.phases?.postOvulatory;
  if (post && day >= post.startDay) {
    // docs/contrat-moteur.md §2 ter - X-POST
    if (post.stopDay != null && day >= post.stopDay) return true;
    return (post.uncertainDays ?? []).includes(day);
  }
  return true;
}

/**
 * @param {object} oracle
 */
function oracleView(oracle) {
  /** @type {object} */
  const view = {
    evaluable: oracle.evaluable,
    reasons: oracle.reasons,
    warnings: oracle.warnings,
    temperatureShift: oracle.temperatureShift,
    secondaryShift: oracle.secondaryShift,
    phases: oracle.phases,
  };
  if (oracle.trace.length > 0) view.trace = oracle.trace;
  return view;
}

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
