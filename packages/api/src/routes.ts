/**
 * @file Routes for the app
 */

import {
  CleanupAction,
  CleanupRule,
  CLEANUP_TABLES_CATEGORIZED_ROUTE,
  CLEANUP_TABLES_UNCATEGORIZED_ROUTE,
  CONFIG_ROUTE,
  INVENTORY_ROUTE,
  RULESET_ROUTE,
  STATISTICS_ROUTE,
  StockingRule,
} from '@philter/common';
import {
  CONFIG_NAMES,
  isCleanable,
  loadCleanupConfig,
  saveCleanupConfig,
  saveCleanupRulesetFile,
  saveStockingRulesetFile,
} from '@philter/common/kol';
import {getvar} from 'zlib.ash';
import {
  loadCleanupRulesetForCurrentPlayer,
  saveCleanupRulesetForCurrentPlayer,
} from './controllers/cleanup-ruleset';
import {
  getInventoryState,
  getInventoryStateWithMaps,
} from './controllers/inventory-state';
import {toItemInfo} from './controllers/item-info';
import {
  getFullDataFileName,
  getFullStockFileName,
} from './controllers/philter-config';
import {loadStockingRulesetForCurrentPlayer} from './controllers/stocking-ruleset';
import {createRoute} from './typed-router';
import {idMappingToItemMap, itemMapToIdMapping} from './util';

export const routes = [
  createRoute(CLEANUP_TABLES_CATEGORIZED_ROUTE, {
    get() {
      const cleanupRulesMap = loadCleanupRulesetForCurrentPlayer();
      if (!cleanupRulesMap || cleanupRulesMap.size === 0) {
        throw new Error(
          'All item information is corrupted or missing. Either you have not yet saved any item data or you lost it.'
        );
      }

      const [inventory, inventoryMaps] = getInventoryStateWithMaps();

      const categorizedItems = new Set(cleanupRulesMap.keys());
      for (const key of Object.keys(inventoryMaps)) {
        const itemMap = inventoryMaps[key as keyof typeof inventoryMaps];
        for (const item of itemMap.keys()) {
          categorizedItems.add(item);
        }
      }

      return {
        result: {
          cleanupRules: itemMapToIdMapping(cleanupRulesMap),
          inventory,
          items: Array.from(categorizedItems, item => toItemInfo(item)),
        },
      };
    },
  }),
  createRoute(CLEANUP_TABLES_UNCATEGORIZED_ROUTE, {
    get: () => {
      const cleanupRulesMap =
        loadCleanupRulesetForCurrentPlayer() || new Map<Item, CleanupRule>();
      const [inventory, inventoryMaps] = getInventoryStateWithMaps();

      const uncategorizedItems = new Set<Item>();
      for (const key of Object.keys(inventoryMaps)) {
        const itemMap = inventoryMaps[key as keyof typeof inventoryMaps];
        for (const item of itemMap.keys()) {
          if (!cleanupRulesMap.has(item) && isCleanable(item)) {
            uncategorizedItems.add(item);
          }
        }
      }

      return {
        result: {
          inventory,
          items: Array.from(uncategorizedItems, item => toItemInfo(item)),
        },
      };
    },
  }),
  createRoute(RULESET_ROUTE, {
    post(params) {
      const cleanupRulesMap = idMappingToItemMap(params.cleanupRules);
      const success = saveCleanupRulesetForCurrentPlayer(cleanupRulesMap);

      return success
        ? {result: {success}}
        : {error: {code: 500, message: 'Cannot save cleanup ruleset'}};
    },
    patch(params) {
      const cleanupRulesMap =
        loadCleanupRulesetForCurrentPlayer() || new Map<Item, CleanupRule>();
      for (const [item, patch] of idMappingToItemMap(
        params.cleanupRulesPatch
      )) {
        if (patch === null) {
          cleanupRulesMap.delete(item);
        } else {
          cleanupRulesMap.set(item, patch);
        }
      }
      const success = saveCleanupRulesetForCurrentPlayer(cleanupRulesMap);

      return success
        ? {result: {success}}
        : {error: {code: 500, message: 'Cannot update cleanup ruleset'}};
    },
  }),
  createRoute(CONFIG_ROUTE, {
    get: () => ({result: loadCleanupConfig()}),
    post(request) {
      const config = request.config;

      if (request.shouldCopyDataFiles) {
        if (config.dataFileName !== getvar(CONFIG_NAMES.dataFileName)) {
          // "Copy" file even if the original stocking file is missing or empty
          if (
            !saveCleanupRulesetFile(
              getFullDataFileName(config.dataFileName),
              loadCleanupRulesetForCurrentPlayer() ||
                new Map<Item, CleanupRule>()
            )
          ) {
            throw new Error(
              `Cannot copy cleanup ruleset from ${CONFIG_NAMES.dataFileName} to ${config.dataFileName}`
            );
          }
        }

        if (config.stockFileName !== getvar(CONFIG_NAMES.stockFileName)) {
          // "Copy" file even if the original stocking file is missing or empty
          saveStockingRulesetFile(
            getFullStockFileName(config.stockFileName),
            loadStockingRulesetForCurrentPlayer() ||
              new Map<Item, StockingRule>()
          );
        }
      }

      saveCleanupConfig(config);
      return {result: {success: true}};
    },
  }),
  createRoute(INVENTORY_ROUTE, {
    get: () => ({result: getInventoryState()}),
  }),
  createRoute(STATISTICS_ROUTE, {
    get: () => {
      const cleanupRulesMap =
        loadCleanupRulesetForCurrentPlayer() || new Map<Item, CleanupRule>();
      const [, inventoryMaps] = getInventoryStateWithMaps();

      const categorizedItemCounts: Record<CleanupAction, number> = {
        AUTO: 0,
        BREAK: 0,
        CLAN: 0,
        CLST: 0,
        DISC: 0,
        DISP: 0,
        GIFT: 0,
        KEEP: 0,
        MAKE: 0,
        MALL: 0,
        PULV: 0,
        TODO: 0,
        UNTN: 0,
        USE: 0,
      };
      for (const rule of cleanupRulesMap.values()) {
        ++categorizedItemCounts[rule.action];
      }

      const uncategorizedItems = new Set<Item>();
      for (const key of Object.keys(inventoryMaps)) {
        const itemMap = inventoryMaps[key as keyof typeof inventoryMaps];
        for (const item of itemMap.keys()) {
          if (!cleanupRulesMap.has(item) && isCleanable(item)) {
            uncategorizedItems.add(item);
          }
        }
      }

      return {
        result: {
          categorizedItemCounts,
          uncategorizedItemCount: uncategorizedItems.size,
        },
      };
    },
  }),
];
