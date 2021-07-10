/**
 * @file Tools for managing `InventoryState` objects.
 */

import {InventoryState} from '@philter/common';
import {toItemMap} from '@philter/common/kol';
import {
  displayAmount,
  getCloset,
  getInventory,
  getStorage,
  haveDisplay,
} from 'kolmafia';
import {itemMapToIdMapping} from '../util';

/**
 * Returns an ES6 Map of all items in the current player's display case.
 */
function getDisplayCaseMap(): Map<Item, number> {
  // There is no equivalent of getInventory(), getCloset(), etc.
  const displayCaseMap = new Map<Item, number>();
  if (haveDisplay()) {
    for (const item of Item.all()) {
      const amount = displayAmount(item);
      if (amount > 0) {
        displayCaseMap.set(item, amount);
      }
    }
  }
  return displayCaseMap;
}

/**
 * Variant of `InventoryState` that uses `Map`s instead of objects.
 */
interface InventoryStateMaps {
  closet: Map<Item, number>;
  displayCase: Map<Item, number>;
  inventory: Map<Item, number>;
  storage: Map<Item, number>;
}

/**
 * Retrieves the player's current inventory state.
 */
export function getInventoryStateMaps(): InventoryStateMaps {
  return {
    closet: toItemMap(getCloset()),
    displayCase: getDisplayCaseMap(),
    inventory: toItemMap(getInventory()),
    storage: toItemMap(getStorage()),
  };
}

/**
 * Retrieves the player's current inventory state.
 */
export function getInventoryState(): InventoryState {
  return {
    closet: itemMapToIdMapping(toItemMap(getCloset())),
    displayCase: itemMapToIdMapping(getDisplayCaseMap()),
    inventory: itemMapToIdMapping(toItemMap(getInventory())),
    storage: itemMapToIdMapping(toItemMap(getStorage())),
  };
}

/**
 * Retrieves the player's current inventory state, as well as a set of all
 * items in inventory/closet/display case/storage.
 * (the latter is a performance optimization).
 * @return `Tuple of [InventoryState, InventoryStateMap]`.
 *    `itemsSeen` is a `Set<Item>` containing all items in `InventoryState`
 */
export function getInventoryStateWithMaps(): [
  InventoryState,
  InventoryStateMaps
] {
  const inventoryStateMap = getInventoryStateMaps();

  return [
    {
      closet: itemMapToIdMapping(inventoryStateMap.closet),
      displayCase: itemMapToIdMapping(inventoryStateMap.displayCase),
      inventory: itemMapToIdMapping(inventoryStateMap.inventory),
      storage: itemMapToIdMapping(inventoryStateMap.storage),
    },
    inventoryStateMap,
  ];
}
