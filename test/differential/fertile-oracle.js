// @ts-check

/**
 * Référence fertile minimale, indépendante du moteur.
 * Encode SPEC.md (température, glaire, col, pré-ovulatoire).
 * N'importe pas `src`.
 *
 * Les fixtures standard (jours numérotés, trous matérialisés) sont la seule entrée.
 */

const TWENTIETHS = 20;
const LTL_SPAN = 9;
const HIGH_DELTA = 4;

/**
 * @param {object[]} specs
 * @returns {object[]}
 */
function expandSpecs(specs) {
  /** @type {Map<number, object>} */
  const byDay = new Map();
  let max = 0;
  for (const spec of specs) {
    byDay.set(spec.day, spec);
    if (spec.day > max) max = spec.day;
  }
  const rows = [];
  for (let day = 1; day <= max; day += 1) rows.push(byDay.get(day) ?? { day });
  return rows;
}

/**
 * @param {unknown} field
 * @returns {unknown}
 */
function presentField(field) {
  if (field == null || typeof field !== 'object') return field ?? null;
  if (/** @type {{ excluded?: boolean }} */ (field).excluded === true) return null;
  return field;
}

/**
 * @param {object} row
 * @returns {number | null}
 */
function tempTw(row) {
  const raw = row.temperature;
  if (raw == null) return null;
  if (typeof raw === 'number') return Math.round(raw * TWENTIETHS);
  const field = presentField(raw);
  if (field == null) return null;
  return Math.round(/** @type {{ celsius: number }} */ (field).celsius * TWENTIETHS);
}

/**
 * @param {object} row
 * @returns {number | null}
 */
function mucusQuality(row) {
  const raw = row.mucus;
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const field = presentField(raw);
  if (field == null) return null;
  return /** @type {{ quality: number }} */ (field).quality;
}

/**
 * @param {object} row
 * @returns {{ opening: number, firmness: number } | null}
 */
function cervixOf(row) {
  const field = presentField(row.cervix);
  if (field == null || typeof field !== 'object') return null;
  return /** @type {{ opening: number, firmness: number }} */ (field);
}

/**
 * @param {number} twentieths
 * @returns {number}
 */
function celsiusOut(twentieths) {
  return Number((twentieths / TWENTIETHS).toFixed(2));
}

/**
 * @param {object[]} rows
 * @param {number} candidateDay
 * @returns {{ kind: 'ok', ltlTw: number } | { kind: 'need-more' } | { kind: 'gap' }}
 */
function ltlAt(rows, candidateDay) {
  /** @type {{ day: number, tw: number }[]} */
  const readings = [];
  for (let day = candidateDay - 1; day >= 1 && readings.length < 6; day -= 1) {
    const tw = tempTw(rows[day - 1]);
    if (tw != null) readings.push({ day, tw });
  }
  if (readings.length < 6) return { kind: 'need-more' };
  if (readings[5].day < candidateDay - LTL_SPAN) return { kind: 'gap' };
  let ltlTw = readings[0].tw;
  for (const reading of readings) if (reading.tw > ltlTw) ltlTw = reading.tw;
  return { kind: 'ok', ltlTw };
}

/**
 * @param {object[]} rows
 * @param {number} start
 * @param {number} count
 * @returns {{ tw: number[], gap: number | null }}
 */
function readTemps(rows, start, count) {
  /** @type {number[]} */
  const tw = [];
  for (let offset = 0; offset < count; offset += 1) {
    const day = start + offset;
    if (day > rows.length) return { tw, gap: null };
    const value = tempTw(rows[day - 1]);
    if (value == null) return { tw, gap: day };
    tw.push(value);
  }
  return { tw, gap: null };
}

/**
 * @param {number[]} highs
 * @param {number} ltlTw
 */
function standardShift(highs, ltlTw) {
  return highs.length >= 3
    && highs[0] > ltlTw && highs[1] > ltlTw && highs[2] > ltlTw
    && highs[2] >= ltlTw + HIGH_DELTA;
}

/**
 * @param {number[]} highs
 * @param {number} ltlTw
 */
