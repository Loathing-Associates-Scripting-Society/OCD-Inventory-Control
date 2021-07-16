/**
 * @file Tools for managing `PhilterConfig` objects.
 */

/**
 * Get the full file name of a cleanup ruleset file, including the prefix and
 * file extension.
 */
export function getFullDataFileName(fileNameComponent: string) {
  return `OCDdata_${fileNameComponent}.txt`;
}

/**
 * Get the full file name of a cleanup stocking ruleset file, including the
 * prefix and file extension.
 */
export function getFullStockFileName(fileNameComponent: string) {
  return `OCDstock_${fileNameComponent}.txt`;
}
