/**
 * @file Tools for manipulating cleanup ruleset files.
 */

import {bufferToFile, toBoolean, toInt, toItem} from 'kolmafia';
import {CleanupRule, isCleanupAction} from '../data/cleanup-rule.js';
import {createMapLoader, encodeItem} from './util.js';

/**
 * A Map that maps `Item` objects to `CleanupRule` objects.
 * Not to be confused with `CleanupRuleset`, which is a plain object whose keys
 * are item IDs (string).
 */
export type CleanupRules = Map<Item, CleanupRule>;

/** A read-only variant of `CleanupRules`. */
export type ReadonlyCleanupRules = ReadonlyMap<Item, Readonly<CleanupRule>>;

/**
 * Loads a cleanup ruleset from a text file into a Map.
 * @param filename Path to the data file
 * @return Map of each item to its cleanup rule. If the user's cleanup ruleset
 *    file is empty or missing, returns `null`.
 * @throws {TypeError} If the file contains invalid data
 */
export const loadCleanupRulesetFile = createMapLoader(
  (
    [itemName, action, keepAmountStr, info, message],
    _,
    filename
  ): [Item, CleanupRule] => {
    if (!isCleanupAction(action)) {
      throw new TypeError(
        `${action} is not a valid cleanup action (file: ${filename}, entry: ${itemName})`
      );
    }

    let rule: CleanupRule;
    if (action === 'GIFT') {
      rule = {action, recipent: info, message};
    } else if (action === 'MAKE') {
      rule = {
        action,
        targetItem: info,
        shouldUseCreatableOnly: toBoolean(message),
      };
    } else if (action === 'MALL') {
      const minPrice = Number(info);
      if (!Number.isInteger(minPrice)) {
        throw new TypeError(
          `Invalid minimum price ${minPrice} for MALL rule (file: ${filename}, entry: ${itemName})`
        );
      }
      rule = {action, minPrice};
    } else if (action === 'TODO') {
      // Curiously, Philter stores the message in the 'info' field
      rule = {action, message: info};
    } else {
      rule = {action};
    }

    const keepAmount = Number(keepAmountStr);
    if (!Number.isInteger(keepAmount)) {
      throw new TypeError(
        `Invalid keep amount ${keepAmountStr} (file: ${filename}, entry: ${itemName})`
      );
    }
    if (keepAmount > 0) {
      rule.keepAmount = keepAmount;
    }

    return [toItem(itemName), rule];
  }
);

/**
 * Saves a Map containing a cleanup ruleset to a text file.
 * @param filepath Path to the data file
 * @param cleanupRulesMap Map of each item to its item info
 */
export function saveCleanupRulesetFile(
  filepath: string,
  cleanupRulesMap: ReadonlyCleanupRules
): boolean {
  // Sort entries by item ID in ascending order when saving
  const buffer = Array.from(cleanupRulesMap.entries())
    .sort(([itemA], [itemB]) => toInt(itemA) - toInt(itemB))
    .map(([item, rule]) => {
      let info = '',
        message = '';
      if (rule.action === 'GIFT') {
        info = rule.recipent;
        message = rule.message;
      } else if (rule.action === 'MAKE') {
        info = rule.targetItem;
        message = String(rule.shouldUseCreatableOnly);
      } else if (rule.action === 'MALL') {
        info = rule.minPrice ? String(rule.minPrice) : '';
      } else if (rule.action === 'TODO') {
        info = rule.message;
      }

      return [
        encodeItem(item),
        rule.action,
        rule.keepAmount || 0,
        info,
        message,
      ].join('\t');
    })
    .join('\n');

  return bufferToFile(buffer, filepath);
}