function exceptionShift(highs, ltlTw) {
  if (highs.length < 4 || !(highs[0] > ltlTw)) return null;
  const above2 = highs[1] > ltlTw;
  const above3 = highs[2] > ltlTw;
  if (above2 && above3 && highs[2] < ltlTw + HIGH_DELTA && highs[3] > ltlTw) return 'T-EX1';
  const drops = Number(!above2) + Number(!above3);
  if (drops === 1 && highs[3] >= ltlTw + HIGH_DELTA) return 'T-EX2';
  return null;
}

/**
 * @param {number[]} highs
 * @param {number} ltlTw
 */
function exceptionStillOpen(highs, ltlTw) {
  const above2 = highs[1] > ltlTw;
  const above3 = highs[2] > ltlTw;
  if (above2 && above3 && highs[2] < ltlTw + HIGH_DELTA) return true;
  return Number(!above2) + Number(!above3) === 1;
}

/**
 * @param {object[]} rows
 * @param {number} day
 * @param {string} ruleId
 */
function refuse(day, ruleId) {
  const code = ruleId === 'D-GAP-LTL' ? 'insufficient_low_readings' : 'gap_in_confirmation_window';
  return {
    evaluable: false,
    detected: false,
    reasons: [{ code, ruleId, day }],
  };
}

/**
 * SPEC.md - La règle de température.
 * @param {object[]} rows
 */
function referenceTemperature(rows) {
  for (let day = 1; day <= rows.length; day += 1) {
    const tw = tempTw(rows[day - 1]);
    if (tw == null) continue;
    const ltl = ltlAt(rows, day);
    if (ltl.kind === 'gap') return refuse(day, 'D-GAP-LTL');
    if (ltl.kind !== 'ok' || tw <= ltl.ltlTw) continue;
    const found = confirmTemperature(rows, day, ltl.ltlTw);
    if (found) return found;
  }
  return { evaluable: true, detected: false, reasons: [] };
}

/**
 * @param {object[]} rows
 * @param {number} firstHigh
 * @param {number} ltlTw
 */
function confirmTemperature(rows, firstHigh, ltlTw) {
  const three = readTemps(rows, firstHigh, 3);
  if (three.gap != null) return refuse(three.gap, 'D-GAP-CONF');
  if (three.tw.length < 3) return null;
  if (standardShift(three.tw, ltlTw)) return shift(firstHigh, 2, 'T-STD', ltlTw);
  if (!exceptionStillOpen(three.tw, ltlTw)) return null;
  const fourth = readTemps(rows, firstHigh + 3, 1);
  if (fourth.gap != null) return refuse(fourth.gap, 'D-GAP-CONF');
  if (fourth.tw.length < 1) return null;
  const ruleId = exceptionShift([...three.tw, fourth.tw[0]], ltlTw);
  if (!ruleId) return null;
  return shift(firstHigh, 3, ruleId, ltlTw);
}

/**
 * @param {number} firstHighDay
 * @param {number} span
 * @param {string} ruleId
 * @param {number} ltlTw
 */
function shift(firstHighDay, span, ruleId, ltlTw) {
  return {
    evaluable: true,
    detected: true,
    reasons: [],
    ruleId,
    ltl: celsiusOut(ltlTw),
    firstHighDay,
    evaluationCompleteDay: firstHighDay + span,
  };
}

/**
 * @param {object[]} rows
 * @param {number} from
 * @param {number} last
 * @param {(row: object) => number | null} qualityFn
 * @param {number} minPeak
 */
function findPeak(rows, from, last, qualityFn, minPeak) {
  let best = 0;
  /** @type {number | null} */
  let peakDay = null;
  const end = Math.min(last, rows.length);
  for (let day = from; day <= end; day += 1) {
    const quality = qualityFn(rows[day - 1]);
    if (quality != null && (quality > best || (quality === best && best >= minPeak))) {
      best = quality;
      if (best >= minPeak) peakDay = day;
    }
    // SPEC.md - trois jours inférieurs, puis surveillance étendue.
    if (peakDay != null && best >= minPeak && day >= peakDay + 3 && threeLower(rows, peakDay, best, qualityFn).status === 'ok') {
      return { peakDay, peakQuality: best };
    }
  }
  if (best < minPeak || peakDay == null) return null;
  return { peakDay, peakQuality: best };
}

/**
 * @param {object[]} rows
 * @param {number} peakDay
 * @param {number} peakQuality
 * @param {(row: object) => number | null} qualityFn
 */
