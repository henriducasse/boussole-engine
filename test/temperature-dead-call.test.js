// @ts-check

/**
 * Ticket #12 - appel mort dans readTempWindow (ancien temperature.js ~l.209).
 *
 * L'appel était `assertConfirmationWindow(cycle, day, day, presentTemperatureTw)`,
 * après `day <= cycle.length` et `presentTemperatureTw == null`, et son retour
 * était ignoré. Depuis ce site :
 * - `{ ok: true }` exige une température présente, déjà exclue ;
 * - `{ ok: false, incomplete: true }` exige `day > cycle.length`, déjà exclu
 *   par le `break` qui précède ;
 * - le seul retour possible `{ ok: false, incomplete: false, day }` dupliquait
 *   `gapDay` et n'était pas lu.
 *
 * La ligne a été supprimée. Ce test ne la réintroduit pas et ne couvre donc
 * pas cette branche : il fige le comportement qui n'en dépendait pas.
 *
 * docs/contrat-moteur.md §7 - fenêtre de confirmation stricte.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluate, inputFromFixture } from '../src/index.js';

describe('appel ignoré dans la fenêtre de température', () => {
  it('temperature.js n’appelle plus assertConfirmationWindow', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/temperature.js', import.meta.url)), 'utf8');
    assert.equal(src.includes('assertConfirmationWindow'), false);
  });

  it('la fin du cycle n’est pas un trou de confirmation', () => {
    // Le `break` de readTempWindow exclut day > length avant tout appel.
    // incomplete: true n’était donc pas atteignable depuis le site supprimé.
    const days = [];
    for (let day = 1; day <= 8; day += 1) {
      /** @type {object} */
      const row = { day, temperature: day < 7 ? 36.4 : 36.7 };
      if (day === 1) row.bleeding = 2;
      days.push(row);
    }
    const output = evaluate(inputFromFixture({ secondarySymptom: 'mucus', days }));
    assert.equal(output.evaluable, true);
    assert.equal(output.temperatureShift.detected, false);
    assert.equal(output.reasons.some((row) => row.ruleId === 'D-GAP-CONF'), false);
    assert.equal(output.trace.some((row) => row.ruleId === 'D-GAP-CONF'), false);
  });
});
