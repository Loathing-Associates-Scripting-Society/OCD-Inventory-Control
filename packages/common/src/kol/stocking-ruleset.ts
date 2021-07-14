/**
 * @file Tools for manipulating stocking ruleset files.
 */

import {StockingRule} from '../data/stocking-rule';

/**
 * A Map that maps `Item` objects to `StockingRule` objects.
 * Not to be confused with `StockingRuleset`, which is a plain object whose keys
 * are item IDs (string).
 */
export type StockingRules = Map<Item, StockingRule>;

/** A read-only variant of `StockingRules`. */
export type ReadonlyStockingRules = ReadonlyMap<Item, Readonly<StockingRule>>;