function threeLower(rows, peakDay, peakQuality, qualityFn) {
  for (let day = peakDay + 1; day <= peakDay + 3; day += 1) {
    if (day > rows.length) return { status: 'incomplete' };
    const quality = qualityFn(rows[day - 1]);
    if (quality == null) return { status: 'gap', day };
    if (quality >= peakQuality) return { status: 'not-yet' };
  }
  return { status: 'ok' };
}

/**
 * @param {object[]} rows
 * @param {number} peakDay
 * @param {number} peakQuality
 * @param {number} until
 * @param {(row: object) => number | null} qualityFn
 * @returns {number | null}
 */
function invalidatedAt(rows, peakDay, peakQuality, until, qualityFn) {
  const last = Math.min(until, rows.length);
  for (let day = peakDay + 4; day <= last; day += 1) {
    const quality = qualityFn(rows[day - 1]);
    if (quality != null && quality >= peakQuality) return day;
  }
  return null;
}

/**
 * SPEC.md - Glaire, col, double vérification.
 * @param {object[]} rows
 * @param {'mucus' | 'cervix'} symptom
 * @param {number | null} tempComplete
 */
function referenceSecondary(rows, symptom, tempComplete) {
  const qualityFn = symptom === 'mucus' ? mucusQuality : cervixQuality;
  const minPeak = symptom === 'mucus' ? 2 : 1;
  const ruleId = symptom === 'mucus' ? 'M-PEAK' : 'C-PEAK';
  const limit = tempComplete ?? rows.length;
  /** @type {{ ruleId: string, day: number, detail: string }[]} */
  const extTrace = [];
  let from = 1;
  while (from <= rows.length) {
    const peak = findPeak(rows, from, limit, qualityFn, minPeak);
    if (!peak) return { evaluable: true, detected: false, kind: symptom, reasons: [], extTrace };
    const verdict = acceptPeak(rows, peak, limit, qualityFn, symptom, ruleId);
    if (verdict.kind === 'retry') {
      extTrace.push({
        ruleId: symptom === 'mucus' ? 'M-EXT' : 'C-EXT',
        day: verdict.from,
        detail: 'pic invalidé',
      });
      from = verdict.from;
      continue;
    }
    return { ...verdict.result, extTrace };
  }
  return { evaluable: true, detected: false, kind: symptom, reasons: [], extTrace };
}

/**
 * @param {object} row
 * @returns {number | null}
 */
function cervixQuality(row) {
  const cervix = cervixOf(row);
  if (cervix == null) return null;
  return cervix.opening === 0 && cervix.firmness === 0 ? 0 : 1;
}

/**
 * @param {object[]} rows
 * @param {{ peakDay: number, peakQuality: number }} peak
 * @param {number} limit
 * @param {(row: object) => number | null} qualityFn
 * @param {'mucus' | 'cervix'} symptom
 * @param {string} ruleId
 * @returns {{ kind: 'done', result: object } | { kind: 'retry', from: number }}
 */
function acceptPeak(rows, peak, limit, qualityFn, symptom, ruleId) {
  const conf = threeLower(rows, peak.peakDay, peak.peakQuality, qualityFn);
  if (conf.status === 'gap') {
    return { kind: 'done', result: { ...refuse(conf.day, 'D-GAP-CONF'), kind: symptom } };
  }
  if (conf.status !== 'ok') {
    return { kind: 'done', result: { evaluable: true, detected: false, kind: symptom, reasons: [] } };
  }
  const again = invalidatedAt(rows, peak.peakDay, peak.peakQuality, limit, qualityFn);
  if (again != null) return { kind: 'retry', from: again };
  return {
    kind: 'done',
    result: {
      evaluable: true,
      detected: true,
      kind: symptom,
      ruleId,
      peakDay: peak.peakDay,
      evaluationCompleteDay: peak.peakDay + 3,
      reasons: [],
    },
  };
}

/**
 * @param {object} row
 * @param {'mucus' | 'cervix'} symptom
 */
function fertileSign(row, symptom) {
  if (symptom === 'mucus') {
    const quality = mucusQuality(row);
    return quality != null && quality >= 2;
  }
  const cervix = cervixOf(row);
  return cervix != null && (cervix.opening >= 1 || cervix.firmness === 1);
}

