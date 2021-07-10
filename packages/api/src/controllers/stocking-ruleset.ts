/**
 * @file Tools for managing `StockingRuleset` objects.
 */

import {StockingRule} from '@philter/common';
import {createMapLoader, encodeItem} from '@philter/common/kol';
import {bufferToFile, toInt, toItem} from 'kolmafia';
import {getvar} from 'zlib.ash';
import {CONFIG_NAMES, getFullStockFileName} from './philter-config';

/**
 * Loads a stocking ruleset from a text file into a map.
 * @param fileName Path to the data file
 * @return Map of each item to its stocking rule. If the user's stocking ruleset
 *    file is empty or missing, returns `null`.
 * @throws {TypeError} If the file contains invalid data
 */
const loadStockingRulesetFile = createMapLoader(
  (
    [itemName, type, amountStr, category = ''],
    _,
    fileName
  ): [Item, StockingRule] => {
    const amount = Number(amountStr);
    if (!Number.isInteger(amount)) {
      throw new TypeError(
        `Invalid stock-up amount (${amount}) for item '${itemName}' in file '${fileName}'`
      );
    }

    return [toItem(itemName), {type, amount, category}];
  }
);

/**
 * Saves a map containing a stocking ruleset to a text file.
 * @param filepath Path to the data file
 * @param stockingRulesMap Map of each item to its stocking rule
 */
export function saveStockingRulesetFile(
  filepath: string,
  stockingRulesMap: ReadonlyMap<Item, Readonly<StockingRule>>
) {
  // Sort entries by item ID in ascending order when saving
  const buffer = Array.from(stockingRulesMap.entries())
    .sort(([itemA], [itemB]) => toInt(itemA) - toInt(itemB))
    .map(([item, rule]) =>
      [encodeItem(item), rule.type, rule.amount, rule.category].join('\t')
    )
    .join('\n');

  if (!bufferToFile(buffer, filepath)) {
    throw new Error(`Failed to save to ${filepath}`);
  }
}

/**
 * Loads the stocking ruleset from the stocking ruleset file of the current
 * player.
 * @return Map of each item to its stocking rule. If the user's stocking ruleset
 *    file is empty or missing, returns `null`.
 */
export function loadStockingRulesetForCurrentPlayer() {
  return loadStockingRulesetFile(
    getFullStockFileName(getvar(CONFIG_NAMES.stockFileName))
  );
}

/**
 * Writes the stocking ruleset to the stocking ruleset file of the current
 * player.
 * @param stockingRulesMap Stocking ruleset to save
 */
export function saveStockingRulesetForCurrentPlayer(
  stockingRulesMap: ReadonlyMap<Item, Readonly<StockingRule>>
) {
  return saveStockingRulesetFile(
    getFullStockFileName(getvar(CONFIG_NAMES.stockFileName)),
    stockingRulesMap
  );
}
