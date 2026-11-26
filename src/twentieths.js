// @ts-check

import { isPresentForCalc } from './gaps.js';

// 1 °C = 20 vingtièmes : la méthode mesure au 1/20 °C (0,05 °C) et le moteur
// calcule en entiers pour éviter les erreurs d'arrondi flottant.
const TWENTIETHS_PER_DEGREE = 20;

// Hausse minimale exigée le 3e jour haut : 4 vingtièmes = 0,20 °C au-dessus de
// la LTL (SPEC.md - La règle standard).
export const MIN_HIGH_DELTA_TW = 4;

/**
 * @ruleRef T-ROUND
 * @param {number} twentieths
 * @returns {number}
 */
export function celsiusOut(twentieths) {
  return Number((twentieths / TWENTIETHS_PER_DEGREE).toFixed(2));
}

/**
 * @ruleRef T-ROUND
 * @param {number} celsius
 * @returns {number}
 */
export function toTwentieths(celsius) {
  return Math.round(celsius * TWENTIETHS_PER_DEGREE);
}

/**
 * @ruleRef D-EXCL
 * @param {{ temperature?: { celsius: number, excluded?: boolean } }} day
 * @returns {number | null}
 */
export function presentTemperatureTw(day) {
  const temperature = day.temperature;
  if (!isPresentForCalc(temperature)) return null;
  return toTwentieths(temperature.celsius);
}