/**
 * Premier jour au-dessus de la ligne de base (même non confirmé), ou le jour où la
 * ligne de base ne peut pas être posée. Sert de borne basse au premier point haut.
 * @param {object[]} rows
 * @returns {number | null}
 */
function firstCandidateDay(rows) {
  for (let day = 1; day <= rows.length; day += 1) {
    const tw = tempTw(rows[day - 1]);
    if (tw == null) continue;
    const ltl = ltlAt(rows, day);
    if (ltl.kind === 'gap') return day;
    if (ltl.kind === 'ok' && tw > ltl.ltlTw) return day;
  }
  return null;
}

/**
 * SPEC.md - Règle « moins 8 » et 5 jours.
 * @param {object[][]} previousCycles
 */
function referenceWindow(previousCycles) {
  /** @type {number[]} */
  const highs = [];
  /** @type {number[]} */
  const caps = [];
  for (const specs of previousCycles) {
    const rows = expandSpecs(specs);
    const shift = referenceTemperature(rows);
    if (shift.evaluable && shift.detected && shift.firstHighDay != null) highs.push(shift.firstHighDay);
    // docs/contrat-moteur.md §9 (issue #130) : un ancien cycle illisible plafonne la fenêtre
    // à son premier candidat, il ne l'allonge jamais.
    if (!shift.evaluable) {
      const cap = firstCandidateDay(rows);
      if (cap != null) caps.push(cap);
    }
  }
  const latest = previousCycles[0] ? referenceTemperature(expandSpecs(previousCycles[0])) : null;
  if (!latest?.detected) return { endDay: 0, ruleId: 'P-NONE', signDay: null };
  let earliest = highs[0] ?? caps[0];
  for (const day of [...highs, ...caps]) if (day < earliest) earliest = day;
  const minus8 = earliest - 8;
  if (minus8 < 5) {
    const endDay = minus8 < 0 ? 0 : minus8;
    return { endDay, ruleId: minus8 === 0 ? 'P-M8-ZERO' : 'P-M8', signDay: null };
  }
  if (minus8 > 5 && highs.length >= 12) return { endDay: minus8, ruleId: 'P-M8', signDay: null };
  return { endDay: 5, ruleId: 'P-5DAY', signDay: null };
}

/**
 * SPEC.md - Arrêt immédiat sur signe fertile.
 * @param {object[]} rows
 * @param {{ endDay: number, ruleId: string, signDay: number | null }} window
 * @param {'mucus' | 'cervix'} symptom
 */
function stopWindow(rows, window, symptom) {
  if (window.endDay <= 0) return window;
  const last = Math.min(window.endDay, rows.length);
  for (let day = 1; day <= last; day += 1) {
    if (!fertileSign(rows[day - 1], symptom)) continue;
    return { endDay: day - 1, ruleId: 'P-STOP', signDay: day };
  }
  return window;
}

/**
 * § État attendu
 * SPEC.md - pré-ovulatoire, signe fertile, post-ovulatoire.
 *
 * Un jour prêt à analyser (`ready: true`) est :
 * - fertile si le cycle est inévaluable (aucune phase infertile accordée) ;
 * - infertile s'il tombe dans la fenêtre pré-ovulatoire encore ouverte ;
 * - infertile à partir du jour post-ovulatoire (soir du signe le plus tardif) ;
 * - fertile sinon.
 *
 * Fin du § - état attendu : `{ day, ready, fertile }`.
 *
 * @param {object[]} rows
 * @param {{ endDay: number } | null} pre
 * @param {{ startDay: number } | null} post
 * @param {boolean} evaluable
 */
export function expectedDayStates(rows, pre, post, evaluable) {
  return rows.map((_, index) => ({
    day: index + 1,
    ready: true,
    fertile: fertileOnDay(index + 1, pre, post, evaluable),
  }));
}

/**
 * @param {number} day
 * @param {{ endDay: number } | null} pre
 * @param {{ startDay: number } | null} post
 * @param {boolean} evaluable
 */
function fertileOnDay(day, pre, post, evaluable) {
  if (!evaluable) return true;
  if (pre && day <= pre.endDay) return false;
  if (post && day >= post.startDay) return postFertile(day, post);
  return true;
}

/**
 * docs/contrat-moteur.md §2 ter - X-POST : après la validation, un jour sans signe
 * est incertain, un signe fertile arrête la phase infertile jusqu'à la fin du cycle.
 * @param {number} day
 * @param {{ startDay: number, stopDay?: number | null, uncertainDays?: number[] }} post
 */
