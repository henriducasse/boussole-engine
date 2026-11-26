// @ts-check

/**
 * @typedef {'non_consecutive_dates' | 'missing_day1_bleeding' | 'invalid_date' | 'out_of_range' | 'empty_cycle'} InputErrorCode
 */

export class InputError extends Error {
  /**
   * @param {{ code: InputErrorCode, message: string, day?: number, date?: string }} fields
   */
  constructor(fields) {
    super(fields.message);
    this.name = 'InputError';
    /** @type {InputErrorCode} */
    this.code = fields.code;
    /** @type {number | undefined} */
    this.day = fields.day;
    /** @type {string | undefined} */
    this.date = fields.date;
  }
}
