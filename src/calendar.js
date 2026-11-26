// @ts-check

import { InputError } from './errors.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * @param {number} year
 * @returns {boolean}
 */
export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function daysInMonth(year, month) {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

/**
 * Days since 1970-01-01 UTC (Howard Hinnant days_from_civil). No `Date`.
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {number}
 */
export function toEpochDay(year, month, day) {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * @param {number} epochDay
 * @returns {{ year: number, month: number, day: number }}
 */
export function fromEpochDay(epochDay) {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = y + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
export function formatYmd(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {number} epochDay
 * @returns {string}
 */
export function formatEpochDay(epochDay) {
  const { year, month, day } = fromEpochDay(epochDay);
  return formatYmd(year, month, day);
}

/**
 * @param {string} iso
 * @param {number} [day]
 * @returns {number}
 */
export function parseIsoDate(iso, day) {
  const match = typeof iso === 'string' ? ISO_DATE.exec(iso) : null;
  if (!match) {
    throw new InputError({
      code: 'invalid_date',
      message: `Date invalide : ${String(iso)}.`,
      day,
      date: typeof iso === 'string' ? iso : undefined,
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const d = Number(match[3]);
  if (month < 1 || month > 12 || d < 1 || d > daysInMonth(year, month)) {
    throw new InputError({
      code: 'invalid_date',
      message: `Date invalide : ${iso}.`,
      day,
      date: iso,
    });
  }
  return toEpochDay(year, month, d);
}

/**
 * @param {string} iso
 * @param {number} deltaDays
 * @returns {string}
 */
export function addDays(iso, deltaDays) {
  return formatEpochDay(parseIsoDate(iso) + deltaDays);
}

/**
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number}
 */
export function diffDays(fromIso, toIso) {
  return parseIsoDate(toIso) - parseIsoDate(fromIso);
}