function postFertile(day, post) {
  if (post.stopDay != null && day >= post.stopDay) return true;
  return (post.uncertainDays ?? []).includes(day);
}

/**
 * @param {object[]} rows
 * @param {'mucus' | 'cervix'} symptom
 * @param {number} startDay
 * @returns {{ stopDay: number | null, uncertainDays: number[] }}
 */
function postWatch(rows, symptom, startDay) {
  /** @type {number[]} */
  const uncertainDays = [];
  for (let day = startDay + 1; day <= rows.length; day += 1) {
    const row = rows[day - 1];
    const quality = mucusQuality(row);
    const cervix = cervixOf(row);
    const seen = symptom === 'mucus' ? quality != null : cervix != null;
    if (!seen) {
      uncertainDays.push(day);
      continue;
    }
    const fertile = symptom === 'mucus' ? quality >= 2 : cervix.opening >= 1 || cervix.firmness === 1;
    if (fertile) return { stopDay: day, uncertainDays };
  }
  return { stopDay: null, uncertainDays };
}

/**
 * @param {{ stopDay?: number | null, uncertainDays?: number[] } | null} post
 */
function postWarnings(post) {
  if (!post) return [];
  const unknown = (post.uncertainDays ?? []).map((day) => ({ code: 'post_ovulatory_day_unknown', day }));
  if (post.stopDay == null) return unknown;
  return [...unknown, { code: 'post_ovulatory_stopped_by_fertile_sign', day: post.stopDay }];
}

/**
 * Calendrier de référence d'une fixture standard.
 * `days` est la fin du § : un objet lisible par jour prêt à analyser.
 *
 * @param {{ days: object[], previousCycles?: object[][], secondarySymptom?: 'mucus' | 'cervix' }} fixture
 */
export function referenceFertileCalendar(fixture) {
  const symptom = fixture.secondarySymptom ?? 'mucus';
  const rows = expandSpecs(fixture.days);
  const temperature = referenceTemperature(rows);
  if (!temperature.evaluable) return unevaluableCalendar(rows, temperature.reasons);
  const secondary = referenceSecondary(rows, symptom, temperature.detected ? temperature.evaluationCompleteDay : null);
  const extTrace = secondary.extTrace ?? [];
  if (!secondary.evaluable) return unevaluableCalendar(rows, secondary.reasons, extTrace);
  const window = stopWindow(rows, referenceWindow(fixture.previousCycles ?? []), symptom);
  const ungrounded = window.endDay > 0 && !applicableOnFirstDay(rows, symptom);
  const startOfPost = bothSigns(temperature, secondary)
    ? laterDay(temperature.evaluationCompleteDay, secondary.evaluationCompleteDay)
    : null;
  const post = startOfPost == null ? null : { startDay: startOfPost, ...postWatch(rows, symptom, startOfPost) };
  if (ungrounded && !post) {
    return unevaluableCalendar(rows, [ungroundedReason(window.ruleId)], [...extTrace, { ruleId: window.ruleId, day: 1 }]);
  }
  const granted = ungrounded ? { endDay: 0, ruleId: null, signDay: null } : window;
  const pre = granted.endDay > 0 ? { endDay: granted.endDay, ruleId: granted.ruleId } : null;
  /** @type {object[]} */
  const trace = [...extTrace];
  if (granted.signDay != null) trace.push({ ruleId: 'P-STOP', day: granted.signDay });
  return {
    evaluable: true,
    reasons: [],
    warnings: [
      ...outlierWarnings(rows, temperature.detected ? temperature.firstHighDay - 1 : rows.length),
      ...stopWarnings(granted.signDay),
      ...postWarnings(post),
    ],
    temperatureShift: publicShift(temperature),
    secondaryShift: publicSecondary(secondary),
    phases: publicPhases(pre, post),
    signDay: granted.signDay,
    trace,
    days: expectedDayStates(rows, pre, post, true),
  };
}

/**
 * @param {object[]} rows
 * @param {object[]} reasons
 */
function unevaluableCalendar(rows, reasons, trace = []) {
  return {
    evaluable: false,
    reasons,
    warnings: outlierWarnings(rows),
    temperatureShift: { detected: false },
    secondaryShift: { detected: false },
    phases: {},
    signDay: null,
    trace,
    days: expectedDayStates(rows, null, null, false),
  };
}

