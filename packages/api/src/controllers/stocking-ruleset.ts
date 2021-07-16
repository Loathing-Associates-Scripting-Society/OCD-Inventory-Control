/**
 * @file Tools for managing `StockingRuleset` objects.
 */

import {StockingRule} from '@philter/common';
import {
  CONFIG_NAMES,
  loadStockingRulesetFile,
  saveStockingRulesetFile,
} from '@philter/common/kol';
import {getvar} from 'zlib.ash';
import {getFullStockFileName} from './philter-config';

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
