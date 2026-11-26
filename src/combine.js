// @ts-check

/**
 * @ruleRef X-BLOCK
 * @param {boolean} tempDetected
 * @param {boolean} secondaryDetected
 * @returns {boolean}
 */
export function bothRequired(tempDetected, secondaryDetected) {
  return tempDetected === true && secondaryDetected === true;
}

/**
 * @ruleRef X-LATER
 * @param {number} tempCompleteDay
 * @param {number} secondaryCompleteDay
 * @returns {number}
 */
export function latestWins(tempCompleteDay, secondaryCompleteDay) {
  return tempCompleteDay >= secondaryCompleteDay ? tempCompleteDay : secondaryCompleteDay;
}
