// @ts-check

/**
 * @typedef {import('./errors.js').InputErrorCode} InputErrorCode
 *
 * @typedef {object} EngineInput
 * @property {CycleDay[]} cycle
 * @property {CycleDay[][]} [previousCycles]
 * @property {'mucus' | 'cervix'} secondarySymptom
 * @property {{ ltlWindowMaxDays?: number }} [options]
 *
 * @typedef {object} CycleDay
 * @property {string} date
 * @property {{ value: 0|1|2|3, excluded?: boolean }} [bleeding]
 * @property {{ celsius: number, excluded?: boolean, time?: string }} [temperature]
 * @property {{ quality: 0|1|2|3|4, excluded?: boolean }} [mucus]
 * @property {{ opening: 0|1|2, firmness: 0|1, excluded?: boolean }} [cervix]
 *
 * @typedef {object} EngineOutput
 * @property {boolean} evaluable
 * @property {object[]} reasons
 * @property {object} phases
 * @property {object} [temperatureShift]
 * @property {object} [secondaryShift]
 * @property {object[]} warnings
 * @property {object[]} trace
 * @property {{ temperature?: object | null, secondary?: object | null }} progress docs/contrat-moteur.md §2 bis
 */

export { evaluate } from './evaluate.js';
export { InputError } from './errors.js';
export {
  addDays,
  diffDays,
  formatEpochDay,
  isLeapYear,
  parseIsoDate,
  toEpochDay,
} from './calendar.js';
export { detectCycleStarts } from './cycles.js';
export { roundToFiveHundredths } from './temperature.js';
export { inputFromFixture, materializeDays } from './materialize.js';
