// @ts-check

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, diffDays, isLeapYear, parseIsoDate, toEpochDay } from '../../src/calendar.js';

describe('calendar.js', () => {
  it('traite le 29 février d’une année bissextile', () => {
    // docs/contrat-moteur.md §9 - invariance, y compris 28 fév. → 1er mars
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2023), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(isLeapYear(1900), false);
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2024-02-29', 1), '2024-03-01');
    assert.equal(addDays('2023-02-28', 1), '2023-03-01');
    assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
  });

  it('enchaîne le 31 décembre et le 1er janvier', () => {
    // docs/contrat-moteur.md §9 - 31 déc. → 1er jan.
    assert.equal(addDays('2023-12-31', 1), '2024-01-01');
    assert.equal(addDays('2024-12-31', 1), '2025-01-01');
    assert.equal(diffDays('2023-12-31', '2024-01-01'), 1);
  });

  it('garde un delta invariant après aller-retour', () => {
    const starts = ['2023-12-20', '2024-02-20', '1970-01-01', '2024-01-15'];
    for (const start of starts) {
      for (let delta = -40; delta <= 40; delta += 1) {
        const shifted = addDays(start, delta);
        assert.equal(diffDays(start, shifted), delta);
      }
    }
  });

  it('ancre l’époque UTC au 1er janvier 1970', () => {
    assert.equal(toEpochDay(1970, 1, 1), 0);
    assert.equal(parseIsoDate('1970-01-01'), 0);
    assert.equal(addDays('1970-01-01', 1), '1970-01-02');
  });
});
