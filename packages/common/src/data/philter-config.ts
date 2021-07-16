/**
 * Represents Philter's configuration.
 */
export interface PhilterConfig {
  // TODO: emptyClosetMode was misinterpreted! It actually means
  // 0: never empty closet
  // 1: before emptying Hangk's
  // -1: A value used by the classic relay script to denote "unselected".
  /**
   * Whether to empty the closet before cleanup.
   * - `0` means "Never empty closet".
   * - `-1` means "Before emptying Hagnk's".
   */
  emptyClosetMode: 0 | -1;
  /**
   * If `true`, no simulation is taken
   */
  simulateOnly: boolean;
  mallPricingMode: 'auto' | 'max';
  mallMultiName: string;
  mallMultiKmailMessage: string;
  /**
   * If `true` and `mallMultiName` is not an empty string, Philter will send
   * `MALL` items to the mall multi instead of mallselling them.
   */
  canUseMallMulti: boolean;
  dataFileName: string;
  stockFileName: string;
}
