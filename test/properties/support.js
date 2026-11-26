// @ts-check

import { InputError, addDays, diffDays, evaluate } from '../../src/index.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBSERVATION_FIELDS = ['temperature', 'mucus', 'cervix', 'bleeding'];

/**
 * @param {object} input
 * @returns {{ threw: false, output: object } | { threw: true, code: string }}
 */
export function runEvaluate(input) {
  try {
    return { threw: false, output: evaluate(structuredClone(input)) };
  } catch (error) {
    if (error instanceof InputError) return { threw: true, code: error.code };
    throw error;
  }
}

/**
 * Jours déclarés infertiles. Refus ou evaluable:false ⇒ 0 (contrat §2, §9).
 * @param {{ threw: boolean, output?: object }} result
 * @param {number} length
 */
export function infertileDaysOf(result, length) {
  if (result.threw || !result.output?.evaluable) return 0;
  return countInfertileDays(result.output, length);
}

/**
 * @param {object} output
 * @param {number} length
 */
export function countInfertileDays(output, length) {
  /** @type {Set<number>} */
  const days = new Set();
  const pre = output.phases?.preOvulatory;
  if (pre && pre.endDay >= 1) {
    const end = Math.min(pre.endDay, length);
    for (let day = pre.startDay; day <= end; day += 1) days.add(day);
  }
  const post = output.phases?.postOvulatory;
  if (post?.startDay >= 1) {
    // docs/contrat-moteur.md §2 ter : arrêt à stopDay, jours incertains non comptés
    const last = Math.min(length, post.stopDay != null ? post.stopDay - 1 : length);
    for (let day = post.startDay; day <= last; day += 1) {
      if (!(post.uncertainDays ?? []).includes(day)) days.add(day);
    }
  }
  return days.size;
}

/**
 * @param {object} input
 * @param {{ temperature?: boolean, mucus?: boolean, cervix?: boolean, bleeding?: boolean }[]} mask
 */
export function punchHoles(input, mask) {
  const gapped = structuredClone(input);
  let removed = 0;
  for (let index = 0; index < gapped.cycle.length; index += 1) {
    const flags = mask[index];
    if (!flags) continue;
    const row = gapped.cycle[index];
    for (const field of OBSERVATION_FIELDS) {
      if (!flags[field] || row[field] == null) continue;
      delete row[field];
      removed += 1;
    }
  }
  return { input: gapped, removed };
}

/**
 * @param {object} input
 * @param {number} delta
 */
export function shiftInput(input, delta) {
  if (delta === 0) return structuredClone(input);
  const shifted = structuredClone(input);
  shifted.cycle = shifted.cycle.map((row) => ({ ...row, date: addDays(row.date, delta) }));
  shifted.previousCycles = (shifted.previousCycles ?? []).map((cycle) =>
    cycle.map((row) => ({ ...row, date: addDays(row.date, delta) })),
  );
  return shifted;
}

/**
 * Remplace chaque date ISO par son écart en jours depuis `start`.
 * @param {unknown} value
 * @param {string} start
 * @returns {unknown}
 */
export function datesToOffsets(value, start) {
  if (typeof value === 'string' && ISO_DATE.test(value)) return diffDays(start, value);
  if (Array.isArray(value)) return value.map((item) => datesToOffsets(item, start));
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = datesToOffsets(child, start);
    return out;
  }
  return value;
}