/**
 * SPEC.md - l'absence de signal ne démontre pas l'infertilité.
 * @param {object[]} rows
 * @param {'mucus' | 'cervix'} symptom
 */
function applicableOnFirstDay(rows, symptom) {
  if (rows.length === 0) return false;
  if (symptom === 'mucus') return mucusQuality(rows[0]) != null;
  return cervixOf(rows[0]) != null;
}

/**
 * @param {string} ruleId
 */
function ungroundedReason(ruleId) {
  return {
    code: 'ungrounded_preovulatory',
    ruleId,
    day: 1,
    message: 'Pas de signe secondaire applicable : la fenêtre pré-ovulatoire n’est pas accordée.',
  };
}

/**
 * Pic isolé vers le haut (≥ 0,2 °C au-dessus des voisins), en phase basse seulement.
 * SPEC.md - Perturbation / jugement.
 * @param {object[]} rows
 * @param {number} [lastLowDay]
 */
function outlierWarnings(rows, lastLowDay = rows.length) {
  /** @type {{ code: string, day: number }[]} */
  const warnings = [];
  for (let index = 0; index < Math.min(rows.length, lastLowDay); index += 1) {
    const tw = tempTw(rows[index]);
    if (tw == null) continue;
    const prev = nearestTw(rows, index, -1);
    const next = nearestTw(rows, index, 1);
    if (prev == null || next == null) continue;
    if (tw >= prev + HIGH_DELTA && tw >= next + HIGH_DELTA) {
      warnings.push({ code: 'possible_outlier_temperature', day: index + 1 });
    }
  }
  return warnings;
}

/**
 * @param {object[]} rows
 * @param {number} index
 * @param {number} step
 * @returns {number | null}
 */
function nearestTw(rows, index, step) {
  for (let cursor = index + step; cursor >= 0 && cursor < rows.length; cursor += step) {
    const tw = tempTw(rows[cursor]);
    if (tw != null) return tw;
  }
  return null;
}

/**
 * @param {number | null} signDay
 */
function stopWarnings(signDay) {
  if (signDay == null) return [];
  return [{ code: 'preovu_stopped_by_fertile_sign', day: signDay }];
}

/**
 * @param {object} temperature
 * @param {object} secondary
 */
function bothSigns(temperature, secondary) {
  return temperature.detected === true && secondary.detected === true;
}

/**
 * @param {number} tempDay
 * @param {number} secondaryDay
 */
function laterDay(tempDay, secondaryDay) {
  return tempDay >= secondaryDay ? tempDay : secondaryDay;
}

/**
 * @param {object} temperature
 */
function publicShift(temperature) {
  if (!temperature.detected) return { detected: false };
  return {
    detected: true,
    ruleId: temperature.ruleId,
    ltl: temperature.ltl,
    firstHighDay: temperature.firstHighDay,
    evaluationCompleteDay: temperature.evaluationCompleteDay,
  };
}

/**
 * @param {object} secondary
 */
function publicSecondary(secondary) {
  if (!secondary.detected) return { kind: secondary.kind, detected: false };
  return {
    kind: secondary.kind,
    detected: true,
    ruleId: secondary.ruleId,
    peakDay: secondary.peakDay,
    evaluationCompleteDay: secondary.evaluationCompleteDay,
  };
}

/**
 * @param {{ startDay: number, stopDay?: number | null, uncertainDays?: number[] }} post
 */
function publicPost(post) {
  /** @type {object} */
  const view = { startDay: post.startDay, time: '18:00' };
  if (post.stopDay != null) {
    view.stopDay = post.stopDay;
    view.stopRuleId = 'X-POST';
  }
  if ((post.uncertainDays ?? []).length > 0) view.uncertainDays = post.uncertainDays;
  return view;
}

/**
 * @param {{ endDay: number, ruleId: string } | null} pre
 * @param {{ startDay: number } | null} post
 */
function publicPhases(pre, post) {
  /** @type {object} */
  const phases = {};
  if (pre) phases.preOvulatory = { startDay: 1, endDay: pre.endDay, ruleId: pre.ruleId };
  if (post) phases.postOvulatory = publicPost(post);
  return phases;
}
