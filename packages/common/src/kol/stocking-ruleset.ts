/**
 * @file Tools for manipulating stocking ruleset files.
 */

import {bufferToFile, toInt, toItem} from 'kolmafia';
import {StockingRule} from '../data/stocking-rule.js';
import {createMapLoader, encodeItem} from './util.js';

/**
 * A Map that maps `Item` objects to `StockingRule` objects.
 * Not to be confused with `StockingRuleset`, which is a plain object whose keys
 * are item IDs (string).
 */
export type StockingRules = Map<Item, StockingRule>;

/** A read-only variant of `StockingRules`. */
export type ReadonlyStockingRules = ReadonlyMap<Item, Readonly<StockingRule>>;

/**
 * Loads a stocking ruleset from a text file into a map.
 * @param fileName Path to the data file
 * @return Map of each item to its stocking rule. If the user's stocking ruleset
 *    file is empty or missing, returns `null`.
 * @throws {TypeError} If the file contains invalid data
 */
export const loadStockingRulesetFile = createMapLoader(
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
