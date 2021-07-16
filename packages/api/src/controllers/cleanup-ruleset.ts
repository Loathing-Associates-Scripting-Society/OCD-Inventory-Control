/**
 * @file Tools for managing `CleanupRuleset` objects.
 */

import {CleanupRule} from '@philter/common';
import {
  CONFIG_NAMES,
  loadCleanupRulesetFile,
  saveCleanupRulesetFile,
} from '@philter/common/kol';
import {myName} from 'kolmafia';
import {getvar} from 'zlib.ash';
import {getFullDataFileName} from './philter-config';

/**
 * Loads the cleanup ruleset from the ruleset file of the current player.
 * @return Map of each item to its cleanup rule. If the user's cleanup ruleset
 *    file is empty or missing, returns `null`.
 */
export function loadCleanupRulesetForCurrentPlayer() {
  let cleanupRulesMap = loadCleanupRulesetFile(
    getFullDataFileName(getvar(CONFIG_NAMES.dataFileName))
  );
  if (!cleanupRulesMap || cleanupRulesMap.size === 0) {
    // Legacy file name
    // TODO: We inherited this from OCD Inventory Manager. Since nobody seems to
    // be using this anymore, we can probably remove it.
    cleanupRulesMap = loadCleanupRulesetFile(`OCD_${myName()}.txt`);
  }
  return cleanupRulesMap;
}

/**
 * Writes the stocking ruleset to the ruleset file of the current player.
 * @param cleanupRulesMap Stocking ruleset to save
 */
export function saveCleanupRulesetForCurrentPlayer(
  cleanupRulesMap: ReadonlyMap<Item, Readonly<CleanupRule>>
) {
  return saveCleanupRulesetFile(
    getFullDataFileName(getvar(CONFIG_NAMES.dataFileName)),
    cleanupRulesMap
  );
}
