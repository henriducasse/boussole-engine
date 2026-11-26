// @ts-check

import { addDays } from './calendar.js';

/**
 * @typedef {object} DaySpec
 * @property {number} day
 * @property {number | { value: 0|1|2|3, excluded?: boolean }} [bleeding]
 * @property {number | { celsius: number, excluded?: boolean, time?: string }} [temperature]
 * @property {number | { quality: 0|1|2|3|4, excluded?: boolean }} [mucus]
 * @property {{ opening: 0|1|2, firmness: 0|1, excluded?: boolean }} [cervix]
 * @typedef {object} FixtureSpec
 * @property {DaySpec[]} days
 * @property {DaySpec[][]} [previousCycles]
 * @property {'mucus' | 'cervix'} [secondarySymptom]
 * @property {{ ltlWindowMaxDays?: number }} [options]
 */

/**
 * Expand day-number fixture rows into a consecutive CycleDay[] from startDate.
 * Days omitted between 1 and max are present with no observations.
 *
 * @param {DaySpec[]} specs
 * @param {string} startDate
 * @returns {import('./index.js').CycleDay[]}
 */
export function materializeDays(specs, startDate) {
  const byDay = new Map();
  let maxDay = 0;
  for (const spec of specs) {
    byDay.set(spec.day, spec);
    if (spec.day > maxDay) maxDay = spec.day;
  }
  const cycle = [];
  for (let day = 1; day <= maxDay; day += 1) {
    cycle.push(expandRow(byDay.get(day) ?? { day }, addDays(startDate, day - 1)));
  }
  return cycle;
}

/**
 * @param {DaySpec} spec
 * @param {string} date
 * @returns {import('./index.js').CycleDay}
 */
function expandRow(spec, date) {
  /** @type {import('./index.js').CycleDay} */
  const row = { date };
  if (spec.bleeding != null) row.bleeding = /** @type {import('./index.js').CycleDay['bleeding']} */ (expandBleeding(spec.bleeding));
  if (spec.temperature != null) row.temperature = /** @type {import('./index.js').CycleDay['temperature']} */ (expandTemp(spec.temperature));
  if (spec.mucus != null) row.mucus = /** @type {import('./index.js').CycleDay['mucus']} */ (expandMucus(spec.mucus));
  if (spec.cervix != null) row.cervix = spec.cervix;
  return row;
}

/**
 * @param {NonNullable<DaySpec['bleeding']>} value
 */
function expandBleeding(value) {
  return typeof value === 'number' ? { value } : value;
}

/**
 * @param {NonNullable<DaySpec['temperature']>} value
 */
function expandTemp(value) {
  return typeof value === 'number' ? { celsius: value } : value;
}

/**
 * @param {NonNullable<DaySpec['mucus']>} value
 */
function expandMucus(value) {
  return typeof value === 'number' ? { quality: value } : value;
}

/**
 * @param {FixtureSpec} fixture
 * @param {string} [startDate]
 * @returns {import('./index.js').EngineInput}
 */
export function inputFromFixture(fixture, startDate = '2024-01-15') {
  return {
    cycle: materializeDays(fixture.days, startDate),
    previousCycles: (fixture.previousCycles ?? []).map((days, index) =>
      materializeDays(days, addDays('2022-01-01', index * 40)),
    ),
    secondarySymptom: fixture.secondarySymptom ?? 'mucus',
    options: fixture.options,
  };
}
