// @ts-check

/**
 * Relevé `progress` (docs/contrat-moteur.md §2 bis).
 *
 * Ce fichier ne décide rien. Les boucles de temperature.js, mucus.js et
 * cervix.js l'appellent au moment où elles décident, pour noter ce qu'elles
 * voient. Aucune fonction du moteur ne relit ce qu'il produit.
 */

import { addDays } from './calendar.js';
import { MIN_HIGH_DELTA_TW, celsiusOut, presentTemperatureTw } from './twentieths.js';

/**
 * @typedef {{ day: number, tw: number }} Reading
 * @typedef {{ kind: string, ltlTw?: number, readings: Reading[] }} LtlResult
 * @typedef {'above' | 'notAbove' | 'missing' | 'upcoming'} MarkFact
 * @typedef {{ day: number, tw: number | null, fact: MarkFact }} FactRow
 * @typedef {{ state: string, count: object }} Final
 * @typedef {{ history: object[], open: object | null, final: Final | null }} Story
 */

/**
 * @returns {Story}
 */
export function startStory() {
  return { history: [], open: null, final: null };
}

/**
 * @ruleRef T-LTL
 * @param {Story} story
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} firstHighDay
 * @param {LtlResult} ltl
 * @param {{ status: string, lastMark?: number, result?: any }} outcome
 */
export function recordCandidate(story, cycle, firstHighDay, ltl, outcome) {
  if (outcome.status === 'reject') {
    story.history.push(describeCount(cycle, firstHighDay, ltl, 'rejected', outcome.lastMark ?? null, null));
  } else if (outcome.status === 'wait') {
    if (!story.open) story.open = describeCount(cycle, firstHighDay, ltl, 'open', null, null);
  } else if (outcome.status === 'shift') {
    const endMark = outcome.result.evaluationCompleteDay - firstHighDay + 1;
    const count = describeCount(cycle, firstHighDay, ltl, 'confirmed', endMark, outcome.result.ruleId);
    story.final = { state: 'confirmed', count };
  } else if (outcome.status === 'gap') {
    const endMark = outcome.result.reasons[0].day - firstHighDay + 1;
    story.final = { state: 'stopped', count: describeCount(cycle, firstHighDay, ltl, 'stopped', endMark, null) };
  }
}

/**
 * @param {Story} story
 * @param {object | null} baseline
 */
export function temperatureProgress(story, baseline) {
  if (story.final) {
    return { state: story.final.state, baseline: null, count: story.final.count, history: story.history };
  }
  if (story.open) return { state: 'counting', baseline: null, count: story.open, history: story.history };
  return { state: 'collecting', baseline, count: null, history: story.history };
}

/**
 * @ruleRef D-GAP-LTL
 * @param {Story} story
 * @param {object} baseline
 */
export function refusedProgress(story, baseline) {
  return { state: 'refused', baseline, count: null, history: story.history };
}

/**
 * @ruleRef T-LTL
 * @ruleRef D-GAP-LTL
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} forDay
 * @param {LtlResult} ltl
 * @param {number} windowMax
 */
export function describeBaseline(cycle, forDay, ltl, windowMax) {
  const states = /** @type {Record<string, string>} */ ({ ok: 'ready', gap: 'spread', 'need-more': 'building' });
  /** @type {Record<string, unknown>} */
  const baseline = {
    forDay,
    forDate: dateOf(cycle, forDay),
    state: states[ltl.kind],
    readings: publicReadings(cycle, ltl.readings),
    windowMax,
  };
  if (ltl.kind === 'ok' && ltl.ltlTw != null) baseline.ltl = celsiusOut(ltl.ltlTw);
  return baseline;
}

/**
 * @ruleRef T-STD
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} firstHighDay
 * @param {LtlResult} ltl ligne « ok » du Jour 1
 * @param {'open' | 'confirmed' | 'rejected' | 'stopped'} outcome
 * @param {number | null} endMark
 * @param {string | null} concludedRule
 */
function describeCount(cycle, firstHighDay, ltl, outcome, endMark, concludedRule) {
  const ltlTw = /** @type {number} */ (ltl.ltlTw);
  const facts = [0, 1, 2, 3].map((offset) => readFact(cycle, firstHighDay + offset, ltlTw));
  const rule = concludedRule ?? ruleInPlay(facts, ltlTw);
  const marks = facts.map((row, index) => describeMark(cycle, row, index + 1, rule, facts, ltlTw, endMark));
  const endDay = endMark == null ? null : firstHighDay + endMark - 1;
  const upcoming = marks.find((mark) => mark.state === 'upcoming');
  return {
    firstHighDay,
    firstHighDate: dateOf(cycle, firstHighDay),
    ltl: celsiusOut(ltlTw),
    ltlReadings: publicReadings(cycle, ltl.readings),
    rule,
    outcome,
    endDay,
    endDate: endDay == null ? null : dateOf(cycle, endDay),
    next: outcome === 'open' && upcoming ? upcoming.mark : null,
    marks,
  };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} day
 * @param {number} ltlTw
 * @returns {FactRow}
 */
function readFact(cycle, day, ltlTw) {
  if (day > cycle.length) return { day, tw: null, fact: 'upcoming' };
  const tw = presentTemperatureTw(cycle[day - 1]);
  if (tw == null) return { day, tw: null, fact: 'missing' };
  return { day, tw, fact: tw > ltlTw ? 'above' : 'notAbove' };
}

