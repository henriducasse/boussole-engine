// @ts-check

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InputError } from '../../src/errors.js';
import { evaluate } from '../../src/evaluate.js';
import { addDays } from '../../src/calendar.js';

describe('validate.js', () => {
  it('lève empty_cycle sur un cycle vide', () => {
    assert.throws(
      () => evaluate({ cycle: [], secondarySymptom: 'mucus' }),
      (error) => error instanceof InputError && error.code === 'empty_cycle',
    );
  });

  it('lève missing_day1_bleeding si J1 n’a pas de saignement ≥ léger', () => {
    // docs/contrat-moteur.md §5 - J1 sans saignement
    const cycle = [{ date: '2024-01-15', bleeding: { value: 0 }, temperature: { celsius: 36.4 } }];
    assert.throws(
      () => evaluate({ cycle, secondarySymptom: 'mucus' }),
      (error) => error instanceof InputError && error.code === 'missing_day1_bleeding' && error.day === 1,
    );
  });

  it('lève non_consecutive_dates sur un trou calendaire', () => {
    const cycle = [
      { date: '2024-01-15', bleeding: { value: 2 } },
      { date: addDays('2024-01-15', 2) },
    ];
    assert.throws(
      () => evaluate({ cycle, secondarySymptom: 'mucus' }),
      (error) => error instanceof InputError && error.code === 'non_consecutive_dates',
    );
  });

  it('lève invalid_date sur le 29 février d’une année non bissextile', () => {
    const cycle = [{ date: '2023-02-29', bleeding: { value: 2 } }];
    assert.throws(
      () => evaluate({ cycle, secondarySymptom: 'mucus' }),
      (error) => error instanceof InputError && error.code === 'invalid_date',
    );
  });

  it('lève out_of_range hors 35,0-38,5 °C', () => {
    // docs/contrat-moteur.md §8
    const cycle = [
      { date: '2024-01-15', bleeding: { value: 2 }, temperature: { celsius: 34.9 } },
    ];
    assert.throws(
      () => evaluate({ cycle, secondarySymptom: 'mucus' }),
      (error) => error instanceof InputError && error.code === 'out_of_range',
    );
  });

  it('lève out_of_range sur une qualité de glaire hors 0-4', () => {
    const cycle = [{ date: '2024-01-15', bleeding: { value: 2 }, mucus: { quality: 5 } }];
    assert.throws(
      () => evaluate({ cycle, secondarySymptom: 'mucus' }),
      (error) => error instanceof InputError && error.code === 'out_of_range',
    );
  });
});
