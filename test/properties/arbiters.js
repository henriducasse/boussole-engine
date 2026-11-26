// @ts-check

import fc from 'fast-check';
import { addDays } from '../../src/index.js';

const dayBodyArb = fc.record({
  bleeding: fc.option(fc.integer({ min: 0, max: 3 }).map((value) => ({ value })), { nil: undefined }),
  temperature: fc.option(
    fc.integer({ min: 700, max: 770 }).map((twentieths) => ({ celsius: twentieths / 20 })),
    { nil: undefined },
  ),
  mucus: fc.option(fc.integer({ min: 0, max: 4 }).map((quality) => ({ quality })), { nil: undefined }),
  cervix: fc.option(
    fc.record({
      opening: fc.integer({ min: 0, max: 2 }),
      firmness: fc.integer({ min: 0, max: 1 }),
    }),
    { nil: undefined },
  ),
});

/** Cycle calendaire consécutif, J1 avec saignement ≥ léger. */
export const cycleArb = fc.integer({ min: 8, max: 24 }).chain((length) =>
  fc.tuple(fc.integer({ min: 0, max: 4000 }), fc.array(dayBodyArb, { minLength: length, maxLength: length })).map(
    ([offset, bodies]) => {
      const start = addDays('2018-01-01', offset);
      return bodies.map((body, index) => materializeBody(body, addDays(start, index), index === 0));
    },
  ),
);

/** Entrée moteur valide : cycle courant, 0 à 2 cycles précédents. */
export const engineInputArb = fc.record({
  cycle: cycleArb,
  previousCycles: fc.array(cycleArb, { minLength: 0, maxLength: 2 }),
  secondarySymptom: fc.constantFrom('mucus', 'cervix'),
});

/** Masque de trous, assez long pour le cycle le plus long généré. */
export const holeMaskArb = fc.array(
  fc.record({
    temperature: fc.boolean(),
    mucus: fc.boolean(),
    cervix: fc.boolean(),
    bleeding: fc.boolean(),
  }),
  { minLength: 24, maxLength: 24 },
);

/**
 * @param {object} body
 * @param {string} date
 * @param {boolean} dayOne
 */
function materializeBody(body, date, dayOne) {
  /** @type {object} */
  const row = { date };
  if (dayOne) row.bleeding = { value: body.bleeding?.value >= 1 ? body.bleeding.value : 2 };
  else if (body.bleeding) row.bleeding = body.bleeding;
  if (body.temperature) row.temperature = body.temperature;
  if (body.mucus) row.mucus = body.mucus;
  if (body.cervix) row.cervix = body.cervix;
  return row;
}

/**
 * Cycle vraisemblable : plateau bas, hausse, glaire qui monte vers un pic,
 * trous et parenthèses semés. Sert à passer souvent par les décomptes
 * (docs/contrat-moteur.md §2 bis), là où cycleArb en crée peu.
 */
export const realisticCycleArb = fc
  .record({
    offset: fc.integer({ min: 0, max: 4000 }),
    low: fc.integer({ min: 6, max: 20 }),
    high: fc.integer({ min: 0, max: 16 }),
    base: fc.integer({ min: 720, max: 736 }),
    lift: fc.integer({ min: 1, max: 8 }),
    peakShift: fc.integer({ min: -4, max: 3 }),
    noise: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 36, maxLength: 36 }),
    holes: fc.array(fc.integer({ min: 0, max: 24 }), { minLength: 36, maxLength: 36 }),
  })
  .map(buildRealisticCycle);

/** Entrée moteur vraisemblable : cycle courant, 0 à 2 cycles précédents. */
export const realisticInputArb = fc.record({
  cycle: realisticCycleArb,
  previousCycles: fc.array(realisticCycleArb, { minLength: 0, maxLength: 2 }),
  secondarySymptom: fc.constantFrom('mucus', 'cervix'),
});

/**
 * holes : 0 = pas de température, 1 = température exclue, 2 = pas de glaire,
 * 3 = pas de col, autre = jour complet.
 * @param {{ offset: number, low: number, high: number, base: number, lift: number,
 *   peakShift: number, noise: number[], holes: number[] }} spec
 */
function buildRealisticCycle(spec) {
  const length = Math.max(8, spec.low + spec.high);
  const start = addDays('2018-01-01', spec.offset);
  const peak = spec.low + spec.peakShift;
  const rows = [];
  for (let day = 1; day <= length; day += 1) {
    const hole = spec.holes[day - 1];
    const tw = spec.base + spec.noise[day - 1] + (day > spec.low ? spec.lift : 0);
    /** @type {Record<string, unknown>} */
    const row = { date: addDays(start, day - 1) };
    if (day === 1) row.bleeding = { value: 2 };
    if (hole !== 0) row.temperature = { celsius: Math.min(770, Math.max(700, tw)) / 20, ...(hole === 1 ? { excluded: true } : {}) };
    if (hole !== 2) row.mucus = { quality: mucusAround(day, peak, spec.noise[day - 1]) };
    if (hole !== 3) row.cervix = day >= peak - 3 && day <= peak ? { opening: 1, firmness: 1 } : { opening: 0, firmness: 0 };
    rows.push(row);
  }
  return rows;
}

/**
 * @param {number} day
 * @param {number} peak
 * @param {number} noise
 */
function mucusAround(day, peak, noise) {
  const distance = day - peak;
  const shape = distance > 0 ? 1 : Math.max(0, 4 + distance);
  return Math.min(4, Math.max(0, shape + (noise === 3 ? 1 : noise === -3 ? -1 : 0)));
}
