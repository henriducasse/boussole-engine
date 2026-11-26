// @ts-check

import { InputError } from './errors.js';
import { diffDays, parseIsoDate } from './calendar.js';

const TIME_HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TEMP_MIN = 35;
const TEMP_MAX = 38.5;

/**
 * @param {import('./index.js').EngineInput} input
 */
export function validateInput(input) {
  if (input == null || !Array.isArray(input.cycle) || input.cycle.length === 0) {
    throw new InputError({ code: 'empty_cycle', message: 'Le cycle est vide.' });
  }
  if (input.secondarySymptom !== 'mucus' && input.secondarySymptom !== 'cervix') {
    throw new InputError({
      code: 'out_of_range',
      message: "secondarySymptom doit valoir 'mucus' ou 'cervix'.",
    });
  }
  validateCycle(input.cycle, true);
  if (input.previousCycles) {
    for (const previous of input.previousCycles) {
      if (!Array.isArray(previous) || previous.length === 0) {
        throw new InputError({ code: 'empty_cycle', message: 'Un cycle précédent est vide.' });
      }
      validateCycle(previous, true);
    }
  }
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {boolean} requireDay1Bleeding
 */
function validateCycle(cycle, requireDay1Bleeding) {
  for (let i = 0; i < cycle.length; i += 1) {
    const day = i + 1;
    const row = cycle[i];
    parseIsoDate(row?.date, day);
    if (i > 0 && diffDays(cycle[i - 1].date, row.date) !== 1) {
      throw new InputError({
        code: 'non_consecutive_dates',
        message: 'Les dates du cycle doivent être consécutives (jour calendaire manquant).',
        day,
        date: row.date,
      });
    }
    validateDayRanges(row, day);
  }
  if (!requireDay1Bleeding) return;
  const bleeding = cycle[0].bleeding;
  if (bleeding == null || bleeding.excluded === true || bleeding.value < 1) {
    throw new InputError({
      code: 'missing_day1_bleeding',
      message: 'Le jour 1 du cycle doit avoir un saignement au moins léger.',
      day: 1,
      date: cycle[0].date,
    });
  }
}

/**
 * @param {import('./index.js').CycleDay} row
 * @param {number} day
 */
function validateDayRanges(row, day) {
  validateBleeding(row.bleeding, day, row.date);
  validateTemperature(row.temperature, day, row.date);
  validateMucus(row.mucus, day, row.date);
  validateCervix(row.cervix, day, row.date);
}

/**
 * @param {import('./index.js').CycleDay['bleeding']} bleeding
 * @param {number} day
 * @param {string} date
 */
function validateBleeding(bleeding, day, date) {
  if (bleeding == null) return;
  if (!isIntInRange(bleeding.value, 0, 3)) {
    throw rangeError(day, date, 'Saignement hors plage (0-3).');
  }
}

/**
 * @param {import('./index.js').CycleDay['temperature']} temperature
 * @param {number} day
 * @param {string} date
 */
function validateTemperature(temperature, day, date) {
  if (temperature == null) return;
  const celsius = temperature.celsius;
  if (typeof celsius !== 'number' || !Number.isFinite(celsius) || celsius < TEMP_MIN || celsius > TEMP_MAX) {
    throw rangeError(day, date, 'Température hors plage plausible (35,0-38,5 °C).');
  }
  if (temperature.time != null && (typeof temperature.time !== 'string' || !TIME_HM.test(temperature.time))) {
    throw rangeError(day, date, 'Heure de température invalide (HH:mm).');
  }
}

/**
 * @param {import('./index.js').CycleDay['mucus']} mucus
 * @param {number} day
 * @param {string} date
 */
function validateMucus(mucus, day, date) {
  if (mucus == null) return;
  if (!isIntInRange(mucus.quality, 0, 4)) {
    throw rangeError(day, date, 'Qualité de glaire hors plage (0-4).');
  }
}

/**
 * @param {import('./index.js').CycleDay['cervix']} cervix
 * @param {number} day
 * @param {string} date
 */
function validateCervix(cervix, day, date) {
  if (cervix == null) return;
  if (!isIntInRange(cervix.opening, 0, 2) || !isIntInRange(cervix.firmness, 0, 1)) {
    throw rangeError(day, date, 'Col hors plage (opening 0-2, firmness 0-1).');
  }
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function isIntInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * @param {number} day
 * @param {string} date
 * @param {string} message
 */
function rangeError(day, date, message) {
  return new InputError({ code: 'out_of_range', message, day, date });
}
