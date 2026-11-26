// @ts-check

/**
 * @ruleRef D-EXCL
 * @template {object} T
 * @param {T | null | undefined} field
 * @returns {field is T}
 */
export function isPresentForCalc(field) {
  return field != null && /** @type {{ excluded?: boolean }} */ (field).excluded !== true;
}

/**
 * @param {{ mucus?: { quality: number, excluded?: boolean } }} day
 * @returns {number | null}
 */
export function presentMucusQuality(day) {
  const mucus = day.mucus;
  if (!isPresentForCalc(mucus)) return null;
  return mucus.quality;
}

/**
 * @param {{ cervix?: { opening: number, firmness: number, excluded?: boolean } }} day
 * @returns {{ opening: number, firmness: number } | null}
 */
export function presentCervix(day) {
  const cervix = day.cervix;
  if (!isPresentForCalc(cervix)) return null;
  return cervix;
}

/**
 * @param {{ bleeding?: { value: number, excluded?: boolean } }} day
 * @returns {number | null}
 */
export function presentBleeding(day) {
  const bleeding = day.bleeding;
  if (!isPresentForCalc(bleeding)) return null;
  return bleeding.value;
}

/**
 * @ruleRef D-GAP-LTL
 * @param {number} oldestReadingDay
 * @param {number} candidateDay
 * @param {number} windowMax
 * @returns {boolean}
 */
export function assertLtlWindow(oldestReadingDay, candidateDay, windowMax) {
  return oldestReadingDay >= candidateDay - windowMax;
}

/**
 * @ruleRef D-GAP-CONF
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} fromDay
 * @param {number} toDay
 * @param {(day: import('./index.js').CycleDay) => unknown} presentFn
 * @returns {{ ok: true } | { ok: false, incomplete: boolean, day: number }}
 */
export function assertConfirmationWindow(cycle, fromDay, toDay, presentFn) {
  for (let day = fromDay; day <= toDay; day += 1) {
    if (day > cycle.length) return { ok: false, incomplete: true, day };
    if (presentFn(cycle[day - 1]) == null) return { ok: false, incomplete: false, day };
  }
  return { ok: true };
}