/**
 * Règle en jeu d'après les Jours 2 et 3 connus.
 * @ruleRef T-EX1
 * @ruleRef T-EX2
 * @param {FactRow[]} facts
 * @param {number} ltlTw
 */
function ruleInPlay(facts, ltlTw) {
  const [, second, third] = facts;
  if (second.fact === 'notAbove') return 'T-EX2';
  if (second.fact !== 'above' || !isKnown(third)) return 'T-STD';
  if (third.fact === 'notAbove') return 'T-EX2';
  return /** @type {number} */ (third.tw) >= ltlTw + MIN_HIGH_DELTA_TW ? 'T-STD' : 'T-EX1';
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {FactRow} row
 * @param {number} mark
 * @param {string} rule
 * @param {FactRow[]} facts
 * @param {number} ltlTw
 * @param {number | null} endMark
 */
function describeMark(cycle, row, mark, rule, facts, ltlTw, endMark) {
  const base = { mark, day: row.day, date: dateOf(cycle, row.day) };
  if (endMark != null && mark > endMark) {
    return { ...base, celsius: null, state: 'notNeeded', target: null, met: null };
  }
  const target = targetFor(mark, rule, facts, ltlTw);
  const optional = mark === 4 && target == null && row.fact === 'upcoming';
  return {
    ...base,
    celsius: row.tw == null ? null : celsiusOut(row.tw),
    state: optional ? 'optional' : row.fact,
    target: target && { op: target.op, celsius: celsiusOut(target.tw) },
    met: row.tw == null || !target ? null : meets(row.tw, target),
  };
}

/**
 * @ruleRef T-STD
 * @param {number} mark
 * @param {string} rule
 * @param {FactRow[]} facts
 * @param {number} ltlTw
 * @returns {{ op: '>' | '>=', tw: number } | null}
 */
function targetFor(mark, rule, facts, ltlTw) {
  const above = { op: /** @type {'>'} */ ('>'), tw: ltlTw };
  const high = { op: /** @type {'>='} */ ('>='), tw: ltlTw + MIN_HIGH_DELTA_TW };
  if (mark <= 2) return above;
  if (mark === 3) return facts[1].fact === 'notAbove' ? above : high;
  if (rule === 'T-EX1') return above;
  if (rule === 'T-EX2') return high;
  return null;
}

/**
 * @param {number} tw
 * @param {{ op: '>' | '>=', tw: number }} target
 */
function meets(tw, target) {
  return target.op === '>' ? tw > target.tw : tw >= target.tw;
}

/**
 * @param {FactRow} row
 */
function isKnown(row) {
  return row.fact === 'above' || row.fact === 'notAbove';
}

/**
 * @ruleRef M-PEAK
 * @ruleRef C-PEAK
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {'mucus' | 'cervix'} kind
 * @param {{ peakDay: number, peakQuality: number } | null} peak
 * @param {number | null} tempCompleteDay
 * @param {(day: import('./index.js').CycleDay) => number | null} qualityFn
 */
export function describeSecondary(cycle, kind, peak, tempCompleteDay, qualityFn) {
  const base = {
    kind,
    peakSearchUntil: Math.min(tempCompleteDay ?? cycle.length, cycle.length),
    peakSearchClosed: tempCompleteDay != null,
  };
  if (!peak) return { ...base, state: 'noPeak', marks: [] };
  const facts = [1, 2, 3].map((offset) => secondaryFact(cycle, peak, peak.peakDay + offset, qualityFn));
  const gapIndex = facts.indexOf('missing');
  const marks = facts.map((fact, index) => ({
    mark: index + 1,
    day: peak.peakDay + index + 1,
    date: dateOf(cycle, peak.peakDay + index + 1),
    state: gapIndex >= 0 && index > gapIndex ? 'notNeeded' : fact,
  }));
  return { ...base, state: secondaryState(facts), peakDay: peak.peakDay, peakDate: dateOf(cycle, peak.peakDay), marks };
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {{ peakQuality: number }} peak
 * @param {number} day
 * @param {(day: import('./index.js').CycleDay) => number | null} qualityFn
 */
function secondaryFact(cycle, peak, day, qualityFn) {
  if (day > cycle.length) return 'upcoming';
  const quality = qualityFn(cycle[day - 1]);
  if (quality == null) return 'missing';
  return quality < peak.peakQuality ? 'lower' : 'notLower';
}

/**
 * Même ordre que confirmThreeLower : un trou arrête, puis un jour aussi
 * fertile que le pic bloque (le pic ne se cherche pas au-delà), puis on attend.
 * @ruleRef D-GAP-CONF
 * @param {string[]} facts
 */
function secondaryState(facts) {
  if (facts.includes('missing')) return 'stopped';
  if (facts.includes('notLower')) return 'blocked';
  if (facts.includes('upcoming')) return 'counting';
  return 'confirmed';
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {Reading[]} readings du plus récent au plus ancien (computeLtl)
 */
function publicReadings(cycle, readings) {
  return [...readings]
    .reverse()
    .map((reading) => ({ day: reading.day, date: dateOf(cycle, reading.day), celsius: celsiusOut(reading.tw) }));
}

/**
 * @param {import('./index.js').CycleDay[]} cycle
 * @param {number} day
 * @returns {string}
 */
function dateOf(cycle, day) {
  if (day >= 1 && day <= cycle.length) return /** @type {{ date: string }} */ (cycle[day - 1]).date;
  return addDays(/** @type {{ date: string }} */ (cycle[0]).date, day - 1);
}
